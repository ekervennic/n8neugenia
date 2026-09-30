# n8neugenia

Workflows n8n versioning en code TypeScript (n8n Workflow SDK), via
[`@workflows-accelerator/n8n-cli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

## Contenu

| Workflow | ID n8n | Rôle |
|---|---|---|
| `Analyse V.I.E. quotidienne` | `xRmMRMGI8bOHBSN4` | Offres V.I.E. quotidiennes, filtrées, notées, écrites dans Google Sheets |


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
