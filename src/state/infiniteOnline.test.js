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
  onlineSuspended: false,
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

// Refus réel du serveur : statut 400/409, `reason` dans le corps.
function refusal(status, reason) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ accepted: false, reason }),
  })
}

async function pendingRuns() {
  const { listPendingInfiniteRuns } =
    await import("./infinitePendingSubmissions.js")
  return listPendingInfiniteRuns()
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
  localStorage.clear()
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

  it("accepted + improved : toast de confirmation générique, pas de métrique nommée à tort", async () => {
    // `improved` ne dit pas laquelle des deux métriques (distance ou
    // cellules) a été battue - un message qui nommerait "cells" pourrait
    // induire en erreur sur une run qui n'a amélioré que la distance.
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
    expect(pushToast.mock.calls[0][0]).not.toMatch(/cells|distance/i)
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

  it("refus de la run (400 invalid_stats) : pas de toast, ne lève pas, pas mise en attente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => refusal(400, "invalid_stats")),
    )

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await expect(submitInfiniteRun(RUN)).resolves.toBeUndefined()

    expect(pushToast).not.toHaveBeenCalled()
    expect(await pendingRuns()).toEqual([])
  })

  it("refus d'identité (409 username_taken) : la run reste en attente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => refusal(409, "username_taken")),
    )

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)

    expect(await pendingRuns()).toEqual([RUN])
  })

  it("échec réseau : avalé silencieusement, run mise en attente", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await expect(submitInfiniteRun(RUN)).resolves.toBeUndefined()

    expect(pushToast).not.toHaveBeenCalled()
    expect(await pendingRuns()).toEqual([RUN])
  })

  it("statut 500 : traité comme une panne, run mise en attente", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await expect(submitInfiniteRun(RUN)).resolves.toBeUndefined()

    expect(pushToast).not.toHaveBeenCalled()
    expect(await pendingRuns()).toEqual([RUN])
  })

  it("acceptée : retire de la file ce que les maxima du serveur couvrent déjà", async () => {
    const { savePendingInfiniteRun } =
      await import("./infinitePendingSubmissions.js")
    const farRun = { ...RUN, maxDistance: 2000, revealedCount: 100 }
    const bigRun = { ...RUN, maxDistance: 10, revealedCount: 90000 }
    savePendingInfiniteRun(farRun)
    savePendingInfiniteRun(bigRun)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          accepted: true,
          category: "clean",
          maxDistance: 842.15,
          revealedCount: 95000, // couvre bigRun, pas farRun
          improved: true,
        }),
      ),
    )

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)

    expect(await pendingRuns()).toEqual([farRun])
  })
})

describe("infiniteOnline — retryPendingInfiniteRuns", () => {
  it("renvoie une seule fois une run championne des deux métriques, sans toast", async () => {
    const { savePendingInfiniteRun } =
      await import("./infinitePendingSubmissions.js")
    savePendingInfiniteRun(RUN)
    const fetchMock = vi.fn(() =>
      jsonResponse({
        accepted: true,
        maxDistance: 842.15,
        revealedCount: 51200,
        improved: true,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingInfiniteRuns } = await import("./infiniteOnline.js")
    await retryPendingInfiniteRuns()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(pushToast).not.toHaveBeenCalled()
    expect(await pendingRuns()).toEqual([])
  })

  it("toujours hors ligne : s'arrête au 1er échec, la file reste intacte", async () => {
    const { savePendingInfiniteRun } =
      await import("./infinitePendingSubmissions.js")
    savePendingInfiniteRun(RUN)
    savePendingInfiniteRun({ ...RUN, usedMachines: true })
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    vi.stubGlobal("fetch", fetchMock)

    const { retryPendingInfiniteRuns } = await import("./infiniteOnline.js")
    await retryPendingInfiniteRuns()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await pendingRuns()).toHaveLength(2)
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
      Promise.resolve({
        status: 500,
        ok: false,
        json: () => Promise.resolve({}),
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { fetchInfiniteLeaderboard } = await import("./infiniteOnline.js")
    await expect(
      fetchInfiniteLeaderboard("distance", "clean"),
    ).rejects.toThrow()
  })
})
