<script setup>
import { computed } from 'vue'
import { MINE_PIXELS, FLAG_PIXELS, WRONG_PIXELS, ORIGIN_PIXELS } from '../icons'

const props = defineProps({
  cell: Object,
  seamless: Boolean
})

// 'press-start' (pas 'pointerdown') volontairement : un nom qui n'existe pas
// nativement en DOM, pour ne courir aucun risque de retomber sur le même
// bug de fallthrough qu'on vient de corriger pour 'click'.
defineEmits(['click', 'flag', 'press-start'])

const isOrigin = computed(() => props.seamless && props.cell.x === 0 && props.cell.y === 0)
</script>

<template>
  <div class="cell"
    @click="$emit('click')"
    @pointerdown="$emit('press-start')"
    :class="{ revealed: cell.revealed, seamless }"
    :style="{ transform: `rotate(${cell.tiltDeg}deg)` }"
    @contextmenu.prevent="$emit('flag')"
  >
    <svg v-if="isOrigin" viewBox="0 0 9 9" class="origin-marker" shape-rendering="crispEdges">
      <rect v-for="(p, i) in ORIGIN_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
    </svg>
    <span v-if="cell.flagged" class="cell-content">
        <svg v-if="cell.wrong" viewBox="0 0 9 9" class="icon" shape-rendering="crispEdges">
          <rect v-for="(p, i) in WRONG_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
        </svg>
        <svg v-else viewBox="0 0 9 9" class="icon" shape-rendering="crispEdges">
          <rect v-for="(p, i) in FLAG_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
        </svg>
    </span>
    <span v-else-if="cell.revealed" class="cell-content">
      <svg v-if="cell.isMine" viewBox="0 0 9 9" class="icon" shape-rendering="crispEdges">
        <rect v-for="(p, i) in MINE_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
      </svg>
      <span v-else-if="cell.neighborMines > 0" :class="['cell-number', 'n' + cell.neighborMines]">{{ cell.neighborMines }}</span>
    </span>
  </div>
</template>

<style scoped>
.cell {
  --notch: calc(var(--cell-size) / 9);
  position: relative;
  width: var(--cell-size);
  height: var(--cell-size);
  font-size: 0.75rem;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-cell-unrevealed-bg);
  border: 1px solid var(--color-cell-unrevealed-border);
  user-select: none;
  cursor: pointer;
  box-sizing: border-box;
  clip-path: polygon(
    0 var(--notch), var(--notch) var(--notch), var(--notch) 0,
    calc(100% - var(--notch)) 0, calc(100% - var(--notch)) var(--notch), 100% var(--notch),
    100% calc(100% - var(--notch)), calc(100% - var(--notch)) calc(100% - var(--notch)), calc(100% - var(--notch)) 100%,
    var(--notch) 100%, var(--notch) calc(100% - var(--notch)), 0 calc(100% - var(--notch))
  );
}
.cell.revealed {
  background: var(--color-cell-revealed-bg);
  border-color: var(--color-cell-revealed-border);
  cursor: default;
}

.cell.seamless:not(.revealed) {
  border: none;
  background: transparent;
}

/* Rendu avant .cell-content dans le template, donc peint derrière : un
   watermark discret, pas devant le chiffre/l'icône de la case. */
.origin-marker {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 60%;
  height: 60%;
  pointer-events: none;
}

.cell-content {
  /* Sans ça, ce <span> serait lui-même l'unique flex item de .cell (au lieu
     de son contenu), et sa propre boîte en ligne (avec la réserve d'espace
     sous les SVG pour leur "descender") décalait légèrement l'icône/le
     chiffre par rapport au centre réel de la case. */
  display: contents;
}

.icon {
  display: block;
  width: 70%;
  height: 70%;
}

.cell-number {
  font-family: 'Press Start 2P', monospace;
  font-size: 14px;
}

.n1 { color: var(--color-n1); }
.n2 { color: var(--color-n2); }
.n3 { color: var(--color-n3); }
.n4 { color: var(--color-n4); }
.n5 { color: var(--color-n5); }
.n6 { color: var(--color-n6); }
.n7 { color: var(--color-n7); }
.n8 { color: var(--color-n8); }
</style>
