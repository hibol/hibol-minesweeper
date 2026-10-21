import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
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
      signal: expect.any(AbortSignal),
      headers: { "Content-Type": "application/json" },
      body: '{"a":1}',
    })
  })

  it("keepalive demandé : transmis à fetch ; absent sinon", async () => {
    const fetchMock = vi.fn(() => response(200))
    vi.stubGlobal("fetch", fetchMock)

    await postJson("/api/x", { a: 1 }, { keepalive: true })
    await postJson("/api/x", { a: 1 })

    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true)
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty("keepalive")
  })

  it("sans corps : POST nu", async () => {
    const fetchMock = vi.fn(() => response(200))
    vi.stubGlobal("fetch", fetchMock)

    await postJson("/api/x")

    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/x`, {
      method: "POST",
      signal: expect.any(AbortSignal),
    })
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

  it("getJson : fetch reçoit toujours un signal", async () => {
    const fetchMock = vi.fn(() => response(200, {}))
    vi.stubGlobal("fetch", fetchMock)

    await getJson("/api/x")

    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/x`, {
      signal: expect.any(AbortSignal),
    })
  })

  it("deleteRequest : DELETE, lève sur un non-2xx", async () => {
    const fetchMock = vi.fn(() => response(500))
    vi.stubGlobal("fetch", fetchMock)

    await expect(deleteRequest("/api/x")).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/x`, {
      method: "DELETE",
      signal: expect.any(AbortSignal),
    })
  })
})

describe("onlineApi — délai maximal et abandon", () => {
  // fetch qui ne répond jamais, sauf à l'annulation de son signal.
  function hangingFetch() {
    return vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          if (signal.aborted) {
            reject(signal.reason)
          }
          signal.addEventListener("abort", () => reject(signal.reason))
        }),
    )
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ["getJson", () => getJson("/api/x")],
    ["postJson", () => postJson("/api/x", {})],
    ["deleteRequest", () => deleteRequest("/api/x")],
  ])(
    "%s : un appel suspendu est abandonné au bout de 15 s",
    async (_n, call) => {
      vi.stubGlobal("fetch", hangingFetch())
      const outcome = call().then(
        () => "résolu",
        (error) => error.message,
      )

      await vi.advanceTimersByTimeAsync(14_999)
      await expect(Promise.race([outcome, "en cours"])).resolves.toBe(
        "en cours",
      )

      await vi.advanceTimersByTimeAsync(1)
      await expect(outcome).resolves.toBe("request timed out")
    },
  )

  it("un appel qui répond à temps n'est pas coupé après coup", async () => {
    const fetchMock = vi.fn(() => response(200, { ok: true }))
    vi.stubGlobal("fetch", fetchMock)

    await postJson("/api/x", {})
    await vi.advanceTimersByTimeAsync(60_000)

    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("le signal de l'appelant abandonne l'appel, avec sa raison", async () => {
    vi.stubGlobal("fetch", hangingFetch())
    const controller = new AbortController()
    const outcome = postJson("/api/x", {}, { signal: controller.signal })

    controller.abort(new Error("dialogue fermé"))

    await expect(outcome).rejects.toThrow("dialogue fermé")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("signal déjà annulé : l'appel échoue sans attendre", async () => {
    vi.stubGlobal("fetch", hangingFetch())

    await expect(
      getJson("/api/x", { signal: AbortSignal.abort(new Error("déjà")) }),
    ).rejects.toThrow("déjà")
  })
})
