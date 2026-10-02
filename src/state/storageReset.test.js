// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest"
import { clearGameStorage } from "./storageReset.js"

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
