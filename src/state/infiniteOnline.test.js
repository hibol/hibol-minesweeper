// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// infiniteOnline.js dépend de playerId.js/username.js (singletons de module)
// et de fetch — mêmes mocks explicites que legacyOnline.test.js, pour isoler
// le payload envoyé, la confirmation "improved" et l'échec réseau avalé.

const usernameRef = { value: "" }
const usernamePromptedRef = { value: true }
const generateRandomUsername = vi.fn()
vi.mock("./username.js", () => ({
  username: usernameRef,
  usernamePrompted: usernamePromptedRef,
  generateRandomUsername: (...args) => generateRandomUsername(...args),
  setServerUsername: (value) => {
    usernameRef.value = value
  },
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
  windMachineUses: 0,
  travelMachineUses: 0,
  xrayMachineUses: 0,
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  usernameRef.value = ""
  usernamePromptedRef.value = true
  generateRandomUsername.mockReset()
  pushToast.mockReset()
  vi.unstubAllGlobals()
})

describe("infiniteOnline — submitInfiniteRun", () => {
  it("POST avec exactement les 11 champs attendus, noms exacts", async () => {
    usernameRef.value = "testeuse"
    const fetchMock = vi.fn(() =>
      jsonResponse({ accepted: true, improved: false }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun({
      ...RUN,
      usedMachines: true,
      windMachineUses: 1,
      travelMachineUses: 2,
      xrayMachineUses: 3,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(SUBMIT_URL)
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({
      playerId: "fixed-player-id",
      username: "testeuse",
      usedMachines: true,
      maxDistance: 842.15,
      revealedCount: 51200,
      minesTriggered: 3,
      heartsCollected: 12,
      robotsTriggered: 7,
      windMachineUses: 1,
      travelMachineUses: 2,
      xrayMachineUses: 3,
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

  it("username_taken : aucun autre nom réclamé, pseudo à choisir persisté, run gardée", async () => {
    usernameRef.value = "test"
    const fetchMock = vi.fn(() => refusal(409, "username_taken"))
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(generateRandomUsername).not.toHaveBeenCalled()
    expect(usernameRef.value).toBe("test")
    expect(pushToast).not.toHaveBeenCalled()
    expect(
      JSON.parse(localStorage.getItem("hibol-minesweeper:username-choice")),
    ).toEqual({ reason: "taken", rejectedName: "test" })
    expect(await pendingRuns()).toEqual([RUN])
  })

  it("invalid_username : pseudo à choisir persisté, run gardée", async () => {
    usernameRef.value = "bloque"
    const fetchMock = vi.fn(() => refusal(400, "invalid_username"))
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      JSON.parse(localStorage.getItem("hibol-minesweeper:username-choice")),
    ).toEqual({ reason: "invalid", rejectedName: "bloque" })
    expect(await pendingRuns()).toEqual([RUN])
  })

  it("pseudo à choisir : run gardée, aucun envoi ni au Give up ni au renvoi", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { requireUsernameChoice } = await import("./usernameChoice.js")
    requireUsernameChoice("account_gone", "test")

    const { submitInfiniteRun, retryPendingInfiniteRuns } =
      await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)
    await retryPendingInfiniteRuns()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(await pendingRuns()).toEqual([RUN])
  })

  it("nom choisi ensuite : la run gardée repart sous ce nom", async () => {
    usernameRef.value = "test"
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(refusal(409, "username_taken"))
      .mockReturnValueOnce(jsonResponse({ username: "nouveau" })) // /claim
      .mockReturnValueOnce(jsonResponse({ accepted: true, improved: false }))
    vi.stubGlobal("fetch", fetchMock)

    const { submitInfiniteRun, retryPendingInfiniteRuns } =
      await import("./infiniteOnline.js")
    const { claimUsername } = await import("./accountOnline.js")
    await submitInfiniteRun(RUN)
    await claimUsername("nouveau")
    await retryPendingInfiniteRuns()

    expect(JSON.parse(fetchMock.mock.calls[2][1].body).username).toBe("nouveau")
    expect(await pendingRuns()).toEqual([])
  })

  it("réponse sans champ username (serveur pas à jour) : pseudo local inchangé", async () => {
    usernameRef.value = "local"
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ accepted: true, improved: false })),
    )

    const { submitInfiniteRun } = await import("./infiniteOnline.js")
    await submitInfiniteRun(RUN)

    expect(usernameRef.value).toBe("local")
    expect(pushToast).not.toHaveBeenCalled()
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
  it("sans machine seulement : une requête clean, liste telle quelle", async () => {
    const list = [{ username: "alice", value: 900, submittedAt: "2026-01-01" }]
    const fetchMock = vi.fn(() => jsonResponse(list))
    vi.stubGlobal("fetch", fetchMock)

    const { fetchInfiniteLeaderboard } = await import("./infiniteOnline.js")
    const result = await fetchInfiniteLeaderboard("cells", true, 25)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${LEADERBOARD_URL}?metric=cells&category=clean&limit=25`,
      { signal: expect.any(AbortSignal) },
    )
    expect(result).toEqual(list)
  })

  it("tout : fusionne clean et assisted, une ligne par pseudo (la meilleure), triée", async () => {
    const clean = [
      { username: "alice", value: 900 },
      { username: "bob", value: 500 },
    ]
    const assisted = [
      { username: "carol", value: 1200 },
      { username: "bob", value: 700 },
      { username: "alice", value: 900 }, // égalité : la ligne clean reste
    ]
    const fetchMock = vi.fn((url) =>
      jsonResponse(url.includes("category=clean") ? clean : assisted),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { fetchInfiniteLeaderboard } = await import("./infiniteOnline.js")
    const result = await fetchInfiniteLeaderboard("cells", false)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual([
      { username: "carol", value: 1200 },
      { username: "alice", value: 900 },
      { username: "bob", value: 700 },
    ])
    expect(result[1]).toBe(clean[0])
  })

  it("tout : ne garde que les `limit` premières lignes", async () => {
    const rows = (prefix, from) =>
      Array.from({ length: 3 }, (_, i) => ({
        username: `${prefix}${i}`,
        value: from - i,
      }))
    vi.stubGlobal(
      "fetch",
      vi.fn((url) =>
        jsonResponse(
          url.includes("category=clean") ? rows("c", 100) : rows("a", 99),
        ),
      ),
    )

    const { fetchInfiniteLeaderboard } = await import("./infiniteOnline.js")
    const result = await fetchInfiniteLeaderboard("distance", false, 4)

    expect(result.map((row) => row.username)).toEqual(["c0", "c1", "a0", "c2"])
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
    await expect(fetchInfiniteLeaderboard("distance", true)).rejects.toThrow()
    await expect(fetchInfiniteLeaderboard("distance", false)).rejects.toThrow()
  })
})

describe("infiniteOnline — pushInfiniteProgress", () => {
  const ACCEPTED = {
    accepted: true,
    category: "clean",
    maxDistance: 842.15,
    revealedCount: 51200,
    improved: true,
  }

  it("envoie la run en silence, sans toast même si le serveur répond improved", async () => {
    const fetchMock = vi.fn(() => jsonResponse(ACCEPTED))
    vi.stubGlobal("fetch", fetchMock)

    const { pushInfiniteProgress } = await import("./infiniteOnline.js")
    await pushInfiniteProgress(RUN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(pushToast).not.toHaveBeenCalled()
  })

  it("premier pseudo pas encore choisi : rien ne part, rien n'est mis en file", async () => {
    usernamePromptedRef.value = false
    const fetchMock = vi.fn(() => jsonResponse(ACCEPTED))
    vi.stubGlobal("fetch", fetchMock)

    const { pushInfiniteProgress } = await import("./infiniteOnline.js")
    await pushInfiniteProgress(RUN)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(await pendingRuns()).toEqual([])
  })

  it("keepalive demandé : transmis à fetch", async () => {
    const fetchMock = vi.fn(() => jsonResponse(ACCEPTED))
    vi.stubGlobal("fetch", fetchMock)

    const { pushInfiniteProgress } = await import("./infiniteOnline.js")
    await pushInfiniteProgress(RUN, { keepalive: true })

    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true)
  })

  it("rien de plus que ce que le serveur a déjà : aucun envoi", async () => {
    const fetchMock = vi.fn(() => jsonResponse(ACCEPTED))
    vi.stubGlobal("fetch", fetchMock)

    const { pushInfiniteProgress } = await import("./infiniteOnline.js")
    await pushInfiniteProgress(RUN)
    await pushInfiniteProgress(RUN)
    await pushInfiniteProgress({ ...RUN, revealedCount: 100 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("dépasser seulement la distance ou seulement les cellules suffit", async () => {
    const fetchMock = vi.fn(() => jsonResponse(ACCEPTED))
    vi.stubGlobal("fetch", fetchMock)

    const { pushInfiniteProgress } = await import("./infiniteOnline.js")
    await pushInfiniteProgress(RUN)
    await pushInfiniteProgress({ ...RUN, maxDistance: 900 })
    await pushInfiniteProgress({ ...RUN, revealedCount: 60000 })

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("le dédoublonnage suit les maxima du serveur, par catégorie", async () => {
    const fetchMock = vi.fn(() => jsonResponse(ACCEPTED))
    vi.stubGlobal("fetch", fetchMock)

    const { pushInfiniteProgress } = await import("./infiniteOnline.js")
    await pushInfiniteProgress(RUN)
    // Autre catégorie : rien n'y a jamais été poussé.
    await pushInfiniteProgress({ ...RUN, usedMachines: true })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("échec réseau : silencieux, run en file, rien de mémorisé (renvoyée au déclencheur suivant)", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    vi.stubGlobal("fetch", fetchMock)

    const { pushInfiniteProgress } = await import("./infiniteOnline.js")
    await expect(pushInfiniteProgress(RUN)).resolves.toBeUndefined()
    await pushInfiniteProgress(RUN)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(pushToast).not.toHaveBeenCalled()
    expect(await pendingRuns()).toEqual([RUN])
  })

  it("pseudo à choisir : aucun envoi, run non mise en file", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { requireUsernameChoice } = await import("./usernameChoice.js")
    requireUsernameChoice("account_gone", "test")

    const { pushInfiniteProgress } = await import("./infiniteOnline.js")
    await pushInfiniteProgress(RUN)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(await pendingRuns()).toEqual([])
  })

  it("stats non numériques : ignorée sans requête", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { pushInfiniteProgress } = await import("./infiniteOnline.js")
    await pushInfiniteProgress({ ...RUN, revealedCount: Number.NaN })
    await pushInfiniteProgress(null)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("Give Up sans progrès depuis le dernier push : pas de faux « New personal best! »", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(ACCEPTED)), // improved: true, même à l'égalité
    )

    const { pushInfiniteProgress, submitInfiniteRun } =
      await import("./infiniteOnline.js")
    await pushInfiniteProgress(RUN)
    await submitInfiniteRun(RUN)

    expect(pushToast).not.toHaveBeenCalled()
  })

  it("Give Up avec progrès depuis le dernier push : le record est annoncé", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(ACCEPTED)),
    )

    const { pushInfiniteProgress, submitInfiniteRun } =
      await import("./infiniteOnline.js")
    await pushInfiniteProgress(RUN)
    await submitInfiniteRun({ ...RUN, revealedCount: RUN.revealedCount + 1 })

    expect(pushToast).toHaveBeenCalledTimes(1)
  })
})

describe("infiniteOnline — runFromGame / runFromSnapshot", () => {
  it("runFromGame : noms du contrat, compteurs de machines à plat", async () => {
    const { runFromGame } = await import("./infiniteOnline.js")

    expect(
      runFromGame({
        usedMachines: true,
        maxDistance: 12.5,
        revealedCount: 300,
        minesTriggeredCount: 4,
        heartsCollectedCount: 2,
        robotsTriggeredCount: 1,
        machineUses: { windMachine: 1, travelMachine: 2, xrayMachine: 3 },
      }),
    ).toEqual({
      usedMachines: true,
      maxDistance: 12.5,
      revealedCount: 300,
      minesTriggered: 4,
      heartsCollected: 2,
      robotsTriggered: 1,
      windMachineUses: 1,
      travelMachineUses: 2,
      xrayMachineUses: 3,
    })
  })

  it("runFromSnapshot : ancien snapshot (champs absents) → zéros", async () => {
    const { runFromSnapshot } = await import("./infiniteOnline.js")

    expect(
      runFromSnapshot({ maxDistance: 7, revealedCount: 90, status: "playing" }),
    ).toEqual({
      usedMachines: false,
      maxDistance: 7,
      revealedCount: 90,
      minesTriggered: 0,
      heartsCollected: 0,
      robotsTriggered: 0,
      windMachineUses: 0,
      travelMachineUses: 0,
      xrayMachineUses: 0,
    })
  })
})
