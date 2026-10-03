import { describe, it, expect, vi, afterEach } from "vitest"
import { ref } from "vue"
import {
  usePointerGestures,
  DRAG_THRESHOLD,
  WHEEL_ZOOM_SENSITIVITY,
} from "./usePointerGestures.js"

// Événements pointeur minimaux : le composable ne lit que ces champs.
function ev(type, pointerId, clientX, clientY, extra = {}) {
  return {
    type,
    pointerId,
    clientX,
    clientY,
    button: 0,
    preventDefault() {},
    ...extra,
  }
}

function setup() {
  const onPan = vi.fn()
  const onZoom = vi.fn()
  const onTap = vi.fn()
  const gestures = usePointerGestures({
    onPan,
    onZoom,
    onTap,
    longPressMs: ref(400),
  })
  return { ...gestures, onPan, onZoom, onTap }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("usePointerGestures — tap et drag", () => {
  it("un appui relâché sur place est un tap", () => {
    const g = setup()
    g.onPointerDown(ev("pointerdown", 1, 50, 60))
    g.onPointerUp(ev("pointerup", 1, 50, 60))
    expect(g.onTap).toHaveBeenCalledWith(50, 60)
    expect(g.onPan).not.toHaveBeenCalled()
  })

  it("un léger tremblement sous le seuil reste un tap", () => {
    const g = setup()
    g.onPointerDown(ev("pointerdown", 1, 50, 60))
    g.onPointerMove(ev("pointermove", 1, 50 + DRAG_THRESHOLD - 1, 60))
    g.onPointerUp(ev("pointerup", 1, 50 + DRAG_THRESHOLD - 1, 60))
    expect(g.onTap).toHaveBeenCalled()
    expect(g.onPan).not.toHaveBeenCalled()
  })

  it("au-delà du seuil, c'est un pan (inversé) et plus un tap", () => {
    const g = setup()
    g.onPointerDown(ev("pointerdown", 1, 0, 0))
    g.onPointerMove(ev("pointermove", 1, 20, 5))
    g.onPointerUp(ev("pointerup", 1, 20, 5))
    expect(g.onPan).toHaveBeenCalledWith(-20, -5)
    expect(g.onTap).not.toHaveBeenCalled()
    expect(g.tapAllowed()).toBe(false)
  })

  it("pointerleave et bouton droit ne comptent pas comme tap", () => {
    const g = setup()
    g.onPointerDown(ev("pointerdown", 1, 0, 0))
    g.onPointerUp(ev("pointerleave", 1, 0, 0))
    g.onPointerDown(ev("pointerdown", 2, 0, 0))
    g.onPointerUp(ev("pointerup", 2, 0, 0, { button: 2 }))
    expect(g.onTap).not.toHaveBeenCalled()
  })
})

describe("usePointerGestures — zoom", () => {
  it("le pincement émet le rapport des distances au milieu des doigts", () => {
    const g = setup()
    g.onPointerDown(ev("pointerdown", 1, 0, 0))
    g.onPointerDown(ev("pointerdown", 2, 100, 0))
    g.onPointerMove(ev("pointermove", 2, 200, 0))
    expect(g.onZoom).toHaveBeenCalledWith(2, 100, 0)

    g.onPointerUp(ev("pointerup", 2, 200, 0))
    g.onPointerUp(ev("pointerup", 1, 0, 0))
    expect(g.onTap).not.toHaveBeenCalled()
    expect(g.onPan).not.toHaveBeenCalled()
  })

  it("la molette zoome de façon exponentielle", () => {
    const g = setup()
    g.onWheel({ deltaY: 100, clientX: 3, clientY: 4 })
    expect(g.onZoom).toHaveBeenCalledWith(
      Math.exp(-100 * WHEEL_ZOOM_SENSITIVITY),
      3,
      4,
    )
  })
})

describe("usePointerGestures — appui long", () => {
  it("déclenche l'action après longPressMs et bloque le tap qui suit", () => {
    vi.useFakeTimers()
    const g = setup()
    const action = vi.fn()
    g.startLongPress(action)
    g.onPointerDown(ev("pointerdown", 1, 0, 0))
    vi.advanceTimersByTime(400)
    expect(action).toHaveBeenCalledTimes(1)
    expect(g.tapAllowed()).toBe(false)
  })

  it("est annulé par un drag", () => {
    vi.useFakeTimers()
    const g = setup()
    const action = vi.fn()
    g.startLongPress(action)
    g.onPointerDown(ev("pointerdown", 1, 0, 0))
    g.onPointerMove(ev("pointermove", 1, 30, 0))
    vi.advanceTimersByTime(1000)
    expect(action).not.toHaveBeenCalled()
  })

  it("l'action secondaire (contextmenu) ne part qu'une fois par appui", () => {
    vi.useFakeTimers()
    const g = setup()
    const action = vi.fn()
    g.startLongPress(action)
    g.triggerSecondaryAction(action)
    vi.advanceTimersByTime(1000)
    g.triggerSecondaryAction(action)
    expect(action).toHaveBeenCalledTimes(1)
  })
})
