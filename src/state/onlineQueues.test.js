import { describe, it, expect, vi, beforeEach } from "vitest"
import { retryOnlineQueues } from "./onlineQueues"
import { retryPendingLegacySubmissions } from "./legacyOnline"
import {
  retryClaimThenRefreshUsername,
  retryPendingIdentityMerges,
} from "./accountOnline"
import { retryPendingInfiniteRuns } from "./infiniteOnline"

vi.mock("./legacyOnline", () => ({ retryPendingLegacySubmissions: vi.fn() }))
vi.mock("./infiniteOnline", () => ({ retryPendingInfiniteRuns: vi.fn() }))
vi.mock("./accountOnline", () => ({
  retryClaimThenRefreshUsername: vi.fn(),
  retryPendingIdentityMerges: vi.fn(),
}))

const steps = [
  retryClaimThenRefreshUsername,
  retryPendingIdentityMerges,
  retryPendingLegacySubmissions,
  retryPendingInfiniteRuns,
]

beforeEach(() => {
  for (const step of steps) {
    step.mockReset()
    step.mockResolvedValue()
  }
})

describe("retryOnlineQueues", () => {
  it("lance les quatre files dans l'ordre, chacune une fois", async () => {
    const order = []
    steps.forEach((step, i) =>
      step.mockImplementation(async () => order.push(i)),
    )

    await retryOnlineQueues()

    expect(order).toEqual([0, 1, 2, 3])
  })

  it("attend la fin d'une file avant de lancer la suivante", async () => {
    let finishClaim
    retryClaimThenRefreshUsername.mockReturnValue(
      new Promise((resolve) => {
        finishClaim = resolve
      }),
    )

    const done = retryOnlineQueues()
    await Promise.resolve()
    expect(retryPendingIdentityMerges).not.toHaveBeenCalled()

    finishClaim()
    await done

    expect(retryPendingIdentityMerges).toHaveBeenCalledOnce()
    expect(retryPendingInfiniteRuns).toHaveBeenCalledOnce()
  })
})

describe("retryOnlineQueues — appels qui se chevauchent", () => {
  it("un appel pendant un passage ne lance pas une 2e file en parallèle", async () => {
    let finishClaim
    retryClaimThenRefreshUsername.mockReturnValueOnce(
      new Promise((resolve) => {
        finishClaim = resolve
      }),
    )

    const first = retryOnlineQueues()
    const second = retryOnlineQueues()
    await Promise.resolve()
    expect(retryClaimThenRefreshUsername).toHaveBeenCalledOnce()

    finishClaim()
    await Promise.all([first, second])
  })

  it("l'appel tardif obtient un 2e passage, après le 1er (état changé entre-temps)", async () => {
    let finishLegacy
    retryPendingLegacySubmissions.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLegacy = resolve
      }),
    )

    const first = retryOnlineQueues()
    await vi.waitFor(() =>
      expect(retryPendingLegacySubmissions).toHaveBeenCalledOnce(),
    )
    const second = retryOnlineQueues()
    expect(retryClaimThenRefreshUsername).toHaveBeenCalledOnce()

    finishLegacy()
    await Promise.all([first, second])

    expect(retryClaimThenRefreshUsername).toHaveBeenCalledTimes(2)
    expect(retryPendingInfiniteRuns).toHaveBeenCalledTimes(2)
  })

  it("plusieurs appels pendant un passage : un seul passage de rattrapage", async () => {
    let finishClaim
    retryClaimThenRefreshUsername.mockReturnValueOnce(
      new Promise((resolve) => {
        finishClaim = resolve
      }),
    )

    const calls = [
      retryOnlineQueues(),
      retryOnlineQueues(),
      retryOnlineQueues(),
    ]
    finishClaim()
    await Promise.all(calls)

    expect(retryClaimThenRefreshUsername).toHaveBeenCalledTimes(2)
  })

  it("après la fin d'un passage, le suivant repart normalement, même après une erreur", async () => {
    retryPendingLegacySubmissions.mockRejectedValueOnce(new Error("boom"))
    await expect(retryOnlineQueues()).rejects.toThrow("boom")

    await retryOnlineQueues()

    expect(retryClaimThenRefreshUsername).toHaveBeenCalledTimes(2)
    expect(retryPendingInfiniteRuns).toHaveBeenCalledOnce()
  })
})
