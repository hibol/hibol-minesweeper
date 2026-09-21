// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// infiniteOnline.js dépend de playerId.js/username.js (singletons de module)
// et de fetch — mêmes mocks explicites que legacyOnline.test.js, pour isoler
// le payload envoyé, la confirmation "improved" et l'échec réseau avalé.

const usernameRef = { value: "" }
const generateRandomUsername = vi.fn()
vi.mock("./username.js", () => ({
  username: usernameRef,
  generateRandomUsername: (...args) => generateRandomUsername(...args),
}))

vi.mock("./playerId.js", () => ({
  playerId: "fixed-player-id",
}))

const pushToast = vi.fn()
vi.mock("./toastQueue.js", () => ({
  pushToast: (...args) => pushToast(...args),
}))

const SUBMIT_URL =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/infinite/submissions"
const LEADERBOARD_URL =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/infinite/leaderboard"

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
}

const RUN = {
  usedMachines: false,
  maxDistance: 842.15,
  revealedCount: 51200,
  minesTriggered: 3,
  heartsCollected: 12,
  robotsTriggered: 7,
}

beforeEach(() => {
  vi.resetModules()
  usernameRef.value = ""
  generateRandomUsername.mockReset()
  pushToast.mockReset()
  vi.unstubAllGlobals()
})

describe("infiniteOnline — submitInfiniteRun", () => {
  it("POST avec exactement les 8 champs attendus, noms exacts", async () => {
    usernameRef.value = "testeuse"
    const fetchMock = vi.fn(() =>
      jsonResponse({ accepted: true, improved: false }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(SUBMIT_URL)
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({
      playerId: "fixed-player-id",
      username: "testeuse",
      usedMachines: false,
      maxDistance: 842.15,
      revealedCount: 51200,
      minesTriggered: 3,
      heartsCollected: 12,
      robotsTriggered: 7,
    })
  })

  it("username local vide : retombe sur generateRandomUsername() pour le corps envoyé", async () => {
    usernameRef.value = ""
    generateRandomUsername.mockReturnValue("player4242")
    const fetchMock = vi.fn(() =>
      jsonResponse({ accepted: true, improved: false }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.username).toBe("player4242")
  })

  it("accepted + improved : toast de confirmation avec le record renvoyé par le serveur", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({
        accepted: true,
        category: "clean",
        maxDistance: 900,
        revealedCount: 60000,
        improved: true,
        reason: null,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)

    expect(pushToast).toHaveBeenCalledTimes(1)
    expect(pushToast.mock.calls[0][0]).toContain("60000")
  })

  it("accepted mais pas improved : aucun toast", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({ accepted: true, improved: false }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)

    expect(pushToast).not.toHaveBeenCalled()
  })

  it("refus serveur (invalid_stats, username_taken...) : avalé silencieusement, pas de toast, ne lève pas", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({ accepted: false, reason: "invalid_stats" }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await expect(submitInfiniteRun(RUN)).resolves.toBeUndefined()

    expect(pushToast).not.toHaveBeenCalled()
  })

  it("échec réseau : avalé silencieusement, ne lève pas", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await expect(submitInfiniteRun(RUN)).resolves.toBeUndefined()

    expect(pushToast).not.toHaveBeenCalled()
  })

  it("statut HTTP non-2xx : traité comme un échec, avalé silencieusement", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await expect(submitInfiniteRun(RUN)).resolves.toBeUndefined()

    expect(pushToast).not.toHaveBeenCalled()
  })
})

describe("infiniteOnline — fetchInfiniteLeaderboard", () => {
  it("construit l'URL avec metric/category/limit et renvoie la liste telle quelle", async () => {
    const list = [{ username: "alice", value: 900, submittedAt: "2026-01-01" }]
    const fetchMock = vi.fn(() => jsonResponse(list))
    vi.stubGlobal("fetch", fetchMock)

    const { fetchInfiniteLeaderboard } = await import("./infiniteOnline.js")
    const result = await fetchInfiniteLeaderboard("cells", "assisted", 25)

    expect(fetchMock).toHaveBeenCalledWith(
      `${LEADERBOARD_URL}?metric=cells&category=assisted&limit=25`,
    )
    expect(result).toEqual(list)
  })

  it("lève en cas d'échec HTTP, à charge de l'appelant", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ status: 500, ok: false, json: () => Promise.resolve({}) }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { fetchInfiniteLeaderboard } = await import("./infiniteOnline.js")
    await expect(fetchInfiniteLeaderboard("distance", "clean")).rejects.toThrow()
  })
})
