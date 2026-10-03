import { describe, it, expect, beforeEach, vi } from "vitest"
import { getJson, postJson, deleteRequest } from "./onlineApi.js"

const API = "https://hibol-minesweeper-api.chez-miette.xyz"

function response(status, body = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe("onlineApi — postJson", () => {
  it("envoie le corps en JSON et renvoie la réponse 2xx", async () => {
    const fetchMock = vi.fn(() => response(200, { accepted: true }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await postJson("/api/x", { a: 1 })

    expect(result).toEqual({ accepted: true })
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/x`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"a":1}',
    })
  })

  it("sans corps : POST nu", async () => {
    const fetchMock = vi.fn(() => response(200))
    vi.stubGlobal("fetch", fetchMock)

    await postJson("/api/x")

    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/x`, { method: "POST" })
  })

  it.each([400, 409])(
    "refus %i : renvoie le corps (reason) sans lever",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => response(status, { reason: "nope" })),
      )

      await expect(postJson("/api/x", {})).resolves.toEqual({ reason: "nope" })
    },
  )

  it.each([429, 500, 503])(
    "panne %i : lève même avec un corps JSON",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => response(status, { reason: "nope" })),
      )

      await expect(postJson("/api/x", {})).rejects.toMatchObject({ status })
    },
  )
})

describe("onlineApi — getJson / deleteRequest", () => {
  it("getJson lève sur un 400 (pas de refus métier en lecture)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response(400)),
    )

    await expect(getJson("/api/x")).rejects.toThrow()
  })

  it("getJson : signal transmis à fetch s'il est fourni, sinon URL seule", async () => {
    const fetchMock = vi.fn(() => response(200, {}))
    vi.stubGlobal("fetch", fetchMock)
    const { signal } = new AbortController()

    await getJson("/api/x", { signal })
    await getJson("/api/x")

    expect(fetchMock.mock.calls).toEqual([
      [`${API}/api/x`, { signal }],
      [`${API}/api/x`],
    ])
  })

  it("deleteRequest : DELETE, lève sur un non-2xx", async () => {
    const fetchMock = vi.fn(() => response(500))
    vi.stubGlobal("fetch", fetchMock)

    await expect(deleteRequest("/api/x")).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/x`, { method: "DELETE" })
  })
})
