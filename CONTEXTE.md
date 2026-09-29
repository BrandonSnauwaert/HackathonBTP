# CONTEXTE — Devis dictés pour artisans du BTP

> Le **pourquoi** et le **quoi** du projet : besoin, périmètre, décisions prises.
> Le **comment** (architecture, commandes, conventions de code) est dans [`AGENTS.md`](AGENTS.md).
> Nom du produit : **pas encore choisi** (voir [Questions ouvertes](#questions-ouvertes)).

## Le hackathon

- **Événement :** hackathon de rentrée de la Foreach Academy.
- **Rendu :** vendredi 2 octobre 2026 après-midi, sans étape intermédiaire.
- **Démo :** en direct, **environ 3 minutes** pour convaincre.
- **Critères du jury :**

| Critère | Ce qui est évalué |
|---|---|
| Besoin | problème réel, utilisateurs, pertinence |
| Innovation | différenciation, valeur, cohérence |
| UX / produit | parcours, ergonomie, priorisation |
| Technique | faisabilité, qualité, démo |
| Business | marché, modèle, acquisition |
| Équipe | organisation, coopération, défense |

La technique ne pèse qu'un critère sur six. **Une démo qui marche du premier coup** et un parcours fluide valent plus qu'une fonctionnalité de plus.

## L'équipe

| Personne | Rôle | Décide de |
|---|---|---|
| Aurélie, Olive | UI / UX | maquettes, parcours, ergonomie |
| Ben | Marketing / Stratégie | positionnement, acquisition, pitch |
| Brandon | Product / Business | périmètre, priorités, modèle économique, **prix** |
| Thomas | Développement (seul dev) | architecture et choix techniques |

Toute l'équipe travaille avec des LLM. Thomas est le seul à coder dans le dépôt.

## Le problème

Faire un devis est une corvée pour un artisan. Il prend des notes pendant la visite chez le client (sur un carnet, dans sa tête, parfois pas du tout), puis doit tout ressaisir le soir dans un logiciel ou un tableur. Le devis part tard, il est incomplet ou mal présenté, et l'artisan ne sait pas si le client l'a lu ni quand le relancer. Des devis se perdent, et avec eux des chantiers.

**Cible :** tous les artisans du BTP, quel que soit le corps de métier, de l'auto-entrepreneur à la petite entreprise. Le produit est **grand public** : inscription libre, aucune configuration technique.

## La solution

L'artisan **dicte** ce qu'il faut faire, directement sur le chantier, même **sans réseau**. L'application transforme la dictée en devis structuré (ouvrages, quantités, TVA). L'artisan le corrige, puis l'envoie par e-mail. Il suit ensuite l'état de chaque devis (envoyé, consulté, à relancer, accepté…).

### Parcours utilisateur (périmètre minimum de la démo)

1. **Connexion** de l'artisan.
2. **Liste de ses devis**, chacun avec son statut (voir [Cycle de vie](#cycle-de-vie-dun-devis)).
3. **Nouveau devis :**
   1. il saisit les infos du client dans un **formulaire** (nom, e-mail, adresse du chantier) ;
   2. il **dicte** les travaux en mode **talkie-walkie** : il maintient le bouton, parle, relâche. Il peut faire plusieurs dictées ;
   3. l'application **restitue le contenu** sous forme de lignes de devis structurées.
4. **Édition** du devis : ajouter, modifier ou supprimer des lignes, ajuster quantités, prix et TVA.
5. **Envoi par e-mail** au client, avec un bouton « Voir le devis ».
6. **Suivi :** le statut se met à jour tout seul (consulté, accepté…).

### Bonus, si le temps le permet

- Photos jointes aux notes de chantier.
- Document de devis complet et conforme (mentions légales, coordonnées) en PDF. **Fort impact en démo.**
- Relance automatique.

## Décisions prises

| Sujet | Décision | Pourquoi |
|---|---|---|
| Mode de dictée | **Talkie-walkie** : un appui produit un clip audio. Pas d'écoute continue. | Fonctionne hors connexion (un clip est un fichier mis en file d'attente) ; l'entrée envoyée au LLM est plus propre ; pas d'enregistrement de la conversation avec le client (RGPD). |
| Hors connexion | **Cœur du produit, montré pendant la démo.** Les clips sont stockés sur le téléphone et traités au retour du réseau. | Les chantiers sont souvent en zone blanche : caves, sous-sols, campagne. |
| Transcription | **Kyutai STT** (`stt-1b-en_fr`), en local sur le GPU du PC de Thomas. Un mock existe pour développer sans GPU. | Bonne qualité en français, y compris le vocabulaire BTP (testé : « ragréage », « gondolée »), et gratuit. |
| LLM | **Hébergé via une API**, pas de LLM local. | Le GPU de démo (GTX 1660, 6 Go) est déjà occupé par Kyutai. |
| Rôle du LLM | Il **extrait** la structure (ouvrage, pièce, quantité, unité, taux de TVA suggéré) et signale ce qui manque. **Il ne fixe pas les prix.** Les totaux sont calculés par le code. | Un LLM invente des prix crédibles mais faux. Les calculs d'argent doivent être exacts et vérifiables. |
| Infos client | Saisies dans un **formulaire**, pas dictées. | Plus fiable : une adresse e-mail dictée, c'est risqué. |
| Suivi d'ouverture | Principal : un **bouton « Voir le devis »** qui mène à une page publique du devis. Secondaire : un pixel de suivi. | Le pixel n'est pas fiable : Apple Mail précharge les images (faux « ouvert »), et certains clients mail les bloquent. Le clic, lui, est certain. |
| Stockage | **SQLite**, un seul fichier. | Suffisant pour un MVP, rien à installer. |
| Hébergement de la démo | **Le PC de Thomas fait serveur.** Le téléphone y accède via un tunnel HTTPS gratuit (sans nom de domaine). | Le GPU est sur ce PC. Le micro du navigateur exige HTTPS, et la page publique du devis doit être accessible depuis Internet. |
| E-mails | **MailHog en local** : l'app envoie réellement ses e-mails (SMTP), mais une boîte de réception locale les garde ; on la montre pendant la démo (http://localhost:8025). | Brevo a rejeté l'expéditeur malgré le domaine configuré ; MailHog supprime tout risque de délivrabilité le jour J. Le code reste compatible avec un vrai fournisseur SMTP. |
| Compte de démo | Un **compte artisan fictif** pré-rempli (entreprise, SIRET, assurance…). | Pas de saisie de profil pendant les 3 minutes. |

## Cycle de vie d'un devis

```
brouillon ⇄ prêt ──► envoyé ──► consulté ──► accepté / refusé
                        │           │
                        └───────────┴──► à relancer ──► accepté / refusé
         envoyé / consulté / à relancer ──► expiré (validité dépassée)
```

| Statut | Code API | Signification | Déclenché par |
|---|---|---|---|
| Brouillon | `draft` | En cours de rédaction : dictées pas toutes traitées, ou lignes à compléter | création ; toute modification d'un devis « prêt » |
| Prêt à envoyer | `ready` | Complet (profil entreprise, e-mail du client, lignes chiffrées) | l'artisan valide |
| Envoyé | `sent` | E-mail parti | envoi |
| Consulté | `viewed` | Le client a ouvert la page du devis. Le pixel de l'e-mail n'est noté qu'à titre indicatif dans l'historique (faux positifs d'Apple Mail). | automatique |
| À relancer | `follow_up` | Pas de réponse **7 jours** après l'envoi (délai réglable) | automatique |
| Accepté / Refusé | `accepted` / `declined` | Réponse du client | le client sur la page du devis (« Accepter » / « Refuser »), ou l'artisan à la main (réponse orale) |
| Expiré | `expired` | Durée de validité dépassée sans réponse | automatique |

Un devis envoyé est un document remis au client : il n'est plus modifiable.

## Le devis : contenu attendu

**Calculs :** pour chaque ligne, quantité × prix unitaire HT. Chaque ligne a son propre taux de TVA :
- **20 %** : taux normal (construction neuve, locaux professionnels) ;
- **10 %** : travaux de rénovation dans un logement de plus de 2 ans ;
- **5,5 %** : travaux de rénovation énergétique.

Le devis affiche le total HT, la TVA par taux, puis le total TTC. Pour les auto-entrepreneurs en franchise de TVA, il n'y a pas de TVA et le devis porte la mention « TVA non applicable, art. 293 B du CGI ». Le LLM peut **suggérer** un taux, l'artisan le **confirme**.

**Mentions obligatoires** d'un devis BTP (tirées du profil entreprise et du formulaire client) :
- **entreprise :** nom ou raison sociale, forme juridique, adresse, SIRET, numéro de TVA intracommunautaire, **assurance décennale** (assureur, couverture géographique) ;
- **client :** nom, adresse, **adresse du chantier** si elle est différente ;
- **devis :** numéro, date, durée de validité, date de début et durée estimée des travaux, détail des prestations (désignation, quantité, unité, prix unitaire HT), totaux HT, TVA et TTC, conditions de paiement (acompte…), frais de déplacement le cas échéant ;
- la mention « Devis reçu avant l'exécution des travaux », avec la date et la signature « bon pour accord ».

## Scénario de démo (brouillon, à finaliser par Brandon et Ben)

1. *(20 s)* **Le problème**, raconté par un artisan type.
2. *(20 s)* **Connexion** et liste des devis avec leurs statuts.
3. *(60 s)* **Nouveau devis :** formulaire client, puis passage du téléphone **en mode avion**. Deux dictées, par exemple « Cuisine : changer la porte, ragréage 12 m² avant carrelage » et « Salle de bain : on garde les radiateurs ». Les clips sont en attente. Fin du mode avion : la transcription et les lignes du devis apparaissent.
4. *(30 s)* **Édition :** on ajuste un prix, la TVA se calcule, on voit le document final.
5. *(30 s)* **Envoi :** l'e-mail arrive sur un 2e téléphone, on clique sur « Voir le devis ». Sur le téléphone de l'artisan, le statut passe à « consulté », puis à « accepté ».
6. *(20 s)* **Business et équipe.**

## Questions ouvertes

| Question | Qui tranche |
|---|---|
| Nom du produit | équipe (Ben, Brandon) |
| **Prix :** catalogue prérempli (et lequel), tarifs de l'artisan, ou prix proposé puis corrigé ? Par défaut côté technique, un champ prix modifiable par ligne. | Brandon |
| Modèle économique, marché, acquisition | Brandon, Ben |
| Maquettes et identité visuelle | Aurélie, Olive |
| Mise en place du tunnel HTTPS (adresse publique du front) | Thomas |
| Fournisseur du LLM hébergé | Thomas |
