// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// accountOnline.js dépend de playerId.js/username.js/pendingUsernameClaim.js
// (singletons de module) et de fetch : mocks explicites pour isoler corps
// envoyés, retry sur username_taken et mise en attente faute de réseau.

const setPlayerId = vi.fn()
vi.mock("./playerId.js", () => ({
  playerId: "fixed-player-id",
  setPlayerId: (...args) => setPlayerId(...args),
  suspendOnline: vi.fn(),
}))

const generateRandomUsername = vi.fn()
const setUsername = vi.fn()
vi.mock("./username.js", () => ({
  generateRandomUsername: (...args) => generateRandomUsername(...args),
  setUsername: (...args) => setUsername(...args),
  resetUsernamePrompt: vi.fn(),
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

function jsonResponse(body) {
  return { ok: true, json: () => Promise.resolve(body) }
}

// Refus réel du serveur : statut 400/409, `reason` dans le corps.
function refusal(status, body) {
  return { ok: false, status, json: () => Promise.resolve(body) }
}

beforeEach(() => {
  vi.resetModules()
  generateRandomUsername.mockReset()
  setPlayerId.mockReset()
  setUsername.mockReset()
  pendingClaimRef.value = null
  savePendingClaim.mockReset()
  clearPendingClaim.mockReset()
  pushToast.mockReset()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe("accountOnline — requestLinkCode", () => {
  it("succès : POST vers link-codes de ce playerId, renvoie code + expiresAt", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        code: "123456",
        expiresAt: "2026-09-20T12:00:00Z",
        reason: null,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { requestLinkCode } = await import("./accountOnline.js")
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
        refusal(400, { code: null, expiresAt: null, reason: "unknown_player" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { requestLinkCode } = await import("./accountOnline.js")
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

    const { requestLinkCode } = await import("./accountOnline.js")

    await expect(requestLinkCode()).rejects.toThrow()
  })
})

describe("accountOnline — completeDeviceLink", () => {
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

  it("succès : remplace playerId/username, ne touche PAS achievements/shop/runHistory/treasureLog", async () => {
    seedUntouchedKeys()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        playerId: "linked-id",
        username: "linkeduser",
        reason: null,
      }),
    ) // POST link
    vi.stubGlobal("fetch", fetchMock)

    const { completeDeviceLink } = await import("./accountOnline.js")
    const result = await completeDeviceLink("123456")

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/link",
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      code: "123456",
    })
    expect(setPlayerId).toHaveBeenCalledWith("linked-id")
    expect(setUsername).toHaveBeenCalledWith("linkeduser")
    expect(fetchMock).toHaveBeenCalledTimes(1) // la réconciliation revient à l'appelant
    expect(result.reason).toBeNull()
    expectUntouchedKeys()
  })

  it("code_invalid : pas de changement d'état (pas de setPlayerId/setUsername, pas de réconciliation)", async () => {
    seedUntouchedKeys()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      refusal(400, {
        playerId: null,
        username: null,
        reason: "code_invalid",
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { completeDeviceLink } = await import("./accountOnline.js")
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
    const fetchMock = vi.fn().mockResolvedValueOnce(
      refusal(400, {
        playerId: null,
        username: null,
        reason: "code_expired",
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { completeDeviceLink } = await import("./accountOnline.js")
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

    const { completeDeviceLink } = await import("./accountOnline.js")

    await expect(completeDeviceLink("222222")).rejects.toThrow()
    expect(setPlayerId).not.toHaveBeenCalled()
  })
})

const CLAIM_URL =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/claim"

describe("accountOnline — claimUsername", () => {
  it("accepté : POST avec le bon corps, renvoie le résultat, rien mis en attente", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ username: "testeuse", reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { claimUsername } = await import("./accountOnline.js")
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
        refusal(409, { username: null, reason: "username_taken" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { claimUsername } = await import("./accountOnline.js")
    const result = await claimUsername("prise")

    expect(result).toEqual({ username: null, reason: "username_taken" })
    expect(savePendingClaim).not.toHaveBeenCalled()
  })

  it("échec réseau : mis en attente, renvoie null plutôt que de lever", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { claimUsername } = await import("./accountOnline.js")

    await expect(claimUsername("testeuse")).resolves.toBeNull()
    expect(savePendingClaim).toHaveBeenCalledWith("testeuse")
  })

  it("HTTP non-2xx : traité comme un échec réseau, mis en attente", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 })
    vi.stubGlobal("fetch", fetchMock)

    const { claimUsername } = await import("./accountOnline.js")

    await expect(claimUsername("testeuse")).resolves.toBeNull()
    expect(savePendingClaim).toHaveBeenCalledWith("testeuse")
  })
})

describe("accountOnline — retryPendingUsernameClaim", () => {
  it("rien en attente : ne fetch rien", async () => {
    pendingClaimRef.value = null
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./accountOnline.js")
    await retryPendingUsernameClaim()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("succès : efface la file, pas de toast", async () => {
    pendingClaimRef.value = { username: "testeuse" }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ username: "testeuse", reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./accountOnline.js")
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
        refusal(409, { username: null, reason: "username_taken" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ username: "player5555", reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./accountOnline.js")
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

    const { retryPendingUsernameClaim } = await import("./accountOnline.js")
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
        refusal(409, { username: null, reason: "username_taken" }),
      )
      .mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./accountOnline.js")
    await retryPendingUsernameClaim()

    expect(clearPendingClaim).not.toHaveBeenCalled()
    expect(pushToast).not.toHaveBeenCalled()
  })
})
