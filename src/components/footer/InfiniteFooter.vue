<script setup>
import FooterStat from "./FooterStat.vue"
import DangerBar from "./DangerBar.vue"
import PositionStat from "./PositionStat.vue"
import StatWithHelp from "./StatWithHelp.vue"
import {
  CELL_PIXELS,
  FLAG_PIXELS,
  MINE_PIXELS,
  HEART_PIXELS,
  ROBOT_PIXELS,
} from "../../icons"

// Footer du mode Infini : barre de danger puis compteurs. `game` : lu pour
// revealedCount, flaggedCount, minesTriggeredCount, heartsCollectedCount et
// robotsTriggeredCount. `position` : { label, description }, null = masquée.
// `help` porte la case à expliquer ('heart' | 'robot').
defineProps({
  game: { type: Object, required: true },
  dangerLevel: { type: Number, required: true },
  hotspotLevel: { type: Number, default: 0 },
  position: { type: Object, default: null },
  showHelpButton: Boolean,
})

defineEmits(["help"])
</script>

<template>
  <footer class="app-footer">
    <DangerBar :level="dangerLevel" :hotspot="hotspotLevel" />
    <div class="stats-row">
      <FooterStat
        :pixels="CELL_PIXELS"
        label="Cells"
        :value="game.revealedCount"
      />
      <!-- Coordonnée de la case au centre du viewport : suit le pan, au cran
           de case près. -->
      <PositionStat
        v-if="position"
        :label="position.label"
        :description="position.description"
      />
      <FooterStat
        :pixels="FLAG_PIXELS"
        label="Flags"
        :value="game.flaggedCount"
      />
      <FooterStat
        :pixels="MINE_PIXELS"
        label="Mines"
        :value="game.minesTriggeredCount"
      />
      <StatWithHelp
        v-if="game.heartsCollectedCount > 0"
        :pixels="HEART_PIXELS"
        label="Hearts"
        :value="game.heartsCollectedCount"
        :show-help="showHelpButton"
        help-label="What does a heart do?"
        @help="$emit('help', 'heart')"
      />
      <StatWithHelp
        v-if="game.robotsTriggeredCount > 0"
        :pixels="ROBOT_PIXELS"
        label="Robots"
        :value="game.robotsTriggeredCount"
        :show-help="showHelpButton"
        help-label="What does a robot do?"
        @help="$emit('help', 'robot')"
      />
    </div>
  </footer>
</template>

<style scoped src="./footer.css"></style>
