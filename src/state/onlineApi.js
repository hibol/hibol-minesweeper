// Accès HTTP au serveur de classements (hibol-minesweeper-server), partagé par
// legacyOnline.js et infiniteOnline.js. Pas de convention VITE_... dans ce
// repo : URL en dur.
const API_BASE = "https://hibol-minesweeper-api.chez-miette.xyz"

// Refus définitifs du serveur : 400/409 avec `reason` dans le corps JSON. Tout
// autre échec (réseau, 5xx, 429...) est une panne et lève, même avec un corps
// JSON parseable : c'est elle seule qui justifie une file d'attente.
const REFUSAL_STATUSES = [400, 409]

function failure(method, path, response) {
  return new Error(`${method} ${path} failed: ${response.status}`)
}

// Lève sur tout statut non-2xx.
export async function getJson(path) {
  const response = await fetch(`${API_BASE}${path}`)

  if (!response.ok) {
    throw failure("GET", path, response)
  }

  return response.json()
}

// Renvoie le corps d'une réponse 2xx ou d'un refus 400/409 (à distinguer via
// `reason`), lève sur une panne. `body` absent : POST sans corps.
export async function postJson(path, body, { signal } = {}) {
  const options = { method: "POST" }
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" }
    options.body = JSON.stringify(body)
  }
  if (signal) {
    options.signal = signal
  }

  const response = await fetch(`${API_BASE}${path}`, options)

  if (!response.ok && !REFUSAL_STATUSES.includes(response.status)) {
    throw failure("POST", path, response)
  }

  return response.json()
}

// Lève sur tout statut non-2xx. Pas de corps attendu (204).
export async function deleteRequest(path) {
  const response = await fetch(`${API_BASE}${path}`, { method: "DELETE" })

  if (!response.ok) {
    throw failure("DELETE", path, response)
  }
}
