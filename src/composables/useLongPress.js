import { onScopeDispose } from "vue"
import { longPressMs } from "../state/settings"

// Au-delà, le doigt fait défiler la liste : l'appui est abandonné.
const MOVE_TOLERANCE_PX = 10

// Appui long sur un élément quelconque (la grille a le sien, cf.
// usePointerGestures). Renvoie les écouteurs à poser avec `v-on="handlers"`.
export function useLongPress(action) {
  let timer = null
  let fired = false
  let startX = 0
  let startY = 0

  function cancel() {
    clearTimeout(timer)
    timer = null
  }

  onScopeDispose(cancel)

  function fire() {
    cancel()
    if (!fired) {
      fired = true
      action()
    }
  }

  function onPointerdown(event) {
    fired = false
    startX = event.clientX
    startY = event.clientY
    cancel()
    timer = setTimeout(fire, longPressMs.value)
  }

  function onPointermove(event) {
    if (
      timer &&
      Math.hypot(event.clientX - startX, event.clientY - startY) >
        MOVE_TOLERANCE_PX
    ) {
      cancel()
    }
  }

  // Android émet `contextmenu` tout seul sur un appui long (et le clic droit
  // aussi) : même action, `fired` évite de la jouer deux fois.
  function onContextmenu(event) {
    event.preventDefault()
    fire()
  }

  return {
    onPointerdown,
    onPointermove,
    onPointerup: cancel,
    onPointercancel: cancel,
    onPointerleave: cancel,
    onContextmenu,
  }
}
