import { describe, it, expect, vi } from "vitest"
import { computed, effectScope, nextTick, ref } from "vue"
import { useMapView, MAP_LEVEL_THRESHOLD } from "./useMapView.js"
import { MAP_FLOOR_MAX, adaptiveMinCellSize } from "../mapRender.js"

// useMapView prend les refs caméra d'App.vue ; ici des ref() nues et un
// centerOn qui reproduit celui de useViewportCamera.

const BASE = 28

function newGame(mode = "infinite") {
  return {
    mode,
    cells: new Map(),
    revealedCount: 0,
    minesTriggeredCount: 0,
    flaggedCount: 0,
  }
}

function setup({
  mode = "infinite",
  cellSize = BASE,
  width = 1000,
  height = 500,
} = {}) {
  const game = ref(newGame(mode))
  const cam = {
    cellSize: ref(cellSize),
    originX: ref(0),
    originY: ref(0),
    containerWidth: ref(width),
    containerHeight: ref(height),
  }
  const confirmedHeartsCount = ref(0)
  const robotStepTick = ref(0)
  const beforeJump = vi.fn()
  const centerOn = vi.fn((x, y) => {
    const across = Math.max(1, Math.floor(width / cam.cellSize.value))
    const down = Math.max(1, Math.floor(height / cam.cellSize.value))
    cam.originX.value = x - across / 2
    cam.originY.value = y - down / 2
  })
  const infiniteLike = computed(
    () => game.value.mode === "infinite" || game.value.mode === "treasure",
  )

  const view = effectScope().run(() =>
    useMapView(game, {
      infiniteLike,
      ...cam,
      baseCellSize: BASE,
      centerOn,
      confirmedHeartsCount,
      robotStepTick,
      beforeJump,
    }),
  )

  return {
    ...view,
    ...cam,
    game,
    confirmedHeartsCount,
    robotStepTick,
    centerOn,
    beforeJump,
  }
}

// Révèle une ligne de cases [0, length) en y = 0 et signale le coup.
async function revealRow(game, length) {
  for (let x = 0; x < length; x++) {
    game.value.cells.set(`${x},0`, { x, y: 0, revealed: true, flagged: false })
  }
  game.value.revealedCount += length
  await nextTick()
}

describe("useMapView — mapActive", () => {
  it("s'active sous MAP_LEVEL_THRESHOLD en infini et en trésor", () => {
    const view = setup({ cellSize: MAP_LEVEL_THRESHOLD - 0.1 })
    expect(view.mapActive.value).toBe(true)
    view.cellSize.value = MAP_LEVEL_THRESHOLD
    expect(view.mapActive.value).toBe(false)
    expect(setup({ mode: "treasure", cellSize: 2 }).mapActive.value).toBe(true)
  })

  it("ne s'active jamais en classic ni en Legacy", () => {
    expect(setup({ mode: "classic", cellSize: 2 }).mapActive.value).toBe(false)
    expect(setup({ mode: "legacy", cellSize: 2 }).mapActive.value).toBe(false)
  })
})

describe("useMapView — zoomFloor", () => {
  it("garde le plancher historique hors infini", () => {
    expect(setup({ mode: "classic" }).zoomFloor()).toBe(MAP_LEVEL_THRESHOLD)
  })

  it("vaut MAP_FLOOR_MAX sur une partie neuve", () => {
    expect(setup().zoomFloor()).toBe(MAP_FLOOR_MAX)
  })

  it("descend pour faire tenir la zone touchée, sous 1 px si besoin", async () => {
    const view = setup({ width: 1000, height: 500 })
    await revealRow(view.game, 2000)
    const expected = adaptiveMinCellSize(
      { minX: 0, minY: 0, maxX: 1999, maxY: 0 },
      1000,
      500,
    )
    expect(view.zoomFloor()).toBeCloseTo(expected)
    expect(view.zoomFloor()).toBeLessThan(1)
  })

  it("ne remonte jamais au cours d'une partie, repart de zéro à la suivante", async () => {
    const view = setup()
    await revealRow(view.game, 2000)
    const low = view.zoomFloor()

    view.game.value.cells.clear()
    view.game.value.revealedCount++
    await nextTick()
    expect(view.zoomFloor()).toBe(low)

    view.game.value = newGame()
    await nextTick()
    expect(view.zoomFloor()).toBe(MAP_FLOOR_MAX)
  })
})

describe("useMapView — zoom de retour", () => {
  it("retient le zoom du dernier coup joué hors carte", async () => {
    const view = setup({ cellSize: 20 })
    view.game.value.revealedCount++
    await nextTick()
    expect(view.playCellSize.value).toBe(20)

    view.cellSize.value = 3
    view.robotStepTick.value++
    view.game.value.revealedCount++
    await nextTick()
    expect(view.playCellSize.value).toBe(20)
  })

  it("vaut le zoom de base par défaut", () => {
    expect(setup({ cellSize: 3 }).playCellSize.value).toBe(BASE)
  })
})

describe("useMapView — double tap", () => {
  it("1er tap : pose la cible, rectangle = zone visible au zoom de jeu", () => {
    const view = setup({ cellSize: 2, width: 1000, height: 500 })
    view.onMapTap(100, 50)

    expect(view.target.value).toEqual({ x: 50, y: 25 })
    const r = view.targetRect.value
    // floor(1000 / 28) = 35 cases → origine 50 - 17.5 = 32.5 → 65 px.
    expect(r.left).toBeCloseTo(65)
    expect(r.width).toBeCloseTo((1000 / BASE) * 2)
    expect(r.height).toBeCloseTo((500 / BASE) * 2)
    expect(r.centerX).toBeCloseTo(100)
    expect(r.centerY).toBeCloseTo(50)
  })

  it("le rectangle est ancré au monde : il suit le pan et le zoom", () => {
    const view = setup({ cellSize: 2 })
    view.onMapTap(100, 50)
    view.originX.value = 10
    expect(view.targetRect.value.centerX).toBeCloseTo(80)
    view.cellSize.value = 4
    expect(view.targetRect.value.centerX).toBeCloseTo(160)
  })

  it("2e tap dans le rectangle : revient au zoom de jeu centré sur la cible", () => {
    const view = setup({ cellSize: 2 })
    view.onMapTap(100, 50)
    view.onMapTap(105, 52)

    expect(view.beforeJump).toHaveBeenCalled()
    expect(view.cellSize.value).toBe(BASE)
    expect(view.centerOn).toHaveBeenCalledWith(50, 25)
    expect(view.target.value).toBeNull()
  })

  it("tap hors du rectangle : déplace la cible", () => {
    const view = setup({ cellSize: 2 })
    view.onMapTap(100, 50)
    view.onMapTap(600, 400)
    expect(view.target.value).toEqual({ x: 300, y: 200 })
    expect(view.centerOn).not.toHaveBeenCalled()
  })

  it("un rectangle de quelques pixels reste tapable au doigt", () => {
    const view = setup({ cellSize: 0.1 })
    view.onMapTap(300, 200)
    expect(view.targetRect.value.width).toBeLessThan(5)
    view.onMapTap(315, 210)
    expect(view.centerOn).toHaveBeenCalled()
  })

  it("cancelTarget et la sortie du niveau carte effacent la cible", async () => {
    const view = setup({ cellSize: 2 })
    view.onMapTap(100, 50)
    view.cancelTarget()
    expect(view.targetRect.value).toBeNull()

    view.onMapTap(100, 50)
    view.cellSize.value = 20
    await nextTick()
    expect(view.target.value).toBeNull()
  })
})

describe("useMapView — mapBounds", () => {
  it("se recalcule avec les coups joués, en nouvel objet à chaque changement", async () => {
    const view = setup()
    expect(view.mapBounds.value).toBeNull()

    await revealRow(view.game, 5)
    const first = view.mapBounds.value
    expect(first).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 0 })
    expect(view.mapBounds.value).toBe(first) // en cache tant que rien ne bouge

    view.robotStepTick.value++
    expect(view.mapBounds.value).not.toBe(first)
    const second = view.mapBounds.value
    view.confirmedHeartsCount.value++
    expect(view.mapBounds.value).not.toBe(second)
  })

  it("ne suit pas les cases elles-mêmes, seulement les signaux", () => {
    const view = setup()
    const before = view.mapBounds.value
    view.game.value.cells.set("3,3", { x: 3, y: 3, revealed: true })
    expect(view.mapBounds.value).toBe(before)
  })
})
