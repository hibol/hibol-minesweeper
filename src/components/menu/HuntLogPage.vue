<script setup>
import { computed } from "vue"
import {
  MINE_PIXELS,
  CHEST_PIXELS,
  HIBOL_PIXELS,
  STOPWATCH_PIXELS,
  WRONG_PIXELS,
} from "../../icons"
import { TREASURE_MAX_MINES } from "../../game/game"
import {
  treasureEntries,
  currentStreak,
  bestStreak,
  describeTreasureReward,
} from "../../state/treasureLog"
import { formatTreasureTime } from "../../state/treasureTimeFormat"
import { formatDayKey } from "../../dateFormat"
import PixelStat from "../PixelStat.vue"
import PixelIcon from "../PixelIcon.vue"

const treasuresFound = computed(
  () => treasureEntries.value.filter((e) => e.outcome === "won").length,
)
const treasureWinRate = computed(() =>
  treasureEntries.value.length
    ? Math.round((treasuresFound.value / treasureEntries.value.length) * 100)
    : 0,
)
</script>

<template>
  <section class="menu-page">
    <div class="menu-section-title">HUNT LOG</div>
    <div class="hunt-log-header">
      <span>Streak {{ currentStreak }}</span>
      <span>Best {{ bestStreak }}</span>
      <span>Found {{ treasuresFound }}</span>
      <span>Win rate {{ treasureWinRate }}%</span>
    </div>
    <ol v-if="treasureEntries.length" class="run-list">
      <li v-for="entry in treasureEntries" :key="entry.dayKey" class="run-row">
        <div class="run-main">
          <!-- Défaite en croix plutôt qu'en mine : la stat mines touchées
               juste après porte déjà un sprite mine. -->
          <span
            class="run-outcome"
            role="img"
            :aria-label="
              entry.outcome === 'won' ? 'Treasure found' : 'Treasure missed'
            "
            :title="
              entry.outcome === 'won' ? 'Treasure found' : 'Treasure missed'
            "
          >
            <PixelIcon
              :pixels="entry.outcome === 'won' ? CHEST_PIXELS : WRONG_PIXELS"
              class="run-icon"
            />
          </span>
          <span>{{ formatDayKey(entry.dayKey) }}</span>
          <PixelStat
            :pixels="MINE_PIXELS"
            label="Mines hit"
            :value="`${entry.minesHit}/${TREASURE_MAX_MINES}`"
          />
          <PixelStat
            :pixels="STOPWATCH_PIXELS"
            label="Time"
            :value="formatTreasureTime(entry.timeMs)"
          />
          <PixelStat
            v-if="entry.reward"
            :pixels="HIBOL_PIXELS"
            label="Hibols earned"
            :value="`+${entry.reward}`"
            :description="describeTreasureReward(entry)"
          />
        </div>
      </li>
    </ol>
    <div v-else class="run-empty">No hunts yet</div>
  </section>
</template>

<style scoped>
.hunt-log-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 14px;
  font-size: 14px;
  color: var(--color-text);
}

.run-icon {
  width: 14px;
  height: 14px;
}

.run-outcome {
  display: inline-flex;
  align-items: center;
}
</style>
