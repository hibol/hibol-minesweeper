// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ref, effectScope, nextTick } from "vue"
import { createGame, createInfiniteGame } from "../game/game"
import { saveActiveGame } from "../state/gameStorage"
import { pushInfiniteProgress } from "../state/infiniteOnline"
import {
  useInfiniteProgressPush,
  PUSH_STEP_CELLS,
} from "./useInfiniteProgressPush"

// Le dédoublonnage et l'envoi sont dans infiniteOnline.test.js : ici on vérifie
// quelle run part, et quand.
vi.mock("../state/infiniteOnline", async (importOriginal) => ({
  ...(await importOriginal()),
  pushInfiniteProgress: vi.fn(() => Promise.resolve()),
}))

let scope

function setup(game) {
  const gameRef = ref(game)
  scope = effectScope()
  const api = scope.run(() => useInfiniteProgressPush(gameRef))
  return { gameRef, ...api }
}

// Une partie Infini au-delà de l'ouverture automatique (isMeaningfulRun).
function playedInfinite(revealedCount = 500) {
  const game = createInfiniteGame(7)
  game.revealedCount = revealedCount
  game.maxDistance = 42.5
  game.minesTriggeredCount = 3
  game.heartsCollectedCount = 1
  game.robotsTriggeredCount = 2
  game.usedMachines = true
  game.machineUses.xrayMachine = 2
  return game
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(pushInfiniteProgress).mockClear()
})

afterEach(() => {
  scope?.stop()
})

describe("useInfiniteProgressPush — pushProgress", () => {
  it("partie Infini vivante : sa run exacte, au contrat serveur", async () => {
    const { pushProgress } = setup(playedInfinite())

    await pushProgress()

    expect(pushInfiniteProgress).toHaveBeenCalledExactlyOnceWith(
      {
        usedMachines: true,
        maxDistance: 42.5,
        revealedCount: 500,
        minesTriggered: 3,
        heartsCollected: 1,
        robotsTriggered: 2,
        windMachineUses: 0,
        travelMachineUses: 0,
        xrayMachineUses: 2,
      },
      { keepalive: false },
    )
  })

  it("keepalive transmis tel quel", async () => {
    const { pushProgress } = setup(playedInfinite())

    await pushProgress({ keepalive: true })

    expect(pushInfiniteProgress.mock.calls[0][1]).toEqual({ keepalive: true })
  })

  it("simple ouverture automatique (pas de vraie progression) : rien ne part", async () => {
    const { pushProgress } = setup(playedInfinite(10))

    await pushProgress()

    expect(pushInfiniteProgress).not.toHaveBeenCalled()
  })

  it("partie perdue : rien ne part (le Give Up a déjà envoyé la run)", async () => {
    const game = playedInfinite()
    game.status = "lost"
    const { pushProgress } = setup(game)

    await pushProgress()

    expect(pushInfiniteProgress).not.toHaveBeenCalled()
  })

  it("joueur dans un autre mode : la run vient du slot Infini sauvegardé", async () => {
    saveActiveGame(playedInfinite(900), {
      originX: 0,
      originY: 0,
      cellSize: 20,
    })
    const { pushProgress } = setup(createGame(10, 10, 20))

    await pushProgress()

    expect(pushInfiniteProgress).toHaveBeenCalledOnce()
    expect(pushInfiniteProgress.mock.calls[0][0]).toMatchObject({
      revealedCount: 900,
      maxDistance: 42.5,
      usedMachines: true,
      xrayMachineUses: 2,
    })
  })

  it("autre mode et aucun slot Infini : rien ne part", async () => {
    const { pushProgress } = setup(createGame(10, 10, 20))

    await pushProgress()

    expect(pushInfiniteProgress).not.toHaveBeenCalled()
  })

  it("slot d'une ancienne version (sans compteurs de machines) : zéros", async () => {
    const game = playedInfinite(900)
    saveActiveGame(game, { originX: 0, originY: 0, cellSize: 20 })
    const key = "hibol-minesweeper:active-game:infinite"
    const slot = JSON.parse(localStorage.getItem(key))
    delete slot.machineUses
    localStorage.setItem(key, JSON.stringify(slot))
    const { pushProgress } = setup(createGame(10, 10, 20))

    await pushProgress()

    expect(pushInfiniteProgress.mock.calls[0][0]).toMatchObject({
      windMachineUses: 0,
      travelMachineUses: 0,
      xrayMachineUses: 0,
    })
  })

  it("ne rejette jamais, même si l'envoi lève", async () => {
    pushInfiniteProgress.mockRejectedValueOnce(new Error("boom"))
    const { pushProgress } = setup(playedInfinite())

    await expect(pushProgress()).resolves.toBeUndefined()
  })
})

describe("useInfiniteProgressPush — reprise", () => {
  it("une partie Infini mise en place (démarrage, retour au mode) pousse", async () => {
    const { gameRef } = setup(createGame(10, 10, 20))

    gameRef.value = playedInfinite()
    await nextTick()

    expect(pushInfiniteProgress).toHaveBeenCalledOnce()
  })

  it("une partie d'un autre mode ne pousse pas", async () => {
    const { gameRef } = setup(createGame(10, 10, 20))

    gameRef.value = createGame(10, 10, 20)
    await nextTick()

    expect(pushInfiniteProgress).not.toHaveBeenCalled()
  })

  it("jouer dans la partie ne compte pas comme une reprise", async () => {
    const { gameRef } = setup(playedInfinite(100))

    gameRef.value.revealedCount += 5
    await nextTick()

    expect(pushInfiniteProgress).not.toHaveBeenCalled()
  })
})

describe("useInfiniteProgressPush — palier de cases", () => {
  it("pousse en franchissant chaque multiple de PUSH_STEP_CELLS, pas entre deux", async () => {
    const { gameRef } = setup(playedInfinite(PUSH_STEP_CELLS - 10))

    gameRef.value.revealedCount = PUSH_STEP_CELLS - 1
    await nextTick()
    expect(pushInfiniteProgress).not.toHaveBeenCalled()

    gameRef.value.revealedCount = PUSH_STEP_CELLS + 20
    await nextTick()
    expect(pushInfiniteProgress).toHaveBeenCalledTimes(1)

    gameRef.value.revealedCount = PUSH_STEP_CELLS + 400
    await nextTick()
    expect(pushInfiniteProgress).toHaveBeenCalledTimes(1)

    gameRef.value.revealedCount = PUSH_STEP_CELLS * 2
    await nextTick()
    expect(pushInfiniteProgress).toHaveBeenCalledTimes(2)
  })

  it("une cascade qui saute plusieurs paliers ne pousse qu'une fois", async () => {
    const { gameRef } = setup(playedInfinite(100))

    gameRef.value.revealedCount = PUSH_STEP_CELLS * 3 + 1
    await nextTick()

    expect(pushInfiniteProgress).toHaveBeenCalledTimes(1)
  })

  it("changer de partie ne compte pas comme un palier (la reprise s'en occupe, une fois)", async () => {
    const { gameRef } = setup(createGame(10, 10, 20))

    gameRef.value = playedInfinite(PUSH_STEP_CELLS * 4)
    await nextTick()

    expect(pushInfiniteProgress).toHaveBeenCalledTimes(1)
  })

  it("pas de palier hors Infini", async () => {
    const game = createGame(10, 10, 20)
    const { gameRef } = setup(game)

    gameRef.value.revealedCount = PUSH_STEP_CELLS * 2
    await nextTick()

    expect(pushInfiniteProgress).not.toHaveBeenCalled()
  })
})
