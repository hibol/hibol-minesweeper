// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import UsernameDialog from "./UsernameDialog.vue"

// claimUsername (legacyOnline.js) est le seul appel réseau touché par ce
// composant — mocké pour piloter les 3 issues testées (accepté / pris /
// erreur réseau -> null) sans dépendre du contrat serveur réel.
const claimUsername = vi.fn()
vi.mock("../state/legacyOnline", () => ({
  claimUsername: (...args) => claimUsername(...args),
}))

beforeEach(() => {
  claimUsername.mockReset()
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
    claimUsername.mockResolvedValue({ username: null, reason: "username_taken" })
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
    claimUsername.mockResolvedValue({ username: null, reason: "username_taken" })
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
