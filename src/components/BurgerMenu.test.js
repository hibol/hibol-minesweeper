// @vitest-environment jsdom
// BurgerMenu.vue importe plusieurs modules d'état qui lisent localStorage à
// l'import (shop.js, settings.js, achievements.js...) — jsdom requis, même
// raison que shop.test.js.

import { describe, it, expect, afterEach, vi } from "vitest"
import { mount, flushPromises, enableAutoUnmount } from "@vue/test-utils"
import BurgerMenu from "./BurgerMenu.vue"
import { usernamePrompted } from "../state/username"

const LEADERBOARD_BASE =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/infinite/leaderboard"

// Un menu resté ouvert garde son écouteur Échap sur window d'un test à
// l'autre : démonter chaque wrapper à la fin de son test.
enableAutoUnmount(afterEach)

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
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
    submittedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

async function openInfiniteRuns(fetchMock) {
  vi.stubGlobal("fetch", fetchMock)
  const wrapper = mount(BurgerMenu, {
    props: { infiniteUnlocked: true, devUnlocked: false },
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

describe("BurgerMenu — INFINITE RUNS (online)", () => {
  it("charge distance/clean par défaut et affiche le rang comme position dans la liste", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse([
        onlineEntry({ username: "alice", value: 900.5, maxDistance: 900.5 }),
        onlineEntry({
          username: "bob",
          value: 500.1,
          maxDistance: 500.1,
          revealedCount: 30000,
          submittedAt: "2026-01-02T00:00:00Z",
        }),
      ]),
    )

    const wrapper = await openInfiniteRuns(fetchMock)

    expect(fetchMock).toHaveBeenCalledWith(
      `${LEADERBOARD_BASE}?metric=distance&category=clean&limit=50`,
    )

    const rows = wrapper.findAll(".run-row")
    expect(rows[0].text()).toContain("#1")
    expect(rows[0].text()).toContain("alice")
    expect(rows[0].text()).toContain("51200 cells")
    expect(rows[0].text()).toContain("901 distance")
    expect(rows[0].text()).toContain("2")
    expect(rows[1].text()).toContain("#2")
    expect(rows[1].text()).toContain("bob")
    expect(rows[1].text()).toContain("30000 cells")
  })

  it("les 4 combinaisons metric/category déclenchent chacune leur propre fetch", async () => {
    const fetchMock = vi.fn(() => jsonResponse([]))
    const wrapper = await openInfiniteRuns(fetchMock)

    async function clickChip(label) {
      const chip = wrapper.findAll(".sort-chip").find((b) => b.text() === label)
      await chip.trigger("click")
      await flushPromises()
    }

    await clickChip("Cells")
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?metric=cells&category=clean&limit=50`,
    )

    await clickChip("Yes")
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?metric=cells&category=assisted&limit=50`,
    )

    await clickChip("Distance")
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?metric=distance&category=assisted&limit=50`,
    )

    // 1 fetch initial en basculant sur Online (distance/clean) + les 3 clics
    // ci-dessus.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("échec réseau : état d'erreur affiché, jamais de crash", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    const wrapper = await openInfiniteRuns(fetchMock)

    expect(wrapper.text()).toContain("Couldn't load")
  })
})

describe("BurgerMenu — INFINITE RUNS (local)", () => {
  it("s'ouvre par défaut sur Local (top perso, aucun fetch réseau)", async () => {
    localStorage.setItem(
      "hibol-minesweeper:infinite-top-runs",
      JSON.stringify([
        {
          revealedCount: 51200,
          distance: 842,
          minesTriggeredCount: 3,
          heartsCollectedCount: 0,
          robotsTriggeredCount: 0,
          seed: 172837465,
          timestamp: 1735689600000,
        },
      ]),
    )
    const fetchMock = vi.fn(() => jsonResponse([]))
    vi.stubGlobal("fetch", fetchMock)

    const wrapper = mount(BurgerMenu, {
      props: { infiniteUnlocked: true, devUnlocked: false },
    })
    await wrapper.find(".menu-btn").trigger("click")
    const navItem = wrapper
      .findAll(".nav-item")
      .find((b) => b.text() === "INFINITE RUNS")
    await navItem.trigger("click")

    expect(fetchMock).not.toHaveBeenCalled()
    const row = wrapper.find(".run-row")
    expect(row.text()).toContain("51200 cells")
    expect(row.text()).toContain("842 distance")
    expect(row.text()).toContain("seed 172837465")
    // Seul le nombre est sélectionnable (tout le reste est user-select: none).
    expect(row.find(".copyable").text()).toBe("172837465")
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
      props: { infiniteUnlocked: true, devUnlocked: false },
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
  afterEach(() => {
    usernamePrompted.value = false
  })

  async function openSettings() {
    const wrapper = mount(BurgerMenu, {
      props: { infiniteUnlocked: true, devUnlocked: false },
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
      props: { infiniteUnlocked: true, devUnlocked: false },
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

    expect(fetchMock.mock.calls[0][1]).toEqual({ method: "DELETE" })
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
      props: { infiniteUnlocked: true, devUnlocked: false },
    })
    await wrapper.find(".menu-btn").trigger("click")
    await wrapper
      .findAll(".nav-item")
      .find((b) => b.text() === "SETTINGS")
      .trigger("click")

    expect(wrapper.text()).toContain("holds your online account")
  })
})
