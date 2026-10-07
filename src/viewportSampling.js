// Échantillonnage d'une valeur sur une grille de points répartis dans le
// viewport (danger bar). Une grille plutôt qu'un seul point au centre :
// getDangerLevel plafonne (MAX_DENSITY) avant que l'œil ne perçoive une zone
// comme dense. Fractions du viewport (pas un nombre fixe de cases), donc
// proportionnel au zoom sans logique dédiée.
export const DANGER_SAMPLE_STEPS = 5

// Appelle visit(x, y) au centre de chaque cellule de la grille `steps × steps`
// couvrant `view` = { left, top, width, height } (coordonnées monde).
function visitGrid(view, steps, visit) {
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      visit(
        view.left + ((i + 0.5) / steps) * view.width,
        view.top + ((j + 0.5) / steps) * view.height,
      )
    }
  }
}

// Moyenne de sampleAt(x, y) sur la grille.
export function averageOverViewport(
  view,
  sampleAt,
  steps = DANGER_SAMPLE_STEPS,
) {
  let total = 0
  visitGrid(view, steps, (x, y) => {
    total += sampleAt(x, y)
  })
  return total / (steps * steps)
}

// Maximum de sampleAt(x, y) sur la grille, plancher 0 : une seule zone en vue
// suffit, pas de dilution par moyenne.
export function maxOverViewport(view, sampleAt, steps = DANGER_SAMPLE_STEPS) {
  let max = 0
  visitGrid(view, steps, (x, y) => {
    max = Math.max(max, sampleAt(x, y))
  })
  return max
}
