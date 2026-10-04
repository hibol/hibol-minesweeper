import { ref } from "vue"

// One localStorage slot per day (local midnight rollover), keyed by AAAAMMJJ.
const DAY_PREFIX = "hibol-minesweeper:treasure-hunt:"
// Porte-monnaie de hibols. La clé garde son nom historique : la renommer
// casserait l'import d'une sauvegarde dans une version plus ancienne de l'app.
const BALANCE_KEY = "hibol-minesweeper:chest-reward"

export function treasureDayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
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

function loadBalance() {
  const n = Number(localStorage.getItem(BALANCE_KEY))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

// Persistent across days: hibols found, chest rewards, spent at the shop.
export const hibolBalance = ref(loadBalance())

export function addHibols(amount = 1) {
  hibolBalance.value += amount

  try {
    localStorage.setItem(BALANCE_KEY, String(hibolBalance.value))
  } catch {
    // idem
  }
}

// Symmetric counterpart, spent at the shop (shop.js buy()). Never goes below
// 0 — buy() has already checked the balance, this is just a belt-and-braces.
export function spendHibols(amount = 1) {
  hibolBalance.value = Math.max(0, hibolBalance.value - amount)

  try {
    localStorage.setItem(BALANCE_KEY, String(hibolBalance.value))
  } catch {
    // idem
  }
}
