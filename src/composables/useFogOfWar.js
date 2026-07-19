import { computed } from 'vue'
import { getDarkness, DARKNESS_MINE_THRESHOLD } from '../game/game'

// Exposant < 1 (concave) plutôt que > 1 : monte vite dès les premières
// mines, pour que l'effet soit déjà visible tôt. Le resserrement final vers
// ~3 cases ne dépend pas de la forme de cette courbe mais du rayon cible fixe
// dans clearRadiusOn — donc pas de perte sur la sévérité au plafond.
const DARKNESS_CURVE_EXPONENT = 0.4

// Une ellipse de rayons (largeur/2, hauteur/2) touche pile les bords du
// viewport mais laisse ses coins dehors (plus loin du centre qu'un bord) :
// il faut un facteur >= racine de 2 pour que les coins rentrent dedans. 1.5
// donne une marge confortable pour qu'il n'y ait vraiment rien de visible à
// darkness 0, quelle que soit la forme du viewport.
const CORNER_COVERAGE = 1.5

export function useFogOfWar(game, viewportWidth, viewportHeight, cellSize) {
  const darkness = computed(() => getDarkness(game.value) ** DARKNESS_CURVE_EXPONENT)

  // Progresse de 0 à 1 en fonction du nombre de mines seul (pas de darkness,
  // donc pas de l'exposant concave ci-dessus) : atteint 1 à la moitié du seuil
  // puis y reste — c'est ce qui pilote le passage ellipse -> cercle, séparément
  // de la taille du voile.
  const roundness = computed(() =>
    Math.min(1, game.value.minesTriggeredCount / (DARKNESS_MINE_THRESHOLD / 2))
  )

  // Rayons (en px, un par axe pour suivre le ratio du viewport plutôt qu'un
  // cercle) où le voile redevient transparent. Partent d'une ellipse qui
  // couvre tout le viewport, coins compris (donc hors champ à darkness 0), et
  // se resserrent vers 1.5 case (~3 cases de diamètre) au plafond — les coins,
  // plus loin du centre, se couvrent naturellement avant les bords.
  function clearRadiusOn(dimension) {
    const ellipticalStart = (dimension.value / 2 + 1) * cellSize * CORNER_COVERAGE
    const circularStart = (Math.max(viewportWidth.value, viewportHeight.value) / 2 + 1) * cellSize * CORNER_COVERAGE
    const startRadius = ellipticalStart * (1 - roundness.value) + circularStart * roundness.value
    const endRadius = cellSize * 1.5
    return startRadius * (1 - darkness.value) + endRadius * darkness.value
  }

  const clearRadiusX = computed(() => clearRadiusOn(viewportWidth))
  const clearRadiusY = computed(() => clearRadiusOn(viewportHeight))

  return { darkness, clearRadiusX, clearRadiusY }
}
