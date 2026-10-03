import { getCurrentScope, onScopeDispose } from "vue"

// Gestes de la zone de jeu : pan au doigt/souris, pincement à deux doigts,
// molette, appui long. Sorti de MineGrid.vue sans changer le comportement ;
// App.vue en crée une instance unique, branchée sur MineGrid ET MapCanvas.

// En dessous de cette distance cumulée, un mousedown+mouseup est traité comme
// un clic (léger tremblement de la main toléré), au-dessus comme un drag.
export const DRAG_THRESHOLD = 8

// Mappage exponentiel plutôt qu'un pas fixe par cran : reste cohérent aussi
// bien pour une molette de souris classique (deltaY ~100 par cran, un vrai
// "cran" de zoom perceptible) que pour un trackpad (deltaY continu, petits
// pas fluides) sans distinguer les deux. deltaY > 0 (molette vers le bas) =
// dézoome, deltaY < 0 = zoome, comme la convention habituelle des cartes.
export const WHEEL_ZOOM_SENSITIVITY = 0.001

// onPan(dxPx, dyPx), onZoom(factor, clientX, clientY) : obligatoires.
// onTap(clientX, clientY) : tap sans drag ni pincement, détecté au pointerup
// (sert au niveau carte ; sur la grille, le click de chaque case fait foi).
// longPressMs : ref, seulement pour startLongPress (MineGrid).
export function usePointerGestures({
  onPan,
  onZoom,
  onTap = null,
  longPressMs = null,
}) {
  let dragging = false
  let didDrag = false
  let startX = 0
  let startY = 0
  let downX = 0
  let downY = 0

  let longPressTimer = null
  // Vrai dès que l'action "opposée" (flag/reveal) a été déclenchée pour cet
  // appui, que ce soit par notre timer ou par un `contextmenu` natif arrivé en
  // même temps (Android le déclenche déjà tout seul sur un appui long) — évite
  // de déclencher l'action deux fois, et empêche le clic normal de suivre.
  let longPressHandled = false

  // Position (coordonnées écran) de chaque doigt actuellement posé, par
  // pointerId. Un deuxième doigt qui se pose bascule le geste en pinch-zoom :
  // le tap/drag/long-press au premier doigt est alors suspendu tant qu'il en
  // reste au moins deux, pour ne jamais mélanger un pan/flag avec un zoom.
  const activePointers = new Map()
  let pinchStartDistance = 0

  function clearLongPress() {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }

  if (getCurrentScope()) {
    onScopeDispose(clearLongPress)
  }

  function pointerDistance() {
    const [a, b] = [...activePointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function pointerMidpoint() {
    const [a, b] = [...activePointers.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  function onWheel(event) {
    const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY)
    onZoom(factor, event.clientX, event.clientY)
  }

  // Sans ça, taper plusieurs fois sur une case sans effet visible (ex. un
  // chord raté sur une case déjà révélée) peut déclencher le menu natif
  // d'Android Chrome (recherche/dictionnaire) — Android interprète des taps
  // répétés sur un texte qui ne change pas comme une tentative de sélection
  // de mot. touch-action: none sur .grid et user-select: none sur .cell ne
  // suffisent pas à eux seuls ; preventDefault() sur chaque pointerdown coupe
  // la reconnaissance de geste par défaut à la racine, quel que soit le tap.
  function onPointerDown(event) {
    event.preventDefault()
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (activePointers.size === 2) {
      dragging = false
      didDrag = true
      longPressHandled = true
      clearLongPress()
      pinchStartDistance = pointerDistance()
      return
    }

    if (activePointers.size > 2) {
      return
    }

    dragging = true
    didDrag = false
    startX = event.clientX
    startY = event.clientY
    downX = event.clientX
    downY = event.clientY
  }

  function onPointerMove(event) {
    if (!activePointers.has(event.pointerId)) {
      return
    }
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (activePointers.size === 2) {
      const distance = pointerDistance()
      if (pinchStartDistance > 0) {
        const { x, y } = pointerMidpoint()
        onZoom(distance / pinchStartDistance, x, y)
      }
      pinchStartDistance = distance
      return
    }

    if (!dragging) {
      return
    }

    const deltaX = event.clientX - startX
    const deltaY = event.clientY - startY
    startX = event.clientX
    startY = event.clientY

    if (
      !didDrag &&
      Math.hypot(event.clientX - downX, event.clientY - downY) > DRAG_THRESHOLD
    ) {
      didDrag = true
      clearLongPress()
    }

    if (didDrag && (deltaX !== 0 || deltaY !== 0)) {
      onPan(-deltaX, -deltaY)
    }
  }

  // Aussi branché sur pointerleave/pointercancel : seul un vrai pointerup du
  // bouton principal compte comme tap.
  function onPointerUp(event) {
    activePointers.delete(event.pointerId)

    if (activePointers.size === 0) {
      const wasTap = dragging && !didDrag
      dragging = false
      clearLongPress()

      if (
        onTap &&
        wasTap &&
        event.type === "pointerup" &&
        (event.button ?? 0) === 0
      ) {
        onTap(event.clientX, event.clientY)
      }
    }
  }

  // Appui long : `action` part après longPressMs, sauf drag/pincement entre-temps.
  function startLongPress(action) {
    longPressHandled = false
    clearLongPress()
    longPressTimer = setTimeout(() => {
      if (!didDrag && !longPressHandled) {
        longPressHandled = true
        action()
      }
    }, longPressMs.value)
  }

  // Action secondaire explicite (contextmenu) : une seule fois par appui.
  function triggerSecondaryAction(action) {
    if (longPressHandled) {
      return
    }

    longPressHandled = true
    clearLongPress()
    action()
  }

  // Un click natif ne vaut tap que s'il ne termine ni un drag ni un appui long.
  function tapAllowed() {
    return !didDrag && !longPressHandled
  }

  return {
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    startLongPress,
    triggerSecondaryAction,
    tapAllowed,
  }
}
