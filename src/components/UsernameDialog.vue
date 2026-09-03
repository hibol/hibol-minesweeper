<script setup>
import { ref, computed } from 'vue'
import { MAX_USERNAME_LENGTH, generateRandomUsername } from '../username'

defineProps({
  show: Boolean
})

// Émet le nom choisi (chaîne éventuellement vide — laisser vide est permis).
const emit = defineEmits(['submit'])

// Deux temps dans le même dialog plutôt que deux composants : saisie du nom,
// puis phrase d'accueil qui le réutilise. Le composant est monté via v-if côté
// App.vue, donc cet état interne repart de zéro à chaque affichage.
const step = ref('input') // 'input' | 'welcome'
const name = ref('')
const chosenName = ref('')

function goToWelcome() {
  // Champ laissé vide -> nom aléatoire "player####" plutôt que rien : le menu
  // affiche toujours un pseudo, et ça préfigure le comportement réseau à venir.
  const typed = name.value.trim().slice(0, MAX_USERNAME_LENGTH)
  chosenName.value = typed || generateRandomUsername()
  step.value = 'welcome'
}

function finish() {
  emit('submit', chosenName.value)
}

// Ton "attract-mode" arcade, aligné sur le reste de la copie du jeu (titres
// en Press Start 2P, formules sèches "Beware of the fog of war").
// chosenName est toujours renseigné à ce stade (saisi ou tiré au sort).
const welcomeTitle = computed(() => `WELCOME, ${chosenName.value.toUpperCase()}`)

const welcomeMessage = 'The minefield is waiting. Good luck.'
</script>

<template>
  <div v-if="show" class="username-overlay">
    <div class="username-box">
      <template v-if="step === 'input'">
        <div class="username-title">ENTER YOUR NAME</div>
        <input
          v-model="name"
          class="username-input"
          type="text"
          :maxlength="MAX_USERNAME_LENGTH"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="up to 12 characters"
          @keydown.enter="goToWelcome"
        />
        <div class="username-actions">
          <button class="pixel-btn" @click="goToWelcome">Continue</button>
        </div>
        <div class="username-hint">leave blank for a random name</div>
      </template>

      <template v-else>
        <div class="username-title">{{ welcomeTitle }}</div>
        <div class="username-sub">{{ welcomeMessage }}</div>
        <div class="username-actions">
          <button class="pixel-btn" @click="finish">PRESS START</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Repris de IntroDialog.vue : même famille visuelle que les autres popups. */
.username-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.username-box {
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 20px 24px;
  max-width: 320px;
  text-align: center;
  font-family: 'VT323', monospace;
}

.username-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 13px;
  color: var(--color-text-strong);
  line-height: 1.6;
}

.username-sub {
  margin-top: 12px;
  font-size: 16px;
  color: var(--color-text);
}

/* Aligné sur .seed-input dans BurgerMenu.vue. */
.username-input {
  margin-top: 16px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  width: 180px;
  padding: 4px 8px;
  background: var(--color-cell-unrevealed-bg);
  border: 2px solid var(--color-chrome-border);
  color: var(--color-text-strong);
  text-align: center;
}

.username-actions {
  margin-top: 16px;
}

.username-hint {
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-text);
  opacity: 0.7;
}
</style>
