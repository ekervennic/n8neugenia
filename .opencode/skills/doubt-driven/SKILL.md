---
name: Doubt-Driven Development
description: Développer et vérifier en ne croyant aucune affirmation — ni la sienne, ni celle d'un outil. Utiliser quand l'on annonce que quelque chose marche, avant de déclarer une tâche terminée, ou quand un outil renvoie un message de succès. Empêche de rapporter « ça marche » sur la seule foi d'un code de sortie nul.
---

# Développement guidé par le doute

## Principe

> Un outil qui dit « succès » prouve qu'il a rendu la main, pas qu'il a fait
> ce qu'on attendait.

Le doute n'est pas de la pessimisme. C'est une discipline : **avant d'affirmer
que X marche, produire l'observation qui prouverait que ça ne marche pas.**

## Les quatre niveaux d'affirmation

Étiquette chaque affirmation. Ne monte jamais d'un cran sans preuve.

| Niveau | Ce qui l'autorise |
| --- | --- |
| **Exécuté** | J'ai fait tourner et j'ai regardé le résultat |
| **Lu** | J'ai lu le résultat dans la source, pas dans le résumé |
| **Déduit** | Je sais que c'est cohérent, je ne l'ai pas vu |
| **Supposé** | Je n'ai ni preuve ni raisonnement solide |

« Le fichier existe » peut être **lu**. « L'API accepte la clé » ne peut être
qu'**exécuté**. « Ça marchera » est **supposé** jusqu'à preuve du contraire.

## Réflexe : nommer le test qui casse

Avant de déclarer que c'est terminé :

1. **Que devais-je voir, et qu'aurais-je vu si c'était faux ?**
2. Fais cette observation-là, pas une autre.
3. **Y a-t-il une partie que je ne regarde pas du tout ?**

Le piège est presque toujours de faire un contrôle qui **confirme** au lieu
d'un contrôle qui **tente de réfuter**. Un `grep` qui cherche ce que tu sais
présent ne prouve rien ; un test qui vérifie l'absence de fuite, sur les
fichiers réellement concernés, prouve quelque chose.

## Pièges documentés

Chacun de ceux-ci a déjà produit un faux « tout est bon » dans ce projet.

**Le message de succès ment.** Un outil a créé un workflow en annonçant
`nodeCount: 16` alors que 4 nœuds avaient été silencieusement perdus ; le
validateur, lui, répondait `valid: true`. Seule la relecture du graphe réel a
révélé les nœuds manquants.

**Un script de vérification peut mentir mieux que le code.** Trois contrôles
successifs ont annoncé « 0 fichier contient le secret » alors que la clé était
présente dans deux fichiers, à cause de :
- `grep -c … || echo 0` qui concaténait deux zéros au lieu d'en produire un ;
- `xargs` qui cassait sur les noms de fichiers contenant des espaces ;
- `git` qui renvoyait les noms entre guillemets, rendant la recherche muette.

Le même script affirmait ensuite « Russie exclue » à cause d'une recherche par
sous-chaîne : `RUSSIE` matche dans `BIELORUSSIE`.

**L'identifiant presque identique passe inaperçu.** `dedoublonner` déclaré,
`deduplonner` appelé : la différence tient à une lettre et aucun diff visuel ne
la montre.

**Un caractère non-ASCII dans un identifiant** casse silencieusement l'analyse.

## Méthode de vérification

1. **Falsifier d'abord.** Cherche le cas qui casse avant le cas qui marche.
2. **Vérifie la couverture, pas juste le résultat.** Combien d'éléments as-tu
   réellement testés, sur combien de surface réelle ?
3. **Rebelote si le test peut mentir.** Le test est-il capable de passer pour
   une réussite ? Fais-le passer sur un cas qui *devrait* échouer — s'il passe
   quand même, le test est inutile.
4. **Lis le résultat brut**, pas seulement le code de sortie ni le résumé.
5. **Reprends les fichiers un par un**, avec une boucle qui gère les espaces
   et les caractères spéciaux.

## Rendre compte

Ne dis jamais « c'est bon » seul. Donne la preuve et sa limite :

```
<Ce que j'ai fait>
<Ce que j'ai observé — la sortie, pas le résumé>
<Ce que je n'ai PAS vérifié>
<Ce qui a failli passer pour un succès>
```

## Signal d'alerte

Ressaisis le contexte si tu t'entends dire :

- « ça devrait marcher »
- « je suppose que… »
- « l'outil a dit que c'était bon »
- « normalement les données sont là »

Chacun de ces phrases est le début d'une affirmation non étiquetée. Arrête-toi,
fais l'observation manquante, puis rapporte avec son niveau.
