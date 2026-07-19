const TOP_RUNS_KEY = "hibol-minesweeper:infinite-top-runs"
const MAX_RUNS = 10

export function loadTopRuns() {
  try {
    return JSON.parse(localStorage.getItem(TOP_RUNS_KEY)) ?? []
  } catch {
    return []
  }
}

// Enregistre une run de fin de partie infinie (après un "give up") dans le
// top personnel, trié par cases révélées (le seul vrai score en infini, cf.
// ROADMAP). Renvoie le rang 1-indexé obtenu si la run entre dans le top,
// sinon null.
export function recordRun(run) {
  const runs = loadTopRuns()
  runs.push(run)
  runs.sort((a, b) => b.revealedCount - a.revealedCount)
  runs.length = Math.min(runs.length, MAX_RUNS)

  localStorage.setItem(TOP_RUNS_KEY, JSON.stringify(runs))

  const rank = runs.indexOf(run)
  return { runs, rank: rank === -1 ? null : rank + 1 }
}
