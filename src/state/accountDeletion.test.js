// @vitest-environment jsdom
// Vrais modules d'état (pas de mocks) : ce qu'on vérifie, c'est justement
// l'effet de deleteOnlineAccount sur playerId/username/files d'attente. Le
// drapeau de suspension vit au niveau module, d'où un import frais par test.

import { describe, it, expect, beforeEach, vi } from "vitest"

const API = "https://hibol-minesweeper-api.chez-miette.xyz"

async function loadModules() {
  vi.resetModules()
  const playerIdModule = await import("./playerId.js")
  const usernameModule = await import("./username.js")
  const pending = await import("./legacyPendingSubmissions.js")
  const pendingClaim = await import("./pendingUsernameClaim.js")
  const pendingInfinite = await import("./infinitePendingSubmissions.js")
  const legacyOnline = await import("./legacyOnline.js")
  const accountOnline = await import("./accountOnline.js")
  const infiniteOnline = await import("./infiniteOnline.js")
  return {
    playerIdModule,
    usernameModule,
    pending,
    pendingClaim,
    pendingInfinite,
    legacyOnline,
    accountOnline,
    infiniteOnline,
  }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem("hibol-minesweeper:player-id", "old-player-id")
  localStorage.setItem("hibol-minesweeper:username", "alice")
  localStorage.setItem("hibol-minesweeper:username-prompted", "true")
  vi.unstubAllGlobals()
})

describe("deleteOnlineAccount", () => {
  it("succès : DELETE sur l'ancien playerId, puis identité locale vierge", async () => {
    const m = await loadModules()
    m.pending.savePendingSubmission("expert", {
      seed: 1,
      moves: [],
      localTimeMs: 5000,
    })
    m.pendingClaim.savePendingClaim("alice")
    m.pendingInfinite.savePendingInfiniteRun({
      usedMachines: false,
      maxDistance: 10,
      revealedCount: 100,
      minesTriggered: 0,
      heartsCollected: 0,
      robotsTriggered: 0,
    })
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await m.accountOnline.deleteOnlineAccount()

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/api/legacy/players/old-player-id`,
      { method: "DELETE" },
    )
    expect(m.playerIdModule.playerId).not.toBe("old-player-id")
    expect(localStorage.getItem("hibol-minesweeper:player-id")).toBe(
      m.playerIdModule.playerId,
    )
    expect(m.usernameModule.username.value).toBe("")
    expect(m.usernameModule.usernamePrompted.value).toBe(false)
    expect(localStorage.getItem("hibol-minesweeper:username-prompted")).toBe(
      null,
    )
    expect(m.pending.pendingLegacySubmissions.value.expert).toBe(null)
    expect(m.pendingClaim.pendingUsernameClaim.value).toBe(null)
    expect(m.pendingInfinite.listPendingInfiniteRuns()).toEqual([])
  })

  it("après suppression, plus aucune soumission ne part (pas de compte recréé en douce)", async () => {
    const m = await loadModules()
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    await m.accountOnline.deleteOnlineAccount()
    fetchMock.mockClear()

    await m.legacyOnline.submitLegacyWin({
      difficulty: "expert",
      seed: 1,
      moves: [],
      localTimeMs: 5000,
    })
    await m.infiniteOnline.submitInfiniteRun({
      usedMachines: false,
      maxDistance: 10,
      revealedCount: 100,
      minesTriggered: 0,
      heartsCollected: 0,
      robotsTriggered: 0,
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("échec serveur : lève, et rien ne change localement", async () => {
    const m = await loadModules()
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    )

    await expect(m.accountOnline.deleteOnlineAccount()).rejects.toThrow()

    expect(m.playerIdModule.playerId).toBe("old-player-id")
    expect(m.usernameModule.username.value).toBe("alice")
    expect(m.usernameModule.usernamePrompted.value).toBe(true)
  })
})
