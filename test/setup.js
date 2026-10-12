// APIs navigateur que jsdom n'implémente pas et dont App.vue + ses composables
// ont besoin au montage. No-op sous l'environnement Node (pas de window).
if (typeof window !== "undefined") {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  if (!window.matchMedia) {
    // settings.js lit matchMedia('(pointer: coarse)') à l'import.
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false
      },
    })
  }

  // usePixelFog dessine sur un <canvas> ; jsdom renvoie null sans le paquet
  // `canvas`. Un contexte 2d bidon suffit (les tests ne regardent pas le voile).
  const noopCtx = new Proxy(
    {},
    {
      get: (_t, prop) => (prop === "canvas" ? {} : () => {}),
      set: () => true,
    },
  )
  HTMLCanvasElement.prototype.getContext = () => noopCtx

  // Réseau coupé par défaut : monter l'App lance des requêtes au boot
  // (relecture du pseudo, files d'attente), qui partiraient sinon sur le vrai
  // serveur — un 404 tardif y a déjà rouvert un dialogue « nouveau pseudo » en
  // plein test. Les tests qui stubbent fetch (vi.stubGlobal) gardent la main ;
  // vi.unstubAllGlobals() revient à ce comportement-ci.
  globalThis.fetch = () =>
    Promise.reject(new Error("fetch non stubbé : réseau coupé en test"))
}
