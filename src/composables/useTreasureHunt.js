import { ref, computed, watch, onScopeDispose } from "vue"
import { useCompass } from "./useCompass"
import { useRunTimer } from "./useRunTimer"
import { pushToast } from "../state/toastQueue"
import { MINE_PIXELS, TORNADO_PIXELS } from "../icons"
import { treasureWinBreakdown, TREASURE_MAX_MINES } from "../game/game"
import {
  addHibols,
  hibolBalance,
  saveTreasureGame,
  treasureDayKey,
} from "../state/treasureHunt"
import { recordTreasureDay } from "../state/treasureLog"
import { formatTreasureTime } from "../state/treasureTimeFormat"
import {
  holdAchievementBanners,
  resumeAchievementBanners,
  unlockAchievement,
  checkHoarder,
  recordTreasureDayPlayed,
} from "../state/achievements"

// Tout le spécifiquement "chasse au trésor" : boussole d'affichage, bannière
// won/lost, chrono, sérialisation du jour, récompense, et les watchers de fin
// de journée / vie perdue / tornade. Le démarrage/reprise (qui réassigne
// game.value + touche la caméra/le boot) reste dans App.vue et appelle
// resetForNewGame / restoreState / snapshot.
export function useTreasureHunt(game, deps) {
  const {
    originX,
    originY,
    cellSize,
    viewportWidth,
    viewportHeight,
    compassDotRadius,
  } = deps

  // --- Boussole (affichage) ---------------------------------------------------
  const {
    active: compassActive,
    angleDeg: compassAngle,
    warmth: compassWarmth,
  } = useCompass(game, originX, originY, viewportWidth, viewportHeight)

  // Teinte interpolée en JS (un dégradé CSS ne suit pas une valeur continue).
  const compassColor = computed(
    () => `hsl(${210 - 210 * compassWarmth.value} 80% 55%)`,
  )

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
  // Gains de la journée par source, dérivés de l'état du jeu (pas stockés) :
  // une seule source de vérité entre le crédit, la bannière et le journal.
  // chest/stormBonus ne sont acquis qu'en cas de victoire.
  const treasureRewardDetail = computed(() => ({
    found: game.value.hibolsCollectedCount ?? 0,
    ...treasureWinBreakdown(
      game.value.minesTriggeredCount,
      game.value.tornadoCount,
    ),
  }))

  const treasureBanner = ref(null) // null | 'won' | 'lost'
  const treasureShake = ref(false)

  // Journée terminée : bandeau "Come back tomorrow" tant que status !== playing.
  const treasureDayOver = computed(
    () => game.value.mode === "treasure" && game.value.status !== "playing",
  )

  // --- Chrono --------------------------------------------------------------
  // Wrappers treasureResume/Engage : garde de mode que useRunTimer n'a pas
  // (sinon le chrono repart en arrière-plan pendant Classic/Infini, bug 2026-09-04).
  const timer = useRunTimer()

  const treasureTimeLabel = computed(() =>
    formatTreasureTime(timer.elapsedMs.value),
  )

  function treasureResume() {
    if (game.value.mode === "treasure" && game.value.status === "playing") {
      timer.resume()
    }
  }

  function treasurePause() {
    timer.pause()
  }

  // Appelé au 1er coup joué (cf. performReveal côté App).
  function treasureEngage() {
    if (game.value.mode === "treasure") {
      timer.start()
    }
  }

  onScopeDispose(() => timer.pause())

  // --- Sérialisation du jour ---------------------------------------------
  function treasureSnapshot() {
    const g = game.value
    return {
      dayKey: treasureDayKey(),
      mode: "treasure",
      seed: g.seed,
      status: g.status,
      unlimitedLives: g.unlimitedLives,
      tornadoCount: g.tornadoCount,
      chestFound: g.chestFound,
      revealedCount: g.revealedCount,
      flaggedCount: g.flaggedCount,
      minesTriggeredCount: g.minesTriggeredCount,
      maxDistance: g.maxDistance,
      // Cases forcées sûres par correctOpeningSolvability à l'ouverture
      // (roadmap point 5, game.js) — même raison de persistance que
      // game.safeZones pour la Travel Machine en infini.
      forcedSafeCells: g.forcedSafeCells ?? [],
      cells: [...g.cells.values()]
        .filter((c) => c.revealed || c.flagged)
        .map((c) => ({
          x: c.x,
          y: c.y,
          revealed: c.revealed,
          flagged: c.flagged,
          // cf. useViewportReveal.js : une tornade révélée mais pas encore vue
          // doit le rester à la reprise, pas se déclencher toute seule au
          // chargement.
          tornadoTriggered: c.tornadoTriggered,
          // Idem pour un hibol révélé pas encore vu : ni compté ni crédité.
          hibolCollected: c.hibolCollected,
        })),
      // chrono figé à l'instant T (période active en cours incluse)
      elapsedMs: timer.elapsedMs.value,
      engaged: timer.started,
      banner: treasureBanner.value,
      camera: {
        originX: originX.value,
        originY: originY.value,
        cellSize: cellSize.value,
      },
    }
  }

  // Les runs DEV (unlimitedLives) ne sont jamais persistées.
  function persistTreasureGame() {
    if (game.value.mode !== "treasure" || game.value.unlimitedLives) {
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

  // --- Journal ----------------------------------------------------------
  // DEV (unlimitedLives) ne compte jamais dans le journal/streak.
  // `reward` = total gagné dans la journée, `rewardDetail` = sa répartition
  // (cf. treasureLog.js pour la compatibilité avec les anciennes entrées).
  function recordTreasureDayIfReal(outcome) {
    if (game.value.unlimitedLives) {
      return
    }
    const { found, chest, stormBonus } = treasureRewardDetail.value
    const rewardDetail =
      outcome === "won"
        ? { found, chest, stormBonus }
        : { found, chest: 0, stormBonus: 0 }
    recordTreasureDay({
      dayKey: treasureDayKey(),
      seed: game.value.seed,
      outcome,
      minesHit: game.value.minesTriggeredCount,
      timeMs: timer.elapsedMs.value,
      reward: rewardDetail.found + rewardDetail.chest + rewardDetail.stormBonus,
      rewardDetail,
      tornadoes: game.value.tornadoCount,
      maxDistance: Math.round(game.value.maxDistance),
    })
    recordTreasureDayPlayed() // Creature of Habit
  }

  // --- Watchers -------------------------------------------------------
  // Vraie transition en jeu : même objet partie qu'au passage précédent.
  // Le remplacement de game.value (reprise d'une journée déjà résolue,
  // changement de mode) ne doit ni re-créditer ni rejouer de toast.
  const sameGame = (source) => [() => game.value, source]

  // Fin de journée. Flush par défaut ("pre") : s'exécute après tout le code
  // synchrone du coup, file des cases vues comprise — les hibols du coup
  // final sont ainsi comptés avant le crédit et le journal.
  watch(
    sameGame(() => game.value.status),
    ([g, status], [prevGame]) => {
      if (g !== prevGame || g.mode !== "treasure") {
        return
      }

      if (status === "won") {
        timer.pause()
        // La bannière prend l'emplacement d'AchievementBanner : on gèle la
        // file (reprise dans dismissTreasureBanner).
        holdAchievementBanners()
        // Les hibols trouvés sont déjà crédités (creditHibol) : ici, le coffre
        // et le bonus seulement.
        const { chest, stormBonus } = treasureRewardDetail.value
        if (!game.value.unlimitedLives) {
          addHibols(chest + stormBonus)
          checkHoarder(hibolBalance.value)
        }
        unlockAchievement("treasure-hunter")
        if (game.value.minesTriggeredCount === 0) {
          unlockAchievement("unscathed")
        }
        if (game.value.tornadoCount > 0) {
          unlockAchievement("storm-chaser")
        }
        treasureBanner.value = "won"
        recordTreasureDayIfReal("won")
        persistTreasureGame()
      } else if (status === "lost") {
        timer.pause()
        holdAchievementBanners()
        treasureBanner.value = "lost"
        recordTreasureDayIfReal("lost")
        persistTreasureGame()
      }
    },
  )

  // Mine non fatale (1re/2e) : toast "-1 vie". La 3e passe status à "lost" et
  // c'est la bannière qui prend le relais.
  watch(
    sameGame(() => game.value.minesTriggeredCount),
    ([g, n], [prevGame, prev]) => {
      if (g !== prevGame || g.mode !== "treasure" || n <= prev) {
        return
      }
      if (!game.value.unlimitedLives && n >= TREASURE_MAX_MINES) {
        return
      }
      const left = game.value.unlimitedLives ? null : TREASURE_MAX_MINES - n
      pushToast(
        left === null
          ? "Mine!"
          : `Mine! ${left} ${left === 1 ? "life" : "lives"} left`,
        { icon: MINE_PIXELS, durationMs: 1800 },
      )
    },
  )

  // Hibol vu (appelé par useViewportReveal.js, une seule fois par case grâce
  // à cell.hibolCollected) : banqué tout de suite, quelle que soit l'issue de
  // la journée. DEV (unlimitedLives) n'en gagne jamais réellement.
  function creditHibol() {
    if (game.value.mode !== "treasure" || game.value.unlimitedLives) {
      return
    }
    addHibols(1)
    checkHoarder(hibolBalance.value)
  }

  // Tornade révélée : le moteur a déjà relocalisé le coffre. Ici toast +
  // secousse, puis on éteint le signal one-shot.
  watch(
    () => game.value.pendingTornado,
    (pending) => {
      if (!pending) {
        return
      }
      game.value.pendingTornado = false
      pushToast("A tornado! The treasure moved", {
        icon: TORNADO_PIXELS,
        durationMs: 2200,
      })
      treasureShake.value = true
      setTimeout(() => {
        treasureShake.value = false
      }, 500)
    },
  )

  return {
    compassActive,
    compassDotStyle,
    treasureRewardDetail,
    creditHibol,
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
  }
}
