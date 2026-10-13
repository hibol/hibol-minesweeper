import { ref } from "vue"
import { hashSeed } from "../rng"
import { writeItem, writeJson } from "./storageWrite"

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

// Deterministic seed shared by every player that day. Hashed: raw day keys
// are consecutive, so neighbouring days would share board streams.
export function treasureDaySeed(date = new Date()) {
  return hashSeed(Number(treasureDayKey(date)))
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
  // Échec d'écriture : le joueur est prévenu, la run elle-même n'est pas affectée.
  writeJson(dayStorageKey(dayKey), snapshot)
}

export function clearTreasureGame(dayKey) {
  try {
    localStorage.removeItem(dayStorageKey(dayKey))
  } catch {
    // idem
  }
}

// Une chasse entamée (1er coup joué) et jamais terminée.
function isAbandoned(key) {
  try {
    const snap = JSON.parse(localStorage.getItem(key))
    return snap?.status === "playing" && !!snap.engaged
  } catch {
    return false
  }
}

// Only today's slot is ever resumable — drop any other day's leftover.
// Renvoie true si l'un d'eux était une chasse entamée et abandonnée.
export function purgeOldTreasureDays() {
  const keep = dayStorageKey(treasureDayKey())
  let abandoned = false
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(DAY_PREFIX) && key !== keep) {
        abandoned ||= isAbandoned(key)
        localStorage.removeItem(key)
      }
    }
  } catch {
    // idem
  }
  return abandoned
}

function loadBalance() {
  const n = Number(localStorage.getItem(BALANCE_KEY))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

// Persistent across days: hibols found, chest rewards, spent at the shop.
export const hibolBalance = ref(loadBalance())

export function addHibols(amount = 1) {
  hibolBalance.value += amount
  writeItem(BALANCE_KEY, String(hibolBalance.value))
}

// Symmetric counterpart, spent at the shop (shop.js buy()). Never goes below
// 0 — buy() has already checked the balance, this is just a belt-and-braces.
export function spendHibols(amount = 1) {
  hibolBalance.value = Math.max(0, hibolBalance.value - amount)
  writeItem(BALANCE_KEY, String(hibolBalance.value))
}
