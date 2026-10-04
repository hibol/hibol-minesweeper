// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest"
import { mount, flushPromises, enableAutoUnmount } from "@vue/test-utils"
import AboutPage from "./AboutPage.vue"
import { usernamePrompted } from "../../state/username"

enableAutoUnmount(afterEach)

afterEach(() => {
  usernamePrompted.value = false
  vi.unstubAllGlobals()
  localStorage.clear()
})

const deleteButton = (wrapper) =>
  wrapper.findAll("button").find((b) => b.text() === "Delete online data")

async function confirmDelete(wrapper) {
  await deleteButton(wrapper).trigger("click")
  await wrapper
    .findAll(".confirm-box button")
    .find((b) => b.text() === "Delete")
    .trigger("click")
  await flushPromises()
}

describe("AboutPage — suppression des données en ligne", () => {
  it("pas d'identité en ligne : pas de bouton", () => {
    expect(deleteButton(mount(AboutPage))).toBeUndefined()
  })

  it("serveur injoignable : message, le bouton reste pour réessayer", async () => {
    usernamePrompted.value = true
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    )
    const wrapper = mount(AboutPage)

    await confirmDelete(wrapper)

    expect(wrapper.find(".settings-error").text()).toContain(
      "Couldn't reach the server",
    )
    expect(deleteButton(wrapper)).toBeDefined()
  })

  // En dernier : la suppression réussie suspend les envois pour ce module.
  it("supprimé : DELETE envoyé, confirmation affichée, bouton retiré", async () => {
    usernamePrompted.value = true
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const wrapper = mount(AboutPage)

    await confirmDelete(wrapper)

    expect(fetchMock.mock.calls[0][1]).toEqual({ method: "DELETE" })
    expect(wrapper.text()).toContain("Your online data was deleted.")
    expect(deleteButton(wrapper)).toBeUndefined()
  })
})
