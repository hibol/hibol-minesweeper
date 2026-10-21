import { ref, watch, onScopeDispose } from "vue"
import { giveUp } from "../game/game"
import { recordRun } from "../state/runHistory"
import { submitInfiniteRun, runFromGame } from "../state/infiniteOnline"
import {
  currentAchievementBanner,
  dismissAchievementBanner,
  holdAchievementBanners,
  resumeAchievementBanners,
} from "../state/achievements"

const INFINITE_UNLOCKED_KEY = "hibol-minesweeper:infinite-unlocked"

const WIN_BANNER_DURATION_MS = 3000

// Auto-dismiss, 1.5x WinBanner (plus de texte à lire — titre + phrase, pas
// juste "YOU WIN") — SEUL moyen de fermer le banner : il ne réagit ni au
// clic ni au tap (un achievement mérite d'être lu jusqu'au bout).
const ACHIEVEMENT_BANNER_DURATION_MS = WIN_BANNER_DURATION_MS * 1.5

// Fins de partie Classic (bannière de victoire, déblocage de l'Infini) et
// Infini (bannière de fin de run, run locale), plus la minuterie de la
// bannière d'achievement. Les fins Legacy et chasse vivent dans leurs
// composables (useLegacyMode, useTreasureHunt).
export function useEndOfGame(game) {
  // Débloqué par la 1re victoire Classic, persisté d'une session à l'autre.
  const infiniteUnlocked = ref(
    localStorage.getItem(INFINITE_UNLOCKED_KEY) === "true",
  )

  const showWinBanner = ref(false)
  const justUnlockedInfinite = ref(false)
  let winBannerTimeout = null

  function dismissWinBanner() {
    clearTimeout(winBannerTimeout)
    showWinBanner.value = false
    justUnlockedInfinite.value = false
    // Rend la main à la file d'achievements mise en pause quand le WinBanner
    // s'est affiché (no-op si elle ne l'était pas — reset de partie, etc.).
    resumeAchievementBanners()
  }

  let achievementBannerTimeout = null

  watch(currentAchievementBanner, (achievement) => {
    clearTimeout(achievementBannerTimeout)

    if (achievement) {
      achievementBannerTimeout = setTimeout(
        dismissAchievementBanner,
        ACHIEVEMENT_BANNER_DURATION_MS,
      )
    }
  })

  const showGiveUpBanner = ref(false)
  const giveUpRank = ref(null)

  function dismissGiveUpBanner() {
    showGiveUpBanner.value = false
  }

  watch(
    () => game.value.status,
    (status) => {
      if (game.value.mode === "classic" && status === "won") {
        const firstWin = !infiniteUnlocked.value

        if (firstWin) {
          infiniteUnlocked.value = true
          localStorage.setItem(INFINITE_UNLOCKED_KEY, "true")
        }

        justUnlockedInfinite.value = firstWin
        // Le WinBanner prend le top-center : met la file d'achievements en
        // pause le temps qu'il s'affiche (relâchée par dismissWinBanner). Le
        // classic ne débloque plus d'achievement lui-même, mais un
        // achievement d'un autre déclencheur pourrait encore être à l'écran.
        holdAchievementBanners()
        showWinBanner.value = true
        clearTimeout(winBannerTimeout)
        winBannerTimeout = setTimeout(dismissWinBanner, WIN_BANNER_DURATION_MS)
      }

      // L'Infini ne se perd que par Give Up (une mine n'y est jamais fatale) :
      // c'est onGiveUp, seul chemin vers "lost", qui envoie la run en ligne.
      // Un autre chemin de défaite ne l'enverrait pas, seulement ce score local.
      if (game.value.mode === "infinite" && status === "lost") {
        const { rank } = recordRun({
          revealedCount: game.value.revealedCount,
          distance: Math.round(game.value.maxDistance),
          minesTriggeredCount: game.value.minesTriggeredCount,
          heartsCollectedCount: game.value.heartsCollectedCount,
          robotsTriggeredCount: game.value.robotsTriggeredCount,
          usedMachines: game.value.usedMachines,
          machineUses: { ...game.value.machineUses },
          seed: game.value.seed,
          timestamp: Date.now(),
        })

        giveUpRank.value = rank
        showGiveUpBanner.value = true
      }
    },
  )

  function onGiveUp() {
    giveUp(game.value)

    if (game.value.status === "lost") {
      // Classement en ligne : appel non bloquant, ne doit jamais retarder la
      // bannière de fin de run (cf. le watch status "lost" plus haut, qui gère
      // déjà le score local) — même principe que submitLegacyWin.
      submitInfiniteRun(runFromGame(game.value))
    }
  }

  onScopeDispose(() => {
    clearTimeout(winBannerTimeout)
    clearTimeout(achievementBannerTimeout)
  })

  return {
    infiniteUnlocked,
    showWinBanner,
    justUnlockedInfinite,
    dismissWinBanner,
    showGiveUpBanner,
    giveUpRank,
    dismissGiveUpBanner,
    onGiveUp,
  }
}
