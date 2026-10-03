// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"
import { nextTick } from "vue"

// Module réel : vérifie la limite de saisie et la persistance par le watch.

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe("username — longueur", () => {
  it("setUsername (saisie du joueur) : coupe à 12 caractères", async () => {
    const { username, setUsername } = await import("./username.js")

    setUsername("  abcdefghijklmnop  ")

    expect(username.value).toBe("abcdefghijkl")
  })

  it("setServerUsername (nom du serveur) : 32 caractères conservés tels quels et persistés", async () => {
    const { username, setServerUsername, USERNAME_KEY } =
      await import("./username.js")
    const longName = "Renamed By Admin With 32 Chars!!"

    setServerUsername(longName)
    await nextTick() // le watch écrit dans localStorage au flush suivant

    expect(longName).toHaveLength(32)
    expect(username.value).toBe(longName)
    expect(localStorage.getItem(USERNAME_KEY)).toBe(longName)
  })
})
