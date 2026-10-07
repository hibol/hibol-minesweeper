import { onScopeDispose, ref } from "vue"

// Drapeau qui retombe seul `durationMs` après trigger() ; un nouveau trigger()
// repart de zéro. Sert aux messages éphémères (ex. « verrouillé »).
export function useTimedFlag(durationMs) {
  const active = ref(false)
  let timeout = null

  function trigger() {
    active.value = true
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      active.value = false
    }, durationMs)
  }

  onScopeDispose(() => clearTimeout(timeout))

  return { active, trigger }
}
