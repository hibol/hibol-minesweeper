// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { writeItem, writeJson, resetWriteWarning } from "./storageWrite.js"
import { currentToast } from "./toastQueue.js"

function fillStorage() {
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError")
  })
}

beforeEach(() => {
  localStorage.clear()
  resetWriteWarning()
  currentToast.value = null
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("storageWrite", () => {
  it("écriture réussie : true, aucun message", () => {
    expect(writeItem("k", "v")).toBe(true)
    expect(writeJson("j", { a: 1 })).toBe(true)

    expect(localStorage.getItem("k")).toBe("v")
    expect(JSON.parse(localStorage.getItem("j"))).toEqual({ a: 1 })
    expect(currentToast.value).toBeNull()
  })

  it("quota plein : false et message au joueur", () => {
    fillStorage()

    expect(writeItem("k", "v")).toBe(false)
    expect(currentToast.value.text).toBe(
      "Storage full: progress can't be saved",
    )
  })

  it("valeur non sérialisable : false et message", () => {
    const circular = {}
    circular.self = circular

    expect(writeJson("k", circular)).toBe(false)
    expect(currentToast.value.text).toMatch(/Storage full/)
  })

  it("un seul message par minute", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    fillStorage()

    writeItem("k", "v")
    currentToast.value = null
    writeItem("k", "v")
    expect(currentToast.value).toBeNull()

    vi.setSystemTime(Date.now() + 61_000)
    writeItem("k", "v")
    expect(currentToast.value).not.toBeNull()
  })
})
