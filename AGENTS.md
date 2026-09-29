# AGENTS.md

Règles et repères techniques pour **toute personne ou agent IA** qui travaille sur ce dépôt.
Pour le besoin, le périmètre et les décisions produit, lire d'abord [`CONTEXTE.md`](CONTEXTE.md).

**Deadline : vendredi 2 octobre 2026 après-midi, démo live de 3 min.** Chaque choix doit servir la démo : la robustesse passe avant l'exhaustivité.

## Structure du dépôt

```
apps/server/            API Node.js (Fastify, TypeScript)
  src/index.ts          point d'entrée, routes
  src/config.ts         variables d'environnement (validées par zod)
  src/transcriber.ts    interface commune des fournisseurs de transcription
  src/mock-transcriber.ts / kyutai-transcriber.ts / create-transcriber.ts
  src/audio-format.ts   format audio attendu (PCM s16le mono 24 kHz)
  scripts/              clients de test (WebSocket, navigateur headless)
  samples/              audio de test (chantier-fr.wav)
apps/web/               PWA React (Vite, TypeScript)
  public/pcm-recorder-worklet.js   capture micro vers PCM 24 kHz
  src/audio/  src/useTranscription.ts  src/App.tsx
services/kyutai-stt/    image Docker moshi-server + config du modèle STT
docker-compose.yml      lance kyutai-stt (GPU)
CONTEXTE.md             besoin, périmètre, décisions (source de vérité produit)
```

## État d'avancement

- [x] Transcription en streaming de bout en bout : front → WebSocket → Kyutai (GPU local) → phrases définitives affichées
- [x] Mock de transcription (`TRANSCRIBER=mock`) pour travailler sans GPU
- [ ] Passage en **talkie-walkie** : clips audio au lieu du flux continu (le flux reste possible en aperçu quand le réseau est là)
- [ ] File d'attente **hors connexion** : clips stockés dans IndexedDB, synchronisés au retour du réseau. Service worker et manifest PWA.
- [ ] SQLite : artisans, profil entreprise, clients, devis, lignes, clips, événements de suivi
- [ ] Authentification (e-mail + mot de passe, session par cookie) et compte de démo pré-rempli
- [ ] Extraction des lignes de devis par le LLM (sortie JSON validée par zod)
- [ ] Liste des devis avec statuts, écran d'édition, calcul HT / TVA / TTC
- [ ] Page publique du devis (lien secret) avec « Accepter » et « Refuser », suivi de consultation, pixel
- [ ] Envoi de l'e-mail (service à choisir) et tunnel HTTPS vers le PC de démo
- [ ] Bonus : PDF conforme, photos, relances automatiques

Tenir cette liste à jour quand une étape est terminée.

## Stack

| Brique | Choix |
|---|---|
| Serveur | Node 24, TypeScript 7 strict, **ESM** (`"type": "module"`), Fastify 5, `@fastify/websocket`, zod 4 |
| Front | React 19, Vite 8, TypeScript strict, CSS simple (variables CSS, thème clair et sombre) |
| STT | Kyutai `stt-1b-en_fr` via `moshi-server` 0.6.4 dans Docker. Protocole WebSocket + msgpack. |
| Base de données | SQLite via `node:sqlite` (intégré à Node, pas de dépendance native). Le warning « experimental » est attendu. |
| LLM | API hébergée, fournisseur à choisir, derrière une interface interne (comme `Transcriber`) |

## Lancer le projet

Machine de dev : Windows et PowerShell. Pour définir une variable d'environnement, `$env:VAR="x"; commande`, ou passer par le `.env`.

```powershell
# 1. STT Kyutai (GPU NVIDIA requis). Premier build ~20 min, puis ~20 s au démarrage.
docker compose up -d kyutai-stt          # à la racine ; arrêt : docker compose stop kyutai-stt

# 2. Serveur (port 3000). Copier .env.example en .env ; TRANSCRIBER=mock sans GPU.
cd apps/server; npm run dev

# 3. Front (port 5173, fait proxy de /ws vers :3000)
cd apps/web; npm run dev
```

## Vérifier son travail

Une tâche n'est **pas terminée** tant que ces vérifications ne passent pas :

| Commande | Où | Rôle |
|---|---|---|
| `npm run typecheck` | apps/server | types du serveur |
| `npm run build` | apps/web | types et build du front |
| `npm run test:ws -- samples/chantier-fr.wav` | apps/server | streame le WAV au serveur lancé, affiche les transcriptions |
| `npm run e2e -- http://localhost:5173 samples/chantier-fr.wav 20000` | apps/server | Chrome headless avec micro simulé : clique sur le micro et lit l'écran |

- La **logique pure** (calculs de devis, TVA, transitions de statut) doit avoir des tests unitaires avec `node:test`, lancés via `tsx --test`.
- Pour un changement visible à l'écran, le vérifier dans le navigateur (ou avec le script e2e), pas seulement au typecheck.

## Contrats existants (ne pas casser sans prévenir)

**Interface de transcription**, dans `apps/server/src/transcriber.ts`. Tout fournisseur la respecte, et il est choisi par la variable `TRANSCRIBER` :
```ts
interface TranscriptEvent { text: string; isFinal: boolean }
interface Transcriber {
  sendAudio(chunk: Buffer): void;
  onTranscript(cb: (e: TranscriptEvent) => void): void;
  close(): void;
}
```

**Format audio** du client vers le serveur : PCM **s16le, mono, 24 kHz**, envoyé en messages binaires. Le rééchantillonnage se fait dans l'AudioWorklet du front.

**WebSocket `/ws`**, du serveur vers le client : `{ "type": "transcript", "text": string, "isFinal": boolean }`.

**Kyutai** : `isFinal` est reconstitué côté serveur. Une phrase se clôt sur une ponctuation finale (`.`, `?`, `!`), ou sur une pause détectée par le VAD sémantique, en tenant compte des ~0,5 s de retard du texte sur l'audio. Voir `kyutai-transcriber.ts`.

## Conventions

- **Langue :** identifiants de code en **anglais** ; commentaires, docs, interface et messages d'erreur visibles en **français**.
- **TypeScript strict**, jamais de `any`. Pour une donnée d'origine externe (requête HTTP, message WebSocket, réponse du LLM, variables d'environnement), partir de `unknown` et valider avec **zod**.
- **Serveur en ESM** : les imports relatifs se terminent par `.js` (`import { x } from "./foo.js"`).
- **Argent en centimes entiers** (`priceCents: number`), jamais de flottants pour les montants. Taux de TVA en points de base (`vatRateBp: 2000` pour 20 %). Arrondis faits une seule fois, au niveau des totaux.
- **Dates** en ISO 8601 UTC en base, affichées en `fr-FR`.
- **Nommage des fichiers :** `kebab-case.ts` côté serveur ; composants React en `PascalCase.tsx` ; hooks en `useXxx.ts`.
- **Configuration** : toute nouvelle variable d'environnement passe par `apps/server/src/config.ts` (schéma zod avec valeur par défaut) et va dans `.env.example`.
- **Secrets** : jamais commités. `.env` reste local ; les clés d'API sont dans `.env`.
- Suivre le style du code voisin : densité de commentaires, gestion d'erreurs, logs Fastify (`request.log`).

## Règles pour les agents

**Sans demander :**
- ajouter une dépendance légère et courante, en justifiant son utilité dans la réponse ;
- créer des fichiers, refactorer du code du dépôt, écrire des tests et des scripts de vérification ;
- lancer des serveurs, conteneurs et tests en local.

**Demander d'abord :**
- changer un contrat existant (voir ci-dessus), le schéma de base ou le modèle de statuts ;
- ajouter une dépendance lourde ou structurante (ORM, framework UI, lib d'état global…) ;
- toute action vers l'extérieur : envoyer de vrais e-mails, appels d'API payantes en boucle, déploiement, DNS ;
- toute décision **produit** (prix, parcours, textes du pitch). Elle revient à l'équipe, voir `CONTEXTE.md`.

**Jamais :**
- commiter sans demande explicite ;
- supprimer des données ou des volumes Docker (cache du modèle) sans confirmation ;
- laisser le LLM calculer des montants : il extrait, le code calcule.

**Commits** (quand ils sont demandés) : [Conventional Commits](https://www.conventionalcommits.org/), message en français, par exemple `feat(web): bouton talkie-walkie`. Types : `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

## Pièges connus

- **GPU de démo (GTX 1660, Turing, 6 Go) :** pas de bf16, d'où `dtype_override = "f16"` dans `services/kyutai-stt/config.toml` (~2,8 Go de VRAM). Si la sortie se dégrade, essayer `"f32"`. Sur une autre carte, rebuild avec le bon `CUDA_COMPUTE_CAP` (voir `docker-compose.yml`).
- `batch_size = 2` dans la config Kyutai : 2 flux de transcription simultanés au maximum.
- **Micro dans le navigateur :** exige HTTPS, sauf sur `localhost`. Pour tester depuis un téléphone, passer par le tunnel HTTPS.
- **Kyutai ne produit du texte que si on lui envoie de l'audio.** Un clip doit être suivi d'environ 1 s de silence pour que les derniers mots sortent.
- **Pixel de suivi :** Apple Mail précharge les images (faux « consulté »). Le clic sur « Voir le devis » est le signal fiable.
- **iOS :** le micro se coupe quand l'écran se verrouille (utiliser la Wake Lock API pendant une dictée), et il n'y a pas de Background Sync (synchroniser sur l'événement `online` et au démarrage de l'app).
