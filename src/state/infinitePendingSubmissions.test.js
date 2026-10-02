// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// La file est chargée depuis localStorage à l'import : modules frais à chaque
// test, comme legacyPendingSubmissions.test.js.

const KEY = "hibol-minesweeper:infinite-pending-submissions"

function run(overrides) {
  return {
    usedMachines: false,
    maxDistance: 100,
    revealedCount: 1000,
    minesTriggered: 1,
    heartsCollected: 2,
    robotsTriggered: 3,
    ...overrides,
  }
}

async function load() {
  return import("./infinitePendingSubmissions.js")
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe("infinitePendingSubmissions — chargement", () => {
  it("filtre les entrées invalides ou rangées dans la mauvaise catégorie", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        clean: {
          distance: run(),
          cells: run({ revealedCount: Number.NaN }),
        },
        assisted: { distance: run({ usedMachines: false }), cells: null },
      }),
    )

    const { pendingInfiniteRuns } = await load()

    expect(pendingInfiniteRuns.value).toEqual({
      clean: { distance: run(), cells: null },
      assisted: { distance: null, cells: null },
    })
  })

  it("localStorage corrompu ⇒ file vide", async () => {
    localStorage.setItem(KEY, "{not json")

    const { listPendingInfiniteRuns } = await load()

    expect(listPendingInfiniteRuns()).toEqual([])
  })
})

describe("infinitePendingSubmissions — savePendingInfiniteRun", () => {
  it("garde la meilleure run par métrique, séparément par catégorie", async () => {
    const { savePendingInfiniteRun, pendingInfiniteRuns } = await load()
    const far = run({ maxDistance: 500, revealedCount: 10 })
    const big = run({ maxDistance: 5, revealedCount: 9000 })
    const weak = run({ maxDistance: 1, revealedCount: 1 })
    const assisted = run({ usedMachines: true })

    savePendingInfiniteRun(far)
    savePendingInfiniteRun(big)
    savePendingInfiniteRun(weak)
    savePendingInfiniteRun(assisted)

    expect(pendingInfiniteRuns.value).toEqual({
      clean: { distance: far, cells: big },
      assisted: { distance: assisted, cells: assisted },
    })
  })

  it("ignore une run aux stats invalides et ne garde que les champs du contrat", async () => {
    const { savePendingInfiniteRun, listPendingInfiniteRuns } = await load()

    savePendingInfiniteRun(run({ maxDistance: Number.POSITIVE_INFINITY }))
    savePendingInfiniteRun({ ...run(), seed: 42 })

    expect(listPendingInfiniteRuns()).toEqual([run()])
  })

  it("persiste dans localStorage", async () => {
    const { savePendingInfiniteRun } = await load()

    savePendingInfiniteRun(run())

    expect(JSON.parse(localStorage.getItem(KEY)).clean.cells).toEqual(run())
  })
})

describe("infinitePendingSubmissions — resolvePendingInfiniteRun", () => {
  it("sans maxima serveur : ne retire que la run elle-même", async () => {
    const {
      savePendingInfiniteRun,
      resolvePendingInfiniteRun,
      pendingInfiniteRuns,
    } = await load()
    const far = run({ maxDistance: 500, revealedCount: 10 })
    const big = run({ maxDistance: 5, revealedCount: 9000 })
    savePendingInfiniteRun(far)
    savePendingInfiniteRun(big)

    resolvePendingInfiniteRun({ ...far })

    expect(pendingInfiniteRuns.value.clean).toEqual({
      distance: null,
      cells: big,
    })
  })

  it("avec maxima serveur : retire aussi ce qu'ils couvrent (égalité incluse)", async () => {
    const {
      savePendingInfiniteRun,
      resolvePendingInfiniteRun,
      pendingInfiniteRuns,
    } = await load()
    const far = run({ maxDistance: 500, revealedCount: 10 })
    const big = run({ maxDistance: 5, revealedCount: 9000 })
    savePendingInfiniteRun(far)
    savePendingInfiniteRun(big)

    resolvePendingInfiniteRun(run({ maxDistance: 1, revealedCount: 1 }), {
      maxDistance: 400,
      revealedCount: 9000,
    })

    expect(pendingInfiniteRuns.value.clean).toEqual({
      distance: far,
      cells: null,
    })
  })

  it("ne touche pas l'autre catégorie", async () => {
    const {
      savePendingInfiniteRun,
      resolvePendingInfiniteRun,
      pendingInfiniteRuns,
    } = await load()
    const assisted = run({ usedMachines: true })
    savePendingInfiniteRun(assisted)

    resolvePendingInfiniteRun(run(), { maxDistance: 1e9, revealedCount: 1e9 })

    expect(pendingInfiniteRuns.value.assisted.distance).toEqual(assisted)
  })
})

describe("infinitePendingSubmissions — listPendingInfiniteRuns", () => {
  it("une run championne des deux métriques n'apparaît qu'une fois", async () => {
    const { savePendingInfiniteRun, listPendingInfiniteRuns } = await load()
    savePendingInfiniteRun(run())

    expect(listPendingInfiniteRuns()).toEqual([run()])
  })

  it("dédoublonne aussi après un rechargement (identité perdue par JSON)", async () => {
    const first = await load()
    first.savePendingInfiniteRun(run())
    vi.resetModules()

    const { listPendingInfiniteRuns } = await load()

    expect(listPendingInfiniteRuns()).toEqual([run()])
  })
})
