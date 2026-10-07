<script setup>
import { computed } from "vue"

// Barre de danger du footer Infini. `level` (0-1) = largeur du remplissage ;
// `hotspot` (0-1) = proximité d'une zone quasi infranchissable, qui fait
// battre la barre au-delà de THROB_THRESHOLD (amplitude et tempo suivent).
const THROB_THRESHOLD = 0.04

const props = defineProps({
  level: { type: Number, required: true },
  hotspot: { type: Number, default: 0 },
})

// Tempo du battement : ~1.2s en lisière de zone, ~0.6s au cœur. En custom
// property inline (une @keyframes ne peut pas interpoler animation-duration).
const throbPeriod = computed(() => `${(1.2 - 0.6 * props.hotspot).toFixed(3)}s`)
</script>

<template>
  <div
    class="danger-row"
    :class="{ throbbing: hotspot > THROB_THRESHOLD }"
    :style="{
      '--pulse-strength': hotspot,
      '--throb-period': throbPeriod,
    }"
  >
    <span class="danger-label">DANGER</span>
    <div class="danger-bar">
      <div class="danger-bar-fill" :style="{ width: `${level * 100}%` }"></div>
    </div>
  </div>
</template>

<style scoped>
.danger-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 340px;
}

.danger-label {
  font-size: 15px;
  color: var(--color-text);
}

.danger-bar {
  flex: 1;
  height: 12px;
  background: var(--color-danger-bar-bg);
  border: 1px solid var(--color-danger-bar-border);
  overflow: hidden;
}

.danger-bar-fill {
  height: 100%;
  background: var(--color-danger-fill);
}

/* Zone quasi infranchissable à portée (roadmap point 5) : la barre garde sa
   largeur (level), c'est l'intensité qui palpite — luminosité du
   remplissage, couleur du cadre et du texte, sur une onde douce (gyrophare).
   --throb-period pilote la vitesse, --pulse-strength l'amplitude (inline sur
   .danger-row, hérités). */
.danger-row.throbbing .danger-bar-fill {
  animation: danger-throb-fill var(--throb-period, 0.9s) ease-in-out infinite;
}

.danger-row.throbbing .danger-bar {
  animation: danger-throb-frame var(--throb-period, 0.9s) ease-in-out infinite;
}

.danger-row.throbbing .danger-label {
  animation: danger-throb-text var(--throb-period, 0.9s) ease-in-out infinite;
}

@keyframes danger-throb-fill {
  0%,
  100% {
    filter: brightness(calc(1 + 0.05 * var(--pulse-strength, 0)));
  }
  50% {
    filter: brightness(calc(1 + 0.3 * var(--pulse-strength, 0)));
  }
}

/* Cadre et texte : fondu gris → rouge sur la demi-période, pas de halo (trop
   hors thème 8bit). --pulse-strength ne joue que sur la luminosité du fill. */
@keyframes danger-throb-frame {
  0%,
  100% {
    border-color: var(--color-danger-bar-border);
  }
  50% {
    border-color: var(--color-danger-fill);
  }
}

@keyframes danger-throb-text {
  0%,
  100% {
    color: var(--color-text);
  }
  50% {
    color: var(--color-danger-fill);
  }
}
</style>
