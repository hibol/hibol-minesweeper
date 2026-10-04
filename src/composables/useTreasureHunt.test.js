// @vitest-environment jsdom
// achievements.js / treasureLog.js / treasureHunt.js lisent localStorage.
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { ref, effectScope, nextTick } from "vue"
import {
  createTreasureGame,
  restoreTreasureGame,
  getCell,
  revealCell,
} from "../game/game"
import { hibolBalance } from "../state/treasureHunt"
import { treasureEntries } from "../state/treasureLog"
import { currentToast } from "../state/toastQueue"
import { useTreasureHunt } from "./useTreasureHunt"
import { useViewportReveal } from "./useViewportReveal"

// Câblage réel d'App.vue : un hibol n'est compté (footer) et crédité
// (hibolBalance) qu'une fois dans le viewport, une seule fois par case.

let scope

beforeEach(() => {
  localStorage.clear()
  hibolBalance.value = 0
  treasureEntries.value = []
  currentToast.value = null
})

afterEach(() => {
  scope?.stop()
})

function setup(game) {
  const gameRef = ref(game)
  const originX = ref(-5000)
  const originY = ref(-5000)
  const viewportWidth = ref(10)
  const viewportHeight = ref(10)
  let api
  scope = effectScope()
  scope.run(() => {
    const hunt = useTreasureHunt(gameRef, {
      originX,
      originY,
      cellSize: ref(28),
      viewportWidth,
      viewportHeight,
      compassDotRadius: 0.4,
    })
    const reveal = useViewportReveal(
      gameRef,
      { originX, originY, viewportWidth, viewportHeight },
      { onHibolCollected: hunt.creditHibol },
    )
    api = { ...hunt, ...reveal }
  })
  return { game: gameRef, originX, originY, ...api }
}

function findHibols(game, count) {
  const found = []
  for (let y = -200; y <= 200 && found.length < count; y++) {
    for (let x = -200; x <= 200 && found.length < count; x++) {
      const cell = getCell(game, x, y)
      if (cell.isHibol && !cell.revealed) found.push(cell)
    }
  }
  return found
}

// Révèle hors poche d'ouverture : un voisin marqué révélé suffit (cf.
// game.treasure.test.js), puis drain comme performReveal dans App.vue.
function revealFar(ctx, cell) {
  getCell(ctx.game.value, cell.x + 1, cell.y).revealed = true
  revealCell(ctx.game.value, cell)
  ctx.drainPendingReveals()
}

async function lookAt(ctx, cell) {
  ctx.originX.value = cell.x - 2
  ctx.originY.value = cell.y - 2
  await nextTick()
}

describe("useTreasureHunt + useViewportReveal — hibols vus", () => {
  it("révélé hors champ : ni compté ni crédité ; compté et crédité à l'entrée dans le viewport", async () => {
    const ctx = setup(createTreasureGame(11))
    const [hibol] = findHibols(ctx.game.value, 1)

    revealFar(ctx, hibol)
    expect(ctx.game.value.hibolsCollectedCount).toBe(0)
    expect(hibolBalance.value).toBe(0)

    await lookAt(ctx, hibol)
    expect(ctx.game.value.hibolsCollectedCount).toBe(1)
    expect(hibol.hibolCollected).toBe(true)
    expect(hibolBalance.value).toBe(1)

    // Repasser dessus ne recrédite rien.
    ctx.originX.value = -5000
    await nextTick()
    await lookAt(ctx, hibol)
    expect(hibolBalance.value).toBe(1)
  })

  it("reprise : jamais compté deux fois, et un hibol pas encore vu reste en attente", async () => {
    const ctx = setup(createTreasureGame(11))
    const [seen, unseen] = findHibols(ctx.game.value, 2)
    revealFar(ctx, seen)
    await lookAt(ctx, seen)
    ctx.originX.value = -5000
    await nextTick()
    revealFar(ctx, unseen)
    expect(hibolBalance.value).toBe(1)

    const snap = ctx.treasureSnapshot()
    ctx.game.value = restoreTreasureGame(snap)
    await nextTick()
    expect(ctx.game.value.hibolsCollectedCount).toBe(1)
    expect(hibolBalance.value).toBe(1)

    await lookAt(ctx, seen)
    expect(hibolBalance.value).toBe(1)
    await lookAt(ctx, unseen)
    expect(ctx.game.value.hibolsCollectedCount).toBe(2)
    expect(hibolBalance.value).toBe(2)
  })

  it("fin de journée : les hibols encore en attente sont perdus ; le journal garde les trouvés", async () => {
    const ctx = setup(createTreasureGame(11))
    const [seen, unseen] = findHibols(ctx.game.value, 2)
    revealFar(ctx, seen)
    await lookAt(ctx, seen)
    ctx.originX.value = -5000
    await nextTick()
    revealFar(ctx, unseen)

    ctx.game.value.status = "lost"
    await lookAt(ctx, unseen)

    expect(unseen.hibolCollected).toBe(false)
    expect(ctx.game.value.hibolsCollectedCount).toBe(1)
    expect(hibolBalance.value).toBe(1)
    expect(treasureEntries.value[0]).toMatchObject({
      outcome: "lost",
      reward: 1,
      rewardDetail: { found: 1, chest: 0, stormBonus: 0 },
    })
  })

  it("coffre révélé hors champ : journée pas gagnée tant qu'il n'est pas vu", async () => {
    const ctx = setup(createTreasureGame(11))
    const g = ctx.game.value
    const chest = getCell(g, g.chest.x, g.chest.y)

    revealFar(ctx, chest)
    await nextTick()
    expect(g.status).toBe("playing")
    expect(g.chestFound).toBe(false)
    expect(hibolBalance.value).toBe(0)

    await lookAt(ctx, chest)
    await nextTick()
    expect(g.status).toBe("won")
    expect(chest.isChest).toBe(true)
    expect(hibolBalance.value).toBe(3)
    expect(treasureEntries.value[0]).toMatchObject({
      outcome: "won",
      reward: 3,
    })
  })

  it("coup final perdant : un hibol révélé à l'écran par ce coup compte encore", async () => {
    const ctx = setup(createTreasureGame(11))
    const [hibol] = findHibols(ctx.game.value, 1)
    await lookAt(ctx, hibol)

    // Même enchaînement synchrone que performReveal : coup, puis drain.
    getCell(ctx.game.value, hibol.x + 1, hibol.y).revealed = true
    revealCell(ctx.game.value, hibol)
    ctx.game.value.status = "lost" // 3e mine du même coup (chord)
    ctx.drainPendingReveals()
    await nextTick()

    expect(hibol.hibolCollected).toBe(true)
    expect(hibolBalance.value).toBe(1)
    expect(treasureEntries.value[0]).toMatchObject({
      outcome: "lost",
      reward: 1,
      rewardDetail: { found: 1, chest: 0, stormBonus: 0 },
    })
  })

  it("reprise d'une journée avec des mines : pas de toast « Mine! » rejoué", async () => {
    const ctx = setup(createTreasureGame(11))
    const snap = { ...ctx.treasureSnapshot(), minesTriggeredCount: 1 }

    ctx.game.value = restoreTreasureGame(snap)
    await nextTick()
    expect(currentToast.value).toBe(null)

    ctx.game.value.minesTriggeredCount = 2
    await nextTick()
    expect(currentToast.value?.text).toMatch(/^Mine! 1 life left/)
  })

  it("victoire : crédite coffre + bonus, journal avec le total et son détail", async () => {
    const ctx = setup(createTreasureGame(11))
    const [hibol] = findHibols(ctx.game.value, 1)
    revealFar(ctx, hibol)
    await lookAt(ctx, hibol)
    ctx.game.value.minesTriggeredCount = 1
    ctx.game.value.tornadoCount = 1

    ctx.game.value.status = "won"
    await nextTick()

    // 1 trouvé + coffre (3 − 1) + bonus tempête.
    expect(hibolBalance.value).toBe(1 + 2 + 1)
    expect(treasureEntries.value[0]).toMatchObject({
      outcome: "won",
      reward: 4,
      rewardDetail: { found: 1, chest: 2, stormBonus: 1 },
    })
  })

  it("DEV (unlimitedLives) : compté au footer, jamais crédité ni journalisé", async () => {
    const ctx = setup(createTreasureGame(11, { unlimitedLives: true }))
    const [hibol] = findHibols(ctx.game.value, 1)
    revealFar(ctx, hibol)
    await lookAt(ctx, hibol)

    expect(ctx.game.value.hibolsCollectedCount).toBe(1)
    expect(hibolBalance.value).toBe(0)
    ctx.game.value.status = "won"
    await nextTick()
    expect(hibolBalance.value).toBe(0)
    expect(treasureEntries.value).toEqual([])
  })
})
