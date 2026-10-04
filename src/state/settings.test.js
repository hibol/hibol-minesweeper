// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { nextTick } from "vue"

// settings.js applique le thème à l'import : module rechargé à chaque test.
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />'
  // jsdom ne lit pas style.css : la variable du thème est posée à la main.
  document.documentElement.style.setProperty("--color-page-bg", "#fff")
})

afterEach(() => {
  vi.restoreAllMocks()
})

const metaColor = () =>
  document.querySelector('meta[name="theme-color"]').getAttribute("content")

describe("settings — thème", () => {
  it("meta theme-color calée sur le fond de page, à l'import puis au changement", async () => {
    const { theme } = await import("./settings.js")
    expect(document.documentElement.dataset.theme).toBe("light")
    expect(metaColor()).toBe("#fff")

    document.documentElement.style.setProperty("--color-page-bg", "#1a1a1a")
    theme.value = "dark"
    await nextTick()

    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(metaColor()).toBe("#1a1a1a")
    expect(localStorage.getItem("hibol-minesweeper:theme")).toBe("dark")
  })

  it("stockage qui lève : le réglage change quand même, sans erreur", async () => {
    const { theme, tapAction } = await import("./settings.js")
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError")
    })

    theme.value = "dark"
    tapAction.value = "flag"
    await nextTick()

    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(tapAction.value).toBe("flag")
  })
})
