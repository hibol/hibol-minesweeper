import { ref, computed } from "vue"
import {
  HEART_PIXELS,
  ROBOT_PIXELS,
  TORNADO_PIXELS,
  HIBOL_PIXELS,
} from "../icons"

const SPECIAL_CELL_HELP = {
  heart: {
    pixels: HEART_PIXELS,
    name: "HEART",
    description:
      "Softens the fog — each heart found holds back the darkness a little longer.",
  },
  robot: {
    pixels: ROBOT_PIXELS,
    name: "ROBOT",
    description:
      "Wanders off on a short walk on its own, revealing a handful of nearby cells for you.",
  },
  tornado: {
    pixels: TORNADO_PIXELS,
    name: "TORNADO",
    description:
      "Reveal one and the treasure is swept somewhere new — the compass swings around. It costs no life, just lost ground.",
  },
  hibol: {
    pixels: HIBOL_PIXELS,
    name: "HIBOL",
    description:
      "A hibol is banked as soon as you see it on screen, whatever happens to the rest of the day's run.",
  },
}

// Popup ouverte à la demande (bouton "?" du compteur concerné). Retient
// QUELLE case expliquer ('heart' | 'robot' | 'tornado' | 'hibol'), pas juste
// un booléen : un seul dialog partagé. `content` = { pixels, name,
// description }, vide tant que rien n'est ouvert.
export function useSpecialCellHelp() {
  const kind = ref(null)

  const show = computed(() => kind.value !== null)
  const content = computed(() => SPECIAL_CELL_HELP[kind.value] ?? {})

  function open(nextKind) {
    kind.value = nextKind
  }

  function close() {
    kind.value = null
  }

  return { show, content, open, close }
}
