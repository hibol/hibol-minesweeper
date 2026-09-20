// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// legacyPendingSubmissions.js charge sa file depuis localStorage à l'import
// (`ref(loadBoard())`), avec un sanitizeEntry interne. Comme legacyScores.js
// (même famille), on teste sur des modules fraîchement importés.

const KEY = "hibol-minesweeper:legacy-pending-submissions"

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe("legacyPendingSubmissions — sanitizeEntry (via l’état chargé)", () => {
  it("filtre une entrée invalide (seed/localTimeMs non fini, moves absent)", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        beginner: { seed: 1, localTimeMs: 5000, moves: [] },
        intermediate: { seed: Number.NaN, localTimeMs: 5000, moves: [] },
        expert: { seed: 1, localTimeMs: 5000 }, // moves absent
      }),
    )

    const { pendingLegacySubmissions } =
      await import("./legacyPendingSubmissions.js")

    expect(pendingLegacySubmissions.value.beginner).toEqual({
      seed: 1,
      localTimeMs: 5000,
      moves: [],
    })
    expect(pendingLegacySubmissions.value.intermediate).toBeNull()
    expect(pendingLegacySubmissions.value.expert).toBeNull()
  })

  it("localStorage vide/corrompu ⇒ file vide", async () => {
    localStorage.setItem(KEY, "{not json")

    const { pendingLegacySubmissions } =
      await import("./legacyPendingSubmissions.js")

    expect(pendingLegacySubmissions.value).toEqual({
      beginner: null,
      intermediate: null,
      expert: null,
    })
  })
})

describe("legacyPendingSubmissions — savePendingSubmission", () => {
  it("garde la 1re entrée quand la file est vide pour cette difficulté", async () => {
    const { savePendingSubmission, pendingLegacySubmissions } =
      await import("./legacyPendingSubmissions.js")

    savePendingSubmission("beginner", { seed: 1, moves: [], localTimeMs: 5000 })

    expect(pendingLegacySubmissions.value.beginner).toEqual({
      seed: 1,
      moves: [],
      localTimeMs: 5000,
    })
  })

  it("remplace seulement si le nouvel essai est meilleur (localTimeMs plus bas)", async () => {
    const { savePendingSubmission, pendingLegacySubmissions } =
      await import("./legacyPendingSubmissions.js")

    savePendingSubmission("beginner", { seed: 1, moves: [], localTimeMs: 5000 })
    savePendingSubmission("beginner", { seed: 2, moves: [], localTimeMs: 9000 }) // pire, ignoré
    expect(pendingLegacySubmissions.value.beginner.seed).toBe(1)

    savePendingSubmission("beginner", { seed: 3, moves: [], localTimeMs: 1000 }) // meilleur, remplace
    expect(pendingLegacySubmissions.value.beginner.seed).toBe(3)
  })

  it("difficulté invalide : no-op", async () => {
    const { savePendingSubmission, pendingLegacySubmissions } =
      await import("./legacyPendingSubmissions.js")

    savePendingSubmission("bogus", { seed: 1, moves: [], localTimeMs: 1000 })

    expect(pendingLegacySubmissions.value).toEqual({
      beginner: null,
      intermediate: null,
      expert: null,
    })
  })

  it("persiste dans localStorage", async () => {
    const { savePendingSubmission } =
      await import("./legacyPendingSubmissions.js")

    savePendingSubmission("expert", { seed: 1, moves: [], localTimeMs: 1000 })

    expect(JSON.parse(localStorage.getItem(KEY)).expert).toEqual({
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })
  })
})

describe("legacyPendingSubmissions — resolvePendingSubmission", () => {
  it("efface l'entrée en attente si elle n'était pas meilleure que la run résolue", async () => {
    const {
      savePendingSubmission,
      resolvePendingSubmission,
      pendingLegacySubmissions,
    } = await import("./legacyPendingSubmissions.js")

    savePendingSubmission("beginner", { seed: 1, moves: [], localTimeMs: 5000 })
    resolvePendingSubmission("beginner", 4000) // run résolue meilleure que l'attente

    expect(pendingLegacySubmissions.value.beginner).toBeNull()
  })

  it("efface aussi en cas d'égalité stricte", async () => {
    const {
      savePendingSubmission,
      resolvePendingSubmission,
      pendingLegacySubmissions,
    } = await import("./legacyPendingSubmissions.js")

    savePendingSubmission("beginner", { seed: 1, moves: [], localTimeMs: 5000 })
    resolvePendingSubmission("beginner", 5000)

    expect(pendingLegacySubmissions.value.beginner).toBeNull()
  })

  it("laisse l'entrée en attente si elle est STRICTEMENT meilleure que la run résolue", async () => {
    const {
      savePendingSubmission,
      resolvePendingSubmission,
      pendingLegacySubmissions,
    } = await import("./legacyPendingSubmissions.js")

    savePendingSubmission("beginner", { seed: 1, moves: [], localTimeMs: 1000 })
    resolvePendingSubmission("beginner", 5000) // pire que l'attente : on la garde

    expect(pendingLegacySubmissions.value.beginner).not.toBeNull()
    expect(pendingLegacySubmissions.value.beginner.localTimeMs).toBe(1000)
  })

  it("rien en attente : no-op silencieux", async () => {
    const { resolvePendingSubmission, pendingLegacySubmissions } =
      await import("./legacyPendingSubmissions.js")

    resolvePendingSubmission("beginner", 1000)

    expect(pendingLegacySubmissions.value.beginner).toBeNull()
  })
})

describe("legacyPendingSubmissions — clearPendingSubmission", () => {
  it("vide l'entrée d'une difficulté sans toucher aux autres", async () => {
    const {
      savePendingSubmission,
      clearPendingSubmission,
      pendingLegacySubmissions,
    } = await import("./legacyPendingSubmissions.js")

    savePendingSubmission("beginner", { seed: 1, moves: [], localTimeMs: 1000 })
    savePendingSubmission("expert", { seed: 2, moves: [], localTimeMs: 2000 })
    clearPendingSubmission("beginner")

    expect(pendingLegacySubmissions.value.beginner).toBeNull()
    expect(pendingLegacySubmissions.value.expert).not.toBeNull()
  })
})
