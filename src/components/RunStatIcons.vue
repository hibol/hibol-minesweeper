<script setup>
import {
  CELL_PIXELS,
  DISTANCE_PIXELS,
  MINE_PIXELS,
  HEART_PIXELS,
  ROBOT_PIXELS,
} from "../icons"
import PixelStat from "./PixelStat.vue"

// Stats d'une ligne de run — INFINITE RUNS local et online partagent
// exactement ce même affichage (cf. BurgerMenu.vue).
defineProps({
  revealedCount: { type: Number, required: true },
  distance: { type: Number, required: true },
  minesTriggered: { type: Number, required: true },
  heartsCollected: { type: Number, default: 0 },
  robotsTriggered: { type: Number, default: 0 },
})
</script>

<template>
  <PixelStat :pixels="CELL_PIXELS" label="Cells" :value="revealedCount" />
  <PixelStat :pixels="DISTANCE_PIXELS" label="Distance" :value="distance" />
  <PixelStat :pixels="MINE_PIXELS" label="Mines" :value="minesTriggered" />
  <PixelStat
    v-if="heartsCollected"
    :pixels="HEART_PIXELS"
    label="Hearts"
    :value="heartsCollected"
  />
  <PixelStat
    v-if="robotsTriggered"
    :pixels="ROBOT_PIXELS"
    label="Robots"
    :value="robotsTriggered"
  />
</template>
