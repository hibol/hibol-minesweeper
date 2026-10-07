<script setup>
import FooterStat from "./FooterStat.vue"
import LegacyTimer from "./LegacyTimer.vue"
import { MINE_PIXELS } from "../../icons"

// Footer du mode Legacy : chrono en avant, seul sur sa ligne, puis mines
// restantes (mines − drapeaux) et difficulté. `game` : lu pour difficulty.
defineProps({
  game: { type: Object, required: true },
  timeLabel: { type: String, required: true },
  minesLeft: { type: Number, required: true },
})
</script>

<template>
  <footer class="app-footer">
    <LegacyTimer :label="timeLabel" />
    <div class="stats-row">
      <FooterStat :pixels="MINE_PIXELS" label="Mines left" :value="minesLeft" />
      <span class="stat">{{ game.difficulty.toUpperCase() }}</span>
    </div>
  </footer>
</template>

<style scoped src="./footer.css"></style>
<style scoped src="./stat.css"></style>
