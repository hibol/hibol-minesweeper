<script setup>
import { ref } from "vue"
import { usernamePrompted } from "../../state/username"
import { deleteOnlineAccount } from "../../state/accountOnline"
import ConfirmDialog from "../ConfirmDialog.vue"

// Servie par GitHub Pages (public/privacy.html) : une seule URL publique,
// celle que demande la fiche Play. Dans l'APK, Capacitor ouvre ce lien
// externe dans le navigateur du téléphone.
const PRIVACY_POLICY_URL =
  "https://hibol.github.io/hibol-minesweeper/privacy.html"

// Suppression du compte en ligne (exigence Play). Proposée dès qu'une
// identité existe (pseudo choisi à l'onboarding), pas seulement en Legacy.
const showDeleteAccountConfirm = ref(false)
const deleteAccountStatus = ref("idle") // idle | loading | done | error

async function confirmDeleteAccount() {
  showDeleteAccountConfirm.value = false
  deleteAccountStatus.value = "loading"
  try {
    await deleteOnlineAccount()
    deleteAccountStatus.value = "done"
  } catch {
    deleteAccountStatus.value = "error"
  }
}
</script>

<template>
  <section class="menu-page">
    <div class="menu-section-title">ABOUT</div>
    <div class="about-content">
      <div class="about-name">Hibol Minesweeper</div>
      <a
        class="about-link pixel-btn"
        href="mailto:hibol18@gmail.com?subject=Hibol%20Minesweeper%20feedback"
        >Send feedback</a
      >
      <a
        class="about-link pixel-btn"
        :href="PRIVACY_POLICY_URL"
        target="_blank"
        rel="noopener"
        >Privacy policy</a
      >
      <template v-if="usernamePrompted || deleteAccountStatus !== 'idle'">
        <button
          v-if="deleteAccountStatus !== 'done'"
          class="pixel-btn"
          :disabled="deleteAccountStatus === 'loading'"
          @click="showDeleteAccountConfirm = true"
        >
          Delete online data
        </button>
        <div v-if="deleteAccountStatus === 'done'" class="settings-hint">
          Your online data was deleted.
        </div>
        <div v-else-if="deleteAccountStatus === 'error'" class="settings-error">
          Couldn't reach the server. Try again later.
        </div>
      </template>
    </div>

    <ConfirmDialog
      :show="showDeleteAccountConfirm"
      title="DELETE ONLINE DATA?"
      message="Your name and scores will be removed from the online leaderboards. Progress on this device is kept."
      confirm-label="Delete"
      @cancel="showDeleteAccountConfirm = false"
      @confirm="confirmDeleteAccount"
    />
  </section>
</template>

<style scoped>
.about-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.about-name {
  font-family: "Press Start 2P", monospace;
  font-size: 13px;
  color: var(--color-text-strong);
}

.about-link {
  text-decoration: none;
  display: inline-block;
}
</style>
