// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest"
import { mount, enableAutoUnmount } from "@vue/test-utils"
import AchievementsPage from "./AchievementsPage.vue"
import { ACHIEVEMENTS, unlockedAchievements } from "../../state/achievements"
import { inventory } from "../../state/shop"

const initialInventory = { ...inventory.value }
const traveler = ACHIEVEMENTS.find((a) => a.id === "traveler")
const legacyCount = ACHIEVEMENTS.filter((a) => a.gate === "legacy").length

enableAutoUnmount(afterEach)

afterEach(() => {
  unlockedAchievements.value = {}
  inventory.value = { ...initialInventory }
  localStorage.clear()
})

describe("AchievementsPage", () => {
  it("débloqué : titre, description et date ; verrouillé : ???", () => {
    unlockedAchievements.value = { traveler: Date.now() }
    const wrapper = mount(AchievementsPage)

    const rows = wrapper.findAll(".achievement-row")
    const unlocked = rows.find((row) => row.text().includes(traveler.title))
    expect(unlocked.text()).toContain(traveler.description)
    expect(unlocked.attributes("role")).toBeUndefined()
    expect(rows.filter((row) => row.text().includes("???")).length).toBe(
      rows.length - 1,
    )
  })

  it("tap sur une ligne verrouillée : l'indice remplace ???, re-tap referme", async () => {
    const wrapper = mount(AchievementsPage)
    const row = wrapper.findAll(".achievement-row")[0]

    await row.trigger("click")
    expect(row.text()).toContain(traveler.hint)

    await row.trigger("click")
    expect(row.text()).toContain("???")
  })

  it("un seul indice ouvert à la fois, aussi au clavier", async () => {
    const wrapper = mount(AchievementsPage)
    const [first, second] = wrapper.findAll(".achievement-row")

    await first.trigger("keydown", { key: "Enter" })
    await second.trigger("keydown", { key: " " })

    expect(first.text()).toContain("???")
    expect(second.find(".achievement-hint").exists()).toBe(true)
  })

  it("succès du Legacy masqués tant que le mode n'est pas acheté", () => {
    const count = () =>
      mount(AchievementsPage).findAll(".achievement-row").length

    const withoutLegacy = count()
    inventory.value = { ...inventory.value, legacyMode: 1 }

    expect(count()).toBe(withoutLegacy + legacyCount)
  })
})
