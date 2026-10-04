// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Capacitor } from "@capacitor/core"
import { Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"
import { saveFile } from "./exportFile"

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}))
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: { writeFile: vi.fn() },
}))
vi.mock("@capacitor/share", () => ({
  Share: { share: vi.fn() },
}))

const CACHE_URI = "file:///data/user/0/app/cache/save.json"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("saveFile, branche native", () => {
  beforeEach(() => {
    Capacitor.isNativePlatform.mockReturnValue(true)
    Filesystem.writeFile.mockResolvedValue({ uri: CACHE_URI })
    Share.share.mockResolvedValue({
      activityType: "com.google.android.apps.docs",
    })
  })

  it("texte : écrit en UTF-8 dans le cache, puis partage ce fichier", async () => {
    await saveFile({
      filename: "save.json",
      mimeType: "application/json",
      data: '{"a":1}',
    })

    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: "save.json",
      directory: "CACHE",
      data: '{"a":1}',
      encoding: "utf8",
    })
    expect(Share.share).toHaveBeenCalledWith({
      title: "save.json",
      files: [CACHE_URI],
    })
    expect(Filesystem.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      Share.share.mock.invocationCallOrder[0],
    )
  })

  it("Blob : écrit en base64 sans encoding (fichier binaire)", async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], {
      type: "image/png",
    })

    await saveFile({ filename: "map.png", mimeType: "image/png", data: blob })

    const options = Filesystem.writeFile.mock.calls[0][0]
    expect(options.data).toBe("iVBORw==")
    expect(options).not.toHaveProperty("encoding")
  })

  it("feuille de partage fermée sans choix : pas d'erreur", async () => {
    Share.share.mockRejectedValue(new Error("Share canceled"))

    await expect(
      saveFile({
        filename: "save.json",
        mimeType: "application/json",
        data: "{}",
      }),
    ).resolves.toBeUndefined()
  })

  it("échec d'écriture : lève, sans ouvrir la feuille de partage", async () => {
    Filesystem.writeFile.mockRejectedValue(new Error("No space left"))

    await expect(
      saveFile({
        filename: "save.json",
        mimeType: "application/json",
        data: "{}",
      }),
    ).rejects.toThrow("No space left")
    expect(Share.share).not.toHaveBeenCalled()
  })

  it("échec réel du partage : lève", async () => {
    Share.share.mockRejectedValue(new Error("only file urls are supported"))

    await expect(
      saveFile({
        filename: "save.json",
        mimeType: "application/json",
        data: "{}",
      }),
    ).rejects.toThrow("only file urls are supported")
  })
})

describe("saveFile, branche web", () => {
  let click

  beforeEach(() => {
    vi.useFakeTimers()
    Capacitor.isNativePlatform.mockReturnValue(false)
    URL.createObjectURL = vi.fn(() => "blob:fake")
    URL.revokeObjectURL = vi.fn()
    click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    click.mockRestore()
  })

  it("crée un lien download, le clique, révoque l'URL plus tard", async () => {
    await saveFile({
      filename: "save.json",
      mimeType: "application/json",
      data: "{}",
    })

    const blob = URL.createObjectURL.mock.calls[0][0]
    expect(blob.type).toBe("application/json")
    const link = click.mock.contexts[0]
    expect(link.href).toBe("blob:fake")
    expect(link.download).toBe("save.json")
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake")
    expect(Filesystem.writeFile).not.toHaveBeenCalled()
  })

  it("Blob passé tel quel", async () => {
    const blob = new Blob(["png"], { type: "image/png" })

    await saveFile({ filename: "map.png", mimeType: "image/png", data: blob })

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
  })
})
