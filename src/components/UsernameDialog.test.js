// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import UsernameDialog from "./UsernameDialog.vue"

// claimUsername (accountOnline.js) est le seul appel réseau touché par ce
// composant — mocké pour piloter les 3 issues testées (accepté / pris /
// erreur réseau -> null) sans dépendre du contrat serveur réel.
const claimUsername = vi.fn()
const completeDeviceLink = vi.fn()
vi.mock("../state/accountOnline", () => ({
  claimUsername: (...args) => claimUsername(...args),
  completeDeviceLink: (...args) => completeDeviceLink(...args),
}))

const reconcileLegacyScoresWithServer = vi.fn()
vi.mock("../state/legacyOnline", () => ({
  reconcileLegacyScoresWithServer: (...args) =>
    reconcileLegacyScoresWithServer(...args),
}))

beforeEach(() => {
  claimUsername.mockReset()
  completeDeviceLink.mockReset()
  reconcileLegacyScoresWithServer.mockReset()
})

async function mountDialog() {
  const wrapper = mount(UsernameDialog, { props: { show: true } })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe("UsernameDialog — claim au clic sur Continue", () => {
  it("nom accepté : passe à WELCOME avec le nom renvoyé par le serveur", async () => {
    claimUsername.mockResolvedValue({ username: "servername", reason: null })
    const wrapper = await mountDialog()

    await wrapper.find(".username-input").setValue("typedname")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()

    expect(claimUsername).toHaveBeenCalledWith("typedname")
    expect(wrapper.text()).toContain("SERVERNAME")
    expect(wrapper.emitted().submit).toBeUndefined() // pas avant PRESS START
  })

  it("nom pris : reste sur l'écran de saisie, message d'erreur inline, jamais WELCOME", async () => {
    claimUsername.mockResolvedValue({
      username: null,
      reason: "username_taken",
    })
    const wrapper = await mountDialog()

    await wrapper.find(".username-input").setValue("prise")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()

    expect(wrapper.find(".username-title").text()).toBe("ENTER YOUR NAME")
    expect(wrapper.find(".username-error").text()).toContain("taken")
    expect(wrapper.text()).not.toContain("WELCOME")
  })

  it("nom invalide : reste sur l'écran de saisie, message d'erreur inline dédié", async () => {
    claimUsername.mockResolvedValue({
      username: null,
      reason: "invalid_username",
    })
    const wrapper = await mountDialog()

    await wrapper.find(".username-input").setValue("!!!")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()

    expect(wrapper.find(".username-title").text()).toBe("ENTER YOUR NAME")
    expect(wrapper.find(".username-error").text()).toContain("valid")
  })

  it("erreur réseau (claimUsername résout null) : n'empêche pas de passer à WELCOME avec le nom local", async () => {
    claimUsername.mockResolvedValue(null)
    const wrapper = await mountDialog()

    await wrapper.find(".username-input").setValue("hors-ligne")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()

    expect(wrapper.text()).toContain("WELCOME, HORS-LIGNE")
  })

  it("réessayer après une erreur efface le message d'erreur en retapant", async () => {
    claimUsername.mockResolvedValue({
      username: null,
      reason: "username_taken",
    })
    const wrapper = await mountDialog()

    await wrapper.find(".username-input").setValue("prise")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()
    expect(wrapper.find(".username-error").exists()).toBe(true)

    await wrapper.find(".username-input").setValue("prise2")
    expect(wrapper.find(".username-error").exists()).toBe(false)
  })

  it("finish() émet submit avec le nom choisi une fois sur l'écran WELCOME", async () => {
    claimUsername.mockResolvedValue({ username: "servername", reason: null })
    const wrapper = await mountDialog()

    await wrapper.find(".username-input").setValue("typedname")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()
    await wrapper.find(".pixel-btn").trigger("click") // PRESS START

    expect(wrapper.emitted().submit).toEqual([["servername"]])
  })
})

describe("UsernameDialog — lier cet appareil depuis l'onboarding", () => {
  async function openLinkStep(wrapper) {
    await wrapper.find(".username-link").trigger("click")
    await flushPromises()
  }

  async function enterCode(wrapper, code) {
    await wrapper.find(".username-input").setValue(code)
    await wrapper.find("form").trigger("submit")
    await flushPromises()
  }

  it("nom pris : le message d'erreur oriente vers le pairage", async () => {
    claimUsername.mockResolvedValue({
      username: null,
      reason: "username_taken",
    })
    const wrapper = await mountDialog()

    await wrapper.find(".username-input").setValue("prise")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()

    expect(wrapper.find(".username-error").text()).toContain("link this device")
  })

  it("le lien ouvre l'écran de code et y place le focus", async () => {
    const wrapper = mount(UsernameDialog, {
      props: { show: true },
      attachTo: document.body,
    })
    await openLinkStep(wrapper)

    expect(wrapper.find(".username-title").text()).toBe("LINK THIS DEVICE")
    expect(document.activeElement).toBe(wrapper.find(".username-input").element)
    wrapper.unmount()
  })

  it("Link reste désactivé tant que le code n'a pas 6 caractères", async () => {
    const wrapper = await mountDialog()
    await openLinkStep(wrapper)

    await wrapper.find(".username-input").setValue("123")
    const linkBtn = wrapper.find("button[type='submit']")

    expect(linkBtn.attributes("disabled")).toBeDefined()
  })

  it("succès : adopte l'identité existante SANS réclamer de pseudo, puis WELCOME BACK", async () => {
    completeDeviceLink.mockResolvedValue({
      playerId: "old-id",
      username: "oldname",
      reason: null,
    })
    const wrapper = await mountDialog()
    await openLinkStep(wrapper)

    await enterCode(wrapper, " 123456")

    expect(completeDeviceLink).toHaveBeenCalledWith("123456")
    expect(reconcileLegacyScoresWithServer).toHaveBeenCalledTimes(1)
    expect(claimUsername).not.toHaveBeenCalled()
    expect(wrapper.find(".username-title").text()).toBe("WELCOME BACK, OLDNAME")

    await wrapper.find(".pixel-btn").trigger("click") // PRESS START
    expect(wrapper.emitted().submit).toEqual([["oldname"]])
  })

  it("code refusé : reste sur l'écran de code avec le message", async () => {
    completeDeviceLink.mockResolvedValue({
      playerId: null,
      username: null,
      reason: "code_invalid",
    })
    const wrapper = await mountDialog()
    await openLinkStep(wrapper)

    await enterCode(wrapper, "000000")

    expect(wrapper.find(".username-title").text()).toBe("LINK THIS DEVICE")
    expect(wrapper.find(".username-error").text()).toBe("Invalid code.")
  })

  it("Back revient à la saisie du nom", async () => {
    const wrapper = await mountDialog()
    await openLinkStep(wrapper)

    await wrapper
      .findAll(".pixel-btn")
      .find((b) => b.text() === "Back")
      .trigger("click")

    expect(wrapper.find(".username-title").text()).toBe("ENTER YOUR NAME")
  })
})
