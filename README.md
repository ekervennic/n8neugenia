# n8neugenia

Workflows n8n versioning en code TypeScript (n8n Workflow SDK), via
[`@workflows-accelerator/n8n-cli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

## Contenu

| Workflow | ID n8n | Rôle |
|---|---|---|
| `Analyse V.I.E. quotidienne` | `xRmMRMGI8bOHBSN4` | Offres V.I.E. quotidiennes, filtrées, notées, écrites dans Google Sheets |
| `RAG Ingestion V4` | `47InbFKzNzfmQUZO` | Ingestion des PDF de cours (texte natif ou scan) : extraction, chunking, boucle d'insertion |
| `Embed and Store Chunks` | `FYhCiothhv5jVAAZ` | Sous-workflow d'ingestion : embedding + écriture pgvector via Postgres |
| `RAG Answer Pipeline` | `SrQI3ph4tDrYWNcH` | Réponse en 5 étapes : contexte, routage, recherche, reranking, génération |

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

Fichiers publiés tels quels depuis n8n, sans modification :

| Fichier | Workflow | ID n8n |
|---|---|---|
| [`n8n/workflows/RAG Ingestion V4.workflow.ts`](n8n/workflows/RAG Ingestion V4.workflow.ts) | RAG Ingestion V4 | `47InbFKzNzfmQUZO` |
| [`n8n/workflows/Embed and Store Chunks.workflow.ts`](n8n/workflows/Embed and Store Chunks.workflow.ts) | Embed and Store Chunks (sous-workflow) | `FYhCiothhv5jVAAZ` |
| [`n8n/workflows/RAG Answer Pipeline.workflow.ts`](n8n/workflows/RAG Answer Pipeline.workflow.ts) | RAG Answer Pipeline | `SrQI3ph4tDrYWNcH` |

Ils ne contiennent aucun secret : seuls des noms et identifiants de
credentials n8n y figurent (les secrets restent chiffrés dans l'instance).

### RAG Ingestion V4 — ingestion

```
Formulaire Course (champ PDF) → Stash PDF as Base64 → Extract PDF Text
  ├ texte > 0 → Chunk and Normalize Text → Limit → boucle (lots)
  └ scan      → Rebuild PDF Binary → Mistral OCR → Chunk and Normalize Text
boucle : Embed and Store Batches (sous-workflow) → Wait 3 s → lot suivant
```

- **Stash PDF as Base64** : copie le binaire `PDF` en `pdf_base64` (+ nom de
  fichier) pour pouvoir le reconstruire plus tard.
- **Extract PDF Text** : lit la couche texte du PDF (`keepSource: both`).
- **Check Extracted Text** : aiguille vers le chunking si le texte extrait est
  non vide, vers l'OCR Mistral sinon.
- **Branche scan** : `Rebuild PDF Binary` reconstruit le binaire depuis la
  copie base64, `Extract Text OCR` appelle Mistral.
- **Chunk and Normalize Text** : normalise le texte, découpe en fragments de
  1200 caractères avec 120 de recouvrement, calcule un `document_id` (hash du
  contenu) et joint `text`, `chunk_index`, `document_id`, `file_name`,
  `ingested_at`. Les deux branches y convergent.
- **Boucle** : `Process in Batches` envoie les fragments par petits lots au
  sous-workflow `Embed and Store Batches` (`mappingMode: passThrough`,
  `mode: each`), avec une pause de 3 s (`Pace Between Batches`) entre les lots
  pour ne pas saturer l'API d'embeddings.

### Embed and Store Chunks — sous-workflow d'écriture

```
Chunks Received → Store Fragments in Postgres (+ loader, splitter, embeddings)
```

- **Chunks Received** (`executeWorkflowTrigger`) : déclare les 5 champs
  transmis par le parent — `text`, `document_id`, `file_name`, `chunk_index`,
  `ingested_at`.
- **Store Fragments in Postgres** (`vectorStorePGVector`, `mode: insert`,
  table `rag_documents`, `embeddingBatchSize: 2`, colonne contenu `content`)
  via la connexion **Postgres** : écrit les fragments et leurs vecteurs dans
  Supabase.
- Sous-nœuds : loader avec les 4 métadonnées, splitter avec 50 de
  recouvrement, embeddings Gemini (modèle stocké : `models/gemini-embedding-2`).

### RAG Answer Pipeline — réponse en 5 étapes

```
Question → ① input context → ② routing → ③ search → ④ reranking → ⑤ génération
```

1. **Input context** : `Contextualise Question` (agent + mémoire `customKey`
   `answer_pipeline_rewrite`, fenêtre 8) reformule la question en requête
   autonome sans y répondre (`et lui ?` → `Jean Echenoz`) ;
   `Read Standalone Query` nettoie le résultat et retombe sur la question
   d'origine si la reformulation est inutilisable.
2. **Routing** : `Classify Intent` classe la requête (`exact`, `conceptual`,
   `global`), `Read Route` valide (défaut `conceptual`), le `Switch` choisit
   un budget de recherche — termes exacts : 30 plein texte / 6 vecteurs, 4
   fragments gardés ; conceptuel : 8 / 25, 5 gardés ; document entier :
   15 / 20, 8 gardés.
3. **Search** : `Keyword Search` (Postgres, `websearch_to_tsquery('french')`
   + repli sous-chaîne sur les mots > 3 lettres), `Vector Search` (PGVector,
   cosinus, un seul appel d'embedding), fusion des deux listes par
   **Reciprocal Rank Fusion** (`K = 60`).
4. **Reranking** : liste numérotée → LLM Mistral qui ordonne les numéros →
   application de l'ordre avec repli sur l'ordre RRF si la réponse est
   illisible, limitation à `final_k`.
5. **Génération** : si `fragments_kept > 0`, `Generate Answer` (agent +
   mémoire `answer_pipeline_chat`) répond depuis les fragments seuls, avec
   citation du fichier ; sinon `Nothing Found` renvoie le refus exact sans
   appel modèle.

### Credentials RAG

| Type | Nom | Utilisé par |
|---|---|---|
| `mistralCloudApi` | Clé mistral n8n | OCR d'ingestion + 4 étapes LLM du pipeline de réponse |
| `googlePalmApi` | Gemini clé Elena | Embeddings ingestion et recherche |
| `postgres` | Postgres Elena clé | Écriture PGVector + recherche plein texte + recherche vectorielle |

Prérequis : la table `rag_documents` (Supabase/pgvector) doit exister avant la
première ingestion.

## Analyse V.I.E. quotidienne

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

Le fichier `Analyse V.I.E. quotidienne.workflow.ts` et
`Recherche V.I.E.workflow.ts` contiennent une **clé d'API en clair**
(`X-API-KEY`) vers `civiweb-api-prd.azurewebsites.net`. Elle provient du
JavaScript public du site officiel et ne donne accès à aucun compte, mais elle
reste une clé : à traiter comme un secret, ou remplacer par une variable
d'environnement avant de publier ce dépôt.
