<script setup>
import FooterStat from "./FooterStat.vue"
import PositionStat from "./PositionStat.vue"
import StatWithHelp from "./StatWithHelp.vue"
import { MINE_PIXELS, HIBOL_PIXELS, TORNADO_PIXELS } from "../../icons"
import { TREASURE_MAX_MINES } from "../../game/game"

// Footer de la chasse au trésor. `game` : lu pour minesTriggeredCount,
// unlimitedLives, hibolsCollectedCount et tornadoCount. `position` :
// { label, description }, null = masquée. `help` porte la case à expliquer
// ('hibol' | 'tornado').
defineProps({
  game: { type: Object, required: true },
  position: { type: Object, default: null },
  showHelpButton: Boolean,
})

defineEmits(["help"])
</script>

<template>
  <footer class="app-footer">
    <!-- Le chrono de run (treasureTimeLabel) n'est plus affiché ici (décision
         2026-09-20) : il continue de tourner et d'alimenter treasureLog en
         silence (cf. useTreasureHunt.js), mais reste visible dans la
         bannière de fin de journée (TreasureBanner) uniquement. -->
    <div class="stats-row">
      <FooterStat
        :pixels="MINE_PIXELS"
        label="Mines hit"
        :value="
          game.unlimitedLives
            ? game.minesTriggeredCount
            : `${game.minesTriggeredCount}/${TREASURE_MAX_MINES}`
        "
      />
      <StatWithHelp
        v-if="game.hibolsCollectedCount > 0"
        :pixels="HIBOL_PIXELS"
        label="Hibols"
        :value="game.hibolsCollectedCount"
        :show-help="showHelpButton"
        help-label="What does a hibol do?"
        @help="$emit('help', 'hibol')"
      />
      <StatWithHelp
        v-if="game.tornadoCount > 0"
        :pixels="TORNADO_PIXELS"
        label="Tornadoes"
        :value="game.tornadoCount"
        :show-help="showHelpButton"
        help-label="What does a tornado do?"
        @help="$emit('help', 'tornado')"
      />
      <PositionStat
        v-if="position"
        :label="position.label"
        :description="position.description"
      />
    </div>
  </footer>
</template>

<style scoped src="./footer.css"></style>
