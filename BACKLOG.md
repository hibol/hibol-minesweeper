# Backlog technique

Dette, bugs latents et refactorings repérés en codant autre chose. Un point
disparaît dans le commit qui le règle (l'historique git garde la trace).
`[serveur]` = dépôt `hibol-minesweeper-server`.

## Sécurité / robustesse serveur

- [ ] **[serveur] Admin** : `admin`/`admin` par défaut si les variables d'environnement manquent (`SecurityConfig.java:62`, `application.properties:10`) → supprimer la valeur par défaut, ou refuser de démarrer hors dev ; pas de limite d'essais sur `POST /login`.
- [ ] **[serveur] Conteneur en root** : pas de `USER` dans l'étage final du `Dockerfile`.
- [ ] **[serveur] `limit` des classements** ni validé ni plafonné (`LegacyController.java:130`, `InfiniteController.java:102`) : négatif → 500, énorme → toute la table.
- [ ] **[serveur] `spring.jpa.open-in-view` actif par défaut** (avertissement au démarrage) : la session Hibernate reste ouverte pendant tout le rendu. Les contrôleurs renvoient des records, rien n'en dépend a priori → `spring.jpa.open-in-view=false` dans `application.properties`, tests relancés.
- [ ] **[serveur] Codes de pairage jamais purgés** : un code expiré mais jamais saisi reste en mémoire jusqu'au redémarrage (`PlayerLinkCodeService`). Purger les expirés dans `generate()`.
- [ ] **[serveur] `POST /api/infinite/submissions` sans limite par IP** : elle appelle aussi `PlayerService.claim`, donc crée un joueur pour tout `playerId` inconnu. Un script peut contourner la limite de `/claim` pour réserver des pseudos. Même `RateLimiter` que `/api/legacy/submissions`.

## CI / livraison

- [ ] **CI front** : `ci.yml` ne lance pas `npm run build` (une PR qui casse le build n'est vue qu'au déploiement) et n'a pas de bloc `permissions: contents: read` ; `deploy.yml` n'a pas `cache: npm` sur `setup-node`.
- [ ] **[serveur] Déploiement** : pas de `concurrency` sur le job de déploiement (deux pushes rapprochés peuvent finir sur l'image `latest` la plus ancienne) ; clé SSH non supprimée si `ssh` échoue (`trap 'rm -f /tmp/deploy_key' EXIT`) ; actions à monter ensemble (`docker/build-push-action` v5 → v6) ; `mvnw` versionné sans bit exécutable (`git update-index --chmod=+x mvnw`).
- [ ] **[serveur] Tests d'intégration lents** : chaque classe démarre son propre MySQL (~13 s × 6) → conteneur partagé (`@TestConfiguration` avec un bean `@ServiceConnection`, ou classe de base) ; figer le tag `mysql:8` sur la version mineure de prod.

## APK

- [ ] **`dist/` partagé entre build Pages et build APK** (`vite.config.js:19`) : un `npx cap sync` après un `npm run build` embarque le build Pages (base `/hibol-minesweeper/`) et l'APK affiche une page blanche. → script `"android:sync": "npm run build:apk && cap sync android"` (et le citer dans le README), ou un `outDir` séparé pour la cible APK.
- [ ] **`aaptOptions` déprécié** (`android/app/build.gradle:45`, modèle Capacitor) → `androidResources { ignoreAssetsPattern … }`, seulement si AGP 9 le retire ou si Capacitor change son modèle.
- [ ] **Événement `online` dans la WebView** : vérifier sur appareil qu'il se déclenche au retour du réseau. Sinon, relancer les trois files d'attente (Legacy, Infini, pseudo) quand l'app revient au premier plan.

## UI

- [ ] **Case à cocher pixel en double** : même style recopié dans `BurgerMenu.vue` (`.settings-checkbox`) et `IntroDialog.vue` (`.intro-checkbox`) → une règle globale dans `style.css` pour la case elle-même, la mise en page restant locale.
- [ ] **LEGACY TIMES invisible pour un acheteur sans victoire** : la page (et son onglet Online) n'apparaît qu'en DEV ou avec un temps local (`legacyTimesVisible`, `BurgerMenu.vue`). Ajouter `legacyUnlocked` à la condition.

- [ ] **Zoom pincer saccadé, deux causes repérées** : le voile se redessine de façon synchrone à chaque pas de zoom (`watch(..., draw)`, `usePixelFog.js:274`) au lieu d'une fois par frame, et `zoomBy` appelle `getBoundingClientRect` à chaque pas (`useViewportCamera.js:74`). → dessin du voile dans un `requestAnimationFrame`, rect du conteneur mémorisé par le `ResizeObserver` existant.
- [ ] **Zoom restauré sans validation** (`App.vue:1047` et `:1758`) : `snapshot.camera.cellSize` est réappliqué tel quel. Depuis le niveau carte, une valeur sous 1 px est légitime, mais 0, NaN ou une valeur négative casseraient la caméra (divisions par `cellSize`). → n'accepter qu'un nombre fini > 0, borné à `MAX_CELL_SIZE`, sinon le zoom de base.
- [ ] **Carte : reconstruction pendant la marche d'un robot** (`MapCanvas.vue:19`) : toutes les 200 ms, l'image de base est refaite en entier (parcours de toutes les cases et nouvelle allocation). Correct aujourd'hui ; à surveiller sur une très longue partie au téléphone, sinon mise à jour incrémentale des seuls pixels changés.

## Contrat front/back

- [ ] **[serveur] JSON malformé sur `/api/legacy/players/*`** : `PlayerController` n'a pas l'`@ExceptionHandler(HttpMessageNotReadableException)` des deux autres contrôleurs, Spring renvoie son corps d'erreur par défaut au lieu de `{ "reason": "invalid_request" }`.
- [ ] **[serveur] Routes d'identité sous `/api/legacy/players`** alors qu'elles servent à tous les modes. Renommer seulement avec une période où les deux routes coexistent (APK installés). Priorité basse.
- [ ] **Pseudo de repli réclamé sans toast** : après un `username_taken`, si le 2e envoi (pseudo aléatoire) prend un 503, le serveur a déjà réclamé ce pseudo mais `submitLegacyWin` lève avant le toast ; le joueur ne saura jamais son nom en ligne. Rare (collision + surcharge).
- [ ] **Victoire Legacy refusée en 503/429 retentée tard** : la file d'attente n'est relancée qu'au démarrage et sur l'événement `online` (`App.vue`). Une victoire refusée pour `replay_busy` attend le prochain lancement. Priorité basse : un retry différé (quelques minutes) suffirait.

## À garder en tête (pas d'action tant que rien ne change)

- **Génération Infini** : une partie restaurée recalcule `isMine`/`neighborMines` avec le code courant (`restoreInfiniteGame`). Si `isMineAt`/`densityAt`/`densityJitter` changent, versionner le snapshot ou garder l'ancienne formule.
- **Génération Legacy** : le serveur rejoue avec un seul moteur épinglé. Changer la génération du plateau Legacy fait refuser les victoires en attente et celles des APK pas à jour. Si ça arrive : `engineVersion` dans la soumission.
- **`flatDir` dans `android/app/build.gradle:74`** : avertissement Gradle « Using flatDir should be avoided ». Bloc généré par Capacitor, à laisser tant que son modèle le contient.
- **Achats in-app** : ne jamais rattacher un achat au seul `playerId` (il circule dans les sauvegardes), ni le garder seulement en local ; vérifier chaque achat côté serveur. Si un login est nécessaire (consommables, achats web + APK), il sort dans la même version que les achats.

## Docs / cosmétique

- [ ] **Dépendances front** : 12 paquets en retard de correctifs, `npm audit` (outillage seulement) → `npm update` + `npm audit fix`.
- [ ] **README front, `canGiveUp`** (ligne 71) : décrit le compteur brut, le code utilise `getEffectiveMines` (net des cœurs).
- [ ] **README front** : la section « Classement en ligne (Legacy) » ne couvre ni le classement Infini ni sa file d'attente, ni `accountOnline.js`/`onlineApi.js`.
- [ ] **[serveur] README, « Lien avec le front »** : mentionner `accountOnline.js` et `onlineApi.js`.
- [ ] **Commentaires périmés** : prop `devUnlocked` de `BurgerMenu.vue` (« Legacy derrière le bouton DEV »), `username.js` (anti-doublon « à venir », il existe).
