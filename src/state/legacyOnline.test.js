// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// legacyOnline.js dépend de playerId.js/username.js/legacyPendingSubmissions.js
// (singletons de module) et de fetch — mocks explicites plutôt que de laisser
// jouer les vrais modules, pour isoler la logique testée ici : corps envoyé,
// retry sur username_taken, échec réseau avalé, le check GET /best avant
// soumission, et la file d'attente faute de réseau (temp/legacy-server-
// integration.md §4 et §6).

vi.mock("./playerId.js", () => ({
  playerId: "fixed-player-id",
  onlineSuspended: false,
}))

const usernameRef = { value: "" }
const generateRandomUsername = vi.fn()
vi.mock("./username.js", () => ({
  username: usernameRef,
  generateRandomUsername: (...args) => generateRandomUsername(...args),
}))

const pendingRef = {
  value: { beginner: null, intermediate: null, expert: null },
}
const savePendingSubmission = vi.fn()
const resolvePendingSubmission = vi.fn()
vi.mock("./legacyPendingSubmissions.js", () => ({
  pendingLegacySubmissions: pendingRef,
  savePendingSubmission: (...args) => savePendingSubmission(...args),
  resolvePendingSubmission: (...args) => resolvePendingSubmission(...args),
}))

// Le texte du toast est testé dans accountOnline.test.js.
const pushUsernameTakenToast = vi.fn()
vi.mock("./accountOnline.js", () => ({
  pushUsernameTakenToast: (...args) => pushUsernameTakenToast(...args),
}))

const SUBMIT_URL =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/submissions"
const BEST_URL =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/fixed-player-id/best?difficulty=beginner"

function jsonResponse(body) {
  return { ok: true, json: () => Promise.resolve(body) }
}

// Refus réel du serveur : statut 400/409, `reason` dans le corps.
function refusal(status, body) {
  return { ok: false, status, json: () => Promise.resolve(body) }
}

// GET /best en tête de chaque scénario "soumission" : { timeMs: null } =
// aucun record côté serveur pour ce joueur/cette difficulté, donc rien à
// comparer, le check ne peut jamais sauter la soumission qui suit.
function noServerBestThenSubmit(...submitResponses) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ timeMs: null }))
  for (const response of submitResponses) {
    fetchMock.mockResolvedValueOnce(response)
  }
  return fetchMock
}

beforeEach(() => {
  vi.resetModules()
  usernameRef.value = ""
  generateRandomUsername.mockReset()
  pendingRef.value = { beginner: null, intermediate: null, expert: null }
  savePendingSubmission.mockReset()
  resolvePendingSubmission.mockReset()
  pushUsernameTakenToast.mockReset()
  // legacyScores.js (réel, pas mocké — cf. describe reconcile plus bas)
  // charge sa table depuis localStorage à l'import.
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe("legacyOnline — submitLegacyWin", () => {
  it("soumission acceptée : POST avec le bon corps, résultat stocké, plus de soumission en attente à retenter", async () => {
    usernameRef.value = "testeuse"
    const fetchMock = noServerBestThenSubmit(
      jsonResponse({ accepted: true, timeMs: 3500, rank: 1, reason: null }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    const result = await submitLegacyWin({
      difficulty: "beginner",
      seed: 42,
      moves: [{ t: 0, type: "reveal", x: 1, y: 2 }],
      localTimeMs: 3500,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, options] = fetchMock.mock.calls[1]
    expect(url).toBe(SUBMIT_URL)
    expect(JSON.parse(options.body)).toEqual({
      playerId: "fixed-player-id",
      username: "testeuse",
      difficulty: "beginner",
      seed: 42,
      moves: [{ t: 0, type: "reveal", x: 1, y: 2 }],
    })
    expect(result).toEqual({
      accepted: true,
      timeMs: 3500,
      rank: 1,
      reason: null,
    })
    expect(resolvePendingSubmission).toHaveBeenCalledWith("beginner", 3500)
    expect(savePendingSubmission).not.toHaveBeenCalled()
  })

  it("username local vide : retombe sur generateRandomUsername() pour le corps envoyé", async () => {
    usernameRef.value = ""
    generateRandomUsername.mockReturnValue("player4242")
    const fetchMock = noServerBestThenSubmit(jsonResponse({ accepted: true }))
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    await submitLegacyWin({
      difficulty: "expert",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    const body = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body.username).toBe("player4242")
  })

  it("username_taken : retente une fois avec un nouveau pseudo tiré au sort", async () => {
    usernameRef.value = "prise"
    generateRandomUsername.mockReturnValue("player9999")
    const fetchMock = noServerBestThenSubmit(
      refusal(409, {
        accepted: false,
        timeMs: null,
        rank: null,
        reason: "username_taken",
      }),
      jsonResponse({ accepted: true, timeMs: 1000, rank: 3, reason: null }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    const result = await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    expect(fetchMock).toHaveBeenCalledTimes(3) // best + 2 POST (1er essai + retry)
    const retryBody = JSON.parse(fetchMock.mock.calls[2][1].body)
    expect(retryBody.username).toBe("player9999")
    expect(result.accepted).toBe(true)
    // Renommage silencieux sinon invisible pour le joueur (cf. §Piece 1) :
    // un toast prévient sous quel nom la run a été enregistrée à la place.
    expect(pushUsernameTakenToast).toHaveBeenCalledExactlyOnceWith("player9999")
  })

  it("username_taken puis run refusée : toast quand même (le pseudo est réclamé avant le rejeu)", async () => {
    usernameRef.value = "prise"
    generateRandomUsername.mockReturnValue("player9999")
    vi.stubGlobal(
      "fetch",
      noServerBestThenSubmit(
        refusal(409, { accepted: false, reason: "username_taken" }),
        refusal(400, { accepted: false, reason: "not_won" }),
      ),
    )

    const { submitLegacyWin } = await import("./legacyOnline.js")
    const result = await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    expect(result.reason).toBe("not_won")
    expect(pushUsernameTakenToast).toHaveBeenCalledExactlyOnceWith("player9999")
  })

  it("username_taken deux fois de suite : pas de toast (aucun pseudo acquis)", async () => {
    usernameRef.value = "prise"
    generateRandomUsername.mockReturnValue("player9999")
    vi.stubGlobal(
      "fetch",
      noServerBestThenSubmit(
        refusal(409, { accepted: false, reason: "username_taken" }),
        refusal(409, { accepted: false, reason: "username_taken" }),
      ),
    )

    const { submitLegacyWin } = await import("./legacyOnline.js")
    await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    expect(pushUsernameTakenToast).not.toHaveBeenCalled()
  })

  it("username_taken puis panne réseau : pas de toast, run mise en attente", async () => {
    usernameRef.value = "prise"
    generateRandomUsername.mockReturnValue("player9999")
    const fetchMock = noServerBestThenSubmit(
      refusal(409, { accepted: false, reason: "username_taken" }),
    )
    fetchMock.mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    const result = await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    expect(result).toBeNull()
    expect(pushUsernameTakenToast).not.toHaveBeenCalled()
    expect(savePendingSubmission).toHaveBeenCalledTimes(1)
  })

  it("reason autre que username_taken : pas de retry, résultat refusé stocké tel quel, pending résolu quand même", async () => {
    usernameRef.value = "x"
    const fetchMock = noServerBestThenSubmit(
      refusal(400, {
        accepted: false,
        timeMs: null,
        rank: null,
        reason: "not_won",
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    const result = await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2) // best + 1 POST, pas de retry
    expect(result.reason).toBe("not_won")
    // Réponse définitive du serveur (même un refus) : plus la peine de
    // retenter une éventuelle soumission en attente pas meilleure que celle-ci.
    expect(resolvePendingSubmission).toHaveBeenCalledWith("beginner", 1000)
    // Le toast de renommage ne se déclenche QUE sur username_taken (cf.
    // §Piece 1) — un autre reason ne doit jamais le faire apparaître.
    expect(pushUsernameTakenToast).not.toHaveBeenCalled()
  })

  it("POST HTTP non-2xx avec corps JSON valide : traité comme un échec, mis en attente (pas résolu comme définitif)", async () => {
    usernameRef.value = "x"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // GET /best
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "internal" }),
      }) // POST, 500 avec corps JSON parseable
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")

    await expect(
      submitLegacyWin({
        difficulty: "beginner",
        seed: 1,
        moves: [{ t: 0, type: "reveal", x: 0, y: 0 }],
        localTimeMs: 1000,
      }),
    ).resolves.toBeNull()

    expect(savePendingSubmission).toHaveBeenCalledWith("beginner", {
      seed: 1,
      moves: [{ t: 0, type: "reveal", x: 0, y: 0 }],
      localTimeMs: 1000,
    })
    expect(resolvePendingSubmission).not.toHaveBeenCalled()
  })

  it("échec réseau (POST) : avalé silencieusement, mis en attente pour plus tard", async () => {
    usernameRef.value = "x"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // GET /best
      .mockRejectedValueOnce(new Error("offline")) // POST
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")

    await expect(
      submitLegacyWin({
        difficulty: "beginner",
        seed: 1,
        moves: [{ t: 0, type: "reveal", x: 0, y: 0 }],
        localTimeMs: 1000,
      }),
    ).resolves.toBeNull()
    expect(savePendingSubmission).toHaveBeenCalledWith("beginner", {
      seed: 1,
      moves: [{ t: 0, type: "reveal", x: 0, y: 0 }],
      localTimeMs: 1000,
    })
    expect(resolvePendingSubmission).not.toHaveBeenCalled()
  })
})

describe("legacyOnline — submitLegacyWin : check GET /best avant soumission", () => {
  it("local clairement pire que le best serveur (au-delà de la marge) : ne POST pas, résout le pending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ timeMs: 1000 }))
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    const result = await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 5000, // très au-dessus de 1000 + marge
    })

    expect(fetchMock).toHaveBeenCalledTimes(1) // que le GET /best
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(BEST_URL)
    expect(result).toBe(null)
    expect(resolvePendingSubmission).toHaveBeenCalledWith("beginner", 5000)
    expect(savePendingSubmission).not.toHaveBeenCalled()
  })

  it("local dans la marge de sécurité du best serveur : soumet quand même", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ timeMs: 1000 }))
      .mockResolvedValueOnce(
        jsonResponse({ accepted: true, timeMs: 1100, rank: 2, reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    const result = await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1100, // pire que 1000, mais sous la marge de 250ms
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.accepted).toBe(true)
  })

  it("local meilleur que le best serveur : soumet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ timeMs: 5000 }))
      .mockResolvedValueOnce(
        jsonResponse({ accepted: true, timeMs: 1000, rank: 1, reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    const result = await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.accepted).toBe(true)
  })

  it("GET /best échoue : soumet quand même (l'échec de l'optimisation ne bloque jamais la vraie tentative)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline")) // GET /best
      .mockResolvedValueOnce(
        jsonResponse({ accepted: true, timeMs: 1000, rank: 1, reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    const result = await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 999999, // même "clairement pire" que rien : pas de best connu
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.accepted).toBe(true)
  })
})

describe("legacyOnline — retryPendingLegacySubmissions", () => {
  it("retente chaque entrée en attente, ignore les difficultés sans entrée", async () => {
    pendingRef.value = {
      beginner: { seed: 11, moves: [], localTimeMs: 4000 },
      intermediate: null,
      expert: { seed: 22, moves: [], localTimeMs: 8000 },
    }
    // 2 entrées à retenter (beginner, expert), chacune : GET /best puis POST.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // best beginner
      .mockResolvedValueOnce(jsonResponse({ accepted: true })) // POST beginner
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // best expert
      .mockResolvedValueOnce(jsonResponse({ accepted: true })) // POST expert
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingLegacySubmissions } = await import("./legacyOnline.js")
    await retryPendingLegacySubmissions()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    const submittedDifficulties = fetchMock.mock.calls
      .filter(([url]) => url === SUBMIT_URL)
      .map(([, options]) => JSON.parse(options.body).difficulty)
    expect(submittedDifficulties.sort()).toEqual(["beginner", "expert"])
  })

  it("rien en attente : ne fetch rien", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingLegacySubmissions } = await import("./legacyOnline.js")
    await retryPendingLegacySubmissions()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

const LEGACY_SCORES_KEY = "hibol-minesweeper:legacy-best-times"

function seedLegacyScores(board) {
  localStorage.setItem(LEGACY_SCORES_KEY, JSON.stringify(board))
}

describe("legacyOnline — reconcileLegacyScoresWithServer", () => {
  it("serveur meilleur que le local : met à jour legacyScores.js (lecture seule, jamais l'inverse)", async () => {
    seedLegacyScores({
      beginner: [{ timeMs: 5000, name: "x", timestamp: 111 }],
      intermediate: [],
      expert: [],
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ timeMs: 3000 })) // best beginner
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // best intermediate
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // best expert
    vi.stubGlobal("fetch", fetchMock)

    const { reconcileLegacyScoresWithServer } =
      await import("./legacyOnline.js")
    const { legacyScores } = await import("./legacyScores.js")
    await reconcileLegacyScoresWithServer()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(legacyScores.value.beginner[0].timeMs).toBe(3000)
    expect(legacyScores.value.beginner).toHaveLength(2)
  })

  it("local déjà meilleur ou égal : ne touche rien", async () => {
    seedLegacyScores({
      beginner: [{ timeMs: 1000, name: "x", timestamp: 111 }],
      intermediate: [],
      expert: [],
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ timeMs: 1000 })) // égal, pas "meilleur"
      .mockResolvedValueOnce(jsonResponse({ timeMs: null }))
      .mockResolvedValueOnce(jsonResponse({ timeMs: null }))
    vi.stubGlobal("fetch", fetchMock)

    const { reconcileLegacyScoresWithServer } =
      await import("./legacyOnline.js")
    const { legacyScores } = await import("./legacyScores.js")
    await reconcileLegacyScoresWithServer()

    expect(legacyScores.value.beginner).toEqual([
      { timeMs: 1000, name: "x", timestamp: 111 },
    ])
  })

  it("échec réseau sur une difficulté : n'empêche pas de vérifier les autres, ne plante pas", async () => {
    seedLegacyScores({
      beginner: [{ timeMs: 5000, name: "x", timestamp: 111 }],
      intermediate: [{ timeMs: 5000, name: "x", timestamp: 111 }],
      expert: [],
    })
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline")) // best beginner
      .mockResolvedValueOnce(jsonResponse({ timeMs: 1000 })) // best intermediate, meilleur
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // best expert
    vi.stubGlobal("fetch", fetchMock)

    const { reconcileLegacyScoresWithServer } =
      await import("./legacyOnline.js")
    const { legacyScores } = await import("./legacyScores.js")

    await expect(reconcileLegacyScoresWithServer()).resolves.toBeUndefined()

    expect(legacyScores.value.beginner[0].timeMs).toBe(5000) // GET en échec, inchangé
    expect(legacyScores.value.intermediate[0].timeMs).toBe(1000) // celle-là mise à jour
  })
})
