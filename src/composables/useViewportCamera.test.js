// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { defineComponent, h } from "vue"
import { mount } from "@vue/test-utils"
import {
  useViewportCamera,
  restoredCellSize,
  MAX_CELL_SIZE,
} from "./useViewportCamera.js"

// jsdom n'a ni layout ni ResizeObserver : rect du conteneur simulé, observer
// déclenché à la main.
let resizeCallback = null

class FakeResizeObserver {
  constructor(callback) {
    resizeCallback = callback
  }
  observe() {}
  disconnect() {}
}

function mountCamera(rect) {
  let camera
  const wrapper = mount(
    defineComponent({
      setup() {
        camera = useViewportCamera(20)
        return () => h("div", { ref: camera.containerRef })
      },
    }),
    { attachTo: document.body },
  )
  const element = wrapper.element
  element.getBoundingClientRect = vi.fn(() => ({ ...rect.current }))
  // Montage : la position lue à onMounted l'a été avant le stub.
  window.dispatchEvent(new Event("resize"))
  return { camera, element, wrapper }
}

// Case monde sous un point écran : doit rester fixe pendant le zoom.
function worldUnder(camera, clientX, clientY, rect) {
  return {
    x: camera.originX.value + (clientX - rect.left) / camera.cellSize.value,
    y: camera.originY.value + (clientY - rect.top) / camera.cellSize.value,
  }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resizeCallback = null
})

describe("useViewportCamera — point focal du zoom", () => {
  it("le monde sous le pincement ne bouge pas, sans relire le rect à chaque pas", () => {
    const rect = { current: { left: 30, top: 80 } }
    const { camera, element, wrapper } = mountCamera(rect)
    const reads = element.getBoundingClientRect.mock.calls.length
    const before = worldUnder(camera, 130, 180, rect.current)

    for (let i = 0; i < 5; i++) {
      camera.zoomBy(1.1, 130, 180)
    }

    expect(camera.cellSize.value).toBeGreaterThan(20)
    const after = worldUnder(camera, 130, 180, rect.current)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
    expect(element.getBoundingClientRect.mock.calls.length).toBe(reads)
    wrapper.unmount()
  })

  it("suit un conteneur déplacé (resize observé, défilement)", () => {
    const rect = { current: { left: 0, top: 0 } }
    const { camera, wrapper } = mountCamera(rect)

    rect.current = { left: 10, top: 50 }
    resizeCallback([{ contentRect: { width: 300, height: 400 } }])
    let before = worldUnder(camera, 100, 100, rect.current)
    camera.zoomBy(0.8, 100, 100)
    let after = worldUnder(camera, 100, 100, rect.current)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)

    rect.current = { left: 10, top: -20 }
    document.body.dispatchEvent(new Event("scroll"))
    before = worldUnder(camera, 100, 100, rect.current)
    camera.zoomBy(1.25, 100, 100)
    after = worldUnder(camera, 100, 100, rect.current)
    expect(after.y).toBeCloseTo(before.y, 10)
    wrapper.unmount()
  })
})

describe("restoredCellSize — zoom relu d'une sauvegarde", () => {
  it("garde un zoom valide, même sous 1 px (vue carte)", () => {
    expect(restoredCellSize(28, 20)).toBe(28)
    expect(restoredCellSize(0.4, 20)).toBe(0.4)
  })

  it("borne à MAX_CELL_SIZE", () => {
    expect(restoredCellSize(MAX_CELL_SIZE * 3, 20)).toBe(MAX_CELL_SIZE)
  })

  it("rejette 0, négatif, NaN, infini, chaîne, null, absent", () => {
    for (const bad of [0, -5, NaN, Infinity, "28", null, undefined, {}]) {
      expect(restoredCellSize(bad, 20), String(bad)).toBe(20)
    }
  })
})
