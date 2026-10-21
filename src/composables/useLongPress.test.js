// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { effectScope } from "vue"
import { longPressMs } from "../state/settings"
import { useLongPress } from "./useLongPress"

// Les écouteurs sont appelés à la main : le contrat de la composable, sans DOM.

let scope
let action

function setup() {
  scope = effectScope()
  return scope.run(() => useLongPress(action))
}

const down = (x = 10, y = 10) => ({ clientX: x, clientY: y })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  action = vi.fn()
})

afterEach(() => {
  scope?.stop()
  vi.useRealTimers()
})

describe("useLongPress", () => {
  it("déclenche l'action après longPressMs, une seule fois", () => {
    const press = setup()

    press.onPointerdown(down())
    vi.advanceTimersByTime(longPressMs.value - 1)
    expect(action).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    vi.advanceTimersByTime(5000)
    expect(action).toHaveBeenCalledOnce()
  })

  it.each([
    ["pointerup", "onPointerup"],
    ["pointercancel", "onPointercancel"],
    ["pointerleave", "onPointerleave"],
  ])("%s avant le délai : annulé", (_name, handler) => {
    const press = setup()

    press.onPointerdown(down())
    press[handler]()
    vi.advanceTimersByTime(longPressMs.value * 2)

    expect(action).not.toHaveBeenCalled()
  })

  it("doigt qui glisse au-delà de la tolérance (défilement) : annulé ; petit tremblement : non", () => {
    const press = setup()

    press.onPointerdown(down(10, 10))
    press.onPointermove(down(13, 12))
    vi.advanceTimersByTime(longPressMs.value)
    expect(action).toHaveBeenCalledOnce()

    action.mockClear()
    press.onPointerdown(down(10, 10))
    press.onPointermove(down(10, 40))
    vi.advanceTimersByTime(longPressMs.value * 2)
    expect(action).not.toHaveBeenCalled()
  })

  it("contextmenu natif (Android, clic droit) : déclenche tout de suite, bloque le menu natif, pas de doublon avec le délai", () => {
    const press = setup()
    const event = { preventDefault: vi.fn() }

    press.onPointerdown(down())
    press.onContextmenu(event)
    vi.advanceTimersByTime(longPressMs.value * 2)
    press.onContextmenu(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(2)
    expect(action).toHaveBeenCalledOnce()
  })

  it("un nouvel appui peut déclencher de nouveau", () => {
    const press = setup()

    press.onPointerdown(down())
    vi.advanceTimersByTime(longPressMs.value)
    press.onPointerup()
    press.onPointerdown(down())
    vi.advanceTimersByTime(longPressMs.value)

    expect(action).toHaveBeenCalledTimes(2)
  })

  it("fin du scope : l'appui en cours est abandonné", () => {
    const press = setup()

    press.onPointerdown(down())
    scope.stop()
    vi.advanceTimersByTime(longPressMs.value * 2)

    expect(action).not.toHaveBeenCalled()
  })
})
