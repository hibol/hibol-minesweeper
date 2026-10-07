<script setup>
import FooterStat from "./FooterStat.vue"
import { FLAG_PIXELS } from "../../icons"

// Footer du mode Classic. `game` : lu pour flaggedCount et mineCount.
defineProps({
  game: { type: Object, required: true },
})
</script>

<template>
  <footer class="app-footer">
    <div class="stats-row">
      <FooterStat
        :pixels="FLAG_PIXELS"
        label="Flags"
        :value="`${game.flaggedCount}/${game.mineCount}`"
      />
    </div>
  </footer>
</template>

<style scoped src="./footer.css"></style>
