import { ref } from 'vue'
import { treasureDayKey } from './treasureHunt'

// Log of resolved treasure-hunt days + streak. One entry per day, newest
// first, capped like runHistory.js's top runs.
const LOG_KEY = 'hibol-minesweeper:treasure-log'
const MAX_ENTRIES = 60

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY))
    return {
      entries: parsed?.entries ?? [],
      currentStreak: parsed?.currentStreak ?? 0,
      bestStreak: parsed?.bestStreak ?? 0,
      lastResolvedDayKey: parsed?.lastResolvedDayKey ?? null
    }
  } catch {
    return { entries: [], currentStreak: 0, bestStreak: 0, lastResolvedDayKey: null }
  }
}

const state = load()

// Reactive singletons (same pattern as chestReward) so BurgerMenu.vue reads
// live values without reloading from storage on open.
export const treasureEntries = ref(state.entries)
export const currentStreak = ref(state.currentStreak)
export const bestStreak = ref(state.bestStreak)

function persist() {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify({
      entries: treasureEntries.value,
      currentStreak: currentStreak.value,
      bestStreak: bestStreak.value,
      lastResolvedDayKey: state.lastResolvedDayKey
    }))
  } catch {
    // full/unavailable localStorage: nothing else to do
  }
}

function previousDayKey(dayKey) {
  const y = Number(dayKey.slice(0, 4))
  const m = Number(dayKey.slice(4, 6)) - 1
  const d = Number(dayKey.slice(6, 8))
  const date = new Date(y, m, d)
  date.setDate(date.getDate() - 1)
  return treasureDayKey(date)
}

// entry: { dayKey, seed, outcome: 'won' | 'lost', minesHit, timeMs, reward,
// tornadoes, maxDistance }.
export function recordTreasureDay(entry) {
  treasureEntries.value = [entry, ...treasureEntries.value].slice(0, MAX_ENTRIES)

  if (entry.outcome === 'won' && state.lastResolvedDayKey === previousDayKey(entry.dayKey)) {
    currentStreak.value++
  } else if (entry.outcome === 'won') {
    currentStreak.value = 1
  } else {
    currentStreak.value = 0
  }

  bestStreak.value = Math.max(bestStreak.value, currentStreak.value)
  state.lastResolvedDayKey = entry.dayKey
  persist()
}

// A skipped day breaks the streak even without playing — call once at boot.
export function checkStreakGap() {
  const today = treasureDayKey()
  const last = state.lastResolvedDayKey

  if (last && last !== today && last !== previousDayKey(today) && currentStreak.value !== 0) {
    currentStreak.value = 0
    persist()
  }
}
