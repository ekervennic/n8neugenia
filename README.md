# n8neugenia

Workflows n8n versioning en code TypeScript (n8n Workflow SDK), via
[`@workflows-accelerator/n8n-cli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

## Contenu

| Workflow | ID n8n | Rôle |
|---|---|---|
| `Analyse V.I.E. quotidienne` | `xRmMRMGI8bOHBSN4` | Offres V.I.E. quotidiennes, filtrées, notées, écrites dans Google Sheets |
| `Rag Ingestion` | `47InbFKzNzfmQUZO` | `Sandbox/` — ingestion des PDF (texte natif ou scan) : extraction, chunking, boucle d'insertion |
| `Embed and Store Chunks` | `FYhCiothhv5jVAAZ` | `Sandbox/` — sous-workflow d'ingestion : embedding + écriture pgvector via Postgres |
| `Rag Answering` | `MKbzPtfpwhKLXpPW` | `Sandbox/` — recherche hybride (plein texte + vecteurs, RRF) et réponse |

## Méthode

Trois skills OpenCode dans `.opencode/skills/`, à invoquer par leur identifiant :

| Skill | ID | Rôle |
|---|---|---|
| Interview | `interview` | Éliciter la spécification avant tout code |
| Revue hostile | `hostile-review` | Attaquer un workflow en six portes avant activation |
| Développement guidé par le doute | `doubt-driven` | Ne rien affirmer sans preuve |

Ils s'enchaînent : l'interview produit la spécification, la revue hostile
l'attaque avant qu'elle ne coûte cher, le doute guidé empêche de rapporter un
faux succès pendant l'implémentation.

Trois documents dans `skills/`, produits de cette méthode sur le workflow
`Analyse V.I.E. quotidienne` :

| Document | Contenu |
|---|---|
| [`skills/specification-analyse-vie.md`](skills/specification-analyse-vie.md) | 10 exigences, chacune avec un critère d'acceptation falsifiable |
| [`skills/introspection-doubt-driven.md`](skills/introspection-doubt-driven.md) | 12 défauts confirmés, dont une introspection sur la méthode elle-même |
| [`skills/revue-hostile-analyse-vie.md`](skills/revue-hostile-analyse-vie.md) | Première exécution réelle, portes franchies et non franchies |

> **`skills/` et `.opencode/skills/` sont deux choses différentes.** Le premier
> contient des documents rédigés, le second des skills exécutables par
> OpenCode.

## Utilisation

```bash
npm install -g @workflows-accelerator/n8n-cli@latest

n8ncli init --url https://elenaker.app.n8n.cloud/ --env prod --project-id kSGuYdfWJNFhSWRF
n8ncli pull        # récupère les workflows distants
n8ncli push        # pousse les modifications
n8ncli status      # compare local / distant
n8ncli validate    # valide contre les schémas n8n
```

> **Toujours passer `--env prod`.** Sans ce drapeau, la CLI cherche un
> environnement `development` et répond `access token is required`.

La config `.n8ncli.json` porte le jeton d'accès : elle est dans `.gitignore`,
ne jamais la versionner.

## RAG cours (ingestion + réponse)

Ingérer des PDF de cours (texte natif ou scans) dans pgvector, puis répondre
aux questions en français **uniquement** à partir des fragments retrouvés —
refus explicite sinon : `Je ne trouve pas cette information dans tes cours.`

Le dépôt est le **miroir du projet n8n** : les workflows vivent dans
`n8n/workflows/Sandbox/`, comme dans le dossier Sandbox de n8n (le bot
exemple vit dans `n8n/workflows/Templates/`). Fichiers publiés tels quels
depuis n8n, sans modification :

| Fichier | Workflow | ID n8n | Actif |
|---|---|---|---|
| [`n8n/workflows/Sandbox/Rag Ingestion.workflow.ts`](n8n/workflows/Sandbox/Rag%20Ingestion.workflow.ts) | Rag Ingestion | `47InbFKzNzfmQUZO` | oui |
| [`n8n/workflows/Sandbox/Embed and Store Chunks.workflow.ts`](n8n/workflows/Sandbox/Embed%20and%20Store%20Chunks.workflow.ts) | Embed and Store Chunks (sous-workflow) | `FYhCiothhv5jVAAZ` | oui |
| [`n8n/workflows/Sandbox/Rag Answering.workflow.ts`](n8n/workflows/Sandbox/Rag%20Answering.workflow.ts) | Rag Answering | `MKbzPtfpwhKLXpPW` | oui |

Ils ne contiennent aucun secret : seuls des noms et identifiants de
credentials n8n y figurent (les secrets restent chiffrés dans l'instance).

### Rag Ingestion — ingestion

```
Formulaire Course (champ PDF) → Extract PDF Text → Check Extracted Text
  ├ texte > 0 → Chunk and Normalize Text → Limit (10) → boucle (lots)
  └ scan      → Rebuild PDF Binary → Mistral OCR → Chunk and Normalize Text
boucle : Embed and Store Batches (sous-workflow) → Wait 3 s → lot suivant
```

- **Extract PDF Text** : lit la couche texte du PDF (`keepSource: both`).
- **Check Extracted Text** : chunking si le texte extrait est non vide, OCR
  Mistral sinon.
- **Chunk and Normalize Text** : fragments de 1200 caractères avec 120 de
  recouvrement, `document_id` (hash du contenu), `text`, `chunk_index`,
  `file_name`, `ingested_at`. Les deux branches y convergent.
- **Boucle** : `Process in Batches` appelle le sous-workflow par petits lots
  (`passThrough`, `mode: each`), pause de 3 s entre les lots pour ne pas
  saturer l'API d'embeddings.
- ⚠️ **Point d'attention** : `Rebuild PDF Binary` lit encore
  `$('Stash PDF as Base64')`, mais ce nœud a été supprimé du workflow — la
  branche OCR échouera tant que ce n'est pas recorrigé.

### Embed and Store Chunks — sous-workflow d'écriture

```
Chunks Received → Store Fragments in Postgres (+ loader, splitter, embeddings)
```

- **Chunks Received** (`executeWorkflowTrigger`, `passthrough`) : reçoit les
  fragments du parent tels quels.
- **Store Fragments in Postgres** (`vectorStorePGVector`, `mode: insert`,
  table `rag_documents`, `embeddingBatchSize: 1`, colonne contenu `content`)
  via la connexion **Postgres**.
- Sous-nœuds : loader avec les 4 métadonnées (`document_id`, `file_name`,
  `chunk_index`, `ingested_at`), splitter (recouvrement 50), embeddings
  Gemini (modèle non épinglé dans le fichier).

### Rag Answering — recherche hybride + réponse

```
Question → Read Question → Keyword Search + Vector Search → merge → RRF → Course Assistant
```

- **Read Question** : normalise la question du chat, erreur explicite si vide.
- **Keyword Search** (Postgres) : plein texte français
  (`websearch_to_tsquery('french')`, `ts_rank`) avec repli sous-chaîne sur
  les mots > 3 lettres, top 20.
- **Vector Search** (PGVector, `mode: load`, cosinus, `topK: 20`) : embarque
  la question et cherche les fragments proches.
- **Fuse Rankings** : **Reciprocal Rank Fusion** (`K = 60`, top 6), sans
  comparer les scores des deux moitiés.
- **Course Assistant** (`chainLlm`, `gemini-2.5-flash-lite`) : répond depuis
  les fragments seuls, refus exact sinon, citation du fichier.

### Credentials RAG

| Type | Nom | Utilisé par |
|---|---|---|
| `postgres` | Postgres Elena clé | Écriture PGVector + recherches plein texte et vectorielle |
| `mistralCloudApi` | Clé mistral n8n | OCR d'ingestion |
| `googlePalmApi` | Clé gmail elena | Embeddings de la recherche |

Prérequis : la table `rag_documents` (Supabase/pgvector) doit exister avant la
première ingestion.

Anciens workflows (V2, V3, RAG Chat, RAG Schema Setup, RAG Answer Pipeline
27 nœuds) : **archivés sur n8n**, leurs fichiers ont été retirés du dépôt
pour refléter l'instance — l'historique git les conserve.

## Analyse V.I.E. quotidienne

Fichier : [`n8n/workflows/Sandbox/Analyse V.I.E. quotidienne.workflow.ts`](n8n/workflows/Sandbox/Analyse V.I.E. quotidienne.workflow.ts)
(déplacé depuis la racine de `n8n/workflows/` par la synchronisation des
dossiers n8n).

Récupère chaque jour à 8h les nouvelles offres sur l'API Business France,
écarte l'Europe, note les restantes sur 10 selon le CV, approfondit les notes
> 7 et écrit le tout dans un Google Sheet.

```
Chaque jour à 8h ─┬─ Profil candidat → Appel API → Séparer → Normaliser
                   │                                          ↓
                   │                                 Offre en erreur ?
                   │                                 ├ sortie 0 → Construire ligne erreur → Consigner dans Erreurs
                   │                                 └ sortie 1 → Fusion ←── Agréger les ID ← Lire le Sheet
                   │                                        ↓
                   │                              Dédoublonner → Hors Europe → Notifier → Parser la note
                   │                                                                   ↓
                   │                                                            Note > 7 ?
           └─ Lire le Sheet                                                   ├ sortie 0 → Analyser → Parser analyse
                                                                            └ sortie 1 ─┴─→ Préparer ligne → Ajouter au Sheet
```

- **Déduplonnage** contre le contenu du Google Sheet (source de vérité), pas
  contre l'historique d'exécutions n8n qui est borné dans le temps.
- **Confidentialité** : seul un profil candidat anonymisé est transmis au LLM.
  Le CV complet ne quitte pas la machine.
- **Robustesse** : 3 tentatives sur l'appel API et sur les deux appels Gemini,
  poursuite du lot en cas d'échec, erreurs consignées dans l'onglet `Erreurs`.

## Onglets Google Sheets attendus

`Offres` — 17 colonnes :

```
date · id · titre · entreprise · pays · ville · contrat · missions · competences
lien · note · justification · resume · adequation · points_correspondants
a_mettre_en_avant · personnalisation
```

`Erreurs` — 9 colonnes :

```
date_erreur · heure_erreur · id_offre · titre · entreprise · lien · etape
message_erreur · a_relancer
```

## Credentials

| Type | Nom | Utilisé par |
|---|---|---|
| `googlePalmApi` | Gemini clé Elena | Notation et analyse |
| `googleSheetsOAuth2Api` | Google Sheets account | Lecture, écriture, onglet Erreurs |

Les secrets vivent dans n8n, chiffrés. Seuls les identifiants sont ici, et ils
ne suffisent à rien sans l'instance.

## Avertissement

Le fichier `n8n/workflows/Sandbox/Analyse V.I.E. quotidienne.workflow.ts` et
`Recherche V.I.E.workflow.ts` contiennent une **clé d'API en clair**
(`X-API-KEY`) vers `civiweb-api-prd.azurewebsites.net`. Elle provient du
JavaScript public du site officiel et ne donne accès à aucun compte, mais elle
reste une clé : à traiter comme un secret, ou remplacer par une variable
d'environnement avant de publier ce dépôt.
