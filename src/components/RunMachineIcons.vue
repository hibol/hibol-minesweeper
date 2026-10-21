<script setup>
import { computed } from "vue"
import { MACHINE_PIXELS } from "../icons"
import { SHOP_ITEMS } from "../state/shop"
import PixelStat from "./PixelStat.vue"

// Machines utilisées dans une run : une icône avec son nombre d'usages, rien
// pour celles jamais servies.
const props = defineProps({
  // { windMachine, travelMachine, xrayMachine } -> nombre d'usages.
  machineUses: { type: Object, default: () => ({}) },
})

const machines = computed(() =>
  SHOP_ITEMS.filter((item) => item.category === "machine")
    .map((item) => ({ ...item, uses: props.machineUses[item.id] ?? 0 }))
    .filter((machine) => machine.uses > 0),
)
</script>

<template>
  <span v-if="machines.length" class="run-machines">
    <PixelStat
      v-for="machine in machines"
      :key="machine.id"
      :pixels="MACHINE_PIXELS[machine.id]"
      :label="machine.name"
      :value="machine.uses"
      :size="12"
    />
  </span>
</template>

<style scoped>
.run-machines {
  display: inline-flex;
  gap: 8px;
  margin-left: 8px;
  vertical-align: middle;
}
</style>
