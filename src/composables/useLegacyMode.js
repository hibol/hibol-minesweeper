import { ref, computed, watch } from "vue"
import { createLegacyGame, LEGACY_PRESETS } from "../game/game"
import { useRunTimer } from "./useRunTimer"
import { useMoveLog } from "./useMoveLog"
import { recordLegacyWin } from "../state/legacyScores"
import { formatLegacyTime } from "../state/legacyTimeFormat"
import { submitLegacyWin } from "../state/legacyOnline"
import {
  unlockAchievement,
  recordLegacyLoss,
  holdAchievementBanners,
  resumeAchievementBanners,
} from "../state/achievements"
import { pushToast } from "../state/toastQueue"

// beginner / intermediate / expert, dans l'ordre : menu de difficulté et
// validation d'une difficulté lue du localStorage.
export const LEGACY_DIFFICULTIES = Object.keys(LEGACY_PRESETS)

// Dernière difficulté choisie : re-rentre dessus au prochain lancement.
const LEGACY_DIFFICULTY_KEY = "hibol-minesweeper:legacy-difficulty"
const SEEN_LEGACY_PAN_HINT_KEY = "hibol-minesweeper:seen-legacy-pan-hint"

const LEGACY_DIFFICULTY_ABBR = {
  beginner: "beg.",
  intermediate: "int.",
  expert: "exp.",
}

// Mode Legacy (démineur Windows chronométré) : chrono qui part au 1er reveal,
// journal de coups pour le rejeu serveur, fin de partie (score local, envoi
// au classement, succès Pro / Ultra Pro / Noob, bannière) et caméra bornée.
// La bascule de mode (sauvegarde, reprise) reste dans App.vue et appelle
// startNewGame / restore / suspend / resumeIfPlaying / snapshotExtras.
export function useLegacyMode(game, deps) {
  const {
    cellSize,
    originX,
    originY,
    containerWidth,
    containerHeight,
    resetZoom,
  } = deps

  const isLegacy = () => game.value.mode === "legacy"

  const timer = useRunTimer()

  // Rejeu serveur anti-triche : t: 0 est ancré sur le tout premier coup
  // enregistré (flag OU reveal), pas sur engage() qui ne démarre le chrono
  // affiché qu'au 1er reveal.
  const moveLog = useMoveLog()

  // mm:ss.cc, même précision que le temps soumis (jamais arrondi).
  const timeLabel = computed(() => formatLegacyTime(timer.elapsedMs.value))

  // Mines − drapeaux posés. Peut passer négatif (drapeaux en trop), comme
  // l'original — pas de Math.max ici, c'est volontaire.
  const minesLeft = computed(
    () => game.value.mineCount - game.value.flaggedCount,
  )

  // Libellé du bouton du header : difficulté abrégée une fois en Legacy.
  const buttonLabel = computed(() =>
    isLegacy()
      ? `Legacy (${LEGACY_DIFFICULTY_ABBR[game.value.difficulty] ?? game.value.difficulty})`
      : "Legacy",
  )

  // Bannière de fin : affichée uniquement à la victoire (pas de "BOOM" à la
  // défaite — le plateau qui révèle ses mines + la case rouge suffisent).
  // `rank` = rang dans la table des meilleurs temps de la difficulté.
  const banner = ref(false)
  const rank = ref(null)

  function dismissBanner() {
    banner.value = false
    // Relâche la file d'achievements mise en pause pendant que la bannière
    // occupait le top-center (no-op si rien n'était en pause).
    resumeAchievementBanners()
  }

  // La bannière disparaît dès qu'on quitte le mode. Une nouvelle partie
  // Legacy la ferme elle-même (startNewGame) : ce watch ne sert qu'au vrai
  // changement de mode.
  watch(() => game.value.mode, dismissBanner)

  // Fin de partie : fige le chrono, gère le score, la bannière et les
  // succès. Une défaite ne montre pas de bannière, juste le compteur Noob.
  watch(
    () => game.value.status,
    (status) => {
      if (!isLegacy()) {
        return
      }
      if (status === "won" || status === "lost") {
        timer.pause()
        moveLog.pause()
      }
      if (status === "won") {
        rank.value = recordLegacyWin(
          game.value.difficulty,
          timer.elapsedMs.value,
        ).rank

        // Classement en ligne : appel non bloquant, indépendant du score
        // local déjà acquis ci-dessus.
        submitLegacyWin({
          difficulty: game.value.difficulty,
          seed: game.value.seed,
          moves: moveLog.moves.value,
          localTimeMs: timer.elapsedMs.value,
        })

        unlockAchievement("pro")
        if (!game.value.everFlagged) {
          unlockAchievement("ultra-pro")
        }
        // La bannière prend le top-center : file d'achievements en pause
        // jusqu'à sa fermeture (dismissBanner).
        holdAchievementBanners()
        banner.value = true
      } else if (status === "lost") {
        recordLegacyLoss()
      }
    },
  )

  // Le chrono part au 1er reveal (comme le démineur d'origine), pas sur une
  // pose de drapeau.
  function engage() {
    if (isLegacy() && game.value.status === "playing") {
      timer.start()
    }
  }

  // Chaque reveal et chaque drapeau, dans l'ordre : c'est ce que le serveur
  // rejoue.
  function recordMove(type, cell) {
    if (isLegacy()) {
      moveLog.record(type, { x: cell.x, y: cell.y })
    }
  }

  function lastDifficulty() {
    const stored = localStorage.getItem(LEGACY_DIFFICULTY_KEY)
    return LEGACY_DIFFICULTIES.includes(stored) ? stored : "beginner"
  }

  function persistDifficulty(difficulty) {
    try {
      localStorage.setItem(LEGACY_DIFFICULTY_KEY, difficulty)
    } catch {
      // idem gameStorage : tant pis, la partie en cours n'est pas affectée.
    }
  }

  // --- Caméra : panoramique au doigt sur un plateau BORNÉ. Le plateau est
  // centré à l'origine (0, 0) ; on peut le pousser de ± la moitié du
  // débordement sur chaque axe, juste assez pour amener n'importe quel bord
  // au bord du viewport. Un axe qui tient à l'écran n'a pas de débordement :
  // son origine reste à 0 (plateau centré, aucun pan).
  function maxPan(boardCells, containerPx) {
    const overflowPx = Math.max(0, boardCells * cellSize.value - containerPx)
    return overflowPx / 2 / cellSize.value // en cases
  }

  // À rappeler après un pan, un zoom ou un redimensionnement.
  function clampOrigin() {
    if (!isLegacy() || !cellSize.value) {
      return
    }
    const maxPanX = maxPan(game.value.width, containerWidth.value)
    const maxPanY = maxPan(game.value.height, containerHeight.value)
    originX.value = Math.min(Math.max(originX.value, -maxPanX), maxPanX)
    originY.value = Math.min(Math.max(originY.value, -maxPanY), maxPanY)
  }

  // Centre et zoom de base : tous les niveaux démarrent au zoom de Beginner.
  function resetCamera() {
    resetZoom()
    originX.value = 0
    originY.value = 0
  }

  // "Il y a encore du plateau par là" : vrai tant qu'on peut pousser dans
  // cette direction. Alimente les ombres de bord.
  const edges = computed(() => {
    const hidden = { left: false, right: false, up: false, down: false }
    if (!isLegacy() || !cellSize.value) {
      return hidden
    }
    const maxPanX = maxPan(game.value.width, containerWidth.value)
    const maxPanY = maxPan(game.value.height, containerHeight.value)
    const eps = 0.02
    return {
      left: originX.value > -maxPanX + eps,
      right: originX.value < maxPanX - eps,
      up: originY.value > -maxPanY + eps,
      down: originY.value < maxPanY - eps,
    }
  })

  // Toast "déplace-toi" au 1er lancement d'un niveau qui déborde
  // (Intermediate / Expert), une seule fois dans la vie de l'app.
  function maybeShowPanHint(difficulty) {
    if (
      difficulty === "beginner" ||
      localStorage.getItem(SEEN_LEGACY_PAN_HINT_KEY) === "true"
    ) {
      return
    }
    pushToast("Drag with your finger to move around the board", {
      durationMs: 3000,
    })
    try {
      localStorage.setItem(SEEN_LEGACY_PAN_HINT_KEY, "true")
    } catch {
      // idem : tant pis, le hint réapparaîtra
    }
  }

  // --- Couture avec la bascule de mode (App.vue) -----------------------------

  // Partie neuve. Difficulté inconnue ou absente : la dernière jouée.
  function startNewGame(difficulty) {
    const chosen = LEGACY_DIFFICULTIES.includes(difficulty)
      ? difficulty
      : lastDifficulty()
    game.value = createLegacyGame(chosen)
    persistDifficulty(chosen)
    timer.reset()
    moveLog.reset()
    dismissBanner()
    resetCamera()
    maybeShowPanHint(chosen)
  }

  // Reprise d'un snapshot, une fois game.value restauré. La caméra repart
  // centrée au zoom de base (pas de zoom sauvegardé) ; le chrono reprend si
  // le 1er coup avait déjà été joué (déduit de revealedCount).
  function restore(snapshot) {
    dismissBanner()
    timer.restore(snapshot.elapsedMs ?? 0, (snapshot.revealedCount ?? 0) > 0)
    moveLog.restore(snapshot.moves)
    resetCamera()
    timer.resume()
    moveLog.resume()
  }

  // On quitte la partie (changement de mode, onglet masqué).
  function suspend() {
    timer.pause()
    moveLog.pause()
  }

  // Retour sur l'onglet : seulement si la partie est encore en cours —
  // sinon revenir après une victoire/défaite relancerait le chrono.
  function resumeIfPlaying() {
    if (isLegacy() && game.value.status === "playing") {
      timer.resume()
      moveLog.resume()
    }
  }

  // Ce que le snapshot du slot Legacy ajoute à la partie elle-même.
  function snapshotExtras() {
    return {
      elapsedMs: timer.elapsedMs.value,
      moves: moveLog.moves.value,
    }
  }

  return {
    moveLog,
    timeLabel,
    minesLeft,
    buttonLabel,
    banner,
    rank,
    dismissBanner,
    engage,
    recordMove,
    clampOrigin,
    edges,
    startNewGame,
    restore,
    suspend,
    resumeIfPlaying,
    snapshotExtras,
  }
}
