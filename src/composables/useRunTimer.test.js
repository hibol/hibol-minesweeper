import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useRunTimer } from './useRunTimer.js'

// useRunTimer s'appuie sur performance.now() ET setInterval. Le default de
// vi.useFakeTimers ne fake PAS performance → on l'ajoute explicitement à
// `toFake`, sinon elapsedMs lirait l'horloge réelle.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useRunTimer', () => {
  it('start → pause → resume : accumule le temps des périodes actives', () => {
    const t = useRunTimer()
    expect(t.elapsedMs.value).toBe(0)

    t.start()
    vi.advanceTimersByTime(1000)
    expect(t.elapsedMs.value).toBe(1000)

    t.pause()
    vi.advanceTimersByTime(5000) // gelé pendant la pause
    expect(t.elapsedMs.value).toBe(1000)

    t.resume()
    vi.advanceTimersByTime(500)
    expect(t.elapsedMs.value).toBe(1500)
  })

  it('restore(elapsed, alreadyStarted=true) : repart en pause au temps donné, resume() le relance', () => {
    const t = useRunTimer()

    t.restore(3000, true)
    expect(t.elapsedMs.value).toBe(3000) // en pause

    t.resume()
    vi.advanceTimersByTime(1000)
    expect(t.elapsedMs.value).toBe(4000)
  })

  it('restore(elapsed, alreadyStarted=false) : resume() reste inerte jusqu’au premier start()', () => {
    const t = useRunTimer()

    t.restore(2000, false)
    t.resume() // inerte : le 1er coup n'a pas encore été joué
    vi.advanceTimersByTime(1000)
    expect(t.elapsedMs.value).toBe(2000)

    t.start()
    vi.advanceTimersByTime(1000)
    expect(t.elapsedMs.value).toBe(3000)
  })

  it('reset : remet à 0 et repasse "jamais lancé"', () => {
    const t = useRunTimer()
    t.start()
    vi.advanceTimersByTime(2000)

    t.reset()
    expect(t.elapsedMs.value).toBe(0)

    t.resume() // inerte après reset
    vi.advanceTimersByTime(1000)
    expect(t.elapsedMs.value).toBe(0)
  })
})
