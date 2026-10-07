// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { isSeen, markSeen } from "./seenFlag"

const KEY = "hibol-minesweeper:seen-test"

beforeEach(() => {
  localStorage.clear()
})

describe("seenFlag", () => {
  it("n'est pas vu tant que la clé n'est pas posée", () => {
    expect(isSeen(KEY)).toBe(false)
  })

  it("est vu une fois marqué, clé par clé", () => {
    markSeen(KEY)

    expect(isSeen(KEY)).toBe(true)
    expect(isSeen("autre-cle")).toBe(false)
    expect(localStorage.getItem(KEY)).toBe("true")
  })

  it('ne tient pour vue que la valeur "true"', () => {
    localStorage.setItem(KEY, "false")

    expect(isSeen(KEY)).toBe(false)
  })
})
