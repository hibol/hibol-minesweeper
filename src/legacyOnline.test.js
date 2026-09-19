// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// legacyOnline.js dépend de playerId.js/username.js (singletons de module) et
// de fetch — mocks explicites plutôt que de laisser jouer les vrais modules,
// pour isoler la logique testée ici : corps envoyé, retry sur
// username_taken, échec réseau avalé.

vi.mock("./playerId.js", () => ({ playerId: "fixed-player-id" }))

const usernameRef = { value: "" }
const generateRandomUsername = vi.fn()
vi.mock("./username.js", () => ({
  username: usernameRef,
  generateRandomUsername: (...args) => generateRandomUsername(...args),
}))

const API_URL =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/submissions"

function jsonResponse(body) {
  return { json: () => Promise.resolve(body) }
}

beforeEach(() => {
  vi.resetModules()
  usernameRef.value = ""
  generateRandomUsername.mockReset()
  vi.unstubAllGlobals()
})

describe("legacyOnline — submitLegacyWin", () => {
  it("soumission acceptée : POST avec le bon corps, résultat stocké dans lastLegacySubmission", async () => {
    usernameRef.value = "testeuse"
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ accepted: true, timeMs: 3500, rank: 1, reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    await submitLegacyWin({
      difficulty: "beginner",
      seed: 42,
      moves: [{ t: 0, type: "reveal", x: 1, y: 2 }],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(API_URL)
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
  })

  it("username local vide : retombe sur generateRandomUsername() pour le corps envoyé", async () => {
    usernameRef.value = ""
    generateRandomUsername.mockReturnValue("player4242")
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ accepted: true }))
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin } = await import("./legacyOnline.js")
    await submitLegacyWin({ difficulty: "expert", seed: 1, moves: [] })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.username).toBe("player4242")
  })

  it("username_taken : retente une fois avec un nouveau pseudo tiré au sort", async () => {
    usernameRef.value = "prise"
    generateRandomUsername.mockReturnValue("player9999")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          accepted: false,
          timeMs: null,
          rank: null,
          reason: "username_taken",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ accepted: true, timeMs: 1000, rank: 3, reason: null }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    await submitLegacyWin({ difficulty: "beginner", seed: 1, moves: [] })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondBody.username).toBe("player9999")
    expect(lastLegacySubmission.value.accepted).toBe(true)
  })

  it("reason autre que username_taken : pas de retry, résultat refusé stocké tel quel", async () => {
    usernameRef.value = "x"
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
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
    await submitLegacyWin({ difficulty: "beginner", seed: 1, moves: [] })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastLegacySubmission.value.reason).toBe("not_won")
  })

  it("échec réseau : avalé silencieusement, lastLegacySubmission inchangé", async () => {
    usernameRef.value = "x"
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const { submitLegacyWin, lastLegacySubmission } =
      await import("./legacyOnline.js")
    expect(lastLegacySubmission.value).toBe(null)

    await expect(
      submitLegacyWin({ difficulty: "beginner", seed: 1, moves: [] }),
    ).resolves.toBeUndefined()
    expect(lastLegacySubmission.value).toBe(null)
  })
})
