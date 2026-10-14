// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest"

const KEY = "hibol-minesweeper:player-id"
const VALID = "3f2b8c1e-5a4d-4e6f-9b0a-1c2d3e4f5a6b"

// playerId est lu à l'import du module : un import neuf par test.
async function load() {
  vi.resetModules()
  return import("./playerId.js")
}

beforeEach(() => {
  localStorage.clear()
})

describe("playerId — lecture au démarrage", () => {
  it("garde un UUID stocké, majuscules comprises", async () => {
    const upper = VALID.toUpperCase()
    localStorage.setItem(KEY, upper)

    const { playerId } = await load()

    expect(playerId).toBe(upper)
  })

  it("rien de stocké : en crée un et le persiste", async () => {
    const { playerId, isPlayerId } = await load()

    expect(isPlayerId(playerId)).toBe(true)
    expect(localStorage.getItem(KEY)).toBe(playerId)
  })

  it.each(["old-player-id", "1-1-1-1-1", `${VALID}0`, " ", "null"])(
    "valeur hors format %j : remplacée par un UUID, et persistée",
    async (stored) => {
      localStorage.setItem(KEY, stored)

      const { playerId, isPlayerId } = await load()

      expect(isPlayerId(playerId)).toBe(true)
      expect(playerId).not.toBe(stored)
      expect(localStorage.getItem(KEY)).toBe(playerId)
    },
  )
})

describe("playerId — isPlayerId", () => {
  it("accepte la forme canonique, refuse le reste", async () => {
    const { isPlayerId } = await load()

    expect(isPlayerId(VALID)).toBe(true)
    expect(isPlayerId("")).toBe(false)
    expect(isPlayerId(undefined)).toBe(false)
    expect(isPlayerId(12345678)).toBe(false)
    expect(isPlayerId(VALID.replaceAll("-", ""))).toBe(false)
  })
})
