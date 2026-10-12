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
