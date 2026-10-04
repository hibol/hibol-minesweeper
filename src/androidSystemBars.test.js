// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { nextTick } from "vue"
import { Capacitor, SystemBars } from "@capacitor/core"
import { theme } from "./state/settings"
import {
  installAndroidSystemBars,
  applySystemBarsStyle,
} from "./androidSystemBars"

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: vi.fn() },
  SystemBars: { setStyle: vi.fn() },
  SystemBarsStyle: { Light: "LIGHT", Dark: "DARK" },
  SystemBarType: { StatusBar: "StatusBar", NavigationBar: "NavigationBar" },
}))

let stop

beforeEach(() => {
  vi.clearAllMocks()
  SystemBars.setStyle.mockResolvedValue()
  theme.value = "light"
})

afterEach(() => {
  stop?.()
  stop = null
})

describe("installAndroidSystemBars", () => {
  it("Android : style du thème appliqué aux deux barres dès le démarrage", () => {
    Capacitor.getPlatform.mockReturnValue("android")

    stop = installAndroidSystemBars()

    expect(SystemBars.setStyle.mock.calls).toEqual([
      [{ style: "LIGHT", bar: "StatusBar" }],
      [{ style: "LIGHT", bar: "NavigationBar" }],
    ])
  })

  it("Android : réappliqué à chaque changement de thème", async () => {
    Capacitor.getPlatform.mockReturnValue("android")
    stop = installAndroidSystemBars()
    SystemBars.setStyle.mockClear()

    theme.value = "dark"
    await nextTick()
    expect(SystemBars.setStyle.mock.calls).toEqual([
      [{ style: "DARK", bar: "StatusBar" }],
      [{ style: "DARK", bar: "NavigationBar" }],
    ])

    SystemBars.setStyle.mockClear()
    theme.value = "light"
    await nextTick()
    expect(SystemBars.setStyle).toHaveBeenCalledTimes(2)
    expect(SystemBars.setStyle).toHaveBeenCalledWith({
      style: "LIGHT",
      bar: "StatusBar",
    })
  })

  it("thème sombre au démarrage : DARK tout de suite", () => {
    Capacitor.getPlatform.mockReturnValue("android")
    theme.value = "dark"

    stop = installAndroidSystemBars()

    expect(SystemBars.setStyle).toHaveBeenCalledWith({
      style: "DARK",
      bar: "NavigationBar",
    })
  })

  it.each(["web", "ios"])(
    "%s : aucun appel, même au changement de thème",
    async (platform) => {
      Capacitor.getPlatform.mockReturnValue(platform)

      stop = installAndroidSystemBars()
      theme.value = "dark"
      await nextTick()

      expect(SystemBars.setStyle).not.toHaveBeenCalled()
    },
  )

  it("erreur du plugin : loguée, jamais propagée, le changement suivant repart", async () => {
    Capacitor.getPlatform.mockReturnValue("android")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    SystemBars.setStyle.mockRejectedValue(new Error("not implemented"))

    stop = installAndroidSystemBars()
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())

    SystemBars.setStyle.mockResolvedValue()
    theme.value = "dark"
    await nextTick()
    expect(SystemBars.setStyle).toHaveBeenLastCalledWith({
      style: "DARK",
      bar: "NavigationBar",
    })
    expect(unhandled).not.toHaveBeenCalled()

    process.off("unhandledRejection", unhandled)
    consoleError.mockRestore()
  })

  it("applySystemBarsStyle : se résout même si le plugin rejette", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    SystemBars.setStyle.mockRejectedValue(new Error("bridge down"))

    await expect(applySystemBarsStyle("dark")).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalledOnce()

    consoleError.mockRestore()
  })
})
