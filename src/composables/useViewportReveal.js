import { watch } from "vue"
import {
  triggerTornado,
  collectHibol,
  confirmChest,
  isChestCell,
} from "../game/game"

// Chasse au trésor : pas de brouillard (contrairement à useHeartFogReveal.js
// en infini), donc "vu" se réduit au rectangle du viewport courant — même
// bornes que getVisibleCells (game.js), pas une ellipse de voile ni un halo.
// Une case spéciale révélée hors champ (cascade) n'agit qu'une fois affichée :
// le coffre ne gagne la journée, une tornade ne le déplace, un hibol n'est
// compté et crédité qu'à ce moment-là.
//
// Journée finie (gagnée ou perdue) : tout est figé, ce qui n'a pas été vu ne
// se déclenche plus jamais (hibols non crédités, tornades sans effet). Seule
// exception : les hibols révélés par le coup final, s'ils sont à l'écran.
//
// Ordre = priorité dans un même passage : les hibols d'abord (comptés avant
// la victoire), puis le coffre (la victoire fige les tornades vues en même
// temps, plutôt que de déplacer le coffre sous les yeux du joueur).
const KINDS = [
  {
    queue: "pendingHibolReveals",
    isWaiting: (cell) => cell.isHibol && cell.revealed && !cell.hibolCollected,
    isDone: (cell) => cell.hibolCollected,
    confirm: (game, cell, hooks) => {
      collectHibol(game, cell)
      hooks.onHibolCollected?.()
    },
    finalMoveGrace: true,
  },
  {
    queue: "pendingChestReveals",
    isWaiting: (cell, game) =>
      game.mode === "treasure" &&
      !game.chestFound &&
      cell.revealed &&
      isChestCell(game, cell),
    // Coffre déplacé par une tornade entre-temps : la case redevient banale.
    isDone: (cell, game) => game.chestFound || !isChestCell(game, cell),
    confirm: (game, cell) => confirmChest(game, cell),
    finalMoveGrace: false,
  },
  {
    queue: "pendingTornadoReveals",
    isWaiting: (cell) =>
      cell.isTornado && cell.revealed && !cell.tornadoTriggered,
    isDone: (cell) => cell.tornadoTriggered,
    confirm: (game, cell) => triggerTornado(game, cell),
    finalMoveGrace: false,
  },
]

export function useViewportReveal(
  game,
  { originX, originY, viewportWidth, viewportHeight },
  hooks = {},
) {
  // Cases révélées mais pas encore vues : { cell, kind }. Tableau simple, pas
  // un ref : rien ne l'affiche, et un ref envelopperait `kind` dans un proxy
  // (la comparaison avec KINDS échouerait).
  let pending = []

  function isCellVisible(cell) {
    return (
      cell.x >= originX.value &&
      cell.x < originX.value + viewportWidth.value &&
      cell.y >= originY.value &&
      cell.y < originY.value + viewportHeight.value
    )
  }

  // finalMove : passage qui suit immédiatement le coup joué (drain). Le
  // statut est relu à chaque case : une victoire en cours de passage fige
  // les suivantes.
  function recheckPending({ finalMove = false } = {}) {
    if (pending.length === 0) {
      return
    }

    const g = game.value
    const kept = []
    for (const kind of KINDS) {
      for (const entry of pending) {
        if (entry.kind !== kind || kind.isDone(entry.cell, g)) {
          continue
        }
        if (g.status !== "playing" && !(finalMove && kind.finalMoveGrace)) {
          continue // jamais vue avant la fin de la journée : perdue
        }
        if (isCellVisible(entry.cell)) {
          kind.confirm(g, entry.cell, hooks)
        } else {
          kept.push(entry)
        }
      }
    }
    pending = kept
  }

  // Vide les files du moteur (game.pending*Reveals, même mécanique que
  // pendingHeartReveals) : à appeler juste après chaque coup (reveal).
  function drainPendingReveals() {
    for (const kind of KINDS) {
      const queue = game.value[kind.queue]
      if (!queue || queue.length === 0) {
        continue
      }
      for (const cell of queue.splice(0, queue.length)) {
        if (!kind.isDone(cell, game.value)) {
          pending.push({ cell, kind })
        }
      }
    }
    recheckPending({ finalMove: true })
  }

  // Reconstruit l'état depuis `game` : nouvelle partie (rien à faire) ou
  // reprise (remet en attente les cases révélées mais pas encore vues avant
  // la mise en arrière-plan — seule source de vérité : les flags persistés
  // par case, pas une file à part). Journée déjà finie : rien à remettre.
  function resetFromGame() {
    pending = []

    if (game.value.status === "playing") {
      for (const cell of game.value.cells.values()) {
        for (const kind of KINDS) {
          if (kind.isWaiting(cell, game.value)) {
            pending.push({ cell, kind })
          }
        }
      }
    }

    for (const kind of KINDS) {
      game.value[kind.queue]?.splice(0)
    }

    recheckPending()
  }

  // flush: "sync" pour la même raison que useHeartFogReveal.js : un resume
  // (App.vue) affecte game.value puis agit dans la foulée sans attendre un
  // tick — le flush par défaut ("pre") laisserait une case pourtant déjà
  // visible à la reprise sans effet jusqu'au prochain changement réel. La
  // caméra du snapshot doit donc être en place AVANT (cf. resumeTreasureGame).
  watch(game, resetFromGame, { immediate: true, flush: "sync" })
  watch([originX, originY, viewportWidth, viewportHeight], () =>
    recheckPending(),
  )

  return { drainPendingReveals }
}
