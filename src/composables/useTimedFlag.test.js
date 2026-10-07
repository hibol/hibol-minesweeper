import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { effectScope } from "vue"
import { useTimedFlag } from "./useTimedFlag"

let scope

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  scope?.stop()
  vi.useRealTimers()
})

// onScopeDispose exige un scope actif : effectScope() en porte un hors composant.
function setup(durationMs) {
  scope = effectScope()
  return scope.run(() => useTimedFlag(durationMs))
}

describe("useTimedFlag", () => {
  it("est inactif au départ", () => {
    const { active } = setup(2000)

    expect(active.value).toBe(false)
  })

  it("s'active au trigger puis retombe après la durée", () => {
    const { active, trigger } = setup(2000)

    trigger()
    expect(active.value).toBe(true)

    vi.advanceTimersByTime(1999)
    expect(active.value).toBe(true)

    vi.advanceTimersByTime(1)
    expect(active.value).toBe(false)
  })

  it("un nouveau trigger repart de zéro", () => {
    const { active, trigger } = setup(2000)

    trigger()
    vi.advanceTimersByTime(1500)
    trigger()
    vi.advanceTimersByTime(1500)

    expect(active.value).toBe(true)

    vi.advanceTimersByTime(500)
    expect(active.value).toBe(false)
  })

  it("annule la minuterie quand le scope s'arrête", () => {
    const { trigger } = setup(2000)

    trigger()
    scope.stop()

    expect(vi.getTimerCount()).toBe(0)
  })
})
