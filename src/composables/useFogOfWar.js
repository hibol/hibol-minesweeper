import { computed } from 'vue'
import { getDarkness } from '../game/game'

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

// viewportWidth/viewportHeight sont en NOMBRE DE CASES (pas en pixels) et
// suivent le zoom (cf. cellsAcross/cellsDown dans useViewportCamera).
// baseCellSize (px) est la taille de case au zoom neutre : sert à figer le
// rayon de départ du voile sur une portion FIXE du monde plutôt que sur le
// nombre de cases affichées — cf. clearRadiusOn.
export function useFogOfWar(game, viewportWidth, viewportHeight, cellSize, baseCellSize) {
  const darkness = computed(() => getDarkness(game.value) ** DARKNESS_CURVE_EXPONENT)

  // Progresse de 0 à 1 en fonction du nombre de mines seul (pas de darkness,
  // donc pas de l'exposant concave ci-dessus) : atteint 1 à la moitié du seuil
  // puis y reste — c'est ce qui pilote le passage ellipse -> cercle, séparément
  // de la taille du voile.
  const roundness = computed(() =>
    Math.min(1, game.value.minesTriggeredCount / (game.value.darknessMineThreshold / 2))
  )

  // Rayon (px) au-delà duquel le voile redevient opaque. Deux régimes :
  //
  // - darkness 0 : AUCUN voile, quel que soit le zoom. On renvoie la diagonale
  //   réelle du viewport (viewportWidth/Height * cellSize ≈ taille px du
  //   conteneur) pour couvrir jusqu'aux coins. Le rayon ancré au monde
  //   ci-dessous, lui, laisserait les coins dans le voile une fois bien
  //   dézoomé — d'où ce cas à part.
  //
  // - darkness > 0 : le rayon correspond à un nombre FIXE de cases-monde,
  //   indépendant du zoom. viewportWidth/Height (en cases) suivent le zoom,
  //   mais viewport * cellSize ≈ px du conteneur (constant) : diviser par
  //   baseCellSize redonne un compte de cases figé sur le zoom neutre, qu'on
  //   re-multiplie par la taille de case courante. Sans ça, dézoomer élargit
  //   la zone sans voile en cases-monde (le rayon de départ était calé sur le
  //   nombre de cases AFFICHÉES) — un moyen de grappiller de la visibilité sur
  //   une zone dangereuse rien qu'en dézoomant.
  function clearRadiusOn(dimensionCells) {
    if (darkness.value === 0) {
      return Math.hypot(
        viewportWidth.value * cellSize.value,
        viewportHeight.value * cellSize.value
      )
    }

    const baseDimCells = (dimensionCells.value * cellSize.value) / baseCellSize
    const baseMaxCells =
      (Math.max(viewportWidth.value, viewportHeight.value) * cellSize.value) / baseCellSize

    const ellipticalStart = (baseDimCells / 2 + 1) * cellSize.value * CORNER_COVERAGE
    const circularStart = (baseMaxCells / 2 + 1) * cellSize.value * CORNER_COVERAGE
    const startRadius = ellipticalStart * (1 - roundness.value) + circularStart * roundness.value
    const endRadius = cellSize.value * 1.5
    return startRadius * (1 - darkness.value) + endRadius * darkness.value
  }

  const clearRadiusX = computed(() => clearRadiusOn(viewportWidth))
  const clearRadiusY = computed(() => clearRadiusOn(viewportHeight))

  return { darkness, clearRadiusX, clearRadiusY }
}
