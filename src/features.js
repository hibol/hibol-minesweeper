// Pairage d'appareils masqué en v0 : il ne partage que l'identité en ligne,
// pas la progression (export/import la copie). Réactiver en local :
// VITE_DEVICE_LINKING=true npm run dev
export const DEVICE_LINKING = import.meta.env.VITE_DEVICE_LINKING === "true"
