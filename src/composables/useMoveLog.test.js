import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { useMoveLog } from "./useMoveLog.js"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance"] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useMoveLog", () => {
  it("record : t=0 sur le 1er coup, relatif ensuite", () => {
    const log = useMoveLog()

    vi.advanceTimersByTime(1000)
    log.record("flag", { x: 2, y: 3 })
    vi.advanceTimersByTime(500)
    log.record("reveal", { x: 4, y: 5 })

    expect(log.moves.value).toEqual([
      { t: 0, type: "flag", x: 2, y: 3 },
      { t: 500, type: "reveal", x: 4, y: 5 },
    ])
  })

  it("le 1er coup peut être un flag ou un reveal, indifféremment", () => {
    const log = useMoveLog()

    log.record("reveal", { x: 0, y: 0 })

    expect(log.moves.value[0]).toEqual({ t: 0, type: "reveal", x: 0, y: 0 })
  })

  it("reset : vide le journal et réancre t=0 sur le prochain coup", () => {
    const log = useMoveLog()

    vi.advanceTimersByTime(2000)
    log.record("reveal", { x: 1, y: 1 })
    log.reset()

    expect(log.moves.value).toEqual([])

    vi.advanceTimersByTime(3000)
    log.record("flag", { x: 9, y: 9 })

    expect(log.moves.value).toEqual([{ t: 0, type: "flag", x: 9, y: 9 }])
  })
})
