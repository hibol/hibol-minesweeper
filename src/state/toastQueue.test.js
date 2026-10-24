import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { currentToast, pushToast, clearToasts } from "./toastQueue"

// clearTimeout compris : sans lui, les minuteurs factices ne s'annulent pas.
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout"],
  })
})

afterEach(() => {
  clearToasts()
  vi.useRealTimers()
})

describe("toastQueue", () => {
  it("sans durée : reste affiché 2,5 s, puis disparaît", () => {
    pushToast("hello")

    vi.advanceTimersByTime(2499)
    expect(currentToast.value?.text).toBe("hello")

    vi.advanceTimersByTime(1)
    expect(currentToast.value).toBeNull()
  })

  it("durée explicite respectée", () => {
    pushToast("long", { durationMs: 4000 })

    vi.advanceTimersByTime(3999)
    expect(currentToast.value?.text).toBe("long")

    vi.advanceTimersByTime(1)
    expect(currentToast.value).toBeNull()
  })

  it("un 2e toast attend la fin du 1er", () => {
    pushToast("first", { durationMs: 1000 })
    pushToast("second", { durationMs: 1000 })
    expect(currentToast.value?.text).toBe("first")

    vi.advanceTimersByTime(1000)
    expect(currentToast.value?.text).toBe("second")

    vi.advanceTimersByTime(1000)
    expect(currentToast.value).toBeNull()
  })
})
