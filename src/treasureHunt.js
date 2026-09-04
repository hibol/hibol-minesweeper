import { ref } from 'vue'

// One localStorage slot per day (local midnight rollover), keyed by AAAAMMJJ.
const DAY_PREFIX = 'hibol-minesweeper:treasure-hunt:'
const REWARD_KEY = 'hibol-minesweeper:chest-reward'

export function treasureDayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// The day key itself, as a number: deterministic seed shared by every player
// that day.
export function treasureDaySeed(date = new Date()) {
  return Number(treasureDayKey(date))
}

function dayStorageKey(dayKey) {
  return DAY_PREFIX + dayKey
}

export function loadTreasureGame(dayKey) {
  try {
    const raw = localStorage.getItem(dayStorageKey(dayKey))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveTreasureGame(dayKey, snapshot) {
  try {
    localStorage.setItem(dayStorageKey(dayKey), JSON.stringify(snapshot))
  } catch {
    // full/unavailable localStorage: the run itself isn't affected
  }
}

export function clearTreasureGame(dayKey) {
  try {
    localStorage.removeItem(dayStorageKey(dayKey))
  } catch {
    // idem
  }
}

// Only today's slot is ever resumable — drop any other day's leftover.
export function purgeOldTreasureDays() {
  const keep = dayStorageKey(treasureDayKey())
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(DAY_PREFIX) && key !== keep) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // idem
  }
}

function loadReward() {
  const n = Number(localStorage.getItem(REWARD_KEY))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

// Persistent across days, generic label ("chestReward") until there's
// something to spend it on.
export const chestReward = ref(loadReward())

export function addChestReward(amount = 1) {
  chestReward.value += amount

  try {
    localStorage.setItem(REWARD_KEY, String(chestReward.value))
  } catch {
    // idem
  }
}
