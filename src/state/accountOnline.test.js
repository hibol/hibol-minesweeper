// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// accountOnline.js dépend de playerId.js/username.js/pendingUsernameClaim.js
// (singletons de module) et de fetch : mocks explicites pour isoler corps
// envoyés, username_taken sans repli et mise en attente faute de réseau.

const setPlayerId = vi.fn()
vi.mock("./playerId.js", () => ({
  playerId: "fixed-player-id",
  PLAYER_ID_KEY: "hibol-minesweeper:player-id",
  setPlayerId: (...args) => setPlayerId(...args),
  onlineSuspended: false,
  suspendOnline: vi.fn(),
}))

// Les setters écrivent dans usernameRef comme le vrai module : la
// synchronisation compare au pseudo local courant.
const usernameRef = { value: "" }
const generateRandomUsername = vi.fn()
const setUsername = vi.fn((value) => {
  usernameRef.value = value
})
const setServerUsername = vi.fn((value) => {
  usernameRef.value = value
})
vi.mock("./username.js", () => ({
  username: usernameRef,
  generateRandomUsername: (...args) => generateRandomUsername(...args),
  setUsername: (...args) => setUsername(...args),
  setServerUsername: (...args) => setServerUsername(...args),
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
  usernameRef.value = ""
  setUsername.mockClear()
  setServerUsername.mockClear()
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

  it("succès : remplace playerId/username, fusionne l'ancienne identité, ne touche PAS achievements/shop/runHistory/treasureLog", async () => {
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
      .mockResolvedValueOnce(jsonResponse({ reason: null })) // POST merge
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
    expect(setServerUsername).toHaveBeenCalledWith("linkeduser")
    expect(pushToast).not.toHaveBeenCalled() // l'écran de pairage le dit déjà
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/merge",
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      fromPlayerId: "fixed-player-id",
      toPlayerId: "linked-id",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2) // la réconciliation revient à l'appelant
    const { pendingIdentityMerges } = await import("./pendingIdentityMerges.js")
    expect(pendingIdentityMerges.value).toEqual([])
    expect(result.reason).toBeNull()
    expectUntouchedKeys()
  })

  it("succès mais fusion impossible (hors ligne) : le lien tient, la fusion reste en attente", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ playerId: "linked-id", username: "u", reason: null }),
      )
      .mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { completeDeviceLink } = await import("./accountOnline.js")
    const result = await completeDeviceLink("123456")

    expect(result.reason).toBeNull()
    expect(setPlayerId).toHaveBeenCalledWith("linked-id")
    const { pendingIdentityMerges } = await import("./pendingIdentityMerges.js")
    expect(pendingIdentityMerges.value).toEqual([
      { from: "fixed-player-id", to: "linked-id" },
    ])
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
    expect(setServerUsername).not.toHaveBeenCalled()
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
    // Pseudo local enregistré sans toast : l'écran d'accueil l'affiche.
    expect(usernameRef.value).toBe("testeuse")
    expect(pushToast).not.toHaveBeenCalled()
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
    expect(usernameRef.value).toBe("")
  })

  it("échec réseau : mis en attente, renvoie null plutôt que de lever", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { claimUsername } = await import("./accountOnline.js")

    await expect(claimUsername("testeuse")).resolves.toBeNull()
    expect(savePendingClaim).toHaveBeenCalledWith("testeuse")
    expect(setUsername).toHaveBeenCalledWith("testeuse")
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
    usernameRef.value = "testeuse" // enregistré à l'onboarding hors ligne
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

  it("username_taken : aucun nom aléatoire, pseudo à choisir persisté, file effacée", async () => {
    pendingClaimRef.value = { username: "test" }
    usernameRef.value = "test"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        refusal(409, { username: null, reason: "username_taken" }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingUsernameClaim } = await import("./accountOnline.js")
    await retryPendingUsernameClaim()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(generateRandomUsername).not.toHaveBeenCalled()
    expect(usernameRef.value).toBe("test")
    expect(pushToast).not.toHaveBeenCalled()
    expect(clearPendingClaim).toHaveBeenCalledTimes(1)
    expect(
      JSON.parse(localStorage.getItem("hibol-minesweeper:username-choice")),
    ).toEqual({ reason: "taken", rejectedName: "test" })
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
})

describe("accountOnline — syncUsernameFromServer", () => {
  it("champ absent ou null (serveur pas à jour) : ne touche à rien", async () => {
    usernameRef.value = "local"
    const { syncUsernameFromServer } = await import("./accountOnline.js")

    syncUsernameFromServer(undefined)
    syncUsernameFromServer(null)

    expect(usernameRef.value).toBe("local")
    expect(setServerUsername).not.toHaveBeenCalled()
    expect(pushToast).not.toHaveBeenCalled()
  })

  it("même nom : rien, pas de toast", async () => {
    usernameRef.value = "local"
    const { syncUsernameFromServer } = await import("./accountOnline.js")

    syncUsernameFromServer("local")

    expect(setServerUsername).not.toHaveBeenCalled()
    expect(pushToast).not.toHaveBeenCalled()
  })

  it("renommage (même à la casse près) : met le local à jour, un seul toast même si le nom revient", async () => {
    usernameRef.value = "local"
    const { syncUsernameFromServer } = await import("./accountOnline.js")

    syncUsernameFromServer("Local")
    syncUsernameFromServer("Local")

    expect(usernameRef.value).toBe("Local")
    expect(pushToast).toHaveBeenCalledTimes(1)
    expect(pushToast.mock.calls[0][0]).toBe('Your online name is now "Local".')
  })

  it("nom de 32 caractères (renommage admin) : conservé tel quel, jamais tronqué", async () => {
    usernameRef.value = "local"
    const longName = "a".repeat(30) + "Zz"
    const { syncUsernameFromServer } = await import("./accountOnline.js")

    syncUsernameFromServer(longName)

    expect(setServerUsername).toHaveBeenCalledWith(longName)
    expect(usernameRef.value).toHaveLength(32)
    expect(pushToast.mock.calls[0][0]).toContain(longName)
  })

  it("announce: false : met à jour sans toast", async () => {
    const { syncUsernameFromServer } = await import("./accountOnline.js")

    syncUsernameFromServer("servername", { announce: false })

    expect(usernameRef.value).toBe("servername")
    expect(pushToast).not.toHaveBeenCalled()
  })
})

describe("accountOnline — retryPendingIdentityMerges", () => {
  async function seedMerges(...merges) {
    const { queueIdentityMerge } = await import("./pendingIdentityMerges.js")
    for (const [from, to] of merges) {
      queueIdentityMerge(from, to)
    }
  }

  it("envoie dans l'ordre et vide la file", async () => {
    await seedMerges(["a", "b"], ["b", "c"])
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ reason: null })),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingIdentityMerges } = await import("./accountOnline.js")
    await retryPendingIdentityMerges()

    const bodies = fetchMock.mock.calls.map(([, o]) => JSON.parse(o.body))
    expect(bodies).toEqual([
      { fromPlayerId: "a", toPlayerId: "b" },
      { fromPlayerId: "b", toPlayerId: "c" },
    ])
    const { pendingIdentityMerges } = await import("./pendingIdentityMerges.js")
    expect(pendingIdentityMerges.value).toEqual([])
  })

  it("s'arrête à la 1re panne, sans toucher à la suite", async () => {
    await seedMerges(["a", "b"], ["b", "c"])
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingIdentityMerges } = await import("./accountOnline.js")
    await retryPendingIdentityMerges()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { pendingIdentityMerges } = await import("./pendingIdentityMerges.js")
    expect(pendingIdentityMerges.value).toHaveLength(2)
  })

  it("refus définitif (400 unknown_player) : fusion abandonnée, on passe à la suivante", async () => {
    await seedMerges(["a", "ghost"], ["b", "c"])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refusal(400, { reason: "unknown_player" }))
      .mockResolvedValueOnce(jsonResponse({ reason: null }))
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingIdentityMerges } = await import("./accountOnline.js")
    await retryPendingIdentityMerges()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const { pendingIdentityMerges } = await import("./pendingIdentityMerges.js")
    expect(pendingIdentityMerges.value).toEqual([])
  })
})

// fetch réel sur un réseau qui ne répond plus : seul l'abandon le fait rejeter.
function hangUntilAbort(url, { signal } = {}) {
  return new Promise((resolve, reject) => {
    signal?.addEventListener("abort", () =>
      reject(new DOMException("Aborted", "AbortError")),
    )
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe("accountOnline — refreshUsernameFromServer", () => {
  const PLAYER_URL =
    "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/fixed-player-id"

  it("200 avec un autre nom (renommage admin) : GET sur ce playerId, nom mis à jour, un toast", async () => {
    usernameRef.value = "ancien"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ username: "Nouveau" }))
    vi.stubGlobal("fetch", fetchMock)

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    await refreshUsernameFromServer()

    expect(fetchMock).toHaveBeenCalledWith(PLAYER_URL, {
      signal: expect.any(AbortSignal),
    })
    expect(usernameRef.value).toBe("Nouveau")
    expect(pushToast).toHaveBeenCalledTimes(1)
    expect(pushToast.mock.calls[0][0]).toBe(
      'Your online name is now "Nouveau".',
    )
  })

  it("200 avec le même nom : rien", async () => {
    usernameRef.value = "alice"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse({ username: "alice" })),
    )

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    await refreshUsernameFromServer()

    expect(setServerUsername).not.toHaveBeenCalled()
    expect(pushToast).not.toHaveBeenCalled()
  })

  it.each([
    ["400 (playerId invalide)", () => ({ ok: false, status: 400 })],
    ["500", () => ({ ok: false, status: 500 })],
    [
      "200 sans corps JSON",
      () => ({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error()),
      }),
    ],
  ])("%s : rien, pas d'exception, rien en attente", async (_, response) => {
    usernameRef.value = "alice"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response()))

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    await expect(refreshUsernameFromServer()).resolves.toBeUndefined()

    expect(usernameRef.value).toBe("alice")
    expect(pushToast).not.toHaveBeenCalled()
    expect(savePendingClaim).not.toHaveBeenCalled()
  })

  it("réponse qui n'arrive jamais : abandonnée après 5 s, rien, pas d'exception", async () => {
    vi.useFakeTimers()
    usernameRef.value = "alice"
    const fetchMock = vi.fn(hangUntilAbort)
    vi.stubGlobal("fetch", fetchMock)

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    const refresh = refreshUsernameFromServer()
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    await expect(refresh).resolves.toBeUndefined()
    expect(usernameRef.value).toBe("alice")
    expect(pushToast).not.toHaveBeenCalled()
  })

  it("erreur réseau : rien, pas d'exception", async () => {
    usernameRef.value = "alice"
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")))

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    await expect(refreshUsernameFromServer()).resolves.toBeUndefined()

    expect(usernameRef.value).toBe("alice")
    expect(pushToast).not.toHaveBeenCalled()
  })

  it.each(["avant", "après"])(
    "soumission qui renvoie le même nouveau nom %s la relecture : un seul toast",
    async (order) => {
      usernameRef.value = "ancien"
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce(jsonResponse({ username: "Nouveau" })),
      )
      const { refreshUsernameFromServer, sendClaimingUsername } =
        await import("./accountOnline.js")
      // Ce que fait une soumission Legacy ou Infini à sa réponse.
      const submit = () =>
        sendClaimingUsername(() =>
          Promise.resolve({ username: "Nouveau", reason: null }),
        )

      if (order === "avant") {
        await submit()
        await refreshUsernameFromServer()
      } else {
        await refreshUsernameFromServer()
        await submit()
      }

      expect(usernameRef.value).toBe("Nouveau")
      expect(pushToast).toHaveBeenCalledTimes(1)
    },
  )

  it("soumission et relecture en vol en même temps : un seul toast", async () => {
    usernameRef.value = "ancien"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse({ username: "Nouveau" })),
    )

    const { refreshUsernameFromServer, sendClaimingUsername } =
      await import("./accountOnline.js")
    await Promise.all([
      refreshUsernameFromServer(),
      sendClaimingUsername(() =>
        Promise.resolve({ username: "Nouveau", reason: null }),
      ),
    ])

    expect(pushToast).toHaveBeenCalledTimes(1)
  })
})

describe("accountOnline — retryClaimThenRefreshUsername", () => {
  it("réclamation en attente envoyée d'abord, relecture ensuite", async () => {
    pendingClaimRef.value = { username: "alice" }
    usernameRef.value = "alice"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ username: "alice", reason: null }))
      .mockResolvedValueOnce(jsonResponse({ username: "alice" }))
    vi.stubGlobal("fetch", fetchMock)

    const { retryClaimThenRefreshUsername } = await import("./accountOnline.js")
    await retryClaimThenRefreshUsername()

    expect(
      fetchMock.mock.calls.map(([url, options]) => [url, options?.method]),
    ).toEqual([
      [
        "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/claim",
        "POST",
      ],
      [
        "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/players/fixed-player-id",
        undefined,
      ],
    ])
    expect(clearPendingClaim).toHaveBeenCalledTimes(1)
    expect(pushToast).not.toHaveBeenCalled()
  })

  it("réclamation encore en panne : la relecture part quand même, sans lever", async () => {
    pendingClaimRef.value = { username: "alice" }
    usernameRef.value = "alice"
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    vi.stubGlobal("fetch", fetchMock)

    const { retryClaimThenRefreshUsername } = await import("./accountOnline.js")
    await expect(retryClaimThenRefreshUsername()).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(clearPendingClaim).not.toHaveBeenCalled()
  })

  it("rien en attente : seulement la relecture", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })
    vi.stubGlobal("fetch", fetchMock)

    const { retryClaimThenRefreshUsername } = await import("./accountOnline.js")
    await retryClaimThenRefreshUsername()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined()
  })

  it("réseau qui ne répond plus : abandon au bout de 5 s, la suite du boot repart", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(hangUntilAbort)
    vi.stubGlobal("fetch", fetchMock)
    const nextStep = vi.fn()

    const { retryClaimThenRefreshUsername } = await import("./accountOnline.js")
    // Même enchaînement qu'au boot (cf. App.vue).
    const boot = retryClaimThenRefreshUsername().then(nextStep)
    await vi.advanceTimersByTimeAsync(4999)
    expect(nextStep).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await boot

    expect(nextStep).toHaveBeenCalledTimes(1)
    expect(pushToast).not.toHaveBeenCalled()
  })
})

describe("accountOnline — compte disparu (404 à la relecture)", () => {
  const notFound = () =>
    vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })

  async function choice() {
    const { usernameChoice } = await import("./usernameChoice.js")
    return usernameChoice.value
  }

  it("pseudo local, rien en attente : pseudo à choisir « account_gone »", async () => {
    usernameRef.value = "test"
    vi.stubGlobal("fetch", notFound())

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    await refreshUsernameFromServer()

    expect(await choice()).toEqual({
      reason: "account_gone",
      rejectedName: "test",
    })
    expect(usernameRef.value).toBe("test")
    expect(savePendingClaim).not.toHaveBeenCalled()
  })

  it("onboarding hors ligne (réclamation en attente) : rien", async () => {
    usernameRef.value = "test"
    pendingClaimRef.value = { username: "test" }
    vi.stubGlobal("fetch", notFound())

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    await refreshUsernameFromServer()

    expect(await choice()).toBeNull()
  })

  it("compte supprimé par le joueur, après rechargement (pseudo vidé) : rien", async () => {
    usernameRef.value = ""
    vi.stubGlobal("fetch", notFound())

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    await refreshUsernameFromServer()

    expect(await choice()).toBeNull()
  })

  it("compte supprimé par le joueur, même session (suspendu) : rien, aucun appel", async () => {
    vi.doMock("./playerId.js", () => ({
      playerId: "fixed-player-id",
      setPlayerId: vi.fn(),
      onlineSuspended: true,
      suspendOnline: vi.fn(),
    }))
    usernameRef.value = "test"
    const fetchMock = notFound()
    vi.stubGlobal("fetch", fetchMock)

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    await refreshUsernameFromServer()
    vi.doUnmock("./playerId.js")

    expect(fetchMock).not.toHaveBeenCalled()
    expect(await choice()).toBeNull()
  })

  it("nom déjà refusé : le motif « taken » est gardé", async () => {
    usernameRef.value = "test"
    vi.stubGlobal("fetch", notFound())
    const { requireUsernameChoice } = await import("./usernameChoice.js")
    requireUsernameChoice("taken", "test")

    const { refreshUsernameFromServer } = await import("./accountOnline.js")
    await refreshUsernameFromServer()

    expect((await choice()).reason).toBe("taken")
  })
})

describe("accountOnline — pseudo à choisir", () => {
  it("envoi de fond : rien n'est envoyé, réponse username_needed", async () => {
    const { requireUsernameChoice } = await import("./usernameChoice.js")
    requireUsernameChoice("taken", "test")
    const send = vi.fn()

    const { sendClaimingUsername, USERNAME_NEEDED } =
      await import("./accountOnline.js")
    const result = await sendClaimingUsername(send)

    expect(send).not.toHaveBeenCalled()
    expect(result.reason).toBe(USERNAME_NEEDED)
  })

  it("nom choisi dans le dialogue et accepté : état effacé, file de réclamation vidée", async () => {
    const { requireUsernameChoice, usernameChoice } =
      await import("./usernameChoice.js")
    requireUsernameChoice("taken", "test")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse({ username: "nouveau" })),
    )

    const { claimUsername } = await import("./accountOnline.js")
    await claimUsername("nouveau")

    expect(usernameChoice.value).toBeNull()
    expect(localStorage.getItem("hibol-minesweeper:username-choice")).toBeNull()
    expect(usernameRef.value).toBe("nouveau")
    expect(clearPendingClaim).toHaveBeenCalled()
    expect(pushToast).not.toHaveBeenCalled()
  })

  it("nom choisi hors ligne : état effacé, le nom passe en réclamation en attente", async () => {
    const { requireUsernameChoice, usernameChoice } =
      await import("./usernameChoice.js")
    requireUsernameChoice("account_gone", "test")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")))

    const { claimUsername } = await import("./accountOnline.js")
    expect(await claimUsername("nouveau")).toBeNull()

    expect(usernameChoice.value).toBeNull()
    expect(savePendingClaim).toHaveBeenCalledWith("nouveau")
  })

  it("nom choisi lui aussi pris : état gardé, l'erreur reste au dialogue", async () => {
    const { requireUsernameChoice, usernameChoice } =
      await import("./usernameChoice.js")
    requireUsernameChoice("taken", "test")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(refusal(409, { reason: "username_taken" })),
    )

    const { claimUsername } = await import("./accountOnline.js")
    const result = await claimUsername("autre")

    expect(result.reason).toBe("username_taken")
    expect(usernameChoice.value).toEqual({
      reason: "taken",
      rejectedName: "test",
    })
  })

  it("pairage réussi : plus de pseudo à choisir", async () => {
    const { requireUsernameChoice, usernameChoice } =
      await import("./usernameChoice.js")
    requireUsernameChoice("taken", "test")
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ playerId: "other", username: "moi", reason: null }),
        )
        .mockResolvedValue(jsonResponse({})),
    )

    const { completeDeviceLink } = await import("./accountOnline.js")
    await completeDeviceLink("123456")

    expect(usernameChoice.value).toBeNull()
  })
})

describe("accountOnline — une seule réclamation en vol", () => {
  it("le 2e envoi attend la réponse du 1er", async () => {
    usernameRef.value = "test"
    let answerFirst
    const first = vi.fn(
      () =>
        new Promise((resolve) => {
          answerFirst = resolve
        }),
    )
    const second = vi.fn(() => Promise.resolve({ reason: null }))

    const { sendClaimingUsername } = await import("./accountOnline.js")
    const sends = [sendClaimingUsername(first), sendClaimingUsername(second)]
    await Promise.resolve()
    await Promise.resolve()

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()

    answerFirst({ reason: null })
    await Promise.all(sends)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("1er envoi refusé (username_taken) : le 2e ne part pas", async () => {
    usernameRef.value = "test"
    const first = vi.fn(() => Promise.resolve({ reason: "username_taken" }))
    const second = vi.fn()

    const { sendClaimingUsername } = await import("./accountOnline.js")
    await Promise.all([
      sendClaimingUsername(first),
      sendClaimingUsername(second),
    ])

    expect(second).not.toHaveBeenCalled()
  })

  it("1er envoi en panne : le verrou est relâché", async () => {
    const { sendClaimingUsername } = await import("./accountOnline.js")
    const failing = sendClaimingUsername(() =>
      Promise.reject(new Error("offline")),
    )
    const next = vi.fn(() => Promise.resolve({ reason: null }))

    await expect(failing).rejects.toThrow("offline")
    await sendClaimingUsername(next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("dialogue derrière un envoi de fond bloqué : abandon à 4 s, nom mis en attente", async () => {
    vi.useFakeTimers()
    const { sendClaimingUsername, claimUsername } =
      await import("./accountOnline.js")
    sendClaimingUsername(() => new Promise(() => {}))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const claim = claimUsername("nouveau")
    await vi.advanceTimersByTimeAsync(4000)

    await expect(claim).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(savePendingClaim).toHaveBeenCalledWith("nouveau")
    vi.useRealTimers()
  })
})
