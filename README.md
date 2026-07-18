# Hibol Minesweeper

Un démineur en Vue 3 + Vite, fait pour apprendre le framework. Habillage visuel façon 8-bit (polices pixel, icônes mine/drapeau et bords de case en pixel-art).

## Modes de jeu

### Classique

Une grille de taille fixe, générée entièrement au démarrage de la partie. Les règles habituelles du démineur.

### Infini

Une grille sans limites, générée à la volée à partir d'une seed : chaque case n'existe qu'au moment où elle est explorée. On se déplace en faisant glisser la grille à la souris ou au doigt. Comme il n'y a pas de fin de grille, il n'y a pas de condition de victoire. Toucher une mine n'arrête plus la partie : l'écran s'assombrit progressivement à chaque mine déclenchée, jusqu'à pouvoir abandonner pour figer la partie. Débloqué après une première victoire en mode classique.

## Développement

```bash
npm install
npm run dev
```

- `npm run dev` : serveur de développement
- `npm run build` : build de production
- `npm run preview` : prévisualisation du build
