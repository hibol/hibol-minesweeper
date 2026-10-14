// Accès HTTP au serveur de classements (hibol-minesweeper-server), partagé par
// legacyOnline.js et infiniteOnline.js. Pas de convention VITE_... dans ce
// repo : URL en dur.
const API_BASE = "https://hibol-minesweeper-api.chez-miette.xyz"

// Refus définitifs du serveur : 400/409 avec `reason` dans le corps JSON. Tout
// autre échec (réseau, 5xx, 429...) est une panne et lève, même avec un corps
// JSON parseable : c'est elle seule qui justifie une file d'attente.
const REFUSAL_STATUSES = [400, 409]

// `status` permet à l'appelant de distinguer un 429 d'une vraie panne.
function failure(method, path, response) {
  const error = new Error(`${method} ${path} failed: ${response.status}`)
  error.status = response.status
  return error
}

// Délai maximal d'un appel. Sans lui, un appel suspendu sur le réseau garde le
// verrou de réclamation (accountOnline.js) jusqu'au délai du navigateur, et
// tous les envois attendent derrière.
const REQUEST_TIMEOUT_MS = 15000

// Exécute `run(signal)` avec un signal annulé après REQUEST_TIMEOUT_MS, ou dès
// que celui de l'appelant l'est. À la main plutôt que AbortSignal.any : absent
// des WebView anciennes, où l'appel échouerait en silence.
async function withTimeout(callerSignal, run) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error("request timed out")),
    REQUEST_TIMEOUT_MS,
  )
  const forward = () => controller.abort(callerSignal.reason)
  if (callerSignal?.aborted) {
    forward()
  } else {
    callerSignal?.addEventListener("abort", forward, { once: true })
  }

  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener("abort", forward)
  }
}

// Lève sur tout statut non-2xx, sur abandon via `signal` et sur délai dépassé.
export function getJson(path, { signal } = {}) {
  return withTimeout(signal, async (timedSignal) => {
    const response = await fetch(`${API_BASE}${path}`, { signal: timedSignal })

    if (!response.ok) {
      throw failure("GET", path, response)
    }

    return response.json()
  })
}

// Renvoie le corps d'une réponse 2xx ou d'un refus 400/409 (à distinguer via
// `reason`), lève sur une panne. `body` absent : POST sans corps.
export function postJson(path, body, { signal } = {}) {
  return withTimeout(signal, async (timedSignal) => {
    const options = { method: "POST", signal: timedSignal }
    if (body !== undefined) {
      options.headers = { "Content-Type": "application/json" }
      options.body = JSON.stringify(body)
    }

    const response = await fetch(`${API_BASE}${path}`, options)

    if (!response.ok && !REFUSAL_STATUSES.includes(response.status)) {
      throw failure("POST", path, response)
    }

    return response.json()
  })
}

// Lève sur tout statut non-2xx. Pas de corps attendu (204).
export function deleteRequest(path) {
  return withTimeout(undefined, async (timedSignal) => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      signal: timedSignal,
    })

    if (!response.ok) {
      throw failure("DELETE", path, response)
    }
  })
}
