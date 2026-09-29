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
  src/email/            envoi d'e-mails (log ou SMTP, Nodemailer) et e-mail d'envoi du devis
  src/audio/            format audio interne (PCM s16le mono 24 kHz), lecture / écriture WAV
  src/images/           reconnaissance du type d'image (JPEG, PNG, WebP) par son contenu
  scripts/              seed de démo, clients de test (WebSocket, navigateur headless)
  samples/              audio de test (chantier-fr.wav)
  api.http              parcours complet de l'API, rejouable depuis l'IDE
  openapi.json          doc OpenAPI exportée (générée : npm run openapi)
apps/web/               PWA React (Vite, TypeScript) — pour l'instant des pages de test, en attendant les maquettes
  public/pcm-recorder-worklet.js   capture micro vers PCM 24 kHz
  src/api/              client de l'API ; schema.d.ts = types générés depuis openapi.json
  src/audio/            micro (AudioWorklet), enregistrement talkie-walkie (useClipRecorder), encodage WAV
  src/images/           réduction des photos sur l'appareil avant l'envoi (1600 px, JPEG)
  src/public-quote/     page client du devis (/d/<secret>) et aperçu artisan (/apercu/<id>) : document, réponse, impression
  src/test-console/     page de test « Devis & dictées » : connexion, devis, lignes, dictées
  src/live/             page de test « Transcription live » (WebSocket)
services/kyutai-stt/    image Docker moshi-server + config du modèle STT
docker-compose.yml      lance kyutai-stt (GPU)
.githooks/pre-commit    vérifications automatiques avant chaque commit
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
- [x] Photos de chantier : ajout (renvoi sans doublon), légende, visibilité client, suppression ; réduites sur l'appareil
- [x] Envoi du devis (lien public) et page client : document avec mentions légales, « Accepter » / « Refuser », impression PDF, suivi (consulté, pixel)
- [x] Envoi du devis par e-mail (SMTP ; MailHog en local pour la démo, boîte sur http://localhost:8025)
- [ ] Tunnel HTTPS pour que le lien de l'e-mail et le micro fonctionnent depuis un téléphone
- [ ] Brancher le vrai LLM (variables `LLM_*`) et ajuster le prompt sur de vraies dictées
- [x] Page de test (`apps/web`, onglet « Devis & dictées ») : connexion, devis, dictée talkie-walkie, prix et TVA des lignes
- [ ] Front définitif : liste des devis, écran d'édition (en attente des maquettes UI/UX)
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

## Première installation (nouveau contributeur)

```powershell
git clone https://github.com/BrandonSnauwaert/HackathonBTP.git
cd HackathonBTP
cd apps/server; npm install; copy .env.example .env; npm run seed:demo
cd ../web; npm install
```

- `npm install` **active les hooks git** du dépôt (`.githooks/`) : chaque commit est vérifié automatiquement (voir « Vérifier son travail »).
- Sans GPU NVIDIA : laisser `TRANSCRIBER=mock` et `LLM_PROVIDER=mock` dans `.env`. Tout fonctionne, avec une transcription et une extraction simulées.

## Lancer le projet

Machine de dev : Windows et PowerShell. Pour définir une variable d'environnement, `$env:VAR="x"; commande`, ou passer par le `.env`.

```powershell
# 1. Conteneurs, à la racine
docker compose up -d mailhog             # e-mails : boîte de réception sur http://localhost:8025
docker compose up -d kyutai-stt          # STT (GPU NVIDIA requis). Premier build ~20 min, puis ~20 s ; arrêt : docker compose stop kyutai-stt

# 2. Serveur (port 3000). Copier .env.example en .env ; TRANSCRIBER=mock sans GPU.
cd apps/server; npm run seed:demo   # (ré)initialise le compte demo@artisan.test / demo1234
npm run dev                          # doc interactive de l'API : http://localhost:3000/docs

# 3. Front (port 5173, fait proxy de /api, /docs et /ws vers :3000)
cd apps/web; npm run dev
```

## Vérifier son travail

**Hook git `pre-commit`** (`.githooks/pre-commit`) : à chaque commit, `npm run check` est lancé dans l'application touchée (`apps/server` et/ou `apps/web`), en ~10 s. **Si une vérification échoue, le commit est refusé.** Ne pas contourner avec `--no-verify` : corriger. Pour les agents : lancer `npm run check` **avant** de commiter.

| Commande | Où | Rôle |
|---|---|---|
| `npm run check` | apps/server | tout : formatage, analyse du code, types, tests, doc OpenAPI à jour (= hook) |
| `npm run check` | apps/web | tout : formatage, analyse du code, types et build (= hook) |
| `npm run format` | les deux | reformate automatiquement le code (Prettier) |
| `npm run lint` | les deux | analyse du code (oxlint) |
| `npm run typecheck` | apps/server | types du serveur et des scripts |
| `npm test` | apps/server | tests unitaires (domaine) et d'intégration (API sur SQLite en mémoire) |
| `npm run openapi` | apps/server | après un changement d'API : met à jour `openapi.json` et régénère les types du front |
| `npm run test:ws -- samples/chantier-fr.wav` | apps/server | streame le WAV au serveur lancé, affiche les transcriptions |
| `npm run e2e:dictation` | apps/server | Chrome headless, micro simulé par le WAV : crée un devis sur le compte de démo, maintient le bouton talkie-walkie, affiche transcription et lignes (`SCREENSHOT=x.png` pour une capture) |
| `npm run e2e -- http://localhost:5173 samples/chantier-fr.wav 20000` | apps/server | idem pour la page « Transcription live » |

- La **logique pure** (calculs de devis, TVA, transitions de statut) doit avoir des tests unitaires (`*.test.ts` à côté du fichier, avec `node:test`).
- Toute nouvelle route doit être couverte dans `src/app.test.ts` (via `app.inject`, sans serveur réel).
- Pour un changement visible à l'écran, le vérifier dans le navigateur (ou avec le script e2e), pas seulement au typecheck.

## Travailler à plusieurs

- **Une branche par fonctionnalité** (`feat/envoi-email`, `fix/dernier-mot`…), des commits petits et fréquents. Avant de pousser : `git pull --rebase origin main`. Jamais de `git push --force` sur `main`.
- **Frontière front / serveur = l'API documentée.** Les types du front (`apps/web/src/api/schema.d.ts`) sont **générés** depuis `apps/server/openapi.json`, lui-même généré depuis le code : ne jamais les écrire à la main. Qui change l'API lance `npm run openapi` (dans apps/server) et commite les deux fichiers générés. Le hook refuse un `openapi.json` pas à jour.
- **Style** : Prettier décide (config dans `.prettierrc.json`, 120 colonnes). Pas de débat de formatage, `npm run format` et c'est réglé.
- Conflit sur un fichier généré (`openapi.json`, `schema.d.ts`) : ne pas le résoudre à la main, relancer `npm run openapi`.

## Contrats existants (ne pas casser sans prévenir)

**API REST**, sous `/api`. La référence est la doc générée sur **`/docs`** (JSON brut : `/docs/json`, copie versionnée : `apps/server/openapi.json`), à partir des schémas zod de `src/http/schemas.ts`.
- **Authentification** : `POST /api/auth/login` pose un cookie `sid` (httpOnly). Les autres routes répondent 401 sans lui.
- **Erreurs** : toujours `{ error, message, details? }`. `error` est un code stable (`validation`, `unauthorized`, `not_found`, `quote_incomplete`, `invalid_transition`, `quote_locked`…), `message` est en français et affichable tel quel.
- **Réponses de devis** : toute modification (lignes, infos, statut) renvoie le **devis complet** (`QuoteDetail`), avec les totaux recalculés, les points manquants (`issues`) et les transitions possibles (`allowedTransitions`). Le front n'a jamais à recalculer.
- **Statuts** (codes en anglais dans l'API, libellé français dans `statusLabel`) : `draft`, `ready`, `sent`, `viewed`, `follow_up`, `accepted`, `declined`, `expired`. Transitions dans `src/domain/quote-status.ts`. Les statuts automatiques (à relancer, expiré) sont appliqués à la lecture, sans tâche planifiée.
- Un devis n'est **modifiable** qu'en `draft` ou `ready`. Une modification repasse un devis `ready` en `draft`.

Pour **ajouter une route** : schémas zod dans `src/http/schemas.ts` (avec `.meta({ id })` pour les objets réutilisés, et `.describe()` sur les champs), puis route dans `src/routes/`, avec `tags`, `summary`, `security: cookieAuth` et les réponses d'erreur. La doc se met à jour toute seule.

**Photos** : `POST /api/quotes/:id/photos`, corps image brut (JPEG, PNG ou WebP, avec son `Content-Type`), `clientPhotoId` pour un renvoi sans doublon, `takenAt`, `caption`. Le type est **vérifié sur le contenu du fichier** (pas sur le `Content-Type`). Taille maximale `MAX_PHOTO_MB` (10 Mo). Le front **réduit les photos à 1600 px avant l'envoi** (`apps/web/src/images/resizeImage.ts`). `visibleToClient` vaut `false` par défaut : la photo est une note interne tant que l'artisan ne la partage pas. Fichiers dans `PHOTOS_DIR`, supprimés avec la photo ou avec le devis.

**Envoi et page client** :
- `POST /api/quotes/:id/send` : e-mail au client (bouton « Voir le devis », pixel, `Reply-To` = e-mail de l'artisan), **puis** le devis `ready` passe en `sent` (figé) avec son lien public `publicUrl` = `PUBLIC_BASE_URL/d/<secret>`. Si l'e-mail échoue : 502 `email_failed` et le devis reste `ready`. `{ "byEmail": false }` : pas d'e-mail, lien partagé à la main.
- **E-mails** : en démo et en développement, **MailHog** (conteneur `mailhog`) reçoit tous les e-mails envoyés par l'app, sans rien envoyer sur Internet. On les lit sur http://localhost:8025 (c'est là qu'on clique « Voir le devis » pendant la démo). Configuration : `EMAIL_PROVIDER=smtp`, `SMTP_SERVER=localhost`, `SMTP_PORT=1025`, identifiants vides. Sans configuration, le code est en `EMAIL_PROVIDER=log` (e-mail écrit dans les logs). Un vrai fournisseur SMTP (Brevo...) marche en renseignant `SMTP_LOGIN` / `SMTP_API_KEY` ; Brevo a refusé l'expéditeur `devis@homiesapp.fr` (rejet après acceptation SMTP, donc invisible pour l'app), d'où MailHog. Au démarrage en SMTP, la connexion est vérifiée sans rien envoyer (voir les logs).
- Routes publiques **sans connexion** sous `/api/public/quotes/:token` : ouverture, `accept` (nom obligatoire, vaut signature), `decline`, photos partagées, `pixel.gif`. Un devis non envoyé n'y est jamais accessible (404).
- Le document public (`QuoteDocument`) ne contient **rien d'interne** : ni notes, ni dictées, ni points à compléter, ni photos non partagées. Un test le vérifie.
- **« Consulté » = ouverture de la page par le client.** Le pixel de l'e-mail ne fait qu'ajouter un événement `email_opened` à l'historique, car Apple Mail précharge les images.
- Front : `/d/<secret>` (client) et `/apercu/<id>` (artisan, sans suivi) affichent le même composant (`apps/web/src/public-quote/`). L'impression (A4) masque les boutons et garde le bloc « Bon pour accord ».

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

**Dictées** : `POST /api/quotes/:id/clips`, corps WAV brut (`Content-Type: audio/wav`), avec `clientClipId` (UUID généré par le téléphone, qui rend le renvoi sans risque) et `recordedAt`. Traitement en tâche de fond, en deux files : la **transcription** (GPU local) enchaîne les clips un par un sans attendre le LLM ; l'**analyse** (LLM distant) démarre dès qu'un texte est prêt, dans l'ordre des dictées pour un même devis, en parallèle entre devis. Statuts : `pending → transcribing → transcribed → extracting → done | failed`. Le front suit l'avancement via le champ `clips` de `GET /api/quotes/:id`. Une transcription réussie est conservée : une relance ne refait que l'appel au LLM.

**Format audio** du client vers le serveur : PCM **s16le, mono, 24 kHz**, envoyé en messages binaires. Le rééchantillonnage se fait dans l'AudioWorklet du front.

**WebSocket `/ws`**, du serveur vers le client : `{ "type": "transcript", "text": string, "isFinal": boolean }`.

**Kyutai** : `isFinal` est reconstitué côté serveur par `transcription/sentence-assembler.ts` (testé sur une séquence réelle). Une phrase se clôt sur une ponctuation finale (`.`, `?`, `!`), ou quand le VAD sémantique a détecté une pause **et** qu'aucun mot n'est arrivé depuis ~1 s. Pourquoi : le VAD annonce la pause pendant que le dernier mot est encore prononcé, et le texte de ce mot arrive jusqu'à ~0,6 s plus tard. Clore dès le signal du VAD couperait le dernier mot.

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
