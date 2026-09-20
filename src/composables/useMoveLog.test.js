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

  it("pause puis resume : le temps en pause n'apparaît pas dans le t du coup suivant", () => {
    const log = useMoveLog()

    log.record("reveal", { x: 0, y: 0 })
    vi.advanceTimersByTime(200)
    log.pause()
    vi.advanceTimersByTime(10000) // onglet masqué, aucun impact attendu sur t
    log.resume()
    vi.advanceTimersByTime(300)
    log.record("flag", { x: 1, y: 1 })

    expect(log.moves.value).toEqual([
      { t: 0, type: "reveal", x: 0, y: 0 },
      { t: 500, type: "flag", x: 1, y: 1 },
    ])
  })

  it("resume() est inerte tant qu'aucun coup n'a été joué", () => {
    const log = useMoveLog()

    log.resume() // aucun 1er coup pour l'instant : ne doit rien démarrer
    vi.advanceTimersByTime(1000)
    log.record("reveal", { x: 0, y: 0 })

    expect(log.moves.value).toEqual([{ t: 0, type: "reveal", x: 0, y: 0 }])
  })

  it("restore() après un reload simulé : reprend depuis le t accumulé, pas depuis 0", () => {
    const first = useMoveLog()
    first.record("flag", { x: 2, y: 2 })
    vi.advanceTimersByTime(400)
    first.record("reveal", { x: 3, y: 3 })
    first.pause()

    // Reload : nouvelle instance, restaurée avec les coups déjà persistés.
    const restored = useMoveLog()
    restored.restore(first.moves.value)
    vi.advanceTimersByTime(5000) // vide du reload lui-même : ne doit pas compter
    restored.resume()
    vi.advanceTimersByTime(100)
    restored.record("reveal", { x: 4, y: 4 })

    expect(restored.moves.value).toEqual([
      { t: 0, type: "flag", x: 2, y: 2 },
      { t: 400, type: "reveal", x: 3, y: 3 },
      { t: 500, type: "reveal", x: 4, y: 4 },
    ])
  })
})
