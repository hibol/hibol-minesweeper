// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { flushPromises } from "@vue/test-utils"
import { username, usernamePrompted } from "./state/username"
import {
  usernameChoice,
  requireUsernameChoice,
  clearUsernameChoice,
} from "./state/usernameChoice"
import { useAppHarness, K, wrapper, mountApp } from "../test/appHarness"
import { createInfiniteGame } from "./game/game"
import { saveActiveGame } from "./state/gameStorage"
import { clearPendingInfiniteRuns } from "./state/infinitePendingSubmissions"

// Intégration d'App.vue : envois en ligne (Give Up Infini) et dialogue de pseudo.

useAppHarness()

describe("App.vue — Give Up (Infini) soumet la run au classement en ligne", () => {
  it("envoie le payload exact au nouvel endpoint sans jamais retarder la bannière de fin de run", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    // Monté avant le stub voulu : le démarrage tombe sur le fetch coupé par
    // défaut (cf. test/setup.js), pas sur le mock dont on compte les appels.
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

    wrapper.vm.game.minesTriggeredCount = 20 // >= seuil d'obscurité (8, cf. useModeSwitcher) : Give Up possible
    wrapper.vm.game.heartsCollectedCount = 4
    wrapper.vm.game.robotsTriggeredCount = 2
    wrapper.vm.game.maxDistance = 123.4
    // Sous le palier de push en cours de partie (5 000 cases) : un seul appel.
    wrapper.vm.game.revealedCount = 4000
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
        "travelMachineUses",
        "usedMachines",
        "username",
        "windMachineUses",
        "xrayMachineUses",
      ].sort(),
    )
    expect(body).toMatchObject({
      usedMachines: true,
      maxDistance: 123.4,
      revealedCount: 4000,
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

    // Après le montage : le démarrage a déjà essuyé le fetch coupé par défaut.
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

describe("App.vue — score Infini poussé en cours de partie", () => {
  const SUBMIT_PATH = "/api/infinite/submissions"

  // Une partie Infini sauvegardée au-delà de l'ouverture automatique, reprise au
  // démarrage ; le faux serveur n'accepte que les soumissions.
  function saveInfiniteGame(revealedCount) {
    const game = createInfiniteGame(7)
    game.revealedCount = revealedCount
    game.maxDistance = 55.5
    game.usedMachines = true
    game.machineUses.windMachine = 2
    saveActiveGame(game, { originX: 0, originY: 0, cellSize: 20 })
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
  }

  function stubServer() {
    const fetchMock = vi.fn((url) =>
      url.includes(SUBMIT_PATH)
        ? Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                accepted: true,
                category: "assisted",
                maxDistance: 55.5,
                revealedCount: 900,
                improved: true,
              }),
          })
        : Promise.reject(new Error("offline")),
    )
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  const submissions = (fetchMock) =>
    fetchMock.mock.calls.filter(([url]) => url.includes(SUBMIT_PATH))

  beforeEach(() => {
    usernamePrompted.value = true
    // Singleton de module : la run mise en file par le test d'échec réseau
    // survit à localStorage.clear() et repartirait avant la reprise.
    clearPendingInfiniteRuns()
  })

  afterEach(() => {
    usernamePrompted.value = false
    username.value = ""
    clearUsernameChoice()
  })

  it("reprise au démarrage : la run sauvegardée part, sans toast ni Give Up", async () => {
    saveInfiniteGame(900)
    const fetchMock = stubServer()

    await mountApp()

    const [[, options]] = submissions(fetchMock)
    expect(JSON.parse(options.body)).toMatchObject({
      usedMachines: true,
      maxDistance: 55.5,
      revealedCount: 900,
      windMachineUses: 2,
      travelMachineUses: 0,
      xrayMachineUses: 0,
    })
    expect(wrapper.find(".toast").exists()).toBe(false)
  })

  it("rien de nouveau depuis : onglet masqué n'envoie rien ; avec progrès, envoi en keepalive", async () => {
    saveInfiniteGame(900)
    const fetchMock = stubServer()
    await mountApp()
    expect(submissions(fetchMock)).toHaveLength(1)

    const hide = () => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      })
      document.dispatchEvent(new Event("visibilitychange"))
    }

    hide()
    await flushPromises()
    expect(submissions(fetchMock)).toHaveLength(1)

    wrapper.vm.game.revealedCount = 1200
    hide()
    await flushPromises()

    const calls = submissions(fetchMock)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[1][1].body).revealedCount).toBe(1200)
    expect(calls[1][1].keepalive).toBe(true)
    delete document.visibilityState
  })

  it("fermeture de la page : visibilitychange puis pagehide n'envoient la run qu'une fois", async () => {
    saveInfiniteGame(900)
    // Serveur réaliste : renvoie en maxima ce qu'il vient de recevoir.
    const fetchMock = vi.fn((url, options) => {
      if (!url.includes(SUBMIT_PATH)) {
        return Promise.reject(new Error("offline"))
      }
      const { revealedCount, maxDistance } = JSON.parse(options.body)
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            accepted: true,
            category: "assisted",
            revealedCount,
            maxDistance,
            improved: true,
          }),
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    await mountApp()
    expect(submissions(fetchMock)).toHaveLength(1)

    wrapper.vm.game.revealedCount = 1200
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    })
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("pagehide"))
    await flushPromises()
    delete document.visibilityState

    const calls = submissions(fetchMock)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[1][1].body).revealedCount).toBe(1200)
  })

  it("franchir un palier de 5 000 cases pendant le jeu pousse la run", async () => {
    saveInfiniteGame(4900)
    const fetchMock = stubServer()
    await mountApp()
    expect(submissions(fetchMock)).toHaveLength(1)

    wrapper.vm.game.revealedCount = 5100
    await flushPromises()

    const calls = submissions(fetchMock)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[1][1].body).revealedCount).toBe(5100)
  })

  it("aucune partie Infini à reprendre : rien n'est envoyé au démarrage", async () => {
    const fetchMock = stubServer()

    await mountApp()

    expect(submissions(fetchMock)).toHaveLength(0)
  })

  it("pseudo pas encore choisi : la run reprise attend le dialogue, puis part sous le nom saisi", async () => {
    usernamePrompted.value = false
    saveInfiniteGame(900)
    const fetchMock = vi.fn((url) => {
      if (url.includes(SUBMIT_PATH)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ accepted: true, category: "assisted" }),
        })
      }
      return url.includes("/players/claim")
        ? Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ username: "chosen" }),
          })
        : Promise.reject(new Error("offline"))
    })
    vi.stubGlobal("fetch", fetchMock)

    await mountApp()

    expect(wrapper.find(".username-overlay").exists()).toBe(true)
    expect(submissions(fetchMock)).toHaveLength(0)

    await wrapper.find(".username-input").setValue("chosen")
    await wrapper.find(".username-box .pixel-btn").trigger("click")
    await flushPromises()
    await wrapper.find(".username-box .pixel-btn").trigger("click") // OK
    await flushPromises()

    const [[, options]] = submissions(fetchMock)
    expect(JSON.parse(options.body)).toMatchObject({
      username: "chosen",
      revealedCount: 900,
    })
    expect(username.value).toBe("chosen")
    expect(wrapper.find(".toast").exists()).toBe(false)
  })

  it("compte supprimé par l'admin : la relecture du pseudo passe avant, rien n'est envoyé", async () => {
    username.value = "Alice"
    saveInfiniteGame(900)
    const fetchMock = vi.fn((url) =>
      url.includes(SUBMIT_PATH) || url.includes("/players/claim")
        ? Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ accepted: true }),
          })
        : Promise.resolve({ ok: false, status: 404 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await mountApp()

    expect(submissions(fetchMock)).toHaveLength(0)
    expect(usernameChoice.value?.reason).toBe("account_gone")
    expect(wrapper.find(".username-overlay").text()).toContain(
      "no longer exists",
    )
  })
})
