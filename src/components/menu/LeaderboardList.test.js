// @vitest-environment jsdom

import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import LeaderboardList from "./LeaderboardList.vue"

const ROWS = [{ name: "alice" }, { name: "bob" }]

function mountList(props) {
  return mount(LeaderboardList, {
    props: {
      rows: [],
      padCount: 0,
      rowKey: (row) => row.name,
      errorMessage: "Couldn't load",
      ...props,
    },
    slots: {
      row: `<template #row="{ row, rank }"><div class="run-main">#{{ rank }} {{ row.name }}</div></template>`,
    },
  })
}

const visibleRows = (wrapper) =>
  wrapper.findAll(".run-row").filter((row) => !row.classes("run-row-pad"))

describe("LeaderboardList", () => {
  it("lignes réelles via le slot, rang 1-based, complétées par des lignes invisibles", () => {
    const wrapper = mountList({ rows: ROWS, padCount: 5 })

    const rows = wrapper.findAll(".run-row")
    expect(rows).toHaveLength(5)
    expect(rows[0].text()).toBe("#1 alice")
    expect(rows[1].text()).toBe("#2 bob")
    expect(visibleRows(wrapper)).toHaveLength(2)
  })

  it("chargement : l'état prend la 1re ligne, les autres restent réservées", () => {
    const wrapper = mountList({ rows: ROWS, status: "loading", padCount: 3 })

    expect(wrapper.findAll(".run-row")).toHaveLength(3)
    expect(visibleRows(wrapper)).toHaveLength(1)
    expect(visibleRows(wrapper)[0].text()).toContain("Loading…")
    // Ancienne liste masquée pendant le chargement.
    expect(wrapper.text()).not.toContain("alice")
  })

  it("erreur : message passé en prop sur la 1re ligne", () => {
    const wrapper = mountList({ status: "error", padCount: 3 })

    expect(visibleRows(wrapper)[0].text()).toContain("Couldn't load")
  })

  it("liste chargée mais vide : « No times yet » sur la 1re ligne", () => {
    const wrapper = mountList({ rows: [], padCount: 4 })

    expect(visibleRows(wrapper)).toHaveLength(1)
    expect(visibleRows(wrapper)[0].text()).toContain("No times yet")
  })

  it("rien à réserver : un simple message, pas de liste", () => {
    expect(mountList({ status: "loading" }).text()).toBe("Loading…")
    expect(mountList({ status: "error" }).text()).toBe("Couldn't load")
    expect(mountList({}).text()).toBe("No times yet")
    expect(mountList({}).find(".run-list").exists()).toBe(false)
  })
})
