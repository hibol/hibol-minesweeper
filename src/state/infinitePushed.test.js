// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// Le playerId est un binding de module : modules frais à chaque test, comme
// infinitePendingSubmissions.test.js.

const KEY = "hibol-minesweeper:infinite-pushed"

let currentPlayerId = "player-a"
vi.mock("./playerId.js", () => ({
  get playerId() {
    return currentPlayerId
  },
}))

function run(overrides) {
  return {
    usedMachines: false,
    maxDistance: 100,
    revealedCount: 1000,
    ...overrides,
  }
}

async function load() {
  return import("./infinitePushed.js")
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  currentPlayerId = "player-a"
})

describe("infinitePushed", () => {
  it("rien de connu : toute run dépasse", async () => {
    const { exceedsPushed } = await load()

    expect(exceedsPushed(run())).toBe(true)
  })

  it("égale ou inférieure aux maxima du serveur : ne dépasse pas ; l'un des deux suffit", async () => {
    const { exceedsPushed, markPushed } = await load()
    markPushed(run(), { revealedCount: 1000, maxDistance: 100 })

    expect(exceedsPushed(run())).toBe(false)
    expect(exceedsPushed(run({ revealedCount: 10, maxDistance: 5 }))).toBe(
      false,
    )
    expect(exceedsPushed(run({ revealedCount: 1001 }))).toBe(true)
    expect(exceedsPushed(run({ maxDistance: 100.5 }))).toBe(true)
  })

  it("mémorise les maxima renvoyés par le serveur, pas la run envoyée", async () => {
    const { exceedsPushed, markPushed } = await load()
    markPushed(run(), { revealedCount: 5000, maxDistance: 300 })

    expect(exceedsPushed(run({ revealedCount: 4000, maxDistance: 250 }))).toBe(
      false,
    )
  })

  it("une catégorie à la fois", async () => {
    const { exceedsPushed, markPushed } = await load()
    markPushed(run(), { revealedCount: 5000, maxDistance: 300 })

    expect(exceedsPushed(run({ usedMachines: true }))).toBe(true)
  })

  it("survit à un rechargement du module", async () => {
    const first = await load()
    first.markPushed(run(), { revealedCount: 1000, maxDistance: 100 })
    vi.resetModules()

    const { exceedsPushed } = await load()

    expect(exceedsPushed(run())).toBe(false)
  })

  it("un autre playerId (sauvegarde importée) repart de zéro", async () => {
    const first = await load()
    first.markPushed(run(), { revealedCount: 1000, maxDistance: 100 })
    currentPlayerId = "player-b"

    expect(first.exceedsPushed(run())).toBe(true)
  })

  it("localStorage corrompu : rien de connu, pas d'exception", async () => {
    localStorage.setItem(KEY, "{not json")
    const { exceedsPushed } = await load()

    expect(exceedsPushed(run())).toBe(true)
  })

  it("écriture refusée : markPushed n'échoue pas", async () => {
    const { markPushed } = await load()
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })

    expect(() =>
      markPushed(run(), { revealedCount: 1, maxDistance: 1 }),
    ).not.toThrow()
    vi.restoreAllMocks()
  })
})
