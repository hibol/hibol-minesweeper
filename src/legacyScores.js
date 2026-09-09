import { ref } from 'vue'
import { username } from './username'

// Table des meilleurs temps du mode Legacy, une liste par difficulté (même
// famille que runHistory.js / treasureLog.js). Triées par temps croissant,
// capées — le classement d'un démineur speed-run.
const KEY = 'hibol-minesweeper:legacy-best-times'
const MAX_PER_DIFFICULTY = 10
export const LEGACY_SCORE_DIFFICULTIES = ['beginner', 'intermediate', 'expert']

function emptyBoard() {
  return { beginner: [], intermediate: [], expert: [] }
}

function sanitizeList(raw) {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter((e) => e && Number.isFinite(e.timeMs))
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, MAX_PER_DIFFICULTY)
}

function loadBoard() {
  const board = emptyBoard()

  try {
    const stored = JSON.parse(localStorage.getItem(KEY))

    if (stored && typeof stored === 'object') {
      for (const difficulty of LEGACY_SCORE_DIFFICULTIES) {
        board[difficulty] = sanitizeList(stored[difficulty])
      }
    }
  } catch {
    // corrompu / indisponible : on repart d'une table vide
  }

  return board
}

// Singleton réactif : la page LEGACY TIMES du menu s'y abonne et se met à jour
// dès qu'une victoire est enregistrée.
export const legacyScores = ref(loadBoard())

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(legacyScores.value))
  } catch {
    // plein / indisponible : la table en mémoire reste bonne pour la session
  }
}

export function hasAnyLegacyScore() {
  return LEGACY_SCORE_DIFFICULTIES.some(
    (difficulty) => (legacyScores.value[difficulty] ?? []).length > 0
  )
}

// Enregistre une victoire. `timeMs` est le temps brut (l'affichage arrondit).
// Renvoie { rank } : le rang 1-indexé si le temps entre dans le top de sa
// difficulté, sinon null.
export function recordLegacyWin(difficulty, timeMs) {
  if (!LEGACY_SCORE_DIFFICULTIES.includes(difficulty) || !Number.isFinite(timeMs)) {
    return { rank: null }
  }

  const entry = {
    timeMs,
    name: username.value || null,
    timestamp: Date.now()
  }

  const list = [...(legacyScores.value[difficulty] ?? []), entry]
  list.sort((a, b) => a.timeMs - b.timeMs)
  list.length = Math.min(list.length, MAX_PER_DIFFICULTY)

  // Nouvel objet racine : remplace le ref pour que les computed/`v-for` qui en
  // dérivent se recalculent (une mutation en place ne suffirait pas partout).
  legacyScores.value = { ...legacyScores.value, [difficulty]: list }
  persist()

  const index = list.indexOf(entry)
  return { rank: index === -1 ? null : index + 1 }
}
