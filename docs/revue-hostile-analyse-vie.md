# Revue hostile — workflow `Analyse V.I.E. quotidienne`

`xRmMRMGI8bOHBSN4` — 30 septembre 2026

Protocole : les six portes de `.opencode/skills/hostile-review/SKILL.md`, dans
l'ordre. Porte 6 **non franchie**, pour un motif précisé plus bas.

## Verdict

**INACTIF — ne pas activer.** Un défaut critique rend le workflow
contre-productif, et la dernière porte n'a pas pu être franchie sans écrire
dans ton Sheet.

## Portes

| Porte | Question | Résultat |
| --- | --- | --- |
| 1 | Structure complète et cohérente ? | **rouge** — 2 défauts |
| 2 | Chaque nœud respecte-t-il son contrat ? | **rouge** — 1 défaut, 12 champs morts |
| 3 | Les bornes sont-elles gérées ? | **rouge** — premier lancement bloqué |
| 4 | Le workflow continue-t-il en cas de panne ? | **non franchie** — dépend de la 2 |
| 5 | Exécution complète sans effet de bord ? | **franchie** — exécution 101 |
| 6 | Première exécution réelle ? | **non franchie** — exigerait l'écriture |

---

## Porte 5 — le test qui compte

C'est la première fois que ce workflow est exécuté. Protocole : épingler le
déclencheur, l'appel HTTP et les trois nœuds Google Sheets, injecter trois
offres réelles dont une française, laisser tous les nœuds de logique s'exécuter
pour de vrai.

Entrée injectée : Maroc (data), France (non data), Singapour (data).

Résultat rapporté par l'outil : `status: success`, aucune erreur.

**Ce que l'outil ne disait pas** — et qu'il fallait aller chercher :

| Nœud | A tourné | Items sortants |
| --- | --- | --- |
| Chaque jour à 8h | oui | 1 |
| Profil candidat | oui | 1 |
| Appel API V.I.E. | oui | 1 |
| Séparer les offres | oui | 3 |
| Normaliser | oui | 3 |
| Offre en erreur ? | oui | 3 |
| **Construire ligne erreur** | **jamais** | — |
| **Consigner dans Erreurs** | **jamais** | — |
| Fusion | oui | 3 |
| Lire le Sheet | oui | 1 |
| Agréger les ID | oui | 1 |
| Dédoublonner | oui | 3 |
| Hors Europe | oui | 3 |
| Notifier | oui | 2 |
| Parser la note | oui | 2 |
| Note > 7 ? | oui | 2 |
| **Analyser** | **jamais** | — |
| **Parser analyse** | **jamais** | — |
| Préparer ligne | oui | 2 |
| Ajouter au Sheet | oui | 1 |

16 nœuds sur 20 exécutés. Quatre jamais touchés — dont toute la gestion
d'erreur.

---

## Constats

### C1 — Le filtre géographique ne filtre pas

**Gravité : critique** — **Support : exécuté** (exécution 101)

Le nœud `Hors Europe` a bien évalué sa condition. Il a bien classé les
conformes en tête. Et il **a conservé les non conformes**.

```
entrée du filtre  : MAROC, FRANCE, SINGAPOUR
sortie du filtre  : MAROC, SINGAPOUR, FRANCE
```

`parameters.options` vaut `{}`. L'option `discardInactiveItems` du nœud Filter
n'est pas activée : sans elle, le nœud **classe** au lieu d'**éliminer**.

J'ai vérifié que l'expression était innocente — évaluée hors n8n, elle renvoie
`false` pour FRANCE, `true` pour MAROC. C'est bien le nœud, pas la condition.

**Contre-exemple** : toute offre européenne passe le filtre et atteint le
Sheet. Sur 100 offres réelles, 59 sont européennes : **le Sheet recevrait 100
lignes au lieu de 41**, et l'exigence « hors d'Europe » serait inversée.

**Correctif** : `options.discardInactiveItems = true`. Un paramètre.

**Support de la preuve** : exécution réelle, ordre des données observé. C'est
la constatation la mieux établie de cette revue.

### C2 — Le dédoublonnage ne dédoublonne pas

**Gravité : critique** — **Support : exécuté et relu**

`Préparer ligne` écrit la colonne `"ID offre"`. `Agréger les ID` relit
`i.json.id`. La clé n'existe pas, la chaîne vide, le `Set` reste vide, et
`Dédoublonner` laisse tout passer.

Dans le test, le Sheet injecté était vide donc le défaut ne pouvait pas
apparaître — mais la chaîne est lisible au repos, et le comportement a été
confirmé par lecture.

**Correctif** : une seule convention de nom, des deux côtés.

### E1 — La gestion d'erreur est du code mort

**Gravité : élevée** — **Support : exécuté**

`Construire ligne erreur` et `Consigner dans Erreurs` **n'ont jamais tourné**,
malgré la présence d'une offre française dans le flux. Ce n'est pas un
défaut de branchement : la condition `Boolean($json.error)` teste un champ que
`Normaliser` supprime.

Conséquence : l'onglet `Erreurs` que tu dois créer ne recevra jamais rien. La
dépendance E10 de la spécification est sans objet.

**Corollaire** : le jour où une offre échoue réellement, elle disparaît sans
trace. Pas d'erreur visible, pas de ligne dans le journal — la robustesse
annoncée n'existe pas.

### M1 — Le premier lancement peut se bloquer

**Gravité : élevée** — **Support : exécuté, partiel**

`Lire le Sheet` sur un onglet vide renvoie 0 item. `Agréger les ID` n'a pas
d'`alwaysOutputData`. Un nœud Code sans entrée ne produit rien. La `Fusion`
attend sa seconde entrée.

Dans le test, j'ai injecté `{}` pour le Sheet, donc `Lire le Sheet` a bien
produit un item et la Fusion a été atteinte. **La condition de blocage n'a
donc pas été reproduite** : elle demande un onglet réellement vide, ce que je
ne peux pas simuler par épinglage. Le risque reste ouvert.

### M2 — Recollage par indice

**Gravité : moyenne** — **Support : lu**

`Parser la note` et `Parser analyse` recolent par `offres[i]`. Toute perte
d'item en amont décale l'attribution des notes, silencieusement.

Dans le test, `Notifier` a produit 2 items pour 3 en entrée (l'offre
française a été mangée par le parseur) et le recalage n'a pas bronché — parce
que l'item perdu était aussi le dernier. Avec une perte en milieu de flux, les
notes seraient mal attribuées.

### M2b — Douze champs lus, jamais produits

**Gravité : moyenne** — **Support : exécuté**

`Préparer ligne` lit 21 champs. Neuf sont produits par `Normaliser`. Les
douze autres — `intitule`, `url`, `note`, `resume`, `adequation`,
`personalisation`… — ne sont créés qu'en partie, et cinq sont inatteignables.

L火花 que j'ai vue à l'écran : `note` n'apparaît nulle part dans le code
parsé. Les colonnes Noter et Justification seraient vides à l'écriture.

**Contre-exemple** : une offre notée 8 s'écrit avec une note vide. Le
classement par note — la fonction centrale du projet — disparaît du Sheet.

### E2 — Deux tableurs, un onglet fantôme

**Gravité : élevée** — **Support : lu**

`Lire le Sheet` et `Ajouter au Sheet` visent `16pnq…`, `Consigner dans
Erreurs` vise `6pnq…`. Onglet visé : `Sheet1`, alors que la spécification
annonce `Offres`.

### F1 — Cinq nœuds Code sans paramètre `mode`

**Gravité : faible** — **Support : exécuté**

Ils ont tourné dans le test, donc le défaut par défaut s'applique. À
corriger quand même.

---

## Ce que cette revue ne prouve pas

Je le dis explicitement, c'est le plus important du rapport :

- **La porte 6 n'a pas été franchie.** Je n'ai pas exécuté le workflow contre
  ton vrai Sheet. Cela aurait écrit des lignes réelles — et avec C1 et C2
  actifs, elles auraient été **erronées** : doublons et offres européennes.
  Écrire faux est pire que ne rien écrire.
- **Le contenu de ton Sheet m'est inaccessible.** Les noms d'onglet et les
  en-têtes réels sont déduits des paramètres du workflow, pas observés. Si
  ton onglet s'appelle `Sheet1`, E2 tombe ; s'il s'appelle `Offres`, le
  workflow échouera.
- **La porte 4 n'a pas été testée.** C1 et E1 la rendent sans objet : tant que
  le filtre ne filtre pas et que la branche d'erreur est morte, tester la
  continuité revient à tester un système qui ne fait pas ce qu'il annonce.
- **Le comportement en conditions réelles n'est pas observé.** J'ai injecté
  trois offres. Le comportement sur 262, avec les limites de l'API et le
  quota du LLM, n'a pas été établi.

## Portes restantes, dans l'ordre

1. Corriger C1 (`discardInactiveItems`), C2 (nom de colonne), E1 (test avant
   `Normaliser`), E2 (tableur et onglet)
2. Rejouer la porte 5 — le test est reproductible en trente secondes
3. Puis seulement, la porte 4 : casser une dépendance, vérifier que le lot
   continue **et** que l'erreur est visible
4. Porte 6 : une exécution réelle vers ton Sheet, ligne relue en entier

Le test de la porte 5 est rejouable autant de fois que nécessaire. C'est ce
qui manquait au projet, et ce que ce skill apporte.

## Effets de bord produits

**Aucun.** Toutes les écritures étaient épinglées. L'exécution 101 n'a rien
touché : ni ton Sheet, ni ton quota Gemini (le nœud `Notifier` était épinglé),
ni le tableur d'erreurs.
