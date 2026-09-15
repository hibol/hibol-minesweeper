import { describe, it, expect } from "vitest"
import { ref, nextTick } from "vue"
import { useTornadoReveal } from "./useTornadoReveal.js"

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

  const { drainPendingTornadoes } = useTornadoReveal(game, {
    originX: originXRef,
    originY: originYRef,
    viewportWidth,
    viewportHeight,
  })

  return {
    game,
    drainPendingTornadoes,
    originX: originXRef,
    originY: originYRef,
  }
}

describe("useTornadoReveal — pending vs déclenchée", () => {
  it("une tornade révélée dans le viewport se déclenche tout de suite", () => {
    const { game, drainPendingTornadoes } = setupTornado({
      game: makeGame(),
    })

    const tornado = tornadoCell(5, 5)
    game.value.pendingTornadoReveals.push(tornado)
    drainPendingTornadoes()

    expect(tornado.tornadoTriggered).toBe(true)
    expect(game.value.tornadoCount).toBe(1)
    expect(game.value.pendingTornado).toBe(true)
  })

  it("une tornade révélée hors du viewport (grosse cascade) reste en attente, ne se déclenche pas", () => {
    const { game, drainPendingTornadoes } = setupTornado({
      game: makeGame(),
    })

    const tornado = tornadoCell(1000, 1000)
    game.value.pendingTornadoReveals.push(tornado)
    drainPendingTornadoes()

    expect(tornado.tornadoTriggered).toBe(false)
    expect(game.value.tornadoCount).toBe(0)
    expect(game.value.pendingTornado).toBe(false)
  })

  it("un déplacement de caméra qui ramène une tornade en attente dans le viewport la déclenche automatiquement", async () => {
    const { game, drainPendingTornadoes, originX, originY } = setupTornado({
      game: makeGame(),
    })

    const tornado = tornadoCell(1000, 1000)
    game.value.pendingTornadoReveals.push(tornado)
    drainPendingTornadoes()
    expect(tornado.tornadoTriggered).toBe(false)

    originX.value = 995
    originY.value = 995
    await nextTick()

    expect(tornado.tornadoTriggered).toBe(true)
    expect(game.value.tornadoCount).toBe(1)
  })

  it("plusieurs tornades en attente : chacune se déclenche dans l'ordre, tornadoCount/chest incrémentent à chaque fois", () => {
    const { game, drainPendingTornadoes } = setupTornado({
      game: makeGame(),
    })

    const first = tornadoCell(1, 1)
    const second = tornadoCell(2, 2)
    game.value.pendingTornadoReveals.push(first, second)
    drainPendingTornadoes()

    expect(first.tornadoTriggered).toBe(true)
    expect(second.tornadoTriggered).toBe(true)
    expect(game.value.tornadoCount).toBe(2)
  })
})

describe("useTornadoReveal — reprise (game.value remplacé)", () => {
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
