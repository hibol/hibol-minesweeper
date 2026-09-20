import { ref } from "vue"
import { LEGACY_SCORE_DIFFICULTIES } from "./legacyScores"

// File d'attente des soumissions Legacy ratées faute de réseau (cf.
// temp/legacy-server-integration.md §6) : au plus UNE entrée par difficulté,
// le meilleur essai en échec — pas un historique de toutes les tentatives,
// seul le meilleur compte pour le classement (même esprit que le check
// GET /best dans legacyOnline.js).
const KEY = "hibol-minesweeper:legacy-pending-submissions"

function emptyBoard() {
  return { beginner: null, intermediate: null, expert: null }
}

function sanitizeEntry(raw) {
  if (
    !raw ||
    !Number.isFinite(raw.seed) ||
    !Number.isFinite(raw.localTimeMs) ||
    !Array.isArray(raw.moves)
  ) {
    return null
  }
  return { seed: raw.seed, localTimeMs: raw.localTimeMs, moves: raw.moves }
}

function loadBoard() {
  const board = emptyBoard()

  try {
    const stored = JSON.parse(localStorage.getItem(KEY))

    if (stored && typeof stored === "object") {
      for (const difficulty of LEGACY_SCORE_DIFFICULTIES) {
        board[difficulty] = sanitizeEntry(stored[difficulty])
      }
    }
  } catch {
    // corrompu / indisponible : on repart d'une file vide
  }

  return board
}

// Singleton réactif, même famille que legacyScores.js.
export const pendingLegacySubmissions = ref(loadBoard())

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(pendingLegacySubmissions.value))
  } catch {
    // plein / indisponible : la file en mémoire reste bonne pour la session
  }
}

// N'écrase l'entrée existante que si ce nouvel essai raté est meilleur (ou
// qu'il n'y en a pas encore) : un seul candidat gardé par difficulté.
export function savePendingSubmission(
  difficulty,
  { seed, moves, localTimeMs },
) {
  if (!LEGACY_SCORE_DIFFICULTIES.includes(difficulty)) {
    return
  }

  const current = pendingLegacySubmissions.value[difficulty]
  if (current && current.localTimeMs <= localTimeMs) {
    return
  }

  pendingLegacySubmissions.value = {
    ...pendingLegacySubmissions.value,
    [difficulty]: { seed, moves, localTimeMs },
  }
  persist()
}

// À appeler quand une run de `localTimeMs` reçoit une réponse définitive du
// serveur (acceptée, refusée, ou déjà couverte par le check GET /best) :
// l'entrée en attente n'a plus lieu d'être retentée si elle n'était pas
// STRICTEMENT meilleure que cette run résolue — sinon (candidat en attente
// encore meilleur, jamais testé) on la laisse pour une prochaine tentative.
export function resolvePendingSubmission(difficulty, localTimeMs) {
  const current = pendingLegacySubmissions.value[difficulty]
  if (!current || current.localTimeMs >= localTimeMs) {
    clearPendingSubmission(difficulty)
  }
}

export function clearPendingSubmission(difficulty) {
  if (!pendingLegacySubmissions.value[difficulty]) {
    return
  }

  pendingLegacySubmissions.value = {
    ...pendingLegacySubmissions.value,
    [difficulty]: null,
  }
  persist()
}
