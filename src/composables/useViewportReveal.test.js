import { describe, it, expect } from "vitest"
import { ref, nextTick } from "vue"
import { useViewportReveal } from "./useViewportReveal.js"

// Cellules/`game` construits à la main (même convention que
// useHeartFogReveal.test.js) — mode "treasure" n'a pas de brouillard, donc
// "vu" ici se réduit au rectangle du viewport (originX/Y + viewportWidth/
// Height, en cases), pas une ellipse.

function makeGame(overrides = {}) {
  return {
    mode: "treasure",
    status: "playing",
    tornadoCount: 0,
    chest: { x: 0, y: 0 },
    pendingTornado: false,
    cells: new Map(),
    pendingTornadoReveals: [],
    ...overrides,
  }
}

function tornadoCell(x, y, { tornadoTriggered = false, revealed = true } = {}) {
  return { x, y, isTornado: true, revealed, tornadoTriggered }
}

function setupTornado({
  game: gameState,
  originX = 0,
  originY = 0,
  viewportWidthCells = 10,
  viewportHeightCells = 10,
}) {
  const game = ref(gameState)
  const originXRef = ref(originX)
  const originYRef = ref(originY)
  const viewportWidth = ref(viewportWidthCells)
  const viewportHeight = ref(viewportHeightCells)

  const { drainPendingReveals } = useViewportReveal(game, {
    originX: originXRef,
    originY: originYRef,
    viewportWidth,
    viewportHeight,
  })

  return {
    game,
    drainPendingReveals,
    originX: originXRef,
    originY: originYRef,
  }
}

describe("useViewportReveal (tornades) — pending vs déclenchée", () => {
  it("une tornade révélée dans le viewport se déclenche tout de suite", () => {
    const { game, drainPendingReveals } = setupTornado({
      game: makeGame(),
    })

    const tornado = tornadoCell(5, 5)
    game.value.pendingTornadoReveals.push(tornado)
    drainPendingReveals()

    expect(tornado.tornadoTriggered).toBe(true)
    expect(game.value.tornadoCount).toBe(1)
    expect(game.value.pendingTornado).toBe(true)
  })

  it("une tornade révélée hors du viewport (grosse cascade) reste en attente, ne se déclenche pas", () => {
    const { game, drainPendingReveals } = setupTornado({
      game: makeGame(),
    })

    const tornado = tornadoCell(1000, 1000)
    game.value.pendingTornadoReveals.push(tornado)
    drainPendingReveals()

    expect(tornado.tornadoTriggered).toBe(false)
    expect(game.value.tornadoCount).toBe(0)
    expect(game.value.pendingTornado).toBe(false)
  })

  it("un déplacement de caméra qui ramène une tornade en attente dans le viewport la déclenche automatiquement", async () => {
    const { game, drainPendingReveals, originX, originY } = setupTornado({
      game: makeGame(),
    })

    const tornado = tornadoCell(1000, 1000)
    game.value.pendingTornadoReveals.push(tornado)
    drainPendingReveals()
    expect(tornado.tornadoTriggered).toBe(false)

    originX.value = 995
    originY.value = 995
    await nextTick()

    expect(tornado.tornadoTriggered).toBe(true)
    expect(game.value.tornadoCount).toBe(1)
  })

  it("plusieurs tornades en attente : chacune se déclenche dans l'ordre, tornadoCount/chest incrémentent à chaque fois", () => {
    const { game, drainPendingReveals } = setupTornado({
      game: makeGame(),
    })

    const first = tornadoCell(1, 1)
    const second = tornadoCell(2, 2)
    game.value.pendingTornadoReveals.push(first, second)
    drainPendingReveals()

    expect(first.tornadoTriggered).toBe(true)
    expect(second.tornadoTriggered).toBe(true)
    expect(game.value.tornadoCount).toBe(2)
  })
})

describe("useViewportReveal (tornades) — reprise (game.value remplacé)", () => {
  it("resetFromGame recompte les tornades en attente depuis les cellules persistées", () => {
    const game = makeGame({
      cells: new Map([
        ["a", tornadoCell(1000, 1000, { tornadoTriggered: false })], // pas encore vue
        ["b", tornadoCell(2, 2, { tornadoTriggered: true })], // déjà déclenchée
      ]),
    })
    const { game: gameRef } = setupTornado({ game })

    // La tornade déjà déclenchée n'a pas rejoué son effet ; celle encore en
    // attente, elle, doit rester détectable comme non déclenchée.
    expect(gameRef.value.cells.get("a").tornadoTriggered).toBe(false)
    expect(gameRef.value.tornadoCount).toBe(0)
  })

  it("BUG resumeGame : le recalcul doit être SYNCHRONE — une tornade restaurée déjà dans le viewport doit se déclencher sans attendre un tick", () => {
    const before = makeGame()
    const { game } = setupTornado({ game: before })

    // Simule "ferme l'app, rouvre-la" : game.value remplacé par un état
    // restauré contenant une tornade révélée mais pas encore vue avant la
    // fermeture — et qui se trouve être DANS le viewport actuel (le joueur
    // avait justement la caméra dessus au moment de fermer).
    game.value = makeGame({
      cells: new Map([["a", tornadoCell(5, 5, { tornadoTriggered: false })]]),
    })

    // AUCUN await ici — même séquence que resumeGame()/redrawFog() dans
    // App.vue : si le watcher n'est pas flush:'sync', la tornade resterait
    // non déclenchée à cet instant précis.
    expect(game.value.cells.get("a").tornadoTriggered).toBe(true)
    expect(game.value.tornadoCount).toBe(1)
  })
})

describe("useViewportReveal (hibols)", () => {
  function hibolCell(x, y, { hibolCollected = false } = {}) {
    return { x, y, isHibol: true, revealed: true, hibolCollected }
  }

  function setupHibol(gameState) {
    const game = ref({ hibolsCollectedCount: 0, ...gameState })
    const originX = ref(0)
    const originY = ref(0)
    let credited = 0
    const { drainPendingReveals } = useViewportReveal(
      game,
      { originX, originY, viewportWidth: ref(10), viewportHeight: ref(10) },
      { onHibolCollected: () => credited++ },
    )
    return {
      game,
      originX,
      originY,
      drainPendingReveals,
      credited: () => credited,
    }
  }

  it("hors champ : en attente ; compté et crédité une fois dans le viewport", async () => {
    const ctx = setupHibol(makeGame({ pendingHibolReveals: [] }))
    const hibol = hibolCell(1000, 1000)
    ctx.game.value.pendingHibolReveals.push(hibol)
    ctx.drainPendingReveals()
    expect(ctx.game.value.hibolsCollectedCount).toBe(0)
    expect(ctx.credited()).toBe(0)

    ctx.originX.value = 995
    ctx.originY.value = 995
    await nextTick()

    expect(hibol.hibolCollected).toBe(true)
    expect(ctx.game.value.hibolsCollectedCount).toBe(1)
    expect(ctx.credited()).toBe(1)
  })

  it("reprise : un hibol déjà collecté n'est jamais recompté, un pas-vu repart en attente", async () => {
    const ctx = setupHibol(
      makeGame({
        pendingHibolReveals: [],
        cells: new Map([
          ["a", hibolCell(1000, 1000, { hibolCollected: true })],
          ["b", hibolCell(2000, 2000)],
        ]),
      }),
    )
    ctx.originX.value = 995
    ctx.originY.value = 995
    await nextTick()
    expect(ctx.credited()).toBe(0)

    ctx.originX.value = 1995
    ctx.originY.value = 1995
    await nextTick()
    expect(ctx.credited()).toBe(1)
    expect(ctx.game.value.cells.get("b").hibolCollected).toBe(true)
  })

  it("journée finie : tout est figé, ni hibol ni tornade en attente ne se déclenche", async () => {
    const ctx = setupHibol(
      makeGame({ pendingHibolReveals: [], pendingTornadoReveals: [] }),
    )
    const hibol = hibolCell(1000, 1000)
    const tornado = tornadoCell(1001, 1001)
    ctx.game.value.pendingHibolReveals.push(hibol)
    ctx.game.value.pendingTornadoReveals.push(tornado)
    ctx.drainPendingReveals()

    ctx.game.value.status = "won"
    ctx.originX.value = 995
    ctx.originY.value = 995
    await nextTick()

    expect(hibol.hibolCollected).toBe(false)
    expect(ctx.credited()).toBe(0)
    expect(tornado.tornadoTriggered).toBe(false)
    expect(ctx.game.value.tornadoCount).toBe(0)
  })

  it("coup final : un hibol visible compte malgré la fin de journée, pas une tornade", () => {
    const ctx = setupHibol(
      makeGame({ pendingHibolReveals: [], pendingTornadoReveals: [] }),
    )
    const hibol = hibolCell(5, 5)
    const tornado = tornadoCell(6, 6)
    ctx.game.value.pendingHibolReveals.push(hibol)
    ctx.game.value.pendingTornadoReveals.push(tornado)
    ctx.game.value.status = "lost"

    ctx.drainPendingReveals()

    expect(hibol.hibolCollected).toBe(true)
    expect(ctx.credited()).toBe(1)
    expect(tornado.tornadoTriggered).toBe(false)
  })

  it("après la fin : un hibol en attente amené à l'écran ne compte pas, même au drain suivant", async () => {
    const ctx = setupHibol(makeGame({ pendingHibolReveals: [] }))
    const hibol = hibolCell(1000, 1000)
    ctx.game.value.pendingHibolReveals.push(hibol)
    ctx.drainPendingReveals()
    ctx.game.value.status = "lost"

    ctx.originX.value = 995
    ctx.originY.value = 995
    await nextTick()
    ctx.drainPendingReveals()

    expect(hibol.hibolCollected).toBe(false)
    expect(ctx.credited()).toBe(0)
  })

  it("reprise d'une journée finie : rien n'est remis en attente", () => {
    const ctx = setupHibol(
      makeGame({
        status: "won",
        cells: new Map([
          ["a", hibolCell(5, 5)],
          ["b", tornadoCell(6, 6)],
        ]),
      }),
    )
    expect(ctx.game.value.cells.get("a").hibolCollected).toBe(false)
    expect(ctx.game.value.cells.get("b").tornadoTriggered).toBe(false)
    expect(ctx.credited()).toBe(0)
  })
})

describe("useViewportReveal (coffre)", () => {
  function chestGame(overrides = {}) {
    return makeGame({
      chest: { x: 1000, y: 1000 },
      chestFound: false,
      hibolsCollectedCount: 0,
      pendingHibolReveals: [],
      pendingChestReveals: [],
      ...overrides,
    })
  }

  function setupChest(gameState) {
    const game = ref(gameState)
    const originX = ref(0)
    const originY = ref(0)
    const { drainPendingReveals } = useViewportReveal(game, {
      originX,
      originY,
      viewportWidth: ref(10),
      viewportHeight: ref(10),
    })
    return { game, originX, originY, drainPendingReveals }
  }

  it("révélé hors champ : pas gagné ; gagné une fois dans le viewport", async () => {
    const ctx = setupChest(chestGame())
    const chest = { x: 1000, y: 1000, revealed: true }
    ctx.game.value.pendingChestReveals.push(chest)
    ctx.drainPendingReveals()
    expect(ctx.game.value.status).toBe("playing")

    ctx.originX.value = 995
    ctx.originY.value = 995
    await nextTick()

    expect(ctx.game.value.status).toBe("won")
    expect(ctx.game.value.chestFound).toBe(true)
    expect(chest.isChest).toBe(true)
  })

  it("même passage : hibols comptés avant la victoire, tornade vue en même temps figée", () => {
    const ctx = setupChest(chestGame({ chest: { x: 5, y: 5 } }))
    const chest = { x: 5, y: 5, revealed: true }
    const hibol = { x: 4, y: 4, isHibol: true, revealed: true }
    const tornado = tornadoCell(6, 6)
    ctx.game.value.pendingTornadoReveals.push(tornado)
    ctx.game.value.pendingChestReveals.push(chest)
    ctx.game.value.pendingHibolReveals.push(hibol)

    ctx.drainPendingReveals()

    expect(ctx.game.value.status).toBe("won")
    expect(ctx.game.value.hibolsCollectedCount).toBe(1)
    expect(tornado.tornadoTriggered).toBe(false)
    expect(ctx.game.value.chest).toEqual({ x: 5, y: 5 })
  })

  it("coffre déplacé par une tornade avant d'être vu : la case ne gagne plus", async () => {
    const ctx = setupChest(chestGame())
    const oldChest = { x: 1000, y: 1000, revealed: true }
    ctx.game.value.pendingChestReveals.push(oldChest)
    ctx.drainPendingReveals()

    ctx.game.value.chest = { x: -1000, y: -1000 }
    ctx.originX.value = 995
    ctx.originY.value = 995
    await nextTick()

    expect(ctx.game.value.status).toBe("playing")
    expect(oldChest.isChest).toBeUndefined()
  })

  it("reprise : un coffre révélé mais pas vu repart en attente", async () => {
    const ctx = setupChest(
      chestGame({
        cells: new Map([["c", { x: 1000, y: 1000, revealed: true }]]),
      }),
    )
    expect(ctx.game.value.status).toBe("playing")

    ctx.originX.value = 995
    ctx.originY.value = 995
    await nextTick()
    expect(ctx.game.value.status).toBe("won")
  })
})
