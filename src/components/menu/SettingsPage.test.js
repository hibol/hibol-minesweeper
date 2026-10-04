// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest"
import { webcrypto } from "node:crypto"
import { mount, enableAutoUnmount } from "@vue/test-utils"
import SettingsPage from "./SettingsPage.vue"
import { buildExport } from "../../state/saveTransfer"
import { usernamePrompted } from "../../state/username"
import { saveFile } from "../../exportFile"

// Reset et pairage : cf. BurgerMenu.test.js (menu entier).

// WebCrypto de Node si jsdom n'en a pas (signature de la sauvegarde), comme
// dans saveTransfer.test.js.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  })
}

vi.mock("../../exportFile", () => ({ saveFile: vi.fn() }))

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.mocked(saveFile).mockReset()
  usernamePrompted.value = false
  localStorage.clear()
})

const button = (wrapper, label) =>
  wrapper.findAll("button").find((b) => b.text() === label)

// La signature passe par WebCrypto, qui répond au-delà d'un flushPromises :
// on attend que la page ait réagi (confirmation ou message d'erreur).
const settled = (wrapper) =>
  vi.waitFor(() => {
    if (
      !wrapper.find(".confirm-box").exists() &&
      !wrapper.find(".settings-error").exists()
    ) {
      throw new Error("pas encore")
    }
  })

// Un <input type="file"> ne se remplit pas par setValue : on pose `files`.
async function pickFile(wrapper, text) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, "files", {
    value: [new File([text], "save.json", { type: "application/json" })],
    configurable: true,
  })
  await input.trigger("change")
  await settled(wrapper)
}

describe("SettingsPage — Backup : export", () => {
  it("enregistre un fichier JSON daté", async () => {
    const wrapper = mount(SettingsPage)

    await button(wrapper, "Export").trigger("click")
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalled())

    const [{ filename, mimeType, data }] = vi.mocked(saveFile).mock.calls[0]
    expect(filename).toMatch(/^hibol-minesweeper-save-\d{8}\.json$/)
    expect(mimeType).toBe("application/json")
    expect(JSON.parse(data).app).toBeDefined()
  })

  it("échec : message dans la page", async () => {
    vi.mocked(saveFile).mockRejectedValue(new Error("disk full"))
    const wrapper = mount(SettingsPage)

    await button(wrapper, "Export").trigger("click")
    await settled(wrapper)

    expect(wrapper.find(".settings-error").text()).toBe("Export failed")
  })
})

describe("SettingsPage — Backup : import", () => {
  it("fichier valide : confirmation, puis émet les données vérifiées", async () => {
    localStorage.setItem("hibol-minesweeper:chest-reward", "7")
    const save = await buildExport()
    const wrapper = mount(SettingsPage)

    await pickFile(wrapper, JSON.stringify(save))
    expect(wrapper.find(".confirm-box").text()).toContain("IMPORT SAVE?")
    expect(wrapper.emitted("import-save")).toBeUndefined()

    await wrapper
      .findAll(".confirm-box button")
      .find((b) => b.text() === "Import")
      .trigger("click")

    expect(wrapper.emitted("import-save")).toEqual([[save.data]])
    expect(wrapper.find(".confirm-box").exists()).toBe(false)
  })

  it("avec un compte en ligne : la confirmation annonce le déplacement des scores", async () => {
    usernamePrompted.value = true
    const wrapper = mount(SettingsPage)

    await pickFile(wrapper, JSON.stringify(await buildExport()))

    expect(wrapper.find(".confirm-box").text()).toContain(
      "Online scores from this device move",
    )
  })

  it("fichier illisible : message, pas de confirmation", async () => {
    const wrapper = mount(SettingsPage)

    await pickFile(wrapper, "pas du json")

    expect(wrapper.find(".settings-error").text()).toBe(
      "Import failed — not a valid file",
    )
    expect(wrapper.find(".confirm-box").exists()).toBe(false)
  })

  it("signature fausse : refusé", async () => {
    const save = await buildExport()
    save.data["hibol-minesweeper:chest-reward"] = "999"
    const wrapper = mount(SettingsPage)

    await pickFile(wrapper, JSON.stringify(save))

    expect(wrapper.find(".settings-error").text()).toMatch(/^Import failed/)
    expect(wrapper.emitted("import-save")).toBeUndefined()
  })
})

describe("SettingsPage — réglages", () => {
  it("position (x;y) proposée seulement une fois l'Infini débloqué", () => {
    const text = (infiniteUnlocked) =>
      mount(SettingsPage, { props: { infiniteUnlocked } }).text()

    expect(text(false)).not.toContain("Show position")
    expect(text(true)).toContain("Show position")
  })
})
