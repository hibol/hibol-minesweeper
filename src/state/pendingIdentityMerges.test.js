// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// File chargée depuis localStorage à l'import : modules frais à chaque test.
const KEY = "hibol-minesweeper:pending-identity-merges"
const PLAYER_ID_KEY = "hibol-minesweeper:player-id"

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(PLAYER_ID_KEY, "this-device")
  vi.resetModules()
})

async function load() {
  return import("./pendingIdentityMerges.js")
}

describe("pendingIdentityMerges — file", () => {
  it("chargement : écarte les entrées invalides ou vers soi-même", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { from: "a", to: "b", extra: 1 },
        { from: "a", to: "a" },
        { from: "", to: "b" },
        "garbage",
      ]),
    )

    const { pendingIdentityMerges } = await load()

    expect(pendingIdentityMerges.value).toEqual([{ from: "a", to: "b" }])
  })

  it("queue puis resolve, persisté, l'ordre est conservé", async () => {
    const { queueIdentityMerge, resolveIdentityMerge, pendingIdentityMerges } =
      await load()

    queueIdentityMerge("a", "b")
    queueIdentityMerge("b", "c")
    queueIdentityMerge("c", "c") // ignorée
    resolveIdentityMerge({ from: "a", to: "b" })
    resolveIdentityMerge({ from: "a", to: "b" }) // déjà résolue : sans effet

    expect(pendingIdentityMerges.value).toEqual([{ from: "b", to: "c" }])
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([
      { from: "b", to: "c" },
    ])
  })
})

describe("pendingIdentityMerges — import de sauvegarde", () => {
  it("garde la file du fichier, puis celle de cet appareil, puis sa fusion vers l'identité importée", async () => {
    const {
      queueIdentityMerge,
      captureIdentityMergesForImport,
      queueIdentityMergesAfterImport,
      pendingIdentityMerges,
    } = await load()
    queueIdentityMerge("older-device", "this-device")
    const imported = {
      [PLAYER_ID_KEY]: "imported",
      [KEY]: JSON.stringify([{ from: "x", to: "imported" }]),
    }

    const captured = captureIdentityMergesForImport(imported)
    // Ce que fait App.vue entre les deux : stockage remplacé par le fichier.
    localStorage.clear()
    for (const [key, value] of Object.entries(imported)) {
      localStorage.setItem(key, value)
    }
    queueIdentityMergesAfterImport(captured)

    expect(pendingIdentityMerges.value).toEqual([
      { from: "x", to: "imported" },
      { from: "older-device", to: "this-device" },
      { from: "this-device", to: "imported" },
    ])
    expect(JSON.parse(localStorage.getItem(KEY))).toHaveLength(3)
  })

  it("sa propre sauvegarde (même identité) : aucune fusion ajoutée", async () => {
    const { captureIdentityMergesForImport, queueIdentityMergesAfterImport } =
      await load()

    const captured = captureIdentityMergesForImport({
      [PLAYER_ID_KEY]: "this-device",
    })
    queueIdentityMergesAfterImport(captured)

    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([])
  })
})
