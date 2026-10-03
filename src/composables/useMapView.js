import { ref, computed, watch, toRaw } from "vue"
import { MIN_CELL_SIZE } from "./useViewportCamera"
import { MAP_FLOOR_MAX, adaptiveMinCellSize, touchedBounds } from "../mapRender"

// Voile au niveau carte. true : même calcul qu'en jeu, le rayon ancré au monde
// se resserre à l'écran quand on dézoome (voulu : l'obscurité désoriente).
// false : pas de voile tant que la carte est affichée.
export const MAP_VIEW_KEEPS_FOG = true

// Sous le plancher historique des MineCell, on passe au canvas de carte.
export const MAP_LEVEL_THRESHOLD = MIN_CELL_SIZE

// Zone tapable minimale du rectangle cible (px) : à fort dézoom il ne fait que
// quelques pixels, impossible à viser au doigt sinon.
const MIN_TARGET_HIT_PX = 44

// Niveau carte (infini/trésor, cellSize < MAP_LEVEL_THRESHOLD) : boîte de la
// zone touchée, plancher de zoom adaptatif, cible du double tap.
// deps : refs caméra d'App.vue + centerOn, et beforeJump (annule les tweens).
export function useMapView(game, deps) {
  const {
    infiniteLike,
    cellSize,
    originX,
    originY,
    containerWidth,
    containerHeight,
    baseCellSize,
    centerOn,
    confirmedHeartsCount,
    robotStepTick,
    beforeJump = () => {},
  } = deps

  const mapActive = computed(
    () => infiniteLike.value && cellSize.value < MAP_LEVEL_THRESHOLD,
  )

  // Zoom de retour : celui du dernier coup joué (et pas ~10 px, valeur de
  // passage quand on dézoome en continu vers la carte).
  const playCellSize = ref(baseCellSize)
  const target = ref(null) // { x, y } en cases monde (fractionnaires)

  // Plancher par partie : ne fait que baisser à mesure que la zone grandit.
  let gameFloor = MAP_FLOOR_MAX

  // Déclaré avant les compteurs : sur un remplacement de partie, ce watch
  // passe d'abord (ordre de création), la caméra restaurée est déjà en place.
  watch(game, () => {
    playCellSize.value =
      cellSize.value >= MAP_LEVEL_THRESHOLD ? cellSize.value : baseCellSize
    target.value = null
    gameFloor = MAP_FLOOR_MAX
  })

  const boardCounters = [
    () => game.value.revealedCount,
    () => game.value.minesTriggeredCount,
    () => game.value.flaggedCount,
  ]

  watch(boardCounters, () => {
    if (infiniteLike.value && !mapActive.value) {
      playCellSize.value = cellSize.value
    }
  })

  // Signaux "la carte a changé" : des compteurs plutôt qu'un suivi profond de
  // dizaines de milliers de cases.
  const mapSignals = [
    ...boardCounters,
    () => confirmedHeartsCount.value,
    () => robotStepTick.value,
  ]

  // Ses seules dépendances sont les signaux lus ici : toRaw lit les cases sans
  // les suivre (ni coût du proxy). Recalculé (O(cases)) seulement à la
  // lecture suivante d'un changement. Nouvel objet à chaque fois : MapCanvas
  // s'en sert aussi comme signal de redessin.
  const mapBounds = computed(() => {
    for (const read of mapSignals) {
      read()
    }
    return touchedBounds(toRaw(game.value.cells))
  })

  // Appelé à chaque pas de zoom.
  function zoomFloor() {
    if (!infiniteLike.value) {
      return MIN_CELL_SIZE
    }
    gameFloor = Math.min(
      gameFloor,
      adaptiveMinCellSize(
        mapBounds.value,
        containerWidth.value,
        containerHeight.value,
      ),
    )
    return gameFloor
  }

  // Zone visible une fois revenu à playCellSize centré sur la cible, en px
  // écran au zoom courant. Mêmes formules que centerOn/cellsAcross.
  const targetRect = computed(() => {
    const t = target.value
    if (!t || !mapActive.value) {
      return null
    }
    const cs = cellSize.value
    const play = playCellSize.value
    const left = t.x - Math.max(1, Math.floor(containerWidth.value / play)) / 2
    const top = t.y - Math.max(1, Math.floor(containerHeight.value / play)) / 2
    return {
      left: (left - originX.value) * cs,
      top: (top - originY.value) * cs,
      width: (containerWidth.value / play) * cs,
      height: (containerHeight.value / play) * cs,
      centerX: (t.x - originX.value) * cs,
      centerY: (t.y - originY.value) * cs,
    }
  })

  function isInsideTarget(x, y) {
    const r = targetRect.value
    if (!r) {
      return false
    }
    const halfW = Math.max(r.width, MIN_TARGET_HIT_PX) / 2
    const halfH = Math.max(r.height, MIN_TARGET_HIT_PX) / 2
    return (
      Math.abs(x - (r.left + r.width / 2)) <= halfW &&
      Math.abs(y - (r.top + r.height / 2)) <= halfH
    )
  }

  // x, y : px relatifs au conteneur. 1er tap = pose la cible, tap dedans =
  // y aller, tap ailleurs = la déplacer.
  function onMapTap(x, y) {
    if (isInsideTarget(x, y)) {
      goToTarget()
      return
    }
    target.value = {
      x: originX.value + x / cellSize.value,
      y: originY.value + y / cellSize.value,
    }
  }

  // Instantané : un tween de cellSize traverserait la vue simplifiée et
  // matérialiserait des dizaines de milliers de cases à chaque frame.
  function goToTarget() {
    const t = target.value
    if (!t) {
      return
    }
    beforeJump()
    target.value = null
    // cellSize avant centerOn : centerOn lit cellsAcross, qui en dépend.
    cellSize.value = playCellSize.value
    centerOn(t.x, t.y)
  }

  function cancelTarget() {
    target.value = null
  }

  watch(mapActive, (active) => {
    if (!active) {
      target.value = null
    }
  })

  return {
    mapActive,
    mapBounds,
    playCellSize,
    target,
    targetRect,
    zoomFloor,
    onMapTap,
    goToTarget,
    cancelTarget,
  }
}
