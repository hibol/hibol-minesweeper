import { ref, computed, watch, onScopeDispose } from 'vue'
import { useCompass } from './useCompass'
import { useRunTimer } from './useRunTimer'
import { pushToast } from '../toastQueue'
import { MINE_PIXELS, TORNADO_PIXELS } from '../icons'
import { treasureWinReward, TREASURE_MAX_MINES } from '../game/game'
import { addChestReward, chestReward, saveTreasureGame, treasureDayKey } from '../treasureHunt'
import { recordTreasureDay } from '../treasureLog'
import {
  holdAchievementBanners,
  resumeAchievementBanners,
  unlockAchievement,
  checkHoarder,
  recordTreasureDayPlayed,
} from '../achievements'

// Tout le spécifiquement "chasse au trésor" : boussole d'affichage, bannière
// won/lost, chrono, sérialisation du jour, récompense, et les watchers de fin
// de journée / vie perdue / tornade. Le démarrage/reprise (qui réassigne
// game.value + touche la caméra/le boot) reste dans App.vue et appelle
// resetForNewGame / restoreState / withRestoreGuard / snapshot.
export function useTreasureHunt(game, deps) {
  const { originX, originY, cellSize, viewportWidth, viewportHeight, compassDotRadius } = deps

  // --- Boussole (affichage) ---------------------------------------------------
  const { active: compassActive, angleDeg: compassAngle, warmth: compassWarmth } = useCompass(
    game,
    originX,
    originY,
    viewportWidth,
    viewportHeight,
  )

  // Teinte interpolée en JS (un dégradé CSS ne suit pas une valeur continue).
  const compassColor = computed(() => `hsl(${210 - 210 * compassWarmth.value} 80% 55%)`)

  // Anneau pixel FIXE : seul le carré de couleur bouge (cos/sin → left/top),
  // grossit et clignote quand ça chauffe.
  const compassDotStyle = computed(() => {
    const rad = (compassAngle.value * Math.PI) / 180
    return {
      left: `${50 + Math.sin(rad) * compassDotRadius * 100}%`,
      top: `${50 - Math.cos(rad) * compassDotRadius * 100}%`,
      background: compassColor.value,
      transform: `translate(-50%, -50%) scale(${1 + 0.6 * compassWarmth.value})`,
    }
  })

  // --- État de la journée ---------------------------------------------------
  // Gain de la journée en cours, dérivé de l'état du jeu (pas stocké) : une
  // seule source de vérité entre le crédit réel et la bannière.
  const treasureRewardEarned = computed(() =>
    treasureWinReward(game.value.minesTriggeredCount, game.value.tornadoCount),
  )

  const treasureBanner = ref(null) // null | 'won' | 'lost'
  const treasureShake = ref(false)

  // Journée terminée : bandeau "Come back tomorrow" tant que status !== playing.
  const treasureDayOver = computed(
    () => game.value.mode === 'treasure' && game.value.status !== 'playing',
  )

  // Vrai le temps d'installer une partie restaurée : neutralise le watcher
  // status pour qu'il ne re-crédite pas une victoire.
  let restoring = false

  // --- Chrono --------------------------------------------------------------
  // Wrappers treasureResume/Engage : garde de mode que useRunTimer n'a pas
  // (sinon le chrono repart en arrière-plan pendant Classic/Infini, bug 2026-09-04).
  const timer = useRunTimer()

  const treasureTimeLabel = computed(() => {
    const total = Math.floor(timer.elapsedMs.value / 1000)
    const mm = String(Math.floor(total / 60)).padStart(2, '0')
    const ss = String(total % 60).padStart(2, '0')
    return `${mm}:${ss}`
  })

  function treasureResume() {
    if (game.value.mode === 'treasure' && game.value.status === 'playing') {
      timer.resume()
    }
  }

  function treasurePause() {
    timer.pause()
  }

  // Appelé au 1er coup joué (cf. performReveal côté App).
  function treasureEngage() {
    if (game.value.mode === 'treasure') {
      timer.start()
    }
  }

  onScopeDispose(() => timer.pause())

  // --- Sérialisation du jour ---------------------------------------------
  function treasureSnapshot() {
    const g = game.value
    return {
      dayKey: treasureDayKey(),
      mode: 'treasure',
      seed: g.seed,
      status: g.status,
      unlimitedLives: g.unlimitedLives,
      tornadoCount: g.tornadoCount,
      chestFound: g.chestFound,
      revealedCount: g.revealedCount,
      flaggedCount: g.flaggedCount,
      minesTriggeredCount: g.minesTriggeredCount,
      maxDistance: g.maxDistance,
      cells: [...g.cells.values()]
        .filter((c) => c.revealed || c.flagged)
        .map((c) => ({ x: c.x, y: c.y, revealed: c.revealed, flagged: c.flagged })),
      // chrono figé à l'instant T (période active en cours incluse)
      elapsedMs: timer.elapsedMs.value,
      engaged: timer.started,
      banner: treasureBanner.value,
      camera: { originX: originX.value, originY: originY.value, cellSize: cellSize.value },
    }
  }

  // Les runs DEV (unlimitedLives) ne sont jamais persistées.
  function persistTreasureGame() {
    if (game.value.mode !== 'treasure' || game.value.unlimitedLives) {
      return
    }
    saveTreasureGame(treasureDayKey(), treasureSnapshot())
  }

  function dismissTreasureBanner() {
    treasureBanner.value = null
    // Relance la file d'achievements gelée à l'affichage de la bannière.
    resumeAchievementBanners()
  }

  // --- Helpers appelés par le start/resume d'App.vue -------------------
  function resetForNewGame() {
    treasureBanner.value = null
    timer.reset()
  }

  function restoreState(snap) {
    timer.restore(snap.elapsedMs ?? 0, !!snap.engaged)
    treasureBanner.value = snap.banner ?? null
    // treasureResume() (pas Engage) : reprend sans la garde "engaged" — sinon
    // revenir sur la chasse laisse le compteur figé.
    treasureResume()
  }

  // Enveloppe la réassignation game.value = restoreTreasureGame(snap) : le
  // watcher status (flush sync) fire pendant, il doit voir restoring = true.
  function withRestoreGuard(fn) {
    restoring = true
    try {
      fn()
    } finally {
      restoring = false
    }
  }

  // --- Journal ----------------------------------------------------------
  // DEV (unlimitedLives) ne compte jamais dans le journal/streak.
  function recordTreasureDayIfReal(outcome, reward) {
    if (game.value.unlimitedLives) {
      return
    }
    recordTreasureDay({
      dayKey: treasureDayKey(),
      seed: game.value.seed,
      outcome,
      minesHit: game.value.minesTriggeredCount,
      timeMs: timer.elapsedMs.value,
      reward,
      tornadoes: game.value.tornadoCount,
      maxDistance: Math.round(game.value.maxDistance),
    })
    recordTreasureDayPlayed() // Creature of Habit
  }

  // --- Watchers -------------------------------------------------------
  // Fin de journée. flush sync + restoring : ne réagit qu'à une vraie
  // transition en jeu, pas au remplacement de game.value par une partie
  // restaurée déjà résolue (sinon un reload re-créditerait la récompense).
  watch(
    () => game.value.status,
    (status) => {
      if (game.value.mode !== 'treasure' || restoring) {
        return
      }

      if (status === 'won') {
        timer.pause()
        // La bannière prend l'emplacement d'AchievementBanner : on gèle la
        // file (reprise dans dismissTreasureBanner).
        holdAchievementBanners()
        const reward = treasureRewardEarned.value
        if (!game.value.unlimitedLives) {
          addChestReward(reward)
          checkHoarder(chestReward.value)
        }
        unlockAchievement('treasure-hunter')
        if (game.value.minesTriggeredCount === 0) {
          unlockAchievement('unscathed')
        }
        if (game.value.tornadoCount > 0) {
          unlockAchievement('storm-chaser')
        }
        treasureBanner.value = 'won'
        recordTreasureDayIfReal('won', reward)
        persistTreasureGame()
      } else if (status === 'lost') {
        timer.pause()
        holdAchievementBanners()
        treasureBanner.value = 'lost'
        recordTreasureDayIfReal('lost', 0)
        persistTreasureGame()
      }
    },
    { flush: 'sync' },
  )

  // Mine non fatale (1re/2e) : toast "-1 vie". La 3e passe status à "lost" et
  // c'est la bannière qui prend le relais.
  watch(
    () => game.value.minesTriggeredCount,
    (n, prev) => {
      if (game.value.mode !== 'treasure' || restoring || n <= prev) {
        return
      }
      if (!game.value.unlimitedLives && n >= TREASURE_MAX_MINES) {
        return
      }
      const left = game.value.unlimitedLives ? null : TREASURE_MAX_MINES - n
      pushToast(
        left === null ? 'Mine!' : `Mine! ${left} ${left === 1 ? 'life' : 'lives'} left`,
        { icon: MINE_PIXELS, durationMs: 1800 },
      )
    },
  )

  // Tornade révélée : le moteur a déjà relocalisé le coffre. Ici toast +
  // secousse, puis on éteint le signal one-shot.
  watch(
    () => game.value.pendingTornado,
    (pending) => {
      if (!pending) {
        return
      }
      game.value.pendingTornado = false
      pushToast('A tornado! The treasure moved', { icon: TORNADO_PIXELS, durationMs: 2200 })
      treasureShake.value = true
      setTimeout(() => {
        treasureShake.value = false
      }, 500)
    },
  )

  return {
    compassActive,
    compassDotStyle,
    treasureRewardEarned,
    treasureBanner,
    treasureShake,
    treasureDayOver,
    treasureTimeLabel,
    treasureResume,
    treasurePause,
    treasureEngage,
    treasureSnapshot,
    persistTreasureGame,
    dismissTreasureBanner,
    resetForNewGame,
    restoreState,
    withRestoreGuard,
  }
}
