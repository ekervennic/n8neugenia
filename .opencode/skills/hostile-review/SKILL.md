---
name: Hostile Review
description: Passer en revue un travail — code, spécification, configuration, décision — en cherchant activement ce qui est faux. Utiliser avant une mise en production, avant de valider une décision, ou quand l'utilisateur demande une revue, une relecture ou un avis franc. Produit des contre-exemples concrets, pas des encouragements.
---

# Revue hostile

## Posture

Tu ne relis pas pour valider. Tu relis pour **trouver ce qui est faux**.

Un travail non cassé ne te fait pas dire « c'est bon » : il te fait dire
« j'ai cherché ceci, cela et cela, et je n'ai rien trouvé ». Le silence n'est
pas une conclusion, c'est une absence de conclusion.

**Pas de compliment.** Un « bien fait » en ouverture achète le silence sur tout
le reste, et l'utilisateur ne saura plus que tu n'as rien trouvé.

## Déroulé

### 1. Lire l'artefact, pas sa description

Ouvre le code, la config, le diff, le document. La description qu'on t'en fait
est une hypothèse, pas une preuve. Une revue faite à partir du résumé d'un
travail ne l'a pas vraiment revue.

### 2. Attaquer

Pour chaque surface, cherche le **chemin vers le défaut**, pas le défaut
imaginé :

| Surface | Attaques |
| --- | --- |
| **Entrées** | Vide, nulle, énorme, négatif, unicode, chevauchement d'encodage, type inattendu |
| **Frontières** | Off-by-one, inclusivité, limites de plage, unités, fuseaux horaires |
| **Échecs** | Panne du tiers, timeout, réponse à moitié reçue, identifiants expirés, quota épuisé |
| **État** | Deux exécutions concurrentes, ré-exécution, reprise après interruption, ordre d'arrivée |
| **Sécurité** | Secrets en clair, données personnelles qui sortent, échappement, traversée de chemin, injection |
| **Coût** | Appels répétés, quotas, ce qui explode à l'échelle, ce qui est facturé |
| **Réversibilité** | Peut-on défaire ? Un test manuel a-t-il pollué la production ? |
| **Dégradation silencieuse** | Que perd-on sans que personne ne le remarque ? |

Sur chaque point, formule le **contre-exemple concret** : l'entrée qui produit
le mauvais résultat. Un défaut sans scénario d'atteinte est une hypothèse, pas
une découverte.

### 3. Trier

Classe chaque constat et **étiquette son support** :

- **Confirmé** — lu dans le code, ou reproduit
- **Probable** — le chemin existe, non exécuté
- **Spéculatif** — pas de chemin d'atteinte trouvé ; dis-le, et demande ce qui
  le rendrait possible

Ne présente jamais un spéculatif comme un défaut. Un rapport qui mélange les
trois est plus difficile à trier qu'un rapport vide.

### 4. Rapporter la couverture

Termine par ce que tu as cherché sans trouver. C'est cette section qui permet à
l'utilisateur de décider s'il accepte le risque résiduel.

## Format

```markdown
## Résumé
<N Found/trouvé — ou "Rien sur <surface>", et ce que j'ai cherché>

## Constats

### C1 — <titre court>
- **Gravité** : bloquant | important | mineur
- **Support** : confirmé (lu) | confirmé (exécuté) | probable
- **Preuve** : `fichier:ligne` ou sortie de commande
- **Contre-exemple** : <entrée → résultat attendu>
- **Correctif** : <le plus petit changement qui suffit>

## Coverage
<Surfaces inspectées, y compris celles où rien n'a été trouvé>

## Risque résiduel
<Ce qui reste non couvert, et pourquoi>
```

## Ce qu'il ne faut pas faire

- **N'invente pas un défaut pour justifier ton rapport.** Un rapport vide avec
  une couverture détaillée vaut mieux qu'un rapport rempli de suppositions.
- **Ne t'arrête pas au premier problème.** Le plus grave est rarement le
  premier lu.
- **Ne revues pas le style.** Le style n'est pas un défaut.
- **Ne propose pas une réécriture complète.** Le correctif doit être le plus
  petit qui règle le constat ; la refonte est une autre conversation.
- **Ne confonds pas « je n'ai pas compris » et « c'est faux ».** Si un passage
  est ambigu, dis qu'il est ambigu.

## Autorisation

Signale ce qui pourrait **détruire des données, exposer un secret ou coûter de
l'argent en production**. Si un constat exige une action immédiate, dis-le en
première ligne.
