// @vitest-environment jsdom
// BurgerMenu.vue importe plusieurs modules d'état qui lisent localStorage à
// l'import (shop.js, settings.js, achievements.js...) — jsdom requis, même
// raison que shop.test.js.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mount, flushPromises, enableAutoUnmount } from "@vue/test-utils"
import BurgerMenu from "./BurgerMenu.vue"
import { usernamePrompted } from "../state/username"
import { inventory } from "../state/shop"
import { legacyScores } from "../state/legacyScores"
import { longPressMs } from "../state/settings"
import { currentToast, clearToasts } from "../state/toastQueue"

// Getter : le drapeau est relu à chaque montage, basculé test par test.
let deviceLinking = false
vi.mock("../features", () => ({
  get DEVICE_LINKING() {
    return deviceLinking
  },
}))

const LEADERBOARD_BASE =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/infinite/leaderboard"

// Un menu resté ouvert garde son écouteur Échap sur window d'un test à
// l'autre : démonter chaque wrapper à la fin de son test.
enableAutoUnmount(afterEach)

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
  clearToasts()
})

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
}

// Entrée de classement en ligne complète (V4 côté serveur : maxDistance/
// revealedCount/mines/hearts/robots, plus la métrique triée `value`).
function onlineEntry(overrides) {
  return {
    username: "alice",
    value: 900.5,
    maxDistance: 900.5,
    revealedCount: 51200,
    minesTriggered: 2,
    heartsCollected: 0,
    robotsTriggered: 0,
    windMachineUses: 0,
    travelMachineUses: 0,
    xrayMachineUses: 0,
    submittedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

async function openInfiniteRuns(fetchMock, props = {}) {
  vi.stubGlobal("fetch", fetchMock)
  const wrapper = mount(BurgerMenu, {
    props: { infiniteUnlocked: true, ...props },
  })
  await wrapper.find(".menu-btn").trigger("click")
  const navItem = wrapper
    .findAll(".nav-item")
    .find((b) => b.text() === "INFINITE RUNS")
  await navItem.trigger("click")
  const onlineChip = wrapper
    .findAll(".sort-chip")
    .find((b) => b.text() === "Online")
  await onlineChip.trigger("click")
  await flushPromises()
  return wrapper
}

// Réponse du faux serveur selon la catégorie demandée.
function leaderboardByCategory({ clean = [], assisted = [] }) {
  return vi.fn((url) =>
    jsonResponse(url.includes("category=clean") ? clean : assisted),
  )
}

const chipLabels = (wrapper) =>
  wrapper.findAll(".sort-chip").map((chip) => chip.text())

async function clickChip(wrapper, label) {
  const chip = wrapper.findAll(".sort-chip").find((b) => b.text() === label)
  await chip.trigger("click")
  await flushPromises()
}

describe("BurgerMenu — INFINITE RUNS (online)", () => {
  it("charge Cells, tous les joueurs (clean + assisted fusionnés), rang = position, machines sur la ligne de date", async () => {
    const fetchMock = leaderboardByCategory({
      clean: [
        onlineEntry({ username: "bob", value: 30000, revealedCount: 30000 }),
      ],
      assisted: [
        onlineEntry({
          username: "alice",
          value: 51200,
          windMachineUses: 2,
          xrayMachineUses: 1,
        }),
      ],
    })

    const wrapper = await openInfiniteRuns(fetchMock)

    expect(fetchMock).toHaveBeenCalledWith(
      `${LEADERBOARD_BASE}?metric=cells&category=clean&limit=50`,
      { signal: expect.any(AbortSignal) },
    )
    expect(fetchMock).toHaveBeenCalledWith(
      `${LEADERBOARD_BASE}?metric=cells&category=assisted&limit=50`,
      { signal: expect.any(AbortSignal) },
    )

    const rows = wrapper.findAll(".run-row")
    expect(rows[0].text()).toContain("#1")
    expect(rows[0].text()).toContain("alice")
    expect(rows[0].find('[aria-label="Cells: 51200"]').exists()).toBe(true)
    expect(rows[0].find('[aria-label="Distance: 901"]').exists()).toBe(true)
    expect(rows[0].find('[aria-label="Mines: 2"]').exists()).toBe(true)
    expect(
      rows[0].find(".run-meta [aria-label='Wind Machine: 2']").exists(),
    ).toBe(true)
    expect(
      rows[0].find(".run-meta [aria-label='X-Ray Machine: 1']").exists(),
    ).toBe(true)
    expect(rows[0].find("[aria-label^='Travel Machine']").exists()).toBe(false)
    expect(rows[1].text()).toContain("#2")
    expect(rows[1].text()).toContain("bob")
    expect(rows[1].find(".run-machines").exists()).toBe(false)
  })

  it("mêmes puces de tri, limitées à Cells et Distance, sans flèche, plus le filtre", async () => {
    localStorage.setItem("hibol-minesweeper:infinite-top-runs", "[]")
    const wrapper = await openInfiniteRuns(leaderboardByCategory({}))

    expect(chipLabels(wrapper)).toEqual([
      "Local",
      "Online",
      "Cells",
      "Distance",
      "Without machines only",
    ])
    expect(wrapper.find(".sort-arrow").exists()).toBe(false)
    expect(wrapper.text()).not.toContain("Machines used")
  })

  it("chaque puce déclenche sa lecture : Distance relit les deux catégories, « Without machines only » seulement clean", async () => {
    const fetchMock = leaderboardByCategory({})
    const wrapper = await openInfiniteRuns(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(2) // Cells, clean + assisted

    await clickChip(wrapper, "Distance")
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock).toHaveBeenCalledWith(
      `${LEADERBOARD_BASE}?metric=distance&category=assisted&limit=50`,
      { signal: expect.any(AbortSignal) },
    )

    await clickChip(wrapper, "Without machines only")
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?metric=distance&category=clean&limit=50`,
      { signal: expect.any(AbortSignal) },
    )
    expect(
      wrapper
        .findAll(".sort-chip")
        .find((b) => b.text() === "Without machines only")
        .classes(),
    ).toContain("active")
  })

  it("échec réseau : état d'erreur affiché, jamais de crash", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    const wrapper = await openInfiniteRuns(fetchMock)

    expect(wrapper.text()).toContain("Couldn't load")
  })

  it("pousse la run en cours AVANT de lire le classement", async () => {
    const order = []
    const pushProgress = vi.fn(async () => {
      order.push("push")
    })
    const fetchMock = vi.fn(() => {
      order.push("fetch")
      return jsonResponse([])
    })

    await openInfiniteRuns(fetchMock, { pushProgress })

    expect(order[0]).toBe("push")
    expect(order.slice(1)).toEqual(["fetch", "fetch"])
  })

  it("push en échec : le classement s'affiche quand même", async () => {
    const pushProgress = vi.fn(() => Promise.reject(new Error("boom")))
    const fetchMock = leaderboardByCategory({ clean: [onlineEntry()] })

    const wrapper = await openInfiniteRuns(fetchMock, { pushProgress })

    expect(wrapper.find(".run-row").text()).toContain("alice")
  })

  it("push qui traîne : la lecture part au bout de 3 s, pas avant", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const pushProgress = vi.fn(() => new Promise(() => {}))
    const fetchMock = vi.fn(() => jsonResponse([]))
    vi.stubGlobal("fetch", fetchMock)

    const wrapper = mount(BurgerMenu, {
      props: { infiniteUnlocked: true, pushProgress },
    })
    await wrapper.find(".menu-btn").trigger("click")
    await wrapper
      .findAll(".nav-item")
      .find((b) => b.text() === "INFINITE RUNS")
      .trigger("click")
    await wrapper
      .findAll(".sort-chip")
      .find((b) => b.text() === "Online")
      .trigger("click")

    await vi.advanceTimersByTimeAsync(2900)
    expect(wrapper.text()).toContain("Loading")
    expect(fetchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("BurgerMenu — INFINITE RUNS (local)", () => {
  const RUN = {
    revealedCount: 51200,
    distance: 842,
    minesTriggeredCount: 3,
    heartsCollectedCount: 0,
    robotsTriggeredCount: 0,
    usedMachines: false,
    machineUses: { windMachine: 0, travelMachine: 0, xrayMachine: 0 },
    seed: 172837465,
    timestamp: 1735689600000,
  }

  async function openLocal(runs, props = {}) {
    localStorage.setItem(
      "hibol-minesweeper:infinite-top-runs",
      JSON.stringify(runs),
    )
    const fetchMock = vi.fn(() => jsonResponse([]))
    vi.stubGlobal("fetch", fetchMock)

    const wrapper = mount(BurgerMenu, {
      props: { infiniteUnlocked: true, ...props },
    })
    await wrapper.find(".menu-btn").trigger("click")
    await wrapper
      .findAll(".nav-item")
      .find((b) => b.text() === "INFINITE RUNS")
      .trigger("click")
    return { wrapper, fetchMock }
  }

  it("s'ouvre par défaut sur Local (top perso, aucun fetch réseau), seed non affichée", async () => {
    const { wrapper, fetchMock } = await openLocal([RUN])

    expect(fetchMock).not.toHaveBeenCalled()
    const row = wrapper.find(".run-row")
    expect(row.find('[aria-label="Cells: 51200"]').exists()).toBe(true)
    expect(row.find('[aria-label="Distance: 842"]').exists()).toBe(true)
    expect(row.text()).not.toContain("172837465")
    expect(row.text()).not.toContain("seed")
    expect(wrapper.text()).toContain("Long press to copy the seed")
  })

  it("garde tous les critères de tri locaux, avec leur flèche", async () => {
    const { wrapper } = await openLocal([RUN])

    expect(chipLabels(wrapper)).toEqual([
      "Local",
      "Online",
      "Cells ▼",
      "Distance",
      "Mines",
      "Without machines only",
    ])
  })

  it("machines utilisées : icône + nombre sur la ligne de la date", async () => {
    const { wrapper } = await openLocal([
      {
        ...RUN,
        usedMachines: true,
        machineUses: { windMachine: 1, travelMachine: 0, xrayMachine: 3 },
      },
    ])

    const meta = wrapper.find(".run-meta")
    expect(meta.find("[aria-label='Wind Machine: 1']").exists()).toBe(true)
    expect(meta.find("[aria-label='X-Ray Machine: 3']").exists()).toBe(true)
    expect(meta.find("[aria-label^='Travel Machine']").exists()).toBe(false)
  })

  it("« Without machines only » : écarte les runs assistées et celles d'avant le champ", async () => {
    const { wrapper } = await openLocal([
      { ...RUN, revealedCount: 300, timestamp: 1 },
      { ...RUN, revealedCount: 200, usedMachines: true, timestamp: 2 },
      { ...RUN, revealedCount: 100, usedMachines: undefined, timestamp: 3 },
    ])
    expect(wrapper.findAll(".run-row")).toHaveLength(3)

    await clickChip(wrapper, "Without machines only")

    const rows = wrapper.findAll(".run-row")
    expect(rows).toHaveLength(1)
    expect(rows[0].find('[aria-label="Cells: 300"]').exists()).toBe(true)
  })

  it("filtre sans résultat : message dédié, puces et indice restent cohérents", async () => {
    const { wrapper } = await openLocal([{ ...RUN, usedMachines: true }])

    await clickChip(wrapper, "Without machines only")

    expect(wrapper.find(".run-row").exists()).toBe(false)
    expect(wrapper.text()).toContain("No runs without machines")
    expect(wrapper.text()).not.toContain("Long press")
  })

  it("aucune run : « No runs yet », ni puces de tri ni indice", async () => {
    const { wrapper } = await openLocal([])

    expect(wrapper.text()).toContain("No runs yet")
    expect(chipLabels(wrapper)).toEqual(["Local", "Online"])
    expect(wrapper.text()).not.toContain("Long press")
  })

  it("appui long sur une ligne : seed copiée, toast « Seed copied »", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    const { wrapper } = await openLocal([RUN])
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })

    // jsdom n'a pas PointerEvent : un MouseEvent du même nom suffit à la ligne.
    wrapper.find(".run-content").element.dispatchEvent(
      new MouseEvent("pointerdown", {
        clientX: 5,
        clientY: 5,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(longPressMs.value - 1)
    expect(writeText).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2)
    expect(writeText).toHaveBeenCalledExactlyOnceWith("172837465")
    expect(currentToast.value.text).toBe("Seed copied")
  })

  it("copie impossible : toast d'échec", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.reject(new Error("denied")) },
    })
    const { wrapper } = await openLocal([RUN])

    await wrapper.find(".run-content").trigger("contextmenu")
    await flushPromises()

    expect(currentToast.value.text).toBe("Couldn't copy the seed")
  })

  it("une ligne en ligne n'est pas copiable (pas de seed serveur)", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    const wrapper = await openInfiniteRuns(
      leaderboardByCategory({ clean: [onlineEntry()] }),
    )

    await wrapper.find(".run-content").trigger("contextmenu")
    await flushPromises()

    expect(writeText).not.toHaveBeenCalled()
  })

  // Comme dans App.vue : v-model:open, le parent tient la valeur et ne la
  // renvoie qu'au rendu suivant. Le top local doit quand même être chargé.
  it("charge le top local quand le parent lie open par v-model", async () => {
    localStorage.setItem(
      "hibol-minesweeper:infinite-top-runs",
      JSON.stringify([
        {
          revealedCount: 9487,
          distance: 123,
          minesTriggeredCount: 110,
          seed: 1789118959268,
          timestamp: 1789156262015,
        },
      ]),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse([])),
    )

    const wrapper = mount(BurgerMenu, {
      props: {
        infiniteUnlocked: true,
        open: false,
        "onUpdate:open": (value) => wrapper.setProps({ open: value }),
      },
    })
    await wrapper.find(".menu-btn").trigger("click")
    const navItem = wrapper
      .findAll(".nav-item")
      .find((b) => b.text() === "INFINITE RUNS")
    await navItem.trigger("click")

    expect(wrapper.find('.run-row [aria-label="Cells: 9487"]').exists()).toBe(
      true,
    )
  })
})

describe("BurgerMenu — Échap / bouton retour Android", () => {
  const pressEscape = () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    )

  async function openMenuAt(label) {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse([])),
    )
    const wrapper = mount(BurgerMenu, {
      props: { infiniteUnlocked: true },
    })
    await wrapper.find(".menu-btn").trigger("click")
    if (label) {
      await wrapper
        .findAll(".nav-item")
        .find((b) => b.text() === label)
        .trigger("click")
    }
    return wrapper
  }

  it("remonte d'un niveau : page → menu → fermé, en consommant l'Échap", async () => {
    const wrapper = await openMenuAt("ABOUT")

    expect(pressEscape()).toBe(false)
    await flushPromises()
    expect(wrapper.find(".menu-overlay").exists()).toBe(true)
    expect(wrapper.find(".about-content").exists()).toBe(false)

    expect(pressEscape()).toBe(false)
    await flushPromises()
    expect(wrapper.find(".menu-overlay").exists()).toBe(false)

    // Menu fermé : l'Échap n'est plus consommé (l'APK passe en arrière-plan).
    expect(pressEscape()).toBe(true)
  })

  it("un ConfirmDialog ouvert dans le menu se ferme seul, la page reste", async () => {
    const wrapper = await openMenuAt("SETTINGS")
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Reset everything")
      .trigger("click")
    await flushPromises()
    expect(wrapper.find(".confirm-overlay").exists()).toBe(true)

    pressEscape()
    await flushPromises()
    expect(wrapper.find(".confirm-overlay").exists()).toBe(false)
    expect(wrapper.find(".menu-section-title").text()).toBe("SETTINGS")
  })
})

describe("BurgerMenu — Account : lier cet appareil", () => {
  beforeEach(() => {
    deviceLinking = true
  })

  afterEach(() => {
    deviceLinking = false
    usernamePrompted.value = false
  })

  async function openSettings() {
    const wrapper = mount(BurgerMenu, {
      props: { infiniteUnlocked: true },
    })
    await wrapper.find(".menu-btn").trigger("click")
    await wrapper
      .findAll(".nav-item")
      .find((b) => b.text() === "SETTINGS")
      .trigger("click")
    return wrapper
  }

  it("visible dès que le joueur a un pseudo, sans Legacy débloqué", async () => {
    usernamePrompted.value = true

    const wrapper = await openSettings()

    expect(wrapper.find(".account-link-form").exists()).toBe(true)
  })

  it("masquée tant que l'onboarding n'a pas eu lieu (pas d'identité)", async () => {
    const wrapper = await openSettings()

    expect(wrapper.find(".account-link-form").exists()).toBe(false)
  })

  it("drapeau désactivé : aucun pairage, même avec un pseudo", async () => {
    deviceLinking = false
    usernamePrompted.value = true

    const wrapper = await openSettings()

    expect(wrapper.find(".account-link-form").exists()).toBe(false)
    expect(wrapper.text()).not.toContain("Get a code")
    expect(wrapper.text()).not.toMatch(/link/i)
  })

  it("lien réussi : rattrape ensuite les temps Legacy du NOUVEAU playerId", async () => {
    usernamePrompted.value = true
    const fetchMock = vi.fn((url) =>
      url.endsWith("/players/link")
        ? jsonResponse({
            playerId: "linked-id",
            username: "linkeduser",
            reason: null,
          })
        : jsonResponse({ timeMs: null }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const wrapper = await openSettings()

    await wrapper.find(".account-link-form input").setValue("123456")
    await wrapper.find(".account-link-form").trigger("submit")
    await flushPromises()

    const bestUrls = fetchMock.mock.calls
      .map(([url]) => url)
      .filter((url) => url.includes("/best?"))
    expect(bestUrls).toHaveLength(3)
    expect(bestUrls.every((url) => url.includes("/players/linked-id/"))).toBe(
      true,
    )
    expect(wrapper.text()).toContain("you're now playing as linkeduser")
  })
})

describe("BurgerMenu — Reset everything", () => {
  afterEach(() => {
    usernamePrompted.value = false
  })

  async function openResetConfirm() {
    const wrapper = mount(BurgerMenu, {
      props: { infiniteUnlocked: true },
    })
    await wrapper.find(".menu-btn").trigger("click")
    await wrapper
      .findAll(".nav-item")
      .find((b) => b.text() === "SETTINGS")
      .trigger("click")
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Reset everything")
      .trigger("click")
    return wrapper
  }

  async function confirm(wrapper) {
    await wrapper
      .findAll(".confirm-box button")
      .find((b) => b.text() === "Reset")
      .trigger("click")
    await flushPromises()
  }

  it("par défaut : garde le compte en ligne, aucun appel serveur", async () => {
    usernamePrompted.value = true
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const wrapper = await openResetConfirm()

    await confirm(wrapper)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.emitted("reset-everything")).toEqual([
      [{ keepOnlineAccount: true }],
    ])
  })

  it("pas d'identité en ligne : pas de case à cocher", async () => {
    const wrapper = await openResetConfirm()

    expect(wrapper.find(".confirm-option").exists()).toBe(false)
  })

  it("suppression demandée mais serveur injoignable : rien n'est effacé, message", async () => {
    usernamePrompted.value = true
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    )
    const wrapper = await openResetConfirm()
    await wrapper.find(".confirm-option input").setValue(true)

    await confirm(wrapper)

    expect(wrapper.emitted("reset-everything")).toBeUndefined()
    expect(wrapper.find(".confirm-box").exists()).toBe(false)
    expect(wrapper.text()).toContain("nothing was reset")
  })

  // En dernier : la suppression réussie suspend les envois pour ce module.
  it("suppression demandée : DELETE d'abord, puis reset complet", async () => {
    usernamePrompted.value = true
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const wrapper = await openResetConfirm()
    await wrapper.find(".confirm-option input").setValue(true)

    await confirm(wrapper)

    expect(fetchMock.mock.calls[0][1]).toEqual({
      method: "DELETE",
      signal: expect.any(AbortSignal),
    })
    expect(wrapper.emitted("reset-everything")).toEqual([
      [{ keepOnlineAccount: false }],
    ])
  })
})

describe("BurgerMenu — Backup", () => {
  afterEach(() => {
    usernamePrompted.value = false
  })

  it("avec un compte en ligne : prévient que le fichier le contient", async () => {
    usernamePrompted.value = true
    const wrapper = mount(BurgerMenu, {
      props: { infiniteUnlocked: true },
    })
    await wrapper.find(".menu-btn").trigger("click")
    await wrapper
      .findAll(".nav-item")
      .find((b) => b.text() === "SETTINGS")
      .trigger("click")

    expect(wrapper.text()).toContain("holds your online account")
  })
})

describe("BurgerMenu — LEGACY TIMES", () => {
  afterEach(() => {
    delete inventory.value.legacyMode
    legacyScores.value = {}
  })

  async function navItems() {
    const wrapper = mount(BurgerMenu, { props: { infiniteUnlocked: false } })
    await wrapper.find(".menu-btn").trigger("click")
    return wrapper.findAll(".nav-item").map((b) => b.text())
  }

  it("caché sans Legacy acheté ni temps local", async () => {
    expect(await navItems()).not.toContain("LEGACY TIMES")
  })

  it("visible dès l'achat du Legacy, sans aucune victoire", async () => {
    inventory.value.legacyMode = 1

    expect(await navItems()).toContain("LEGACY TIMES")
  })

  it("visible avec un temps local, même sans achat", async () => {
    legacyScores.value = { beginner: [{ timeMs: 5000 }] }

    expect(await navItems()).toContain("LEGACY TIMES")
  })
})
