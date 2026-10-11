import {
  createGame,
  createInfiniteGame,
  createTreasureGame,
  restoreClassicGame,
  restoreInfiniteGame,
  restoreLegacyGame,
  restoreTreasureGame,
  DEFAULT_DENSITY_SCALE,
} from "../game/game"
import {
  loadActiveGame,
  clearActiveGame,
  getLastMode,
  setLastMode,
} from "../state/gameStorage"
import {
  loadTreasureGame,
  clearTreasureGame,
  treasureDayKey,
  treasureDaySeed,
} from "../state/treasureHunt"
import { treasureEntries } from "../state/treasureLog"
import { legacyUnlocked } from "../state/shop"
import { unlockAchievement } from "../state/achievements"
import { pushToast } from "../state/toastQueue"
import { chooseBootMode, fallbackBootMode } from "../gameModes"
import { restoredCellSize } from "./useViewportCamera"
import { usePausedModes } from "./usePausedModes"
import { usePendingStart } from "./usePendingStart"

// Rampe de densité 4× plus rapide que le défaut du moteur et assombrissement
// plafonné à 8 mines : l'arc « calme -> dur -> espoir des cœurs » en quelques
// minutes. À retuner via scripts/autoplay.js --densityScale=X
// --darknessMineThreshold=Y.
const INFINITE_DENSITY_SCALE = DEFAULT_DENSITY_SCALE / 4
const INFINITE_DARKNESS_MINE_THRESHOLD = 8

// Gestionnaire de modes : boutons de mode, partie neuve (avec confirmation de
// perte), reprise des slots en pause, chasse du jour, mode de démarrage.
// Chaque mode a son slot (gameStorage) ; la chasse a sa sauvegarde par jour.
export function useModeSwitcher(
  game,
  {
    // Caméra
    cellSize,
    originX,
    originY,
    resetZoom,
    centerOn,
    defaultCellSize,
    // Scène : robots, bannières, voile
    resetRobotFollowState,
    dismissWinBanner,
    dismissGiveUpBanner,
    snapFogRadius,
    redrawFog,
    // Legacy (useLegacyMode)
    startNewLegacyGame,
    restoreLegacyState,
    // Trésor (useTreasureHunt)
    resetTreasureForNewGame,
    restoreTreasureState,
    persistTreasureGame,
    // Introductions
    maybeShowInfiniteIntro,
    maybeShowTreasureIntro,
    // Divers
    persistActiveGame,
    infiniteUnlocked,
  },
) {
  const { pausedModes, refreshPausedModes, meaningfulGameInMode } =
    usePausedModes(game)

  // Reprend la partie en pause du slot `mode`. false (sans rien changer) si le
  // slot est vide, terminé ou illisible : au caller de démarrer une partie.
  function resumeGame(mode) {
    const snapshot = loadActiveGame(mode)

    if (!snapshot || snapshot.status !== "playing") {
      return false
    }

    let restored
    try {
      restored =
        mode === "classic"
          ? restoreClassicGame(snapshot)
          : mode === "legacy"
            ? restoreLegacyGame(snapshot)
            : restoreInfiniteGame(snapshot)
    } catch {
      // Snapshot corrompu ou d'un ancien format : abandonné plutôt que planter.
      clearActiveGame(mode)
      return false
    }

    resetRobotFollowState()

    // Caméra AVANT game.value : useHeartFogReveal juge « vu » dès
    // l'assignation (watch synchrone), donc avec la caméra du snapshot.
    if (mode !== "legacy") {
      if (snapshot.camera) {
        cellSize.value = restoredCellSize(
          snapshot.camera.cellSize,
          defaultCellSize,
        )
        originX.value = snapshot.camera.originX
        originY.value = snapshot.camera.originY
      } else {
        resetZoom()
      }
    }

    game.value = restored

    if (mode === "legacy") {
      restoreLegacyState(snapshot)
    }

    dismissWinBanner()
    dismissGiveUpBanner()
    setLastMode(mode)
    refreshPausedModes()

    // snapFogRadius() AVANT redrawFog() : une reprise apparaît directement
    // dans son état, sans « voyage » du voile. redrawFog forcé : les valeurs
    // dérivées peuvent coïncider avec les anciennes, et le watch de
    // usePixelFog ne se redéclencherait pas.
    snapFogRadius()
    redrawFog()

    return true
  }

  // Démarre une partie NEUVE dans `mode` (efface d'abord son slot).
  function startNewGame(mode, params = {}) {
    // Une chasse par jour : aucun chemin de « partie neuve » ne la relance.
    if (mode === "treasure") {
      return
    }
    clearActiveGame(mode)

    if (mode === "classic") {
      // Le classic garde son zoom d'une partie classic à l'autre, pas celui
      // hérité d'un autre mode.
      if (game.value.mode !== "classic") {
        resetZoom()
      }
      resetRobotFollowState()
      game.value = createGame(10, 10, 20)
      dismissWinBanner()
      dismissGiveUpBanner()
    } else if (mode === "legacy") {
      resetRobotFollowState()
      startNewLegacyGame(params.difficulty)
      dismissWinBanner()
      dismissGiveUpBanner()
    } else {
      startInfiniteGame(params.seed)
    }

    setLastMode(mode)
    refreshPausedModes()
  }

  // Toujours appelé via startNewGame("infinite", …), qui efface le slot et met
  // à jour last-mode et marqueurs.
  function startInfiniteGame(seed = Date.now()) {
    game.value = createInfiniteGame(
      seed,
      0.15,
      1,
      0.23,
      INFINITE_DENSITY_SCALE,
      INFINITE_DARKNESS_MINE_THRESHOLD,
    )
    // Avant le centrage : un tween de suivi robot en vol l'écraserait.
    resetRobotFollowState()
    // resetZoom() avant centerOn() : le centrage dépend de cellSize. Chaque
    // run infinie repart d'une vue neutre.
    resetZoom()
    centerOn(0, 0)
    dismissWinBanner()
    dismissGiveUpBanner()

    // Pas de « voyage » du voile depuis la partie précédente (cf. resumeGame).
    snapFogRadius()
    redrawFog()

    maybeShowInfiniteIntro()
  }

  // Confirmation avant d'écraser une partie par une partie neuve.
  const {
    pendingStart,
    pendingDiscardMessage,
    ask: askPendingStart,
    confirm: confirmPendingStart,
    cancel: cancelPendingStart,
  } = usePendingStart(game, { startNewGame })

  // Partie neuve, confirmée si elle écrase une progression réelle. `params` :
  // difficulté en Legacy, seed en infini. Venant d'un autre mode, la partie à
  // l'écran est d'abord sauvegardée : seule celle du mode cible peut se perdre.
  function requestNewGame(mode, params = {}) {
    // La chasse du jour ne se redémarre jamais (cf. startNewGame).
    if (mode === "treasure") {
      return
    }
    if (game.value.mode !== mode) {
      persistActiveGame()
    }

    if (meaningfulGameInMode(mode)) {
      askPendingStart(mode, params)
      return
    }

    startNewGame(mode, params)
  }

  // Entrée des boutons de mode. Re-cliquer le mode à l'écran = partie neuve.
  // Changer de mode = sauvegarder la partie sortante, puis reprendre le slot
  // cible ou en démarrer un neuf.
  function activateMode(mode, params = {}) {
    if (mode === "treasure") {
      // Avant le « même mode = requestNewGame » : re-cliquer la chasse ne
      // redémarre rien (bug 2026-09-04, ça lançait une infinie).
      if (game.value.mode === "treasure") {
        return
      }
      // Reprise du jour ou chasse neuve : rien n'est perdu, pas de confirmation.
      persistActiveGame()
      if (!resumeTreasureGame() && !startTreasureGame()) {
        pushToast("Today's hunt is over. Come back tomorrow!")
      }
      return
    }

    if (game.value.mode === mode) {
      requestNewGame(mode, params)
      return
    }

    persistActiveGame()

    if (!resumeGame(mode)) {
      startNewGame(mode, params)
    }
  }

  // Seed choisie par le joueur (« PLAY A SEED ») : seul endroit où débloquer
  // Seed Hunter a du sens. Toujours une partie neuve, jamais une reprise.
  function onStartInfiniteWithSeed(seed) {
    unlockAchievement("seed-hunter")
    requestNewGame("infinite", { seed })
  }

  function treasureDayResolved() {
    const dayKey = treasureDayKey()
    return treasureEntries.value.some((entry) => entry.dayKey === dayKey)
  }

  // Démarre la chasse du jour. dev = true : seed aléatoire + vies illimitées,
  // depuis la console uniquement. false si la chasse du jour est déjà au
  // journal (son snapshot a pu disparaître, elle ne se rejoue pas).
  function startTreasureGame({ dev = false } = {}) {
    if (!dev && treasureDayResolved()) {
      return false
    }
    resetRobotFollowState()

    const seed = dev ? Math.floor(Math.random() * 2 ** 31) : treasureDaySeed()
    const hunt = createTreasureGame(seed, { unlimitedLives: dev })
    // Caméra avant game.value, même raison que resumeTreasureGame.
    resetZoom()
    centerOn(0, 0)
    game.value = hunt
    resetTreasureForNewGame()
    dismissWinBanner()
    dismissGiveUpBanner()
    setLastMode("treasure")
    refreshPausedModes()

    if (!dev) {
      persistTreasureGame()
      maybeShowTreasureIntro()
    }
    return true
  }

  // Reprend la chasse du jour. false si aucune (ou illisible, ou d'un autre
  // jour) : au caller de démarrer une chasse neuve.
  function resumeTreasureGame() {
    const dayKey = treasureDayKey()
    const snap = loadTreasureGame(dayKey)
    if (!snap || snap.dayKey !== dayKey) {
      return false
    }

    let restored
    try {
      restored = restoreTreasureGame(snap)
    } catch {
      clearTreasureGame(dayKey)
      return false
    }

    resetRobotFollowState()

    // Caméra AVANT game.value : useViewportReveal juge « vu » dès
    // l'assignation (watch synchrone).
    if (snap.camera) {
      cellSize.value = restoredCellSize(snap.camera.cellSize, defaultCellSize)
      originX.value = snap.camera.originX
      originY.value = snap.camera.originY
    } else {
      resetZoom()
      centerOn(0, 0)
    }

    game.value = restored
    restoreTreasureState(snap)

    dismissWinBanner()
    dismissGiveUpBanner()
    setLastMode("treasure")
    refreshPausedModes()
    return true
  }

  // Partie de démarrage : le dernier mode joué (défaut classic), sous réserve
  // des garde-fous de chooseBootMode.
  function bootGame() {
    let bootMode = chooseBootMode({
      lastMode: getLastMode(),
      infiniteUnlocked: infiniteUnlocked.value,
      legacyUnlocked: legacyUnlocked.value,
    })

    // Chasse du jour reprise ou neuve ; jour déjà joué sans snapshot : repli
    // sur le mode de base du header.
    if (
      bootMode === "treasure" &&
      !resumeTreasureGame() &&
      !startTreasureGame()
    ) {
      bootMode = fallbackBootMode(legacyUnlocked.value)
    }

    if (bootMode !== "treasure" && !resumeGame(bootMode)) {
      // `game` est déjà une partie classic neuve : seuls l'infini et le Legacy
      // sont à créer.
      if (bootMode === "infinite") {
        startNewGame("infinite")
      } else if (bootMode === "legacy") {
        startNewGame("legacy")
      }
    }

    refreshPausedModes()
  }

  return {
    pausedModes,
    pendingStart,
    pendingDiscardMessage,
    confirmPendingStart,
    cancelPendingStart,
    activateMode,
    requestNewGame,
    onStartInfiniteWithSeed,
    startTreasureGame,
    bootGame,
  }
}
