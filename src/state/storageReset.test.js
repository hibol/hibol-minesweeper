// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest"
import {
  clearGameStorage,
  snapshotGameStorage,
  restoreGameStorage,
} from "./storageReset.js"

const ONLINE = [
  "hibol-minesweeper:player-id",
  "hibol-minesweeper:username",
  "hibol-minesweeper:username-prompted",
  "hibol-minesweeper:pending-username-claim",
  "hibol-minesweeper:pending-identity-merges",
  "hibol-minesweeper:legacy-pending-submissions",
  "hibol-minesweeper:infinite-pending-submissions",
]
const PROGRESS = [
  "hibol-minesweeper:shop-inventory",
  "hibol-minesweeper:legacy-best-times",
  "hibol-minesweeper:infinite-top-runs",
]

beforeEach(() => {
  localStorage.clear()
  for (const key of [...ONLINE, ...PROGRESS, "other-app:data"]) {
    localStorage.setItem(key, "x")
  }
})

describe("storageReset — clearGameStorage", () => {
  it("garde le compte en ligne (identité + envois en attente), efface la progression", () => {
    clearGameStorage({ keepOnlineAccount: true })

    expect(Object.keys(localStorage).sort()).toEqual(
      [...ONLINE, "other-app:data"].sort(),
    )
  })

  it("sans option : efface toutes les clés du jeu, jamais celles d'autres apps", () => {
    clearGameStorage()

    expect(Object.keys(localStorage)).toEqual(["other-app:data"])
  })
})

describe("storageReset — snapshotGameStorage / restoreGameStorage", () => {
  it("la copie ne contient que les clés du jeu", () => {
    const keys = snapshotGameStorage().map(([key]) => key)

    expect(keys.sort()).toEqual([...ONLINE, ...PROGRESS].sort())
  })

  it("restaure l'état copié, en retirant ce qui a été écrit depuis", () => {
    localStorage.setItem("hibol-minesweeper:shop-inventory", "avant")
    const copy = snapshotGameStorage()

    clearGameStorage()
    localStorage.setItem("hibol-minesweeper:shop-inventory", "après")
    localStorage.setItem("hibol-minesweeper:nouvelle", "y")
    restoreGameStorage(copy)

    expect(localStorage.getItem("hibol-minesweeper:shop-inventory")).toBe(
      "avant",
    )
    expect(localStorage.getItem("hibol-minesweeper:nouvelle")).toBeNull()
    expect(localStorage.getItem("other-app:data")).toBe("x")
  })
})
