# Spécification — Analyse V.I.E. quotidienne

Issue de l'interview du 30 septembre 2026. Chaque exigence porte un critère
d'acceptation falsifiable : le test qui prouverait qu'elle est fausse.

## Intention

Repérer chaque jour les offres de V.I.E. publiées par Business France qui
portent hors de l'Union européenne, les noter sur 10 selon ton profil, et les
conserver dans un Google Sheet pour que tu puisses y revenir quand tu cherches
une candidature.

Le Sheet est un **journal de ce que tu as pu voir**, pas un tableau de bord des
opportunités encore ouvertes.

## Périmètre

**Inclus**

- Récupération quotidienne des offres sur l'API Business France
- Exclusion des offres situées dans l'Union européenne
- Notation de 1 à 10 sur la seule base du profil candidat anonymisé
- Analyse approfondie au-delà de 7
- Inscription dans un Google Sheet, sans doublon
- Journalisation des échecs dans un onglet dédié

**Exclu — explicitement**

- Toute mise à jour, correction ou suppression d'une ligne déjà écrite
- La moindre notification, alerte, mail ou résumé automatique
- Le filtrage des offres par mots-clés liés à la data
- Les colonnes complémentaires (`endBroadcastDate`, `missionStartDate`, …)
- Le repérage des offres disparues du site
- Le nettoyage de l'historique à la hausse

## Exigences

### E1 — Collecte quotidienne

- **Règle** : chaque jour à 08:00, récupérer les offres publiées sur
  `mon-vie-via.businessfrance.fr`.
- **Acceptation** : un jour sans aucune publication, le Sheet ne gagne aucune
  ligne et le workflow se termine sans erreur.
- **Limite** : en fonctionnement courant, seules les 100 offres les plus
  récentes sont vues. Cela couvre environ deux mois d'historique, ce qui suffit
  largement au quotidien.

### E2 — Hors Union européenne

- **Règle** : ne conserver que les offres dont le pays n'appartient pas à une
  liste de 45 pays (UE + EEE + micro-États européens).
- **Acceptation** : une offre en `ROYAUME-UNI`, `ISLANDE`, `TURQUIE`,
  `RUSSIE`, `GEORGIE` ou `AZERBAIDJAN` **est** inscrite. Une offre en
  `FRANCE`, `ESPAGNE`, `SUEDE` ou `CHYPRE` **ne l'est pas**.
- **Précision** : « hors d'Europe » est ici « hors UE ». Le Royaume-Uni et
  l'Islande sont géographiquement européens mais conservés ; Chypre est dans
  l'UE et écarté.
- **Limite** : si le champ `countryName` est absent, l'offre est **conservée**.
  Zéro cas observés sur les 782 offres du site.

### E3 — Notation sur le CV seul

- **Règle** : chaque offre retenue reçoit une note **entière de 1 à 10**,
  établie uniquement à partir du profil candidat anonymisé. Aucun autre
  document n'entre en ligne de compte.
- **Acceptation** : une offre sans rapport avec le profil reçoit 1 à 3, une
  offre de tracking ou d'analytique reçoit 7 à 10. Vérifiable en relisant dix
  lignes et leur justification.
- **Conséquence implicite** : l'orientation « data » ne vient pas d'un filtre,
  elle vient du **profil lui-même**. Un profil peu « data » ne fera remonter
  aucune offre data. C'est le prix du choix « score plutôt que filtre ».
- **Confidentialité** : le profil anonymisé est le seul élément transmis. Le CV
  complet ne quitte jamais la machine.

### E4 — Analyse approfondie au-delà de 7

- **Règle** : les cinq colonnes `resume`, `adequation`,
  `points_correspondants`, `a_mettre_en_avant`, `personnalisation` ne sont
  renseignées que pour une note **strictement supérieure** à 7.
- **Acceptation** : toute ligne notée 7 a ces cinq colonnes vides ; toute ligne
  notée 8 les renseigne.

### E5 — Journal figé

- **Règle** : une ligne écrite n'est jamais modifiée ni supprimée.
- **Acceptation** : relancer le workflow alors qu'une offre a changé sur le
  site ne modifie aucune ligne existante.
- **Limite assumée** : une offre qui passe de 1 à 5 places restera affichée à 1,
  silencieusement. C'est le choix fait.

### E6 — Aucun doublon

- **Règle** : une offre dont l'ID figure déjà dans le Sheet n'est jamais
  réinscrite. La source de vérité est le Sheet, pas l'historique n8n.
- **Acceptation** : deux exécutions consécutives sur les mêmes données
  produisent un Sheet strictement identique.

### E7 — Colonne `date`

- **Règle** : `date` est la **date de découverte**, pas la date de publication.
- **Acceptation** : toutes les lignes du backfill portent la date du jour du
  lancement.
- **Limite assumée** : le Sheet ne dit pas depuis quand une offre est en ligne.
  L'API fournit `creationDate` et `startBroadcastDate`, mais le choix a été fait
  de ne pas les stocker.

### E8 — Backfill initial

- **Règle** : au premier lancement, parcourir **toutes les pages** de l'API et
  inscrire les **262 offres hors UE** existantes, pas seulement la première
  page de 100.
- **Acceptation** : après le backfill, le Sheet contient 262 lignes et le
  workflow se termine sans erreur.
- **Modification requise** : le workflow appelle l'API avec `limit: 100` et ne
  pagine pas. Il faut ajouter la boucle pour voir les 262.
- **Limite** : 260 de ces 262 datent de 2026, 2 datent de 2025. Le site supprime
  ses offres mortes, il n'y a donc pas d'archéologie à nettoyer.

### E9 — Échec d'une offre

- **Règle** : trois tentatives automatiques. Si l'offre échoue encore, on
  l'ignore, le lot continue, et l'erreur est inscrite dans l'onglet `Erreurs`.
- **Acceptation** : une offre dont la réponse est illisible est absente du
  Sheet et présente dans `Erreurs` avec `etape = notation`.
- **Limite non couverte** : si la clé Gemini est révoquée ou le quota épuisé,
  l'échec ne touche pas 1 offre mais **les 39 du jour**. Le Sheet se remplit
  d'erreurs et reste vide, silencieusement. Voir question ouverte Q1.

### E10 — Dépendance bloquante : l'onglet `Erreurs`

- **Règle** : l'onglet `Erreurs` doit exister avec ses 9 colonnes **avant la
  première erreur**. Sans lui, l'écriture d'erreur échoue à son tour.
- **Acceptation** : une écriture dans `Erreurs` réussit, sans
  `sheet not found`.
- **Responsable** : Elena. **État : à faire.**
- Colonnes : `date_erreur` · `heure_erreur` · `id_offre` · `titre` ·
  `entreprise` · `lien` · `etape` · `message_erreur` · `a_relancer`

## Comportement en cas d'échec

| Situation | Comportement | Signalé à |
| --- | --- | --- |
| Une offre échoue à la notation | Ignorée, lot continue | Onglet `Erreurs` |
| L'API V.I.E. est indisponible | 3 tentatives, puis le Sheet ne change pas | Onglet `Erreurs` |
| Gemini est indisponible | Voir E9, non couvert | Onglet `Erreurs` |
| L'écriture dans le Sheet échoue | Les offres restent absentes, donc retentées le lendemain | Journal n8n |
| L'onglet `Erreurs` n'existe pas | L'erreur ne peut pas être journalisée | Aucune alerte — voir E10 |

## Variables fixées à la spécification

- **Déclenchement** : quotidien, 8 h 00
- **Modèle** : `gemini-flash-lite-latest`
- **Onglet principal** : `Offres`, 17 colonnes
- **Onglet d'erreurs** : `Erreurs`, 9 colonnes
- **Critère de doublon** : `id`

## Questions restées ouvertes

- **Q1** — Faut-il une garde : si plus de la moitié des offres d'une journée
  échouent, ne rien écrire du tout plutôt que de remplir `Erreurs` de 39 lignes
  identiques ? Question posée, non tranchée.
- **Q2** — Le comportement E2 en cas de `countryName` absent (conserver) n'a
  jamais été exercé, faute de cas réel. À confirmer si l'API change.

## Erreurs commises pendant l'interview

Pour mémoire, et parce qu'elles ont influencé une décision : l'estimation
initiale annonçait ~400 offres d'historique « en grande partie closes depuis
deux ans », qui justifierait un Sheet pollué. Le recomptage sur les 8 pages de
l'API montre 782 offres au total, dont **262 hors UE, et seulement 2
antérieures à 2026**. Le choix B (backfill) s'en trouve nettement moins
coûteux que décrit. Le risque retenu (aucune protection du premier lancement)
a été validé en connaissant les chiffres corrigés.

## Reste à faire avant le premier lancement

1. Créer l'onglet `Erreurs` (E10) — bloquant
2. Ajouter la pagination à l'appel API (E8)
3. Activer le workflow
