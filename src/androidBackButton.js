import { Capacitor } from "@capacitor/core"
import { App } from "@capacitor/app"

// Bouton retour Android (APK). Écouter "backButton" coupe le comportement
// natif : on le remplace par un Échap simulé, que les dialogues
// (useModalA11y) et le menu burger savent déjà traiter. Personne ne l'a
// consommé (preventDefault) → rien à fermer : l'app passe en arrière-plan,
// comme Android le fait sur un écran racine.
export function handleBackButton(minimize) {
  const escape = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  })
  if (document.dispatchEvent(escape)) minimize()
}

export function installAndroidBackButton() {
  if (Capacitor.getPlatform() !== "android") return
  App.addListener("backButton", () => handleBackButton(() => App.minimizeApp()))
}
