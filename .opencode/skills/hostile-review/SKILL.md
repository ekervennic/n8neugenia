---
name: Hostile Review
description: Attaquer un workflow n8n pour prouver qu'il ne fonctionne pas, avant de l'activer. Utiliser quand un workflow doit être validé, mis en production, réveillé après une longue inactivité, ou modifié. Vérifie la structure, le comportement de chaque nœud, les bornes, la continuité en cas de panne et les effets de bord, dans un ordre où aucun test ne pollue la production. Produit des contre-exemples et un rapport de couverture, jamais des encouragements.
---

# Revue hostile

## Posture

Tu ne valides pas. Tu essaies de **casser**.

Un workflow qui résiste à cette revue reçoit un rapport qui dit *ce qui a été
cherché sans succès* — pas un « tout est bon ». Le silence n'est pas une
conclusion, c'est une absence de conclusion. Et **aucun compliment en
ouverture** : un « bien fait » achète le silence sur le reste.

## Règle fondatrice

> Un workflow qui n'a jamais été exécuté n'est pas vérifié. Il est supposé
> fonctionner.

C'est la règle qui empêche toutes les autres. Un graphe peut être
structuralement parfait, valider, et ne rien faire : le validateur n'exécute
rien. La preuve est une **exécution observée**, pas une lecture.

Conséquence pratique : **la revue se conduit dans un ordre imposé.** On ne
passe pas à la porte suivante tant que la précédente n'est pas franchie.
Inverser l'ordre, c'est valider avant d'avoir exécuté quoi que ce soit — c'est
l'erreur exacte qui a produit le défaut le plus grave du projet analysé.

---

## Les six portes

Chacune a une question unique. Une porte non franchie arrête la revue.

### Porte 1 — Intégrité statique

**Question : est-ce que le graphe est complet et cohérent ?**

Sans exécuter. Lecture seule.

- Chaque nœud existe-t-il ? La création d'un workflow peut en perdre
  silencieusement, et le validateur peut répondre `valid: true` malgré ça.
- Chaque connexion pointe-t-elle vers un nœud existant ?
- Les sorties d'un IF sont-elles les deux câblées, aux bons indices ? Un nœud
  Code n'a **qu'une** sortie : un routage en deux branches via Code ne peut pas
  fonctionner, et l'index de sortie invalide passe inaperçu si on ne regarde
  pas les connexions réelles.
- Les références `$('Nœud')` pointent-elles vers des nœuds existants ?
- Les credentials sont-elles posées sur **tous** les nœuds qui en ont besoin ?
- Les paramètres obligatoires sont-ils remplis (`mode` sur un nœud Code,
  `operation` sur un nœud d'application) ?
- **Les noms de colonnes écrits par un nœud correspondent-ils aux noms lus par
  un autre ?** C'est la vérification la plus rentable et la plus souvent
  oubliée. Un nœud qui écrit `"ID offre"` et un autre qui lit `json.id`
  produisent un système silencieusement inerte.

**Ce que cette porte ne prouve pas** : que quoi que ce soit fonctionne. Elle
prouve seulement qu'il n'y a pas de faille immédiatement visible.

### Porte 2 — Contrat de chaque nœud

**Question : chaque nœud fait-il ce qu'on lui demande, sur une entrée connue ?**

Nœud par nœud, avec des données de test qui ne viennent pas de la
production.

Pour chaque nœud, définir **l'entrée attendue**, **la sortie attendue**, puis
vérifier les deux. Une pins de données figée permet de tester un nœud isolé
sans exécuter ce qui est en amont.

Contrats à vérifier en priorité :

- **Normalisation** : chaque champ attendu est-il produit ? Un champ absent
  ici devient un `undefined` silencieux dix nœuds plus loin.
- **Filtre** : une entrée qui doit passer passe-t-elle ? une entrée qui doit
  être rejetée est-elle rejetée ? Un filtre qui rejette tout « fonctionne ».
- **IF** : les deux branches sont-elles atteintes par les bonnes entrées ?
- **Code** : que donne-t-il sur 0 item, sur 1 item, sur `null` ?
- **Écriture** : écrit-il dans le bon document, le bon onglet, avec les bons
  noms de colonnes ?

### Porte 3 — Bornes

**Question : que se passe-t-il aux extrêmes ?**

Quatre entrées, systématiquement :

| Entrée | Ce qu'elle attrape |
|---|---|
| **0 item** | Un nœud aval ne s'exécute pas. Une Fusion attend une entrée qui n'arrivera jamais → l'exécution se suspend. |
| **1 item** | Les boucles `i++`, les index `offres[0]`, les prompts par item. |
| **1000 items** | Limites d'API, pagination, fusion de tableaux, coûts. |
| **Donnée malformée** | `null`, chaîne vide, objet sans le champ attendu, réponse tronquée. |

La borne « 0 item » est la plus sous-testée et la plus destructrice : le
premier lancement d'un workflow qui écrit dans un tableau **vide** est
exactement ce cas.

### Porte 4 — Injection de panne

**Question : le workflow continue-t-il quand une dépendance tombe ?**

Casser volontairement une dépendance, une par une, et observer :

| Dépendance cassée | Comportement attendu |
|---|---|
| L'API externe | Le lot continue, l'erreur est consignée |
| Le LLM | Idem |
| Le tableur | Les données ne sont pas perdues, l'exécution échoue proprement |
| Le credential | Échec net, **et un signal** |

Le test qui compte : **un échec doit-il être visible ?** Un nœud qui
`continueRegularOutput` sur une erreur transforme un incident visible en
absence de données. Si personne n'est prévenu, ce n'est pas de la
robustesse, c'est de la perte silencieuse.

Vérifier aussi que la branche d'erreur **est réellement atteinte**. Une
branche d'erreur dont la condition teste un champ supprimé en amont est du
**code mort** : elle ne se déclenche jamais, et personne ne le remarque.

### Porte 5 — Exécution sans effet de bord

**Question : le workflow complet fait-il son travail, vers où il le doit ?**

C'est la porte que presque tout le monde saute. La technique :

> Épingler les données des nœuds à credentials et des requêtes HTTP, en
> pointant les écritures vers un **tableur jetable**, puis exécuter le
> workflow de bout en bout.

Ce que ça permet, sans rien toucher en production :

- les nœuds de logique (Set, If, Code, Filter, Merge) **s'exécutent
  réellement** — c'est le cœur du workflow
- les appels externes sont simulés, donc gratuits et instantanés
- les écritures vont ailleurs, donc sans conséquence
- le graphe complet est parcouru, donc les câbles sont prouvés

Comparer **avant / après** : nombre de lignes dans le tableau jetable, et
contrôler que le tableau de production n'a pas bougé d'une ligne.

Vérifier ensuite, sur l'exécution capturée :

- quels nœuds **ont** tourné, et lesquels **non** — un nœud jamais exécuté
  est un nœud dont personne ne connaît le comportement
- le nombre d'items à chaque étape : une chute inexpliquée entre deux nœuds
  signale une perte
- le nombre d'appels LLM, pour chiffrer le coût réel

### Porte 6 — Première exécution réelle

**Question : que se passe-t-il quand on arrête de tester ?**

Une seule exécution sur les vraies données, **écriture vers le tableau
jetable encore**, puis lecture du résultat ligne à ligne.

Une ligne lue en entier, pas dix lignes regardées en diagonale.

Avant cette porte, le workflow **reste inactif**. L'activation est la dernière
action du projet, jamais la première.

---

## Surfaces à toujours attaquer

Indépendamment du protocole, ces huit surfaces Structurent toute revue :

| Surface | Attaques |
| --- | --- |
| **Noms** | Un nœud écrit-il le nom qu'un autre lit ? LesCollision de convention tuent en silence. |
| **Flux** | Un item peut-il disparaître entre deux nœuds ? Le recomplage est-il par position ou par clé ? |
| **Bornes** | 0, 1, énorme, malformé. Voir porte 3. |
| **Panne** | Continuité, et **visibilité** de l'échec. |
| **Sécurité** | Secret en clair, donnée personnelle qui sort, échappement. |
| **Effets de bord** | Le test a-t-il écrit en production ? Le test est-il réversible ? |
| **Argent** | Qu'est-ce qui est facturé, à quel volume, et le plafond ? |
| **Réversibilité** | Peut-on défaire ? Combien de lignes à nettoyer à la main ? |

---

## Format du rapport

```markdown
## Verdict
<INACTIF — inactivé | activable | à corriger avant activation>

## Portes
| Porte | Question | Résultat |
|---|---|---|
| 1 | Structure complète ? | … |
| 2 | Contrats respectés ? | … |
| 3 | Bornes gérées ? | … |
| 4 | Continuité en panne ? | … |
| 5 | Exécution sans effet de bord ? | … |
| 6 | Première exécution réelle ? | … |

## Constats
### C1 — <titre>
- **Gravité** : critique | élevée | moyenne | faible
- **Support** : exécuté | lu | déduit
- **Preuve** : sortie de commande, `nœud:ligne`, ou journal d'exécution
- **Contre-exemple** : <entrée → résultat observed>
- **Correctif** : <le plus petit changement>

## Couverture
<Nœuds testés, nœuds jamais exécutés, portes franchies, portes non franchies>

## Effets de bord produits
<Ce qui a été écrit, où, et comment l'annuler>
```

## Ce qu'il ne faut pas faire

- **Ne pas valider une porte non franchie.** Une porte non franchie se
  déclare non franchie, pas « probablement correcte ».
- **Ne pas s'arrêter au premier défaut.** Le plus grave est rarement le premier
  lu.
- **Ne pas écrire en production pour tester.** Un test qui pollue n'est pas un
  test, c'est un accident. Si aucun bac à sable n'est possible, le dire et
  s'arrêter à la porte 4.
- **Ne pas mélanger les niveaux de support.** Un défaut déduit ne s'écrit pas
  comme un défaut exécuté.
- **Ne pas appeler « validé » un workflow non exécuté.** C'est le mensonge
  exact que ce skill existe pour empêcher.

## Autorisation

Si un constat implique de **détruire des données, d'exposer un secret ou de
faire exploser la facture**, il va en première ligne du rapport, sans
attendre la section constats.
