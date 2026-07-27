# Hibol Minesweeper

Un démineur en Vue 3 + Vite, fait pour apprendre le framework. Habillage visuel façon 8-bit (polices pixel, icônes mine/drapeau et bords de case en pixel-art).

## Modes de jeu

### Classique

Une grille de taille fixe, générée entièrement au démarrage de la partie. Les règles habituelles du démineur.

### Infini

Une grille sans limites, générée à la volée à partir d'une seed : chaque case n'existe qu'au moment où elle est explorée. On se déplace en faisant glisser la grille à la souris ou au doigt. Comme il n'y a pas de fin de grille, il n'y a pas de condition de victoire. Toucher une mine n'arrête plus la partie : l'écran s'assombrit progressivement à chaque mine déclenchée, jusqu'à pouvoir abandonner pour figer la partie. Débloqué après une première victoire en mode classique.

## Paramètres de gameplay

Référence de tous les paramètres qui influencent la difficulté/le ressenti en mode infini (le classique n'a que `width`/`height`/`mineCount`, fixés à 10×10/20 dans `App.vue`). L'essentiel vit dans `src/game/game.js` ; `DARKNESS_CURVE_EXPONENT`/`CORNER_COVERAGE` sont dans `src/composables/useFogOfWar.js` (purement visuels) ; les overrides du mode 3 (bouton DEV) sont dans `src/App.vue`.

### Vue d'ensemble

| Paramètre | Défaut | Où | Rôle |
|---|---|---|---|
| `baseDensity` | 0.15 | par partie | densité de mines à l'origine (0,0) |
| `MAX_DENSITY` | 0.25 | constante | plafond de densité, jamais dépassé |
| `densityScale` | 60 | par partie (`DEFAULT_DENSITY_SCALE`) | distance à laquelle la densité approche le plafond |
| `DENSITY_CHUNK_SIZE` / `DENSITY_JITTER` | 24 / 0.045 | constantes | bruit par poches, casse les anneaux concentriques |
| `MAX_OPENING_REVEAL` | 60 | constante | taille max de la zone auto-ouverte au démarrage |
| `darknessMineThreshold` | 15 | par partie (`DEFAULT_DARKNESS_MINE_THRESHOLD`) | mines déclenchées (net des cœurs) pour l'assombrissement max |
| `DARKNESS_CURVE_EXPONENT` | 0.4 | constante | courbure visuelle de l'assombrissement |
| `CORNER_COVERAGE` | 1.5 | constante | géométrie du voile (coins couverts), purement visuel |
| `HEART_DENSITY_MIN` / `MAX` | 0.003 / 0.01 | constantes | fourchette de densité des cœurs |
| `heartDensityScale` | 1 | par partie | multiplicateur global des cœurs (0 = désactivés) |
| `heartMinDensity` | 0.23 | par partie | coupure dure : pas de cœur sous cette densité de mine locale |
| `ROBOT_DENSITY_MIN` / `MAX` | 0.001 / 0.006 | constantes | fourchette de densité des robots |
| `robotDensityScale` | 1 | par partie | multiplicateur global des robots |
| `ROBOT_MAX_STEPS` | 10 | constante | cases max explorées par une marche de robot |
| `ROBOT_STEP_DELAY_MS` | 220 | App.vue | cadence visuelle de l'animation (aucun effet sur le gameplay réel) |

### Densité de mines et danger

La densité (probabilité qu'une case donnée soit une mine) suit une approche exponentielle amortie de `baseDensity` vers `MAX_DENSITY` à mesure qu'on s'éloigne de l'origine :

```
densityAt(distance) = MAX_DENSITY - (MAX_DENSITY - baseDensity) × e^(-distance / densityScale)
```

Courbe : à `distance = densityScale`, ~63 % de l'écart base→plafond est comblé ; à `3 × densityScale`, ~95 %. Plus `densityScale` est petit, plus la difficulté grimpe vite avec l'éloignement (c'est le levier utilisé par le mode 3, voir plus bas) — `baseDensity`, lui, ne fait que déplacer le point de départ de la courbe, pas sa pente.

Un bruit de valeur par blocs (`DENSITY_CHUNK_SIZE` cases, interpolé, amplitude `DENSITY_JITTER`) s'ajoute au résultat pour créer des poches plus ou moins denses à distance égale — sans lui, deux cases à la même distance de l'origine auraient exactement la même densité, ce qui se verrait comme des anneaux concentriques parfaits.

`getDangerLevel` normalise tout ça en `[0, 1]` : `(densityAt - baseDensity) / (MAX_DENSITY - baseDensity)`. C'est cette version normalisée — pas la densité brute — qui pilote la barre DANGER du footer et sert de base à la densité des cœurs et des robots (voir plus bas) : plus une zone est dangereuse, plus elle a de chances d'offrir un cœur ou un robot, en plus des mines elles-mêmes. Boucle de compensation délibérée : le jeu devient plus dur et donne plus de "chances" en même temps.

`MAX_OPENING_REVEAL` n'influence pas la densité elle-même, mais la génération : si le flood-fill auto-ouvert à (0,0) au lancement d'une partie dépasse cette taille, la seed est incrémentée et on recommence — évite de démarrer sur une poche à 0 mine démesurément grande.

### Assombrissement (fog of war)

Le ratio brut d'assombrissement est `min(1, effectiveMines / darknessMineThreshold)`, où `effectiveMines = max(0, minesTriggeredCount - heartsCollectedCount)` — chaque cœur ramassé compense une mine déclenchée dans ce ratio, sans jamais faire redescendre le compteur `minesTriggeredCount` affiché au footer.

Ce ratio brut passe ensuite par une courbe concave avant d'être appliqué visuellement : `darkness_visuel = darkness_brut ^ DARKNESS_CURVE_EXPONENT` (0.4). Un exposant < 1 fait monter l'effet vite dès les premières mines (déjà nettement assombri après peu de mines déclenchées), puis plafonne — plutôt qu'une montée linéaire qui resterait discrète longtemps avant de s'accélérer.

Indépendamment, `roundness` (= `min(1, minesTriggeredCount / (darknessMineThreshold / 2))`, sur le compteur brut, pas net des cœurs) pilote la transition entre un voile elliptique (couvre tout le viewport, coins compris grâce à `CORNER_COVERAGE`) et un voile circulaire resserré — atteint son maximum à la moitié du seuil, indépendamment de si des cœurs font redescendre `darkness_visuel` ensuite.

Le bouton "Give up" ne dépend d'aucune de ces courbes : `canGiveUp` ne regarde que `minesTriggeredCount >= darknessMineThreshold` (compteur brut), pour rester disponible même si des cœurs ont fait redescendre `darkness` sous 1 après franchissement du seuil.

### Cœurs et robots

Même mécanisme pour les deux, une fourchette `[MIN, MAX]` mise à l'échelle linéairement par `getDangerLevel`, multipliée par un scale par-partie :

```
heartDensityAt  = (HEART_DENSITY_MIN  + (HEART_DENSITY_MAX  - HEART_DENSITY_MIN)  × dangerLevel) × heartDensityScale
robotDensityAt  = (ROBOT_DENSITY_MIN  + (ROBOT_DENSITY_MAX  - ROBOT_DENSITY_MIN)  × dangerLevel) × robotDensityScale
```

Les robots sont volontairement plus rares que les cœurs (fourchette max ~×1,7 plus basse). Aucun des deux n'apparaît pendant la zone d'ouverture auto (`openingInProgress`) ni sur une case mine ; un cœur ne peut pas non plus être un robot (exclusivité : mine > cœur > robot). Les cœurs ont en plus une coupure dure, `heartMinDensity` (0.23) : sous cette densité de mine locale, aucun cœur n'apparaît quelle que soit `heartDensityAt` — valeur calée via `scripts/autoplay.js --heartMinDensity=X` (sous 0.2, quasi aucun effet sur le taux de parties qui plafonnent l'assombrissement ; au-dessus de 0.23, les cœurs deviennent trop rares pour servir de "coup de chance"). Les robots n'ont pas cette coupure pour l'instant.

Une marche de robot va jusqu'à `ROBOT_MAX_STEPS` (10) cases non révélées/non flaggées, une à la fois, en s'arrêtant plus tôt si elle est bloquée ou tombe sur une mine (neutre : révélée mais ne compte pas dans `minesTriggeredCount`). `ROBOT_STEP_DELAY_MS` ne change que le rythme de l'animation à l'écran, aucun effet sur l'issue de la marche (déjà résolue d'un coup côté moteur).

### Mode 3 (bouton DEV, prototype)

Reprend exactement le moteur infini, avec deux overrides seulement :

- `densityScale` = `DEFAULT_DENSITY_SCALE / 4` (15 au lieu de 60) — la rampe de densité atteint le plafond ~4× plus vite en distance.
- `darknessMineThreshold` = 8 (au lieu de 15) — l'assombrissement plafonne avec deux fois moins de mines déclenchées.

`baseDensity`, `heartDensityScale`, `heartMinDensity` et `robotDensityScale` restent identiques au mode infini normal — cœurs et robots suivent donc exactement la même politique, juste rencontrés plus tôt puisque `getDangerLevel` grimpe plus vite avec la distance.

### Simuler pour tuner

`scripts/autoplay.js` (bot solveur déterministe) prend tous ces paramètres en ligne de commande — `--baseDensity`, `--densityScale`, `--darknessMineThreshold`, `--heartDensityScale`, `--heartMinDensity`, `--robotDensityScale`, plus `--errorRate` pour simuler un joueur plus ou moins distrait (clic risqué aléatoire parmi les candidats de bordure) — et rejoue des centaines/milliers de parties d'un coup, avec des stats agrégées (mean/median/min/max/p90) sur `revealedCount`, `minesTriggeredCount`, `heartsCollectedCount`, `robotsTriggeredCount`, `movesToCap`, etc. :

```bash
node scripts/autoplay.js --games=200 --mode=infinite --errorRate=0.1
node scripts/autoplay.js --games=1 --render=grid.svg   # visualiser la dernière grille en SVG
```

C'est l'outil qui a servi à caler `densityScale`/`darknessMineThreshold` du mode 3 cette session — `heartMinDensity` avait été calé de la même façon avant. Les cœurs et robots n'ont pour l'instant été tunés qu'à l'œil/en jouant, pas encore passés au crible d'un sweep systématique comme la densité.

## Développement

```bash
npm install
npm run dev
```

- `npm run dev` : serveur de développement
- `npm run build` : build de production
- `npm run preview` : prévisualisation du build
