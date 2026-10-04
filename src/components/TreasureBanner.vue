<script setup>
import { computed } from "vue"
import { HIBOL_PIXELS, CHEST_PIXELS, TORNADO_PIXELS } from "../icons"
import { TREASURE_MAX_MINES } from "../game/game"
import PixelIcon from "./PixelIcon.vue"

// Bannière de fin de journée de la chasse au trésor (roadmap point 10). Deux
// états, run continu à 3 vies (révisé 2026-09-03, plus de "tentatives") :
//  - 'won'  : coffre trouvé → récapitulatif des gains + temps
//  - 'lost' : 3e mine touchée → hibols trouvés + temps
// Style repris de WinBanner.vue / GameOverBanner.vue (panneau centré haut,
// transition en escaliers).
const props = defineProps({
  show: Boolean,
  variant: String,
  // Gains de la journée par source (cf. treasureRewardDetail dans
  // useTreasureHunt.js). chest/stormBonus ne comptent qu'en victoire.
  found: { type: Number, default: 0 },
  chest: { type: Number, default: 0 },
  stormBonus: { type: Number, default: 0 },
  minesHit: { type: Number, default: 0 },
  timeLabel: String,
})

defineEmits(["close"])

const won = computed(() => props.variant === "won")

// En victoire, la ligne du coffre reste même à 0 pour rendre la pénalité
// lisible ; les autres lignes n'apparaissent que si elles rapportent.
const rows = computed(() => {
  const list = []
  if (props.found > 0) {
    list.push({ label: "Found", pixels: HIBOL_PIXELS, amount: props.found })
  }
  if (won.value) {
    list.push({
      label: "Chest",
      pixels: CHEST_PIXELS,
      amount: props.chest,
      detail:
        props.minesHit > 0
          ? `${TREASURE_MAX_MINES} − ${props.minesHit} ${props.minesHit === 1 ? "mine" : "mines"}`
          : "",
    })
    if (props.stormBonus > 0) {
      list.push({
        label: "Storm bonus",
        pixels: TORNADO_PIXELS,
        amount: props.stormBonus,
      })
    }
  }
  return list
})

const total = computed(() =>
  rows.value.reduce((sum, row) => sum + row.amount, 0),
)
</script>

<template>
  <Transition name="treasure-banner">
    <div v-if="show" class="treasure-banner">
      <div class="treasure-banner-title">
        {{ won ? "YOU WIN" : "GAME OVER" }}
      </div>
      <div v-if="!won" class="treasure-banner-sub">
        {{ TREASURE_MAX_MINES }} mines — the treasure got away
      </div>

      <div v-if="rows.length" class="reward-table">
        <template v-for="row in rows" :key="row.label">
          <PixelIcon :pixels="row.pixels" class="reward-icon" />
          <span class="reward-label">{{ row.label }}</span>
          <span class="reward-amount">+{{ row.amount }}</span>
          <span class="reward-detail">{{ row.detail }}</span>
        </template>
        <div class="reward-rule"></div>
        <span></span>
        <span class="reward-label">Total</span>
        <span class="reward-amount reward-total">+{{ total }}</span>
        <span></span>
      </div>
      <div v-else class="treasure-banner-sub">No hibols today</div>

      <div class="treasure-banner-sub">Time {{ timeLabel }}</div>
      <button class="pixel-btn treasure-banner-btn" @click="$emit('close')">
        OK
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.treasure-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 2;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 10px 20px;
  text-align: center;
}

.treasure-banner-title {
  font-family: "Press Start 2P", monospace;
  font-size: 18px;
  color: var(--color-text-strong);
}

.treasure-banner-sub {
  margin-top: 8px;
  font-family: "VT323", monospace;
  font-size: 15px;
  color: var(--color-text);
  letter-spacing: 1px;
}

/* Icône | source | montant | détail : colonnes alignées d'une ligne à l'autre. */
.reward-table {
  display: grid;
  grid-template-columns: auto auto auto auto;
  align-items: center;
  justify-content: center;
  column-gap: 8px;
  row-gap: 4px;
  margin-top: 10px;
  font-family: "VT323", monospace;
  font-size: 15px;
  color: var(--color-text);
  letter-spacing: 1px;
  text-align: left;
}

.reward-icon {
  width: 15px;
  height: 15px;
}

.reward-amount {
  text-align: right;
  color: var(--color-text-strong);
}

.reward-detail {
  font-size: 13px;
  opacity: 0.6;
}

.reward-rule {
  grid-column: 1 / -1;
  border-top: 1px solid var(--color-border-soft);
}

.reward-total {
  font-weight: bold;
}

.treasure-banner-btn {
  margin-top: 12px;
}

/* Transition en escaliers (steps) plutôt qu'un easing lisse : cohérent avec
   WinBanner/GameOverBanner. */
.treasure-banner-enter-active,
.treasure-banner-leave-active {
  transition:
    transform 0.4s steps(6, end),
    opacity 0.4s steps(6, end);
}

.treasure-banner-enter-from,
.treasure-banner-leave-to {
  transform: translate(-50%, -150%);
  opacity: 0;
}
</style>
