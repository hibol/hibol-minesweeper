// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// legacyOnline.js dépend de playerId.js/username.js/legacyPendingSubmissions.js
// (singletons de module) et de fetch — mocks explicites plutôt que de laisser
// jouer les vrais modules, pour isoler la logique testée ici : corps envoyé,
// retry sur username_taken, échec réseau avalé, le check GET /best avant
// soumission, et la file d'attente faute de réseau (temp/legacy-server-
// integration.md §4 et §6).

const setPlayerId = vi.fn()
vi.mock("./playerId.js", () => ({
  playerId: "fixed-player-id",
  setPlayerId: (...args) => setPlayerId(...args),
}))

const usernameRef = { value: "" }
const generateRandomUsername = vi.fn()
const setUsername = vi.fn()
vi.mock("./username.js", () => ({
  username: usernameRef,
  generateRandomUsername: (...args) => generateRandomUsername(...args),
  setUsername: (...args) => setUsername(...args),
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

const pendingClaimRef = { value: null }
const savePendingClaim = vi.fn()
const clearPendingClaim = vi.fn()
vi.mock("./pendingUsernameClaim.js", () => ({
  pendingUsernameClaim: pendingClaimRef,
  savePendingClaim: (...args) => savePendingClaim(...args),
  clearPendingClaim: (...args) => clearPendingClaim(...args),
}))

const pushToast = vi.fn()
vi.mock("./toastQueue.js", () => ({
  pushToast: (...args) => pushToast(...args),
}))

const SUBMIT_URL =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/submissions"
const BEST_URL =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/fixed-player-id/best?difficulty=beginner"

function jsonResponse(body) {
  return { ok: true, json: () => Promise.resolve(body) }
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
  pendingClaimRef.value = null
  savePendingClaim.mockReset()
  clearPendingClaim.mockReset()
  pushToast.mockReset()
  setPlayerId.mockReset()
  setUsername.mockReset()
  // legacyScores.js (réel, pas mocké — cf. describes reconcile/link plus bas)
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

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    await submitLegacyWin({
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
    expect(lastLegacySubmission.value).toEqual({
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
      jsonResponse({
        accepted: false,
        timeMs: null,
        rank: null,
        reason: "username_taken",
      }),
      jsonResponse({ accepted: true, timeMs: 1000, rank: 3, reason: null }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    expect(fetchMock).toHaveBeenCalledTimes(3) // best + 2 POST (1er essai + retry)
    const retryBody = JSON.parse(fetchMock.mock.calls[2][1].body)
    expect(retryBody.username).toBe("player9999")
    expect(lastLegacySubmission.value.accepted).toBe(true)
    // Renommage silencieux sinon invisible pour le joueur (cf. §Piece 1) :
    // un toast prévient sous quel nom la run a été enregistrée à la place.
    expect(pushToast).toHaveBeenCalledTimes(1)
    expect(pushToast.mock.calls[0][0]).toContain("player9999")
  })

  it("reason autre que username_taken : pas de retry, résultat refusé stocké tel quel, pending résolu quand même", async () => {
    usernameRef.value = "x"
    const fetchMock = noServerBestThenSubmit(
      jsonResponse({
        accepted: false,
        timeMs: null,
        rank: null,
        reason: "not_won",
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2) // best + 1 POST, pas de retry
    expect(lastLegacySubmission.value.reason).toBe("not_won")
    // Réponse définitive du serveur (même un refus) : plus la peine de
    // retenter une éventuelle soumission en attente pas meilleure que celle-ci.
    expect(resolvePendingSubmission).toHaveBeenCalledWith("beginner", 1000)
    // Le toast de renommage ne se déclenche QUE sur username_taken (cf.
    // §Piece 1) — un autre reason ne doit jamais le faire apparaître.
    expect(pushToast).not.toHaveBeenCalled()
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

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")

    await expect(
      submitLegacyWin({
        difficulty: "beginner",
        seed: 1,
        moves: [{ t: 0, type: "reveal", x: 0, y: 0 }],
        localTimeMs: 1000,
      }),
    ).resolves.toBeUndefined()

    expect(lastLegacySubmission.value).toBe(null)
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

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    expect(lastLegacySubmission.value).toBe(null)

    await expect(
      submitLegacyWin({
        difficulty: "beginner",
        seed: 1,
        moves: [{ t: 0, type: "reveal", x: 0, y: 0 }],
        localTimeMs: 1000,
      }),
    ).resolves.toBeUndefined()
    expect(lastLegacySubmission.value).toBe(null)
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

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 5000, // très au-dessus de 1000 + marge
    })

    expect(fetchMock).toHaveBeenCalledTimes(1) // que le GET /best
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(BEST_URL)
    expect(lastLegacySubmission.value).toBe(null)
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

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1100, // pire que 1000, mais sous la marge de 250ms
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(lastLegacySubmission.value.accepted).toBe(true)
  })

  it("local meilleur que le best serveur : soumet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ timeMs: 5000 }))
      .mockResolvedValueOnce(
        jsonResponse({ accepted: true, timeMs: 1000, rank: 1, reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 1000,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(lastLegacySubmission.value.accepted).toBe(true)
  })

  it("GET /best échoue : soumet quand même (l'échec de l'optimisation ne bloque jamais la vraie tentative)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline")) // GET /best
      .mockResolvedValueOnce(
        jsonResponse({ accepted: true, timeMs: 1000, rank: 1, reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    await submitLegacyWin({
      difficulty: "beginner",
      seed: 1,
      moves: [],
      localTimeMs: 999999, // même "clairement pire" que rien : pas de best connu
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(lastLegacySubmission.value.accepted).toBe(true)
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

describe("legacyOnline — requestLinkCode", () => {
  it("succès : POST vers link-codes de ce playerId, renvoie code + expiresAt", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        code: "123456",
        expiresAt: "2026-09-20T12:00:00Z",
        reason: null,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { requestLinkCode } = await import("./legacyOnline.js")
    const result = await requestLinkCode()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/fixed-player-id/link-codes",
      { method: "POST" },
    )
    expect(result).toEqual({
      code: "123456",
      expiresAt: "2026-09-20T12:00:00Z",
      reason: null,
    })
  })

  it("unknown_player : renvoyé tel quel, pas d'exception", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: null, expiresAt: null, reason: "unknown_player" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { requestLinkCode } = await import("./legacyOnline.js")
    const result = await requestLinkCode()

    expect(result).toEqual({
      code: null,
      expiresAt: null,
      reason: "unknown_player",
    })
  })

  it("échec HTTP : lève", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 })
    vi.stubGlobal("fetch", fetchMock)

    const { requestLinkCode } = await import("./legacyOnline.js")

    await expect(requestLinkCode()).rejects.toThrow()
  })
})

describe("legacyOnline — completeDeviceLink", () => {
  const ACHIEVEMENTS_KEY = "hibol-minesweeper:achievements-unlocked"
  const SHOP_KEY = "hibol-minesweeper:shop-inventory"
  const RUN_HISTORY_KEY = "hibol-minesweeper:infinite-top-runs"
  const TREASURE_LOG_KEY = "hibol-minesweeper:treasure-log"

  function seedUntouchedKeys() {
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify({ pro: 123 }))
    localStorage.setItem(SHOP_KEY, JSON.stringify({ windMachine: 1 }))
    localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify([{ x: 1 }]))
    localStorage.setItem(TREASURE_LOG_KEY, JSON.stringify([{ y: 2 }]))
  }

  function expectUntouchedKeys() {
    expect(localStorage.getItem(ACHIEVEMENTS_KEY)).toBe(
      JSON.stringify({ pro: 123 }),
    )
    expect(localStorage.getItem(SHOP_KEY)).toBe(
      JSON.stringify({ windMachine: 1 }),
    )
    expect(localStorage.getItem(RUN_HISTORY_KEY)).toBe(
      JSON.stringify([{ x: 1 }]),
    )
    expect(localStorage.getItem(TREASURE_LOG_KEY)).toBe(
      JSON.stringify([{ y: 2 }]),
    )
  }

  it("succès : remplace playerId/username, réconcilie les scores, ne touche PAS achievements/shop/runHistory/treasureLog", async () => {
    seedUntouchedKeys()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          playerId: "linked-id",
          username: "linkeduser",
          reason: null,
        }),
      ) // POST link
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // best beginner
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // best intermediate
      .mockResolvedValueOnce(jsonResponse({ timeMs: null })) // best expert
    vi.stubGlobal("fetch", fetchMock)

    const { completeDeviceLink } = await import("./legacyOnline.js")
    const result = await completeDeviceLink("123456")

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/link",
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      code: "123456",
    })
    expect(setPlayerId).toHaveBeenCalledWith("linked-id")
    expect(setUsername).toHaveBeenCalledWith("linkeduser")
    expect(fetchMock).toHaveBeenCalledTimes(4) // link + les 3 GET /best de la réconciliation
    expect(result.reason).toBeNull()
    expectUntouchedKeys()
  })

  it("code_invalid : pas de changement d'état (pas de setPlayerId/setUsername, pas de réconciliation)", async () => {
    seedUntouchedKeys()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ playerId: null, username: null, reason: "code_invalid" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { completeDeviceLink } = await import("./legacyOnline.js")
    const result = await completeDeviceLink("000000")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(setPlayerId).not.toHaveBeenCalled()
    expect(setUsername).not.toHaveBeenCalled()
    expect(result).toEqual({
      playerId: null,
      username: null,
      reason: "code_invalid",
    })
    expectUntouchedKeys()
  })

  it("code_expired : renvoyé tel quel, pas de changement d'état", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ playerId: null, username: null, reason: "code_expired" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { completeDeviceLink } = await import("./legacyOnline.js")
    const result = await completeDeviceLink("111111")

    expect(result).toEqual({
      playerId: null,
      username: null,
      reason: "code_expired",
    })
    expect(setPlayerId).not.toHaveBeenCalled()
  })

  it("échec réseau : lève (à l'appelante de gérer, pas avalé ici)", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { completeDeviceLink } = await import("./legacyOnline.js")

    await expect(completeDeviceLink("222222")).rejects.toThrow()
    expect(setPlayerId).not.toHaveBeenCalled()
  })
})

const CLAIM_URL =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/claim"

describe("legacyOnline — claimUsername", () => {
  it("accepté : POST avec le bon corps, renvoie le résultat, rien mis en attente", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ username: "testeuse", reason: null }))
    vi.stubGlobal("fetch", fetchMock)

    const { claimUsername } = await import("./legacyOnline.js")
    const result = await claimUsername("testeuse")

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(CLAIM_URL)
    expect(JSON.parse(options.body)).toEqual({
      playerId: "fixed-player-id",
      username: "testeuse",
    })
    expect(result).toEqual({ username: "testeuse", reason: null })
    expect(savePendingClaim).not.toHaveBeenCalled()
  })

  it("username_taken : renvoyé tel quel, pas mis en attente (réponse définitive, pas une erreur réseau)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ username: null, reason: "username_taken" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { claimUsername } = await import("./legacyOnline.js")
    const result = await claimUsername("prise")

    expect(result).toEqual({ username: null, reason: "username_taken" })
    expect(savePendingClaim).not.toHaveBeenCalled()
  })

  it("échec réseau : mis en attente, renvoie null plutôt que de lever", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { claimUsername } = await import("./legacyOnline.js")

    await expect(claimUsername("testeuse")).resolves.toBeNull()
    expect(savePendingClaim).toHaveBeenCalledWith("testeuse")
  })

  it("HTTP non-2xx : traité comme un échec réseau, mis en attente", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 })
    vi.stubGlobal("fetch", fetchMock)

    const { claimUsername } = await import("./legacyOnline.js")

    await expect(claimUsername("testeuse")).resolves.toBeNull()
    expect(savePendingClaim).toHaveBeenCalledWith("testeuse")
  })
})

describe("legacyOnline — retryPendingUsernameClaim", () => {
  it("rien en attente : ne fetch rien", async () => {
    pendingClaimRef.value = null
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./legacyOnline.js")
    await retryPendingUsernameClaim()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("succès : efface la file, pas de toast", async () => {
    pendingClaimRef.value = { username: "testeuse" }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ username: "testeuse", reason: null }))
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./legacyOnline.js")
    await retryPendingUsernameClaim()

    expect(clearPendingClaim).toHaveBeenCalledTimes(1)
    expect(pushToast).not.toHaveBeenCalled()
  })

  it("username_taken : retente avec un nom aléatoire, pousse un toast, efface la file", async () => {
    pendingClaimRef.value = { username: "prise" }
    generateRandomUsername.mockReturnValue("player5555")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ username: null, reason: "username_taken" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ username: "player5555", reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./legacyOnline.js")
    await retryPendingUsernameClaim()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(retryBody.username).toBe("player5555")
    expect(pushToast).toHaveBeenCalledTimes(1)
    expect(pushToast.mock.calls[0][0]).toContain("player5555")
    expect(clearPendingClaim).toHaveBeenCalledTimes(1)
  })

  it("échec réseau : laisse la file intacte, pas de toast", async () => {
    pendingClaimRef.value = { username: "testeuse" }
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./legacyOnline.js")
    await retryPendingUsernameClaim()

    expect(clearPendingClaim).not.toHaveBeenCalled()
    expect(pushToast).not.toHaveBeenCalled()
  })

  it("username_taken puis échec réseau au retry : laisse la file intacte, pas de toast", async () => {
    pendingClaimRef.value = { username: "prise" }
    generateRandomUsername.mockReturnValue("player5555")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ username: null, reason: "username_taken" }),
      )
      .mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./legacyOnline.js")
    await retryPendingUsernameClaim()

    expect(clearPendingClaim).not.toHaveBeenCalled()
    expect(pushToast).not.toHaveBeenCalled()
  })
})
