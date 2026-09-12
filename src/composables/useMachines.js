import { ref, computed, watch } from 'vue'
import { pushToast } from '../toastQueue'
import { SHOP_ITEMS, inventory, consume } from '../shop'
import { useWindMachine, useTravelMachine, useXrayMachine } from '../game/game'
import { WIND_MACHINE_PIXELS, TRAVEL_MACHINE_PIXELS, XRAY_MACHINE_PIXELS } from '../icons'

const MACHINE_ICONS = {
  windMachine: WIND_MACHINE_PIXELS,
  travelMachine: TRAVEL_MACHINE_PIXELS,
  xrayMachine: XRAY_MACHINE_PIXELS,
}

// Machines du shop (mode Infini) : tiroir de boutons, état armé/en visée,
// overlay de visée Travel, déclenchement. Les primitives moteur (game.js)
// mutent `game` ; ici caméra, inventaire (consume) et persistance.
// `deps` = ce qu'App.vue possède (caméra, tween, robot-follow, persistance).
export function useMachines(game, deps) {
  const {
    robotAnimationsActive,
    originX,
    originY,
    viewportWidth,
    viewportHeight,
    animateOriginTo,
    cancelOriginTween,
    cancelPendingRobotReturn,
    drainRobotTrails,
    drainPendingHearts,
    persistActiveGame,
    travelTweenMs,
    compassDotRadius, // partagé avec la boussole (App: COMPASS_DOT_RADIUS)
  } = deps

  const ownedMachines = computed(() =>
    SHOP_ITEMS.filter((item) => item.category === 'machine' && inventory.value[item.id] > 0),
  )

  const showMachineTray = computed(
    () =>
      game.value.mode === 'infinite' &&
      game.value.status === 'playing' &&
      ownedMachines.value.length > 0,
  )

  // Wind ne sert à rien sans assombrissement à dissiper (bouton grisé sinon).
  const hasHaze = computed(
    () => game.value.minesTriggeredCount > game.value.heartsCollectedCount,
  )

  // xrayArmed : le prochain tap grille désigne le centre du scan.
  // travelAiming : l'overlay directionnel a la main. Les deux retombent à false
  // sur nouvelle partie / changement de mode / fin de partie (watch ci-dessous).
  const xrayArmed = ref(false)
  const travelAiming = ref(false)
  // Direction visée (radians, convention écran : 0 = droite, horaire, +y bas).
  const travelAngle = ref(null)

  watch([game, () => game.value.status], () => {
    xrayArmed.value = false
    travelAiming.value = false
    travelAngle.value = null
  })

  // Point de visée sur l'anneau (même anneau que la boussole). Convention écran
  // directe ici, pas la convention "nord" de compassDotStyle.
  const travelAimDotStyle = computed(() => {
    const a = travelAngle.value ?? 0
    return {
      left: `${50 + Math.cos(a) * compassDotRadius * 100}%`,
      top: `${50 + Math.sin(a) * compassDotRadius * 100}%`,
    }
  })

  let travelAimDragging = false

  function onTravelAimPointer(e) {
    if (e.type === 'pointerdown') {
      travelAimDragging = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } else if (!travelAimDragging) {
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)

    if (dx !== 0 || dy !== 0) {
      travelAngle.value = Math.atan2(dy, dx)
    }
  }

  function endTravelAimDrag(e) {
    travelAimDragging = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  function cancelTravelAim() {
    travelAiming.value = false
    travelAngle.value = null
  }

  function fireTravel() {
    if (travelAngle.value === null || game.value.status !== 'playing') {
      return
    }

    const fromX = Math.floor(originX.value + viewportWidth.value / 2)
    const fromY = Math.floor(originY.value + viewportHeight.value / 2)
    const landing = useTravelMachine(game.value, fromX, fromY, travelAngle.value)

    travelAiming.value = false
    travelAngle.value = null

    if (!landing) {
      return
    }

    consume('travelMachine')
    // La cascade d'arrivée peut réveiller un robot ou révéler un cœur, comme
    // un reveal ordinaire (openCell est appelé directement, hors performReveal).
    drainRobotTrails()
    drainPendingHearts()
    cancelOriginTween()
    cancelPendingRobotReturn()
    animateOriginTo(
      landing.x - viewportWidth.value / 2,
      landing.y - viewportHeight.value / 2,
      travelTweenMs,
    )
    persistActiveGame()
    pushToast('Teleported to fresh ground', { icon: TRAVEL_MACHINE_PIXELS })
  }

  function useMachine(itemId) {
    if (robotAnimationsActive.value > 0 || game.value.status !== 'playing') {
      return
    }

    if (itemId === 'xrayMachine') {
      xrayArmed.value = !xrayArmed.value
      if (xrayArmed.value) {
        travelAiming.value = false
        pushToast('X-Ray armed — tap the pocket to scan', { icon: XRAY_MACHINE_PIXELS })
      }
      return
    }

    if (itemId === 'travelMachine') {
      travelAiming.value = !travelAiming.value
      travelAngle.value = null
      if (travelAiming.value) {
        xrayArmed.value = false
        pushToast('Travel — pick a direction, then Go', { icon: TRAVEL_MACHINE_PIXELS })
      }
      return
    }

    if (itemId === 'windMachine') {
      if (!hasHaze.value) {
        return
      }
      useWindMachine(game.value)
      consume('windMachine')
      persistActiveGame()
      pushToast('The wind clears the haze', { icon: WIND_MACHINE_PIXELS })
    }
  }

  // X-Ray armé : consomme le tap grille (App.onCellClick délègue). Renvoie true
  // si le tap a servi au scan.
  function tryXrayTap(cell) {
    if (!xrayArmed.value) {
      return false
    }
    const found = useXrayMachine(game.value, cell.x, cell.y)
    consume('xrayMachine')
    xrayArmed.value = false
    persistActiveGame()
    pushToast(
      found > 0
        ? `X-Ray: ${found} mine${found > 1 ? 's' : ''} revealed`
        : 'X-Ray: no mines in range',
      { icon: XRAY_MACHINE_PIXELS },
    )
    return true
  }

  // Vrai quand une machine à cible capte les taps grille (onCellClick/onCellFlag).
  const capturingTaps = computed(() => xrayArmed.value || travelAiming.value)

  return {
    MACHINE_ICONS,
    ownedMachines,
    showMachineTray,
    hasHaze,
    xrayArmed,
    travelAiming,
    travelAngle,
    travelAimDotStyle,
    onTravelAimPointer,
    endTravelAimDrag,
    cancelTravelAim,
    fireTravel,
    useMachine,
    tryXrayTap,
    capturingTaps,
  }
}
