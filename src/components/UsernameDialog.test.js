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

// Getter : le drapeau est relu à chaque montage, basculé test par test.
let deviceLinking = false
vi.mock("../features", () => ({
  get DEVICE_LINKING() {
    return deviceLinking
  },
}))

beforeEach(() => {
  deviceLinking = false
  claimUsername.mockReset()
  completeDeviceLink.mockReset()
  reconcileLegacyScoresWithServer.mockReset()
})

async function mountDialog(retry = null) {
  const wrapper = mount(UsernameDialog, { props: { show: true, retry } })
  await wrapper.vm.$nextTick()
  return wrapper
}

async function openLinkStep(wrapper) {
  await wrapper.find(".username-link").trigger("click")
  await flushPromises()
}

async function enterCode(wrapper, code) {
  await wrapper.find(".username-input").setValue(code)
  await wrapper.find("form").trigger("submit")
  await flushPromises()
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

  it("finish() émet submit (sans nom : déjà enregistré par claimUsername) une fois sur l'écran WELCOME", async () => {
    claimUsername.mockResolvedValue({ username: "servername", reason: null })
    const wrapper = await mountDialog()

    await wrapper.find(".username-input").setValue("typedname")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()
    await wrapper.find(".pixel-btn").trigger("click") // PRESS START

    expect(wrapper.emitted().submit).toEqual([[]])
  })
})

describe("UsernameDialog — pairage masqué (drapeau désactivé)", () => {
  it("ni lien vers le pairage, ni mention dans l'erreur « nom pris »", async () => {
    claimUsername.mockResolvedValue({
      username: null,
      reason: "username_taken",
    })
    const wrapper = await mountDialog()

    expect(wrapper.find(".username-link").exists()).toBe(false)

    await wrapper.find(".username-input").setValue("prise")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()

    expect(wrapper.find(".username-error").text()).toBe(
      "that name's taken, try another",
    )
    expect(wrapper.text()).not.toMatch(/link|device|code/i)
  })

  it.each([
    { reason: "taken", rejectedName: "test" },
    { reason: "account_gone", rejectedName: "test" },
  ])("variante $reason : aucune mention du pairage", async (retry) => {
    claimUsername.mockResolvedValue({ reason: "username_taken" })
    const wrapper = await mountDialog(retry)

    await wrapper.find(".username-input").setValue("autre")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()

    expect(wrapper.find(".username-link").exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/link|device|code/i)
  })
})

describe("UsernameDialog — lier cet appareil depuis l'onboarding", () => {
  beforeEach(() => {
    deviceLinking = true
  })

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
    expect(wrapper.emitted().submit).toEqual([[]])
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

describe("UsernameDialog — variante « nouveau pseudo »", () => {
  it("nom refusé en arrière-plan : le dit, avec le nom refusé", async () => {
    const wrapper = await mountDialog({ reason: "taken", rejectedName: "test" })

    expect(wrapper.text()).toContain(
      '"test" is already taken online — pick another name.',
    )
  })

  it("compte disparu : message dédié", async () => {
    const wrapper = await mountDialog({
      reason: "account_gone",
      rejectedName: "test",
    })

    expect(wrapper.text()).toContain(
      "Your online account no longer exists — choose a name to appear online again.",
    )
  })

  it("onboarding : aucun de ces messages", async () => {
    const wrapper = await mountDialog()

    expect(wrapper.text()).not.toContain("already taken online")
    expect(wrapper.text()).not.toContain("no longer exists")
  })

  it("champ vide : nom aléatoire réclamé, comme à l'onboarding, puis OK", async () => {
    claimUsername.mockImplementation((name) =>
      Promise.resolve({ username: name, reason: null }),
    )
    const wrapper = await mountDialog({ reason: "taken", rejectedName: "test" })

    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()

    expect(claimUsername.mock.calls[0][0]).toMatch(/^player\d{4}$/)
    expect(wrapper.find(".username-title").text()).toMatch(
      /^YOU'RE NOW PLAYER\d{4}$/,
    )
    await wrapper.find(".pixel-btn").trigger("click") // OK
    expect(wrapper.emitted().submit).toEqual([[]])
  })

  it("nom choisi lui aussi pris : même erreur inline qu'à l'onboarding", async () => {
    deviceLinking = true
    claimUsername.mockResolvedValue({ reason: "username_taken" })
    const wrapper = await mountDialog({ reason: "taken", rejectedName: "test" })

    await wrapper.find(".username-input").setValue("autre")
    await wrapper.find(".pixel-btn").trigger("click")
    await flushPromises()

    expect(wrapper.find(".username-error").text()).toContain("link this device")
  })

  it("pairage depuis la variante : WELCOME BACK, sans réclamer de pseudo", async () => {
    deviceLinking = true
    completeDeviceLink.mockResolvedValue({
      playerId: "old-id",
      username: "test",
      reason: null,
    })
    const wrapper = await mountDialog({ reason: "taken", rejectedName: "test" })
    await openLinkStep(wrapper)

    await enterCode(wrapper, "123456")

    expect(claimUsername).not.toHaveBeenCalled()
    expect(wrapper.find(".username-title").text()).toBe("WELCOME BACK, TEST")
  })
})
