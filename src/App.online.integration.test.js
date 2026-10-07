// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { flushPromises } from "@vue/test-utils"
import { usernamePrompted } from "./state/username"
import {
  usernameChoice,
  requireUsernameChoice,
  clearUsernameChoice,
} from "./state/usernameChoice"
import { useAppHarness, K, wrapper, mountApp } from "../test/appHarness"

// Intégration d'App.vue : envois en ligne (Give Up Infini) et dialogue de pseudo.

useAppHarness()

describe("App.vue — Give Up (Infini) soumet la run au classement en ligne", () => {
  it("envoie le payload exact au nouvel endpoint sans jamais retarder la bannière de fin de run", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()

    // Résolue seulement en fin de test : si onGiveUp attendait cet appel, la
    // bannière n'apparaîtrait pas avant — c'est ce qui prouve le caractère
    // non-bloquant. Libérée ensuite, sinon le verrou de réclamation
    // (accountOnline.js) resterait pris pour les tests suivants.
    let answer
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    vi.stubGlobal("fetch", fetchMock)

    wrapper.vm.game.minesTriggeredCount = 20 // > darknessMineThreshold (15) : Give Up possible
    wrapper.vm.game.heartsCollectedCount = 4
    wrapper.vm.game.robotsTriggeredCount = 2
    wrapper.vm.game.maxDistance = 123.4
    wrapper.vm.game.revealedCount = 5000
    wrapper.vm.game.usedMachines = true
    await wrapper.vm.$nextTick()

    const giveUpBtn = wrapper.find(".give-up")
    expect(giveUpBtn.exists()).toBe(true)
    await giveUpBtn.trigger("click")
    await wrapper.vm.$nextTick()

    // Bannière de fin de run déjà affichée alors que fetchMock ne s'est
    // toujours pas résolu.
    const banner = wrapper.find(".win-banner")
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain("GAME OVER")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(
      "https://hibol-minesweeper-api.chez-miette.xyz/api/infinite/submissions",
    )
    expect(options.method).toBe("POST")

    const body = JSON.parse(options.body)
    expect(Object.keys(body).sort()).toEqual(
      [
        "heartsCollected",
        "maxDistance",
        "minesTriggered",
        "playerId",
        "revealedCount",
        "robotsTriggered",
        "usedMachines",
        "username",
      ].sort(),
    )
    expect(body).toMatchObject({
      usedMachines: true,
      maxDistance: 123.4,
      revealedCount: 5000,
      minesTriggered: 20,
      heartsCollected: 4,
      robotsTriggered: 2,
    })
    expect(typeof body.playerId).toBe("string")
    expect(typeof body.username).toBe("string")

    answer({ ok: true, json: () => Promise.resolve({ accepted: true }) })
    await flushPromises()
  })

  it("un échec réseau est avalé silencieusement : le score reste acquis localement", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    )

    wrapper.vm.game.minesTriggeredCount = 20
    await wrapper.vm.$nextTick()

    const giveUpBtn = wrapper.find(".give-up")
    await giveUpBtn.trigger("click")
    await flushPromises() // laisse le catch de submitInfiniteRun s'exécuter

    expect(wrapper.vm.game.status).toBe("lost")
    expect(wrapper.find(".win-banner").exists()).toBe(true)
  })
})

describe("App.vue — pseudo à choisir (dialogue « nouveau pseudo »)", () => {
  beforeEach(() => {
    usernamePrompted.value = true
    // Aucun appel réseau réel au boot (relecture du pseudo, files d'attente).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    )
  })

  afterEach(() => {
    usernamePrompted.value = false
    clearUsernameChoice()
  })

  it("partie en cours : pas de dialogue, il s'ouvre à la fin de la partie", async () => {
    await mountApp()
    await wrapper.find(".cell").trigger("click")
    expect(wrapper.vm.game.status).toBe("playing")
    expect(wrapper.vm.game.revealedCount).toBeGreaterThan(0)

    requireUsernameChoice("taken", "test")
    await flushPromises()
    expect(wrapper.find(".username-overlay").exists()).toBe(false)

    wrapper.vm.game.status = "lost"
    await flushPromises()
    expect(wrapper.find(".username-overlay").text()).toContain(
      '"test" is already taken online',
    )
  })

  it("au démarrage, sans partie commencée : dialogue tout de suite", async () => {
    requireUsernameChoice("account_gone", "test")

    await mountApp()

    expect(wrapper.find(".username-overlay").text()).toContain(
      "no longer exists",
    )
  })

  it("nom choisi : dialogue fermé, état effacé", async () => {
    requireUsernameChoice("taken", "test")
    await mountApp()
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ username: "nouveau" }),
        }),
      ),
    )

    await wrapper.find(".username-input").setValue("nouveau")
    await wrapper.find(".username-box .pixel-btn").trigger("click")
    await flushPromises()
    await wrapper.find(".username-box .pixel-btn").trigger("click") // OK
    await flushPromises()

    expect(usernameChoice.value).toBeNull()
    expect(wrapper.find(".username-overlay").exists()).toBe(false)
  })
})
