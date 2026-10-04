// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest"
import { mount, enableAutoUnmount } from "@vue/test-utils"
import ShopPage from "./ShopPage.vue"
import { hibolBalance } from "../../state/treasureHunt"
import { inventory } from "../../state/shop"
import { equippedMineSkin } from "../../state/cosmetics"

const initialInventory = { ...inventory.value }

enableAutoUnmount(afterEach)

afterEach(() => {
  hibolBalance.value = 0
  inventory.value = { ...initialInventory }
  equippedMineSkin.value = "default"
  localStorage.clear()
})

const rowOf = (wrapper, name) =>
  wrapper.findAll(".shop-row").find((row) => row.text().includes(name))

const chip = (wrapper, label) =>
  wrapper.findAll(".sort-chip").find((b) => b.text() === label)

describe("ShopPage", () => {
  it("achat d'une machine : solde débité, stock affiché", async () => {
    hibolBalance.value = 50
    const wrapper = mount(ShopPage)

    await rowOf(wrapper, "Wind Machine").find(".shop-buy").trigger("click")

    expect(inventory.value.windMachine).toBe(1)
    expect(hibolBalance.value).toBeLessThan(50)
    expect(rowOf(wrapper, "Wind Machine").text()).toContain("x1")
  })

  it("solde insuffisant : bouton Buy désactivé", () => {
    hibolBalance.value = 0
    const wrapper = mount(ShopPage)

    expect(
      rowOf(wrapper, "Wind Machine").find(".shop-buy").attributes("disabled"),
    ).toBeDefined()
  })

  it("mode déjà acheté : Owned, plus rachetable", async () => {
    inventory.value = { ...inventory.value, legacyMode: 1 }
    const wrapper = mount(ShopPage)

    await chip(wrapper, "Modes").trigger("click")

    const button = rowOf(wrapper, "Legacy Mode").find(".shop-buy")
    expect(button.text()).toBe("Owned")
    expect(button.attributes("disabled")).toBeDefined()
  })

  it("skin acheté : équipé d'office, l'ancien redevient équipable", async () => {
    hibolBalance.value = 10
    const wrapper = mount(ShopPage)
    await chip(wrapper, "Customisation").trigger("click")

    await rowOf(wrapper, "Dynamite").find(".shop-buy").trigger("click")

    expect(equippedMineSkin.value).toBe("mineDynamite")
    expect(rowOf(wrapper, "Dynamite").find(".shop-buy").text()).toBe("Equipped")

    await rowOf(wrapper, "Classic").find(".shop-buy").trigger("click")
    expect(equippedMineSkin.value).toBe("default")
  })
})
