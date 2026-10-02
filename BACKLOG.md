# Backlog technique

Dette, bugs latents et refactorings repérés en codant autre chose. Un point
disparaît dans le commit qui le règle (l'historique git garde la trace).
`[serveur]` = dépôt `hibol-minesweeper-server`.

## Sécurité / robustesse serveur

- [ ] **[serveur] Rejeux Legacy non plafonnés** : `POST /api/legacy/submissions` lance un process Node par requête (jusqu'à 10 s), sans limite de concurrence (`ReplayService`). Quelques centaines de requêtes saturent le VPS partagé. Rate limit + sémaphore. Même `RateLimiter` sur `/claim` (réservation de pseudos en masse).
- [ ] **[serveur + front] Déploiements sans tests** : le `Dockerfile` serveur compile avec `-DskipTests` et `deploy.yml` n'a pas de job de tests ; côté front, le déploiement Pages ne dépend pas de `ci.yml`, qui ne lance pas non plus le lint ni `format:check`.
- [ ] **[serveur] Admin** : `admin`/`admin` par défaut si les variables d'environnement manquent (`SecurityConfig`) → refuser de démarrer ; pas de limite d'essais sur `POST /login`.
- [ ] **[serveur] Conteneur en root** : pas de `USER` dans l'étage final du `Dockerfile`.
- [ ] **[serveur] `limit` des classements** ni validé ni plafonné (`LegacyController.java:130`, `InfiniteController.java:102`) : négatif → 500, énorme → toute la table.
- [ ] **[serveur] Codes de pairage jamais purgés** : un code expiré mais jamais saisi reste en mémoire jusqu'au redémarrage (`PlayerLinkCodeService`). Purger les expirés dans `generate()`.

## APK

- [ ] **Événement `online` dans la WebView** : vérifier sur appareil qu'il se déclenche au retour du réseau. Sinon, relancer les trois files d'attente (Legacy, Infini, pseudo) quand l'app revient au premier plan.

## UI

- [ ] **LEGACY TIMES invisible pour un acheteur sans victoire** : la page (et son onglet Online) n'apparaît qu'en DEV ou avec un temps local (`legacyTimesVisible`, `BurgerMenu.vue`). Ajouter `legacyUnlocked` à la condition.

## Contrat front/back

- [ ] **[serveur] JSON malformé sur `/api/legacy/players/*`** : `PlayerController` n'a pas l'`@ExceptionHandler(HttpMessageNotReadableException)` des deux autres contrôleurs, Spring renvoie son corps d'erreur par défaut au lieu de `{ "reason": "invalid_request" }`.
- [ ] **[serveur] Routes d'identité sous `/api/legacy/players`** alors qu'elles servent à tous les modes. Renommer seulement avec une période où les deux routes coexistent (APK installés). Priorité basse.

## À garder en tête (pas d'action tant que rien ne change)

- **Génération Infini** : une partie restaurée recalcule `isMine`/`neighborMines` avec le code courant (`restoreInfiniteGame`). Si `isMineAt`/`densityAt`/`densityJitter` changent, versionner le snapshot ou garder l'ancienne formule.
- **Génération Legacy** : le serveur rejoue avec un seul moteur épinglé. Changer la génération du plateau Legacy fait refuser les victoires en attente et celles des APK pas à jour. Si ça arrive : `engineVersion` dans la soumission.
- **Achats in-app** : ne jamais rattacher un achat au seul `playerId` (il circule dans les sauvegardes), ni le garder seulement en local ; vérifier chaque achat côté serveur. Si un login est nécessaire (consommables, achats web + APK), il sort dans la même version que les achats.

## Docs / cosmétique

- [ ] **Dépendances front** : 12 paquets en retard de correctifs, `npm audit` (outillage seulement) → `npm update` + `npm audit fix`.
- [ ] **Prettier** : `src/composables/useMoveLog.js` et `useHeartFogReveal.test.js` hors format.
- [ ] **README front, `canGiveUp`** (ligne 71) : décrit le compteur brut, le code utilise `getEffectiveMines` (net des cœurs).
- [ ] **README front** : la section « Classement en ligne (Legacy) » ne couvre ni le classement Infini ni sa file d'attente, ni `accountOnline.js`/`onlineApi.js`.
- [ ] **[serveur] README, « Lien avec le front »** : mentionner `accountOnline.js` et `onlineApi.js`.
- [ ] **Commentaires périmés** : prop `devUnlocked` de `BurgerMenu.vue` (« Legacy derrière le bouton DEV »), `username.js` (anti-doublon « à venir », il existe).
