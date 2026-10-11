// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ref, effectScope, watch, toRaw } from "vue"
import { createGame, createInfiniteGame } from "../game/game"
import {
  saveActiveGame,
  loadActiveGame,
  getLastMode,
  setLastMode,
} from "../state/gameStorage"
import { treasureDayKey } from "../state/treasureHunt"
import { treasureEntries } from "../state/treasureLog"
import { unlockedAchievements } from "../state/achievements"
import { currentToast } from "../state/toastQueue"
import { useModeSwitcher } from "./useModeSwitcher"

// Les parcours complets (boutons, confirmation, démarrage dans l'app montée)
// sont dans App.modes.integration.test.js. Ici : les ordres d'appel et les
// garde-fous que le DOM ne montre pas.

const CELL = 28
let scope

function setup(
  game = createGame(10, 10, 20),
  { infiniteUnlocked = true } = {},
) {
  const gameRef = ref(game)
  const deps = {
    cellSize: ref(CELL),
    originX: ref(0),
    originY: ref(0),
    resetZoom: vi.fn(),
    centerOn: vi.fn(),
    defaultCellSize: CELL,
    resetRobotFollowState: vi.fn(),
    dismissWinBanner: vi.fn(),
    dismissGiveUpBanner: vi.fn(),
    snapFogRadius: vi.fn(),
    redrawFog: vi.fn(),
    startNewLegacyGame: vi.fn(),
    restoreLegacyState: vi.fn(),
    resetTreasureForNewGame: vi.fn(),
    restoreTreasureState: vi.fn(),
    persistTreasureGame: vi.fn(),
    maybeShowInfiniteIntro: vi.fn(),
    maybeShowTreasureIntro: vi.fn(),
    persistActiveGame: vi.fn(),
    infiniteUnlocked: ref(infiniteUnlocked),
  }
  scope = effectScope()
  const api = scope.run(() => useModeSwitcher(gameRef, deps))
  return { gameRef, deps, ...api }
}

// Slot infini en pause, caméra comprise.
function pausedInfinite(camera = { originX: 7, originY: -3, cellSize: 20 }) {
  const game = createInfiniteGame(4242)
  saveActiveGame(game, camera)
  return game
}

// Partie classic avec de la progression (la confirmation de perte s'ouvre).
function playedClassic() {
  const game = createGame(10, 10, 20)
  game.status = "playing"
  game.revealedCount = 5
  return game
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  scope?.stop()
  treasureEntries.value = []
  unlockedAchievements.value = {}
  currentToast.value = null
})

describe("useModeSwitcher — changer de mode", () => {
  it("sauvegarde la partie sortante avant de reprendre le slot cible", () => {
    const paused = pausedInfinite()
    const { activateMode, deps, gameRef } = setup()
    const modeAtPersist = []
    deps.persistActiveGame.mockImplementation(() =>
      modeAtPersist.push(gameRef.value.mode),
    )

    activateMode("infinite")

    expect(modeAtPersist).toEqual(["classic"])
    expect(gameRef.value.mode).toBe("infinite")
    expect(gameRef.value.seed).toBe(paused.seed)
    expect(getLastMode()).toBe("infinite")
  })

  it("reprise : caméra du snapshot en place AVANT l'assignation de la partie", () => {
    pausedInfinite()
    const { activateMode, deps, gameRef } = setup()
    const cameraAtAssign = []
    scope.run(() =>
      watch(
        gameRef,
        () =>
          cameraAtAssign.push([
            deps.originX.value,
            deps.originY.value,
            deps.cellSize.value,
          ]),
        { flush: "sync" },
      ),
    )

    activateMode("infinite")

    expect(cameraAtAssign).toEqual([[7, -3, 20]])
  })

  it("reprise : voile calé (snapFogRadius) avant d'être redessiné", () => {
    pausedInfinite()
    const { activateMode, deps } = setup()

    activateMode("infinite")

    expect(deps.snapFogRadius).toHaveBeenCalledOnce()
    expect(deps.snapFogRadius.mock.invocationCallOrder[0]).toBeLessThan(
      deps.redrawFog.mock.invocationCallOrder[0],
    )
  })

  it("slot illisible : effacé, partie neuve à la place", () => {
    localStorage.setItem(
      "hibol-minesweeper:active-game:infinite",
      JSON.stringify({ mode: "infinite", status: "playing" }),
    )
    const { activateMode, gameRef, deps } = setup()

    activateMode("infinite")

    expect(gameRef.value.mode).toBe("infinite")
    expect(gameRef.value.seed).toBeGreaterThan(1e12)
    expect(loadActiveGame("infinite")).toBeNull()
    expect(deps.maybeShowInfiniteIntro).toHaveBeenCalledOnce()
  })

  it("partie infinie neuve : zoom remis avant le centrage", () => {
    const { activateMode, deps } = setup()

    activateMode("infinite")

    expect(deps.centerOn).toHaveBeenCalledWith(0, 0)
    expect(deps.resetZoom.mock.invocationCallOrder[0]).toBeLessThan(
      deps.centerOn.mock.invocationCallOrder[0],
    )
  })
})

describe("useModeSwitcher — partie neuve", () => {
  it("même mode avec progression : confirmation, puis partie neuve", () => {
    const game = playedClassic()
    const { activateMode, pendingStart, confirmPendingStart, gameRef, deps } =
      setup(game)

    activateMode("classic")

    expect(pendingStart.value).toEqual({ mode: "classic", params: {} })
    expect(toRaw(gameRef.value)).toBe(game)
    expect(deps.persistActiveGame).not.toHaveBeenCalled()

    confirmPendingStart()

    expect(pendingStart.value).toBeNull()
    expect(toRaw(gameRef.value)).not.toBe(game)
    expect(gameRef.value.revealedCount).toBe(0)
  })

  it("requestNewGame vers un autre mode sauvegarde la partie à l'écran", () => {
    const { requestNewGame, deps, gameRef } = setup()

    requestNewGame("infinite", { seed: 99 })

    expect(deps.persistActiveGame).toHaveBeenCalledOnce()
    expect(gameRef.value.seed).toBe(99)
  })

  it("seed choisie : débloque Seed Hunter, partie neuve à cette seed", () => {
    pausedInfinite()
    const { onStartInfiniteWithSeed, gameRef } = setup()

    onStartInfiniteWithSeed(1234)

    expect(unlockedAchievements.value["seed-hunter"]).toBeTruthy()
    // Partie neuve, pas la reprise du slot en pause.
    expect(gameRef.value.seed).toBe(1234)
  })

  it("la chasse ne se redémarre jamais par requestNewGame", () => {
    const { requestNewGame, gameRef, deps } = setup()
    const before = gameRef.value

    requestNewGame("treasure")

    expect(gameRef.value).toBe(before)
    expect(deps.persistActiveGame).not.toHaveBeenCalled()
  })
})

describe("useModeSwitcher — chasse au trésor", () => {
  it("bouton chasse depuis un autre mode : sauvegarde puis chasse neuve", () => {
    const { activateMode, gameRef, deps } = setup()

    activateMode("treasure")

    expect(deps.persistActiveGame).toHaveBeenCalledOnce()
    expect(gameRef.value.mode).toBe("treasure")
    expect(deps.resetTreasureForNewGame).toHaveBeenCalledOnce()
    expect(deps.persistTreasureGame).toHaveBeenCalledOnce()
    expect(deps.maybeShowTreasureIntro).toHaveBeenCalledOnce()
    expect(getLastMode()).toBe("treasure")
  })

  it("re-cliquer la chasse à l'écran ne fait rien", () => {
    const { activateMode, gameRef, deps } = setup()
    activateMode("treasure")
    const hunt = gameRef.value
    deps.persistActiveGame.mockClear()

    activateMode("treasure")

    expect(gameRef.value).toBe(hunt)
    expect(deps.persistActiveGame).not.toHaveBeenCalled()
    expect(deps.resetTreasureForNewGame).toHaveBeenCalledOnce()
  })

  it("chasse du jour déjà au journal : on reste, avec un message", () => {
    treasureEntries.value = [{ dayKey: treasureDayKey() }]
    const { activateMode, gameRef } = setup()
    const before = gameRef.value

    activateMode("treasure")

    expect(gameRef.value).toBe(before)
    expect(currentToast.value.text).toBe(
      "Today's hunt is over. Come back tomorrow!",
    )
  })

  it("startTreasureGame({ dev: true }) : ni sauvegarde ni introduction", () => {
    treasureEntries.value = [{ dayKey: treasureDayKey() }]
    const { startTreasureGame, gameRef, deps } = setup()

    expect(startTreasureGame({ dev: true })).toBe(true)

    expect(gameRef.value.mode).toBe("treasure")
    expect(deps.persistTreasureGame).not.toHaveBeenCalled()
    expect(deps.maybeShowTreasureIntro).not.toHaveBeenCalled()
  })
})

describe("useModeSwitcher — démarrage", () => {
  it("dernier mode infini avec slot en pause : reprise", () => {
    const paused = pausedInfinite()
    setLastMode("infinite")
    const { bootGame, gameRef, pausedModes } = setup()

    bootGame()

    expect(gameRef.value.seed).toBe(paused.seed)
    expect(pausedModes.value.infinite).toBe(false)
  })

  it("dernier mode infini sans slot : partie neuve", () => {
    setLastMode("infinite")
    const { bootGame, gameRef } = setup()

    bootGame()

    expect(gameRef.value.mode).toBe("infinite")
  })

  it("chasse du jour déjà jouée : repli sur le mode de base", () => {
    treasureEntries.value = [{ dayKey: treasureDayKey() }]
    setLastMode("treasure")
    const { bootGame, gameRef } = setup()

    bootGame()

    expect(gameRef.value.mode).toBe("classic")
  })

  it("chasse déjà jouée : le repli reprend la partie classic en pause", () => {
    treasureEntries.value = [{ dayKey: treasureDayKey() }]
    saveActiveGame(playedClassic(), { originX: 0, originY: 0, cellSize: CELL })
    setLastMode("treasure")
    const { bootGame, gameRef } = setup()

    bootGame()

    expect(gameRef.value.revealedCount).toBe(5)
  })

  it("slot classic illisible : effacé, même si la partie neuve est déjà là", () => {
    localStorage.setItem(
      "hibol-minesweeper:active-game:classic",
      JSON.stringify({ mode: "classic", status: "playing" }),
    )
    const { bootGame } = setup()

    bootGame()

    expect(loadActiveGame("classic")).toBeNull()
  })

  it("marque les modes en pause", () => {
    pausedInfinite()
    const { bootGame, pausedModes } = setup()

    bootGame()

    expect(pausedModes.value.infinite).toBe(true)
  })
})
