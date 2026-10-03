import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ref, effectScope, nextTick } from "vue"
import { useRobotAnimation } from "./useRobotAnimation.js"
import { useFogOfWar } from "./useFogOfWar.js"
import { useHeartFogReveal } from "./useHeartFogReveal.js"
import {
  createInfiniteGame,
  getCell,
  revealCell,
  ROBOT_STEP_MS,
} from "../game/game.js"

// Câblage d'App.vue : useRobotAnimation fait avancer les marches, onStep vide
// les cœurs révélés par le pas (useHeartFogReveal), qui lit les halos.
// Timers simulés : chaque pas tombe à son heure.

function cellProps(x, y, props) {
  return {
    x,
    y,
    isMine: false,
    isHeart: false,
    isRobot: false,
    revealed: false,
    flagged: false,
    wrong: false,
    neighborMines: 0,
    tiltDeg: 0,
    heartFogConfirmed: false,
    robotHere: false,
    ...props,
  }
}

// Pièce [x0..x1] x [y0..y1] ceinturée de cases révélées (cf. game.robot.test.js).
function room(x0, y0, x1, y1, overrides = {}, extra = {}) {
  const game = createInfiniteGame(1)
  game.cells.clear()
  Object.assign(game, {
    revealedCount: 0,
    minesTriggeredCount: 0,
    heartsCollectedCount: 0,
    robotsTriggeredCount: 0,
    maxDistance: 0,
    robotWalks: [],
    robotClock: 0,
    pendingRobotTrails: [],
    pendingHeartReveals: [],
    openingInProgress: false,
    ...extra,
  })
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const border = x < x0 || x > x1 || y < y0 || y > y1
      game.cells.set(
        `${x},${y}`,
        cellProps(x, y, border ? { revealed: true } : {}),
      )
    }
  }
  for (const [key, props] of Object.entries(overrides)) {
    Object.assign(game.cells.get(key), props)
  }
  return game
}

const CELL = 10

function setup(gameState, { originX = -5, originY = -5 } = {}) {
  const game = ref(gameState)
  const cam = {
    originX: ref(originX),
    originY: ref(originY),
    cellSize: ref(CELL),
    viewportWidth: ref(20),
    viewportHeight: ref(20),
  }
  const containerWidth = ref(20 * CELL)
  const containerHeight = ref(20 * CELL)
  const confirmedHeartsCount = ref(0)
  const animateOriginTo = vi.fn()
  const onAllWalksEnd = vi.fn()
  const changedLog = []
  let drainPendingHearts = () => {}

  const scope = effectScope()
  const robots = scope.run(() => {
    const anim = useRobotAnimation(game, {
      ...cam,
      animateOriginTo,
      cancelOriginTween: vi.fn(),
      followTweenMs: 300,
      onStep: (changed) => {
        changedLog.push(changed)
        drainPendingHearts()
      },
      onAllWalksEnd,
    })
    const { clearRadiusX, clearRadiusY } = useFogOfWar(
      game,
      cam.viewportWidth,
      cam.viewportHeight,
      cam.cellSize,
      CELL,
      confirmedHeartsCount,
    )
    ;({ drainPendingHearts } = useHeartFogReveal(game, {
      ...cam,
      containerWidth,
      containerHeight,
      clearRadiusX,
      clearRadiusY,
      haloPositions: anim.robotHaloPositions,
      haloRadius: anim.robotHaloRadius,
      confirmedHeartsCount,
    }))
    return anim
  })

  // Comme performReveal : reveal, puis drains.
  function click(x, y) {
    revealCell(game.value, getCell(game.value, x, y))
    robots.drainRobotTrails()
    drainPendingHearts()
  }

  return {
    game,
    ...cam,
    ...robots,
    confirmedHeartsCount,
    animateOriginTo,
    onAllWalksEnd,
    changedLog,
    click,
    scope,
  }
}

// Couloir est : robot en (0,0), cœur en (2,0), tout numéroté (pas de cascade).
function corridorWithHeart(extra) {
  const overrides = { "0,0": { isRobot: true, neighborMines: 1 } }
  for (let x = 1; x <= 4; x++) overrides[`${x},0`] = { neighborMines: 1 }
  overrides["2,0"].isHeart = true
  return room(0, 0, 4, 0, overrides, extra)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useRobotAnimation — un pas à la fois", () => {
  it("un cœur sur le chemin, dans la zone claire, n'est confirmé qu'à l'arrivée du robot", () => {
    const view = setup(corridorWithHeart())
    view.click(0, 0)
    const heart = view.game.value.cells.get("2,0")

    expect(heart.revealed).toBe(false)
    expect(heart.heartFogConfirmed).toBe(false)
    expect(view.confirmedHeartsCount.value).toBe(0)

    vi.advanceTimersByTime(ROBOT_STEP_MS) // robot en (1,0)
    expect(heart.revealed).toBe(false)
    expect(view.confirmedHeartsCount.value).toBe(0)

    vi.advanceTimersByTime(ROBOT_STEP_MS) // robot sur le cœur
    expect(heart.robotHere).toBe(true)
    expect(heart.heartFogConfirmed).toBe(true)
    expect(view.confirmedHeartsCount.value).toBe(1)
    expect(view.game.value.heartsCollectedCount).toBe(1)
  })

  it("les compteurs montent pas à pas, la marche se termine un pas après le dernier", () => {
    const view = setup(corridorWithHeart())
    view.click(0, 0)
    const game = view.game.value

    expect(view.robotAnimationsActive.value).toBe(1)
    expect(game.revealedCount).toBe(1)
    expect(game.maxDistance).toBe(0)

    for (let step = 1; step <= 4; step++) {
      vi.advanceTimersByTime(ROBOT_STEP_MS)
      expect(game.revealedCount).toBe(1 + step)
      expect(game.maxDistance).toBe(step)
      expect(game.cells.get(`${step},0`).robotHere).toBe(true)
      expect(game.cells.get(`${step - 1},0`).robotHere).toBe(false)
    }

    expect(view.robotAnimationsActive.value).toBe(1)
    expect(view.onAllWalksEnd).not.toHaveBeenCalled()

    vi.advanceTimersByTime(ROBOT_STEP_MS) // plus rien à explorer
    expect(view.robotAnimationsActive.value).toBe(0)
    expect(game.cells.get("4,0").robotHere).toBe(false)
    expect(view.robotHaloPositions.value).toEqual([])
    expect(view.onAllWalksEnd).toHaveBeenCalledTimes(1)
  })

  it("chaque pas passe ses cases changées à onStep (case quittée comprise)", () => {
    const view = setup(corridorWithHeart())
    view.click(0, 0)
    vi.advanceTimersByTime(ROBOT_STEP_MS)

    const [changed] = view.changedLog
    const cells = view.game.value.cells
    expect(changed).toEqual([cells.get("0,0"), cells.get("1,0")])
  })

  it("le halo suit le robot case par case", () => {
    const view = setup(corridorWithHeart())
    view.click(0, 0)
    const haloX = () => view.robotHaloPositions.value[0].x

    expect(haloX()).toBe((0 - view.originX.value) * CELL + CELL / 2)
    vi.advanceTimersByTime(ROBOT_STEP_MS)
    expect(haloX()).toBe((1 - view.originX.value) * CELL + CELL / 2)
  })

  it("un cœur ouvert loin du robot, hors de la zone claire, attend d'être vu", async () => {
    // Le pas en (1,0) ouvre une poche (cases à 0) jusqu'au cœur en (6,2).
    // Voile au maximum, caméra ailleurs : ni zone claire ni halo dessus.
    const game = room(
      0,
      0,
      6,
      2,
      {
        "0,0": { isRobot: true, neighborMines: 1 },
        "0,1": { revealed: true },
        "1,1": { revealed: true },
        "6,2": { isHeart: true },
      },
      { minesTriggeredCount: 15, darknessMineThreshold: 15 },
    )
    const view = setup(game, { originX: 100, originY: 100 })
    view.click(0, 0)
    vi.advanceTimersByTime(ROBOT_STEP_MS)

    const heart = view.game.value.cells.get("6,2")
    expect(heart.revealed).toBe(true)
    expect(heart.heartFogConfirmed).toBe(false)
    expect(view.confirmedHeartsCount.value).toBe(0)

    // Caméra centrée sur le cœur : confirmé par le mécanisme habituel.
    view.originX.value = 6 - 10
    view.originY.value = 2 - 10
    await nextTick()
    expect(heart.heartFogConfirmed).toBe(true)
    expect(view.confirmedHeartsCount.value).toBe(1)
  })
})

describe("useRobotAnimation — plusieurs robots, remplacement de partie", () => {
  // Graine 3 : le clic en (1,5) révèle (2,4) et (4,8), transformées en robots.
  function twoRobots() {
    const game = createInfiniteGame(3)
    getCell(game, 2, 4).isRobot = true
    getCell(game, 4, 8).isRobot = true
    return game
  }

  it("deux robots marchent en parallèle, les clics restent bloqués jusqu'au dernier", () => {
    const view = setup(twoRobots())
    view.click(1, 5)

    expect(view.robotAnimationsActive.value).toBe(2)
    expect(view.robotHaloPositions.value).toHaveLength(2)

    const before = view.game.value.revealedCount
    vi.advanceTimersByTime(ROBOT_STEP_MS)
    // Les deux premiers pas tombent au même instant virtuel.
    expect(view.changedLog).toHaveLength(2)
    expect(view.game.value.revealedCount).toBeGreaterThan(before)

    vi.advanceTimersByTime(60_000)
    expect(view.robotAnimationsActive.value).toBe(0)
    expect(view.game.value.robotWalks).toEqual([])
    expect(view.onAllWalksEnd).toHaveBeenCalledTimes(1)
  })

  it("remplacer la partie coupe les marches sans les jouer sur l'ancienne", () => {
    const view = setup(corridorWithHeart())
    view.click(0, 0)
    const old = view.game.value
    vi.advanceTimersByTime(ROBOT_STEP_MS)
    const countAtSwitch = old.revealedCount

    view.game.value = corridorWithHeart()
    expect(view.robotAnimationsActive.value).toBe(0)
    expect(view.robotHaloPositions.value).toEqual([])

    vi.advanceTimersByTime(10 * ROBOT_STEP_MS)
    expect(old.revealedCount).toBe(countAtSwitch)
    expect(old.robotWalks).toHaveLength(1) // reste à terminer à sa restauration
  })

  it("arrêter le scope coupe le minuteur", () => {
    const view = setup(corridorWithHeart())
    view.click(0, 0)
    view.scope.stop()

    vi.advanceTimersByTime(10 * ROBOT_STEP_MS)
    expect(view.game.value.revealedCount).toBe(1)
  })
})
