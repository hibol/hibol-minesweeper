// @vitest-environment jsdom
// legacyScores.js / achievements.js lisent localStorage.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ref, effectScope, nextTick } from "vue"
import { createLegacyGame, createGame } from "../game/game"
import { legacyScores } from "../state/legacyScores"
import { unlockedAchievements } from "../state/achievements"
import { currentToast } from "../state/toastQueue"
import { submitLegacyWin } from "../state/legacyOnline"
import { useLegacyMode } from "./useLegacyMode"

// La victoire de bout en bout (DOM, réseau réel stubé) : cf.
// App.integration.test.js. Ici, ce que l'intégration ne voit pas bien :
// chrono, caméra, difficulté mémorisée.

vi.mock("../state/legacyOnline", () => ({ submitLegacyWin: vi.fn() }))

const CELL = 28
let scope

beforeEach(() => {
  localStorage.clear()
  legacyScores.value = {}
  unlockedAchievements.value = {}
  currentToast.value = null
  vi.mocked(submitLegacyWin).mockClear()
  // Le chrono lit performance.now() et se rafraîchit par setInterval.
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "setTimeout", "performance"],
  })
})

afterEach(() => {
  scope?.stop()
  vi.useRealTimers()
})

function setup(game = createLegacyGame("beginner", 42)) {
  const deps = {
    cellSize: ref(CELL),
    originX: ref(0),
    originY: ref(0),
    containerWidth: ref(9 * CELL),
    containerHeight: ref(9 * CELL),
    resetZoom: vi.fn(() => {
      deps.cellSize.value = CELL
    }),
  }
  const gameRef = ref(game)
  let api
  scope = effectScope()
  scope.run(() => {
    api = useLegacyMode(gameRef, deps)
  })
  return { game: gameRef, ...deps, ...api }
}

const anyCell = { x: 0, y: 0 }

describe("useLegacyMode — chrono et journal", () => {
  it("le chrono part au 1er reveal, puis avance", () => {
    const legacy = setup()
    expect(legacy.timeLabel.value).toBe("00:00.00")

    legacy.engage()
    vi.advanceTimersByTime(1500)

    expect(legacy.timeLabel.value).toBe("00:01.50")
  })

  it("victoire ou défaite : chrono figé", async () => {
    for (const status of ["won", "lost"]) {
      const legacy = setup()
      legacy.engage()
      legacy.recordMove("reveal", anyCell)
      vi.advanceTimersByTime(1000)

      legacy.game.value.status = status
      await nextTick()
      vi.advanceTimersByTime(5000)

      expect(legacy.timeLabel.value).toBe("00:01.00")
      scope.stop()
    }
  })

  it("hors Legacy : ni chrono ni journal", () => {
    const legacy = setup(createGame(10, 10, 20))

    legacy.engage()
    legacy.recordMove("reveal", anyCell)
    vi.advanceTimersByTime(1000)

    expect(legacy.timeLabel.value).toBe("00:00.00")
    expect(legacy.moveLog.moves.value).toEqual([])
  })
})

describe("useLegacyMode — fin de partie", () => {
  it("victoire : temps local, envoi en ligne, Pro + Ultra Pro, bannière", async () => {
    const legacy = setup()
    legacy.engage()
    legacy.recordMove("reveal", anyCell)
    vi.advanceTimersByTime(2000)

    legacy.game.value.status = "won"
    await nextTick()

    expect(legacyScores.value.beginner[0].timeMs).toBe(2000)
    expect(legacy.rank.value).toBe(1)
    expect(submitLegacyWin).toHaveBeenCalledWith({
      difficulty: "beginner",
      seed: 42,
      moves: legacy.moveLog.moves.value,
      localTimeMs: 2000,
    })
    expect(unlockedAchievements.value.pro).toBeTruthy()
    expect(unlockedAchievements.value["ultra-pro"]).toBeTruthy()
    expect(legacy.banner.value).toBe(true)
  })

  it("victoire avec un drapeau posé : pas d'Ultra Pro", async () => {
    const legacy = setup()
    legacy.game.value.everFlagged = true

    legacy.game.value.status = "won"
    await nextTick()

    expect(unlockedAchievements.value.pro).toBeTruthy()
    expect(unlockedAchievements.value["ultra-pro"]).toBeFalsy()
  })

  it("défaite : une défaite de plus au compteur, rien d'autre", async () => {
    // Compteur gardé en variable de module (achievements.js), que
    // localStorage.clear() ne remet pas à zéro : on mesure l'écart.
    const losses = () =>
      Number(localStorage.getItem("hibol-minesweeper:legacy-losses"))
    const legacy = setup()
    legacy.game.value.status = "lost"
    await nextTick()
    const before = losses()

    legacy.game.value = createLegacyGame("beginner", 7)
    await nextTick()
    legacy.game.value.status = "lost"
    await nextTick()

    expect(losses()).toBe(before + 1)
    expect(legacy.banner.value).toBe(false)
    expect(submitLegacyWin).not.toHaveBeenCalled()
    expect(legacyScores.value.beginner).toBeUndefined()
  })

  it("victoire d'un autre mode : ignorée", async () => {
    const legacy = setup(createGame(10, 10, 20))

    legacy.game.value.status = "won"
    await nextTick()

    expect(legacy.banner.value).toBe(false)
    expect(submitLegacyWin).not.toHaveBeenCalled()
  })

  it("la bannière se ferme quand on change de mode", async () => {
    const legacy = setup()
    legacy.game.value.status = "won"
    await nextTick()

    legacy.game.value = createGame(10, 10, 20)
    await nextTick()

    expect(legacy.banner.value).toBe(false)
  })
})

describe("useLegacyMode — partie neuve et difficulté", () => {
  it("mémorise la difficulté choisie et la reprend par défaut", () => {
    const legacy = setup()

    legacy.startNewGame("expert")
    expect(legacy.game.value.difficulty).toBe("expert")

    legacy.startNewGame()
    expect(legacy.game.value.difficulty).toBe("expert")

    legacy.startNewGame("n'importe quoi")
    expect(legacy.game.value.difficulty).toBe("expert")
  })

  it("chrono, journal et caméra repartent de zéro", () => {
    const legacy = setup()
    legacy.engage()
    legacy.recordMove("reveal", anyCell)
    vi.advanceTimersByTime(1000)
    legacy.originX.value = 3

    legacy.startNewGame("beginner")

    expect(legacy.timeLabel.value).toBe("00:00.00")
    expect(legacy.moveLog.moves.value).toEqual([])
    expect(legacy.originX.value).toBe(0)
    expect(legacy.resetZoom).toHaveBeenCalled()
  })

  it("« déplace-toi » : seulement pour un plateau qui déborde, une seule fois", () => {
    const legacy = setup()

    legacy.startNewGame("beginner")
    expect(currentToast.value).toBeNull()

    legacy.startNewGame("intermediate")
    expect(currentToast.value.text).toContain("Drag with your finger")

    currentToast.value = null
    legacy.startNewGame("expert")
    expect(currentToast.value).toBeNull()
  })

  it("libellé du bouton : difficulté abrégée en Legacy", () => {
    const legacy = setup()
    expect(legacy.buttonLabel.value).toBe("Legacy (beg.)")

    legacy.game.value = createGame(10, 10, 20)
    expect(legacy.buttonLabel.value).toBe("Legacy")
  })
})

describe("useLegacyMode — caméra bornée", () => {
  it("plateau qui tient à l'écran : verrouillé au centre, aucune ombre", () => {
    const legacy = setup()
    legacy.originX.value = 5

    legacy.clampOrigin()

    expect(legacy.originX.value).toBe(0)
    expect(legacy.edges.value).toEqual({
      left: false,
      right: false,
      up: false,
      down: false,
    })
  })

  it("plateau qui déborde : borné à ± la moitié du débordement", () => {
    const legacy = setup(createLegacyGame("expert", 1))
    // 30 cases de large dans 10 : 20 cases de débordement, ± 10.
    legacy.containerWidth.value = 10 * CELL

    legacy.originX.value = 50
    legacy.clampOrigin()
    expect(legacy.originX.value).toBe(10)
    expect(legacy.edges.value.left).toBe(true)
    expect(legacy.edges.value.right).toBe(false)

    legacy.originX.value = -50
    legacy.clampOrigin()
    expect(legacy.originX.value).toBe(-10)
  })
})

describe("useLegacyMode — sauvegarde et reprise", () => {
  it("snapshot puis restore : temps et journal repris, chrono relancé", () => {
    const first = setup()
    first.engage()
    first.recordMove("reveal", anyCell)
    vi.advanceTimersByTime(3000)
    first.suspend()
    const extras = first.snapshotExtras()
    scope.stop()

    const second = setup()
    second.restore({ ...extras, revealedCount: 5 })
    vi.advanceTimersByTime(1000)

    expect(second.timeLabel.value).toBe("00:04.00")
    expect(second.moveLog.moves.value).toEqual(extras.moves)
  })

  it("restore avant tout reveal : le chrono attend le 1er coup", () => {
    const legacy = setup()

    legacy.restore({ elapsedMs: 0, moves: [], revealedCount: 0 })
    vi.advanceTimersByTime(1000)

    expect(legacy.timeLabel.value).toBe("00:00.00")
  })

  it("retour sur l'onglet : le chrono ne repart que si la partie continue", async () => {
    const legacy = setup()
    legacy.engage()
    legacy.suspend()
    legacy.resumeIfPlaying()
    vi.advanceTimersByTime(1000)
    expect(legacy.timeLabel.value).toBe("00:01.00")

    legacy.game.value.status = "won"
    await nextTick()
    legacy.resumeIfPlaying()
    vi.advanceTimersByTime(1000)
    expect(legacy.timeLabel.value).toBe("00:01.00")
  })
})
