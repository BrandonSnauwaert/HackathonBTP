# AGENTS.md

Règles et repères techniques pour **toute personne ou agent IA** qui travaille sur ce dépôt.
Pour le besoin, le périmètre et les décisions produit, lire d'abord [`CONTEXTE.md`](CONTEXTE.md).

**Deadline : vendredi 2 octobre 2026 après-midi, démo live de 3 min.** Chaque choix doit servir la démo : la robustesse passe avant l'exhaustivité.

## Structure du dépôt

```
apps/server/            API Node.js (Fastify, TypeScript)
  src/index.ts          point d'entrée (ouvre la base, lance le serveur)
  src/app.ts            construction de l'app : plugins, doc OpenAPI, gestion d'erreurs, routes
  src/config.ts         variables d'environnement (validées par zod)
  src/db/database.ts    SQLite : migrations, transactions, helpers de requête validés par zod
  src/domain/           logique métier pure et testée : statuts, calculs HT/TVA/TTC, unités
  src/repositories/     accès aux données (SQL), une table par fichier ou presque
  src/services/         règles métier : devis (quote-service.ts), dictées et file de traitement (clip-service.ts)
  src/http/             schémas zod de l'API, erreurs HTTP, nettoyage de la doc OpenAPI
  src/routes/           routes Fastify, une par ressource (auth, company, clients, quotes, transcription)
  src/auth/             mots de passe (scrypt) et session par cookie
  src/transcription/    interface Transcriber, mock, Kyutai, transcription d'un clip complet
  src/llm/              interface LlmClient, client compatible OpenAI, extraction des lignes de devis (prompt)
  src/audio/            format audio interne (PCM s16le mono 24 kHz), lecture / écriture WAV
  scripts/              seed de démo, clients de test (WebSocket, navigateur headless)
  samples/              audio de test (chantier-fr.wav)
  api.http              parcours complet de l'API, rejouable depuis l'IDE
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
- [x] SQLite : artisans, profil entreprise, clients, devis, lignes, historique
- [x] Authentification (e-mail + mot de passe, session par cookie) et compte de démo pré-rempli (`npm run seed:demo`)
- [x] API REST des devis : CRUD, lignes, statuts, calcul HT / TVA / TTC, points manquants, doc OpenAPI sur `/docs`
- [x] Dictées : dépôt d'un clip WAV, file de traitement (Kyutai puis LLM), lignes ajoutées au devis, relance, reprise au redémarrage
- [x] Client LLM compatible OpenAI et extraction des lignes (JSON validé par zod, seconde tentative si invalide)
- [ ] Brancher le vrai LLM (variables `LLM_*`) et ajuster le prompt sur de vraies dictées
- [ ] Front : liste des devis, écran d'édition (en attente des maquettes UI/UX)
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
cd apps/server; npm run seed:demo   # (ré)initialise le compte demo@artisan.test / demo1234
npm run dev                          # doc interactive de l'API : http://localhost:3000/docs

# 3. Front (port 5173, fait proxy de /ws vers :3000)
cd apps/web; npm run dev
```

## Vérifier son travail

Une tâche n'est **pas terminée** tant que ces vérifications ne passent pas :

| Commande | Où | Rôle |
|---|---|---|
| `npm run typecheck` | apps/server | types du serveur et des scripts |
| `npm test` | apps/server | tests unitaires (domaine) et d'intégration (API sur SQLite en mémoire) |
| `npm run build` | apps/web | types et build du front |
| `npm run test:ws -- samples/chantier-fr.wav` | apps/server | streame le WAV au serveur lancé, affiche les transcriptions |
| `npm run e2e -- http://localhost:5173 samples/chantier-fr.wav 20000` | apps/server | Chrome headless avec micro simulé : clique sur le micro et lit l'écran |

- La **logique pure** (calculs de devis, TVA, transitions de statut) doit avoir des tests unitaires (`*.test.ts` à côté du fichier, avec `node:test`).
- Toute nouvelle route doit être couverte dans `src/app.test.ts` (via `app.inject`, sans serveur réel).
- Pour un changement visible à l'écran, le vérifier dans le navigateur (ou avec le script e2e), pas seulement au typecheck.

## Contrats existants (ne pas casser sans prévenir)

**API REST**, sous `/api`. La référence est la doc générée sur **`/docs`** (JSON brut : `/docs/json`), à partir des schémas zod de `src/http/schemas.ts`.
- **Authentification** : `POST /api/auth/login` pose un cookie `sid` (httpOnly). Les autres routes répondent 401 sans lui.
- **Erreurs** : toujours `{ error, message, details? }`. `error` est un code stable (`validation`, `unauthorized`, `not_found`, `quote_incomplete`, `invalid_transition`, `quote_locked`…), `message` est en français et affichable tel quel.
- **Réponses de devis** : toute modification (lignes, infos, statut) renvoie le **devis complet** (`QuoteDetail`), avec les totaux recalculés, les points manquants (`issues`) et les transitions possibles (`allowedTransitions`). Le front n'a jamais à recalculer.
- **Statuts** (codes en anglais dans l'API, libellé français dans `statusLabel`) : `draft`, `ready`, `sent`, `viewed`, `follow_up`, `accepted`, `declined`, `expired`. Transitions dans `src/domain/quote-status.ts`. Les statuts automatiques (à relancer, expiré) sont appliqués à la lecture, sans tâche planifiée.
- Un devis n'est **modifiable** qu'en `draft` ou `ready`. Une modification repasse un devis `ready` en `draft`.

Pour **ajouter une route** : schémas zod dans `src/http/schemas.ts` (avec `.meta({ id })` pour les objets réutilisés, et `.describe()` sur les champs), puis route dans `src/routes/`, avec `tags`, `summary`, `security: cookieAuth` et les réponses d'erreur. La doc se met à jour toute seule.

**Interface de transcription**, dans `apps/server/src/transcription/transcriber.ts`. Tout fournisseur la respecte, et il est choisi par la variable `TRANSCRIBER` :
```ts
interface TranscriptEvent { text: string; isFinal: boolean }
interface Transcriber {
  sendAudio(chunk: Buffer): void;
  onTranscript(cb: (e: TranscriptEvent) => void): void;
  flush(): Promise<void>;   // fin de l'audio : se résout quand tout est transcrit (clips)
  close(): void;
}
```

**LLM**, dans `apps/server/src/llm/`. Deux niveaux :
- `LlmClient.complete(messages, { json? })` : appel générique. Une seule implémentation, `openai-client.ts`, qui parle à **toute API compatible OpenAI** (`/v1/chat/completions` : OpenAI, Mistral, Groq, OpenRouter, Ollama, vLLM…) via le SDK `openai` et `baseURL`.
- `LineExtractor.extract({ transcript, existingLines })` renvoie `{ lines, warnings }`. Le prompt est dans `line-extractor.ts` (`SYSTEM_PROMPT`). La réponse est validée par zod avec une normalisation tolérante des unités et de la TVA, et redemandée une fois si elle est invalide. **Jamais de prix** dans la sortie.
- Configuration : `LLM_PROVIDER` (`mock` = extraction par mots-clés sans LLM, `openai`), `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TEMPERATURE`, `LLM_TIMEOUT_MS`, `LLM_JSON_MODE` (`json_object` par défaut ; `json_schema` si le serveur le gère ; `none` si le serveur refuse `response_format`).

**Dictées** : `POST /api/quotes/:id/clips`, corps WAV brut (`Content-Type: audio/wav`), avec `clientClipId` (UUID généré par le téléphone, qui rend le renvoi sans risque) et `recordedAt`. Traitement en tâche de fond, **un clip à la fois** : `pending → transcribing → extracting → done | failed`. Le front suit l'avancement via le champ `clips` de `GET /api/quotes/:id`. Une transcription réussie est conservée : une relance ne refait que l'appel au LLM.

**Format audio** du client vers le serveur : PCM **s16le, mono, 24 kHz**, envoyé en messages binaires. Le rééchantillonnage se fait dans l'AudioWorklet du front.

**WebSocket `/ws`**, du serveur vers le client : `{ "type": "transcript", "text": string, "isFinal": boolean }`.

**Kyutai** : `isFinal` est reconstitué côté serveur. Une phrase se clôt sur une ponctuation finale (`.`, `?`, `!`), ou sur une pause détectée par le VAD sémantique, en tenant compte des ~0,5 s de retard du texte sur l'audio. Voir `kyutai-transcriber.ts`.

## Conventions

- **Langue :** identifiants de code en **anglais** ; commentaires, docs, interface et messages d'erreur visibles en **français**.
- **TypeScript strict**, jamais de `any`. Pour une donnée d'origine externe (requête HTTP, message WebSocket, réponse du LLM, variables d'environnement), partir de `unknown` et valider avec **zod**.
- **Serveur en ESM** : les imports relatifs se terminent par `.js` (`import { x } from "./foo.js"`).
- **Argent en centimes entiers** (`unitPriceCents: number`), jamais de flottants pour les montants. Taux de TVA en points de base (`vatRateBp: 2000` pour 20 %). Arrondi au centime sur le total de chaque ligne, puis sur la TVA de chaque taux. Tous les calculs passent par `src/domain/quote-totals.ts`.
- **Accès aux données** : SQL uniquement dans `src/repositories/`, requêtes paramétrées (`:param`), lignes lues via `queryOne` / `queryAll` avec un schéma zod. Toujours filtrer par `user_id` : un artisan ne voit jamais les données d'un autre. Plusieurs écritures liées vont dans une `transaction()`.
- **Schéma de base** : on ne modifie jamais une migration existante, on en ajoute une à la fin de `MIGRATIONS` (`src/db/database.ts`).
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
- **`node:sqlite`** affiche un avertissement « ExperimentalWarning » au démarrage : c'est normal.
- **Doc OpenAPI** : les identifiants de schéma (`.meta({ id })`) ne doivent pas finir par `Input`, car la librairie ajoute ce suffixe aux versions « entrée » et deux noms entreraient en collision (erreur 500 sur `/docs`).
- `exactOptionalPropertyTypes` est activé : pour typer des champs optionnels venant de zod, utiliser `PatchOf<T>` (`src/types.ts`) plutôt que `Partial<T>`.
- **Vitesse de Kyutai sur la GTX 1660** : ~1,15× le temps réel. Une dictée de 10 s met ~9 s à être transcrite, auxquelles s'ajoute l'appel au LLM.
- `batch_size = 2` dans la config Kyutai : 2 flux de transcription simultanés au maximum.
- **Micro dans le navigateur :** exige HTTPS, sauf sur `localhost`. Pour tester depuis un téléphone, passer par le tunnel HTTPS.
- **Kyutai ne produit du texte que si on lui envoie de l'audio.** Un clip doit être suivi d'environ 1 s de silence pour que les derniers mots sortent.
- **Pixel de suivi :** Apple Mail précharge les images (faux « consulté »). Le clic sur « Voir le devis » est le signal fiable.
- **iOS :** le micro se coupe quand l'écran se verrouille (utiliser la Wake Lock API pendant une dictée), et il n'y a pas de Background Sync (synchroniser sur l'événement `online` et au démarrage de l'app).
