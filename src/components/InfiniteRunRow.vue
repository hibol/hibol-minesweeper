<script setup>
import { pushToast } from "../state/toastQueue"
import { useLongPress } from "../composables/useLongPress"
import RunStatIcons from "./RunStatIcons.vue"
import RunMachineIcons from "./RunMachineIcons.vue"

// Contenu d'une ligne de INFINITE RUNS, local comme online (la page fournit le
// <li>). Une `seed` rend la ligne copiable à l'appui long : seules les runs
// locales en ont une.
const props = defineProps({
  rank: { type: Number, required: true },
  username: { type: String, default: null },
  // Mêmes noms que les props de RunStatIcons.
  stats: { type: Object, required: true },
  machineUses: { type: Object, default: () => ({}) },
  date: { type: String, default: "" },
  seed: { type: Number, default: null },
})

async function copySeed() {
  try {
    await navigator.clipboard.writeText(String(props.seed))
    pushToast("Seed copied")
  } catch {
    pushToast("Couldn't copy the seed")
  }
}

const longPress = useLongPress(copySeed)
</script>

<template>
  <div
    class="run-content"
    :class="{ pressable: seed !== null }"
    v-bind="seed !== null ? longPress : {}"
  >
    <div class="run-main">
      <span class="run-rank">#{{ rank }}</span>
      <span v-if="username" class="run-name" :title="username">{{
        username
      }}</span>
      <RunStatIcons v-bind="stats" />
    </div>
    <div class="run-meta">
      {{ date }}<RunMachineIcons :machine-uses="machineUses" />
    </div>
  </div>
</template>

<style scoped>
/* Pas de sélection de texte ni de menu natif pendant l'appui long. */
.pressable {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
</style>
