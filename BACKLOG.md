# Backlog technique

Dette, bugs latents et refactorings repérés en codant autre chose. Un point
disparaît dans le commit qui le règle (l'historique git garde la trace).
`[serveur]` = dépôt `hibol-minesweeper-server`.

## Sécurité / robustesse serveur

- [ ] **[serveur] Conteneur en root** : pas de `USER` dans l'étage final du `Dockerfile`.
- [ ] **[serveur] Limite du login contournable en IPv6** (`LoginAttemptFilter.java`) : un attaquant change d'adresse dans son /64. → clé = préfixe /64 pour les adresses IPv6 (vaut aussi pour les autres `RateLimiter` par IP).
- [ ] **[serveur] `/merge` d'un joueur vers lui-même en changeant la casse** (`PlayerMergeService.java:43`) : `equals` tient compte de la casse, la colonne `player_id` non. Un merge de « AAAA… » vers « aaaa… » supprime le joueur et tous ses scores (il faut connaître son propre `playerId` : auto-sabotage, mais bug). → `equalsIgnoreCase`, ou n'accepter que des UUID en minuscules dans `PlayerIds`.
- [ ] **[serveur] Imitations de pseudos encore possibles** (`PlayerService.java:27`) : espace insécable U+00A0, caractères invisibles hors des catégories refusées (U+3164, U+2800), marques combinantes empilées, homoglyphes (« а » cyrillique). → normaliser en NFKC, refuser les espaces autres que U+0020, et à terme une comparaison par « squelette » (Unicode TR39) pour l'unicité.

## CI / livraison

- [ ] **CI front** : `ci.yml` ne lance pas `npm run build` (une PR qui casse le build n'est vue qu'au déploiement) et n'a pas de bloc `permissions: contents: read` ; `deploy.yml` n'a pas `cache: npm` sur `setup-node`.
- [ ] **[serveur] Déploiement** : pas de `concurrency` sur le job de déploiement (deux pushes rapprochés peuvent finir sur l'image `latest` la plus ancienne) ; clé SSH non supprimée si `ssh` échoue (`trap 'rm -f /tmp/deploy_key' EXIT`) ; `known_hosts` figé sur l'IP du VPS en dur (`deploy.yml:75-82`) alors que l'hôte vient d'un secret → la ligne `known_hosts` dans un secret ; actions à monter ensemble (`docker/build-push-action` v5 → v6) ; `mvnw` versionné sans bit exécutable (`git update-index --chmod=+x mvnw`).
- [ ] **[serveur] Tests d'intégration lents** : chaque classe démarre son propre MySQL (~13 s × 6) → conteneur partagé (`@TestConfiguration` avec un bean `@ServiceConnection`, ou classe de base) ; figer le tag `mysql:8` sur la version mineure de prod.
- [ ] **[serveur] Requêtes en trop à chaque soumission** (`PlayerService.java:49`) : `touch()` + `save()` sur une entité détachée (sans open-in-view) = un SELECT et un UPDATE de plus. → requête `@Modifying` « UPDATE players SET last_active_at = :now WHERE player_id = :id ».

## APK

- [ ] **`aaptOptions` déprécié** (`android/app/build.gradle:45`, modèle Capacitor) → `androidResources { ignoreAssetsPattern … }`, seulement si AGP 9 le retire ou si Capacitor change son modèle.
- [ ] **Événement `online` dans la WebView** : vérifier sur appareil qu'il se déclenche au retour du réseau. Sinon, relancer les trois files d'attente (Legacy, Infini, pseudo) quand l'app revient au premier plan.
- [ ] **Export PNG : lien révoqué trop tôt** (`App.vue:926`) : `URL.revokeObjectURL` juste après `link.click()` peut annuler le téléchargement sur certains navigateurs ; dans la WebView, `<a download>` sur un blob ne marche probablement pas du tout. → révoquer après un `setTimeout`, et passer les exports par `@capacitor/filesystem` + `share` dans l'APK (deuxième passe APK).

## UI

- [ ] **Case à cocher pixel en double** : même style recopié dans `BurgerMenu.vue` (`.settings-checkbox`) et `IntroDialog.vue` (`.intro-checkbox`) → une règle globale dans `style.css` pour la case elle-même, la mise en page restant locale.
- [ ] **LEGACY TIMES invisible pour un acheteur sans victoire** : la page (et son onglet Online) n'apparaît qu'en DEV ou avec un temps local (`legacyTimesVisible`, `BurgerMenu.vue`). Ajouter `legacyUnlocked` à la condition.
- [ ] **Temps locaux avec l'ancien pseudo** (`legacyScores.js:74` et `:112`) : chaque temps local garde le pseudo du moment, donc après un renommage la liste mélange ancien et nouveau nom. → ne plus afficher ce nom dans la liste locale, ou afficher le pseudo actuel.
- [ ] **Petites retouches pseudo** : placeholder « up to 12 characters » en dur (`UsernameDialog.vue:133`) → le construire avec `MAX_USERNAME_LENGTH` ; `word-break: break-word` déprécié sur `.menu-username` (`BurgerMenu.vue:1799`) → `overflow-wrap: anywhere`.
- [ ] **Position de caméra restaurée sans validation** (`App.vue:1053` et `:1764`) : `originX`/`originY` sont réappliqués tels quels, un NaN casse la caméra comme le faisait `cellSize`. → étendre `restoredCellSize` en `restoredCamera(camera, base)`.
- [ ] **Voile : canvas réalloué et couleur relue à chaque dessin** (`usePixelFog.js:173` et `:181`) → ne redimensionner que si la taille change, garder `--fog-color` en cache par thème.
- [ ] **Easing et boucle de tween dupliqués** (`useOriginTween.js`, `useFogRadiusTween.js`) : `easeOutCubic` et la boucle `requestAnimationFrame` recopiés → un petit utilitaire commun.
- [ ] **`onGridTap` relit encore la position du conteneur** (`App.vue:1642`, `getBoundingClientRect`) : sans gravité (une fois par tap) → exposer la position mémorisée par `useViewportCamera`.

## Moteur et robots

- [ ] **Clics bloqués pour toujours si un pas de robot plante** (`useRobotAnimation.js:166`, `runDueSteps`) : une exception dans `stepRobotWalk` empêche de planifier les pas suivants et laisse `robotAnimationsActive` > 0. → `try`/`catch` qui termine les marches (`finishRobotWalks`) puis arrête les timers.
- [ ] **Pop du robot rejoué au remontage** (`MineCell.vue:223`) : un robot arrêté qui sort du champ puis y revient refait son pop. Mineur. → remettre `robotPop` à `false` sur `animationend`, comme `heartPopped`.
- [ ] **Snapshots de test écrits à la main** (`game.restore.test.js:54`, `game.robot.test.js:122`) : ils dupliquent `saveActiveGame`, d'où l'oubli de `robotMinDensity` passé inaperçu (les tests l'incluaient, pas le vrai code). → extraire une fonction pure `infiniteSnapshot(game)` de `gameStorage.js` et l'utiliser dans les tests.
- [ ] **Helpers de test robot dupliqués** (`useRobotAnimation.test.js:37`) : `room` et `cellProps` recopient ceux de `game.robot.test.js`, sans `closedRoom`. → un module de helpers de test partagé.
- [ ] **Mock incomplet dans `legacyOnline.test.js`** : le mock de `legacyPendingSubmissions` n'expose pas `clearPendingSubmission`, alors que `accountOnline.js` (réel dans ce test) l'importe. Ça passe parce que l'export n'est lu qu'à l'appel → ajouter l'export au mock.

## Contrat front/back

- [ ] **[serveur] Soumission Legacy sans `moves` → 500** (`LegacyController.java:88`, NullPointerException) → `invalid_moves` (400).
- [ ] **[serveur] Paramètre manquant ou mal typé sur les classements et `/best`** (`difficulty`/`category` absent, `limit=abc`) : corps d'erreur JSON par défaut de Spring au lieu d'un 400 sans corps comme les autres refus → `@ExceptionHandler` pour `MissingServletRequestParameterException` et `MethodArgumentTypeMismatchException`.
- [ ] **[serveur] Longueur du pseudo comptée en UTF-16** (`PlayerService.java:27`) : un emoji compte pour 2, MySQL compte les caractères (la limite de 32 vaut 16 emoji). → `codePointCount`, ou le documenter.
- [ ] **`playerId` importé sans validation** (`playerId.js:11`) : un `player-id` non-UUID venu d'une sauvegarde importée est repris tel quel, et depuis que le serveur exige un UUID, toutes ses soumissions répondent `invalid_request` pour toujours. → valider le format à la lecture ou à l'import, sinon en régénérer un.
- [ ] **Réclamation en attente jamais effacée sur `invalid_request`** (`accountOnline.js:113`) : seule une réponse sans `reason` l'efface, elle est renvoyée à chaque démarrage. N'arrive qu'avec un `playerId` hors format (point précédent). → traiter `invalid_request` comme définitif.
- [ ] **[serveur] Routes d'identité sous `/api/legacy/players`** alors qu'elles servent à tous les modes. Renommer seulement avec une période où les deux routes coexistent (APK installés). Priorité basse.
- [ ] **Renvois du démarrage en parallèle** (`App.vue`, ~lignes 1902-1910) : réclamation en attente, runs Infini et victoires Legacy partent en même temps. Avec un serveur qui ne renvoie pas encore `username` dans les soumissions, deux replis simultanés peuvent chacun se croire acquis : deux toasts, deux noms différents. → enchaîner ces renvois, ou partager une promesse de réclamation en cours.
- [ ] **Victoire Legacy refusée en 503/429 retentée tard** : la file d'attente n'est relancée qu'au démarrage et sur l'événement `online` (`App.vue`). Une victoire refusée pour `replay_busy` attend le prochain lancement. Priorité basse : un retry différé (quelques minutes) suffirait.

## À garder en tête (pas d'action tant que rien ne change)

- **Génération Infini** : une partie restaurée recalcule `isMine`/`neighborMines` avec le code courant (`restoreInfiniteGame`). Si `isMineAt`/`densityAt`/`densityJitter` changent, versionner le snapshot ou garder l'ancienne formule.
- **Génération Legacy** : le serveur rejoue avec un seul moteur épinglé. Changer la génération du plateau Legacy fait refuser les victoires en attente et celles des APK pas à jour. Si ça arrive : `engineVersion` dans la soumission.
- **`flatDir` dans `android/app/build.gradle:74`** : avertissement Gradle « Using flatDir should be avoided ». Bloc généré par Capacitor, à laisser tant que son modèle le contient.
- **Position du conteneur mémorisée** (`useViewportCamera.js:34`) : rafraîchie au redimensionnement et au défilement. Si le conteneur bouge sans changer de taille ni défiler (l'en-tête grandit pendant que le pied rétrécit d'autant), le point focal du zoom serait décalé → la rafraîchir au début de chaque pincement.
- **Clés `v-for` des classements** (`${username}-${submittedAt}`) : un renommage entre deux chargements change la clé, sans conséquence aujourd'hui. Si le serveur exposait un identifiant public stable par ligne, l'utiliser.
- **Achats in-app** : ne jamais rattacher un achat au seul `playerId` (il circule dans les sauvegardes), ni le garder seulement en local ; vérifier chaque achat côté serveur. Si un login est nécessaire (consommables, achats web + APK), il sort dans la même version que les achats.

## Docs / cosmétique

- [ ] **Dépendances front** : 12 paquets en retard de correctifs, `npm audit` (outillage seulement) → `npm update` + `npm audit fix`.
- [ ] **README front, `canGiveUp`** (ligne 71) : décrit le compteur brut, le code utilise `getEffectiveMines` (net des cœurs).
- [ ] **README front** : la section « Classement en ligne (Legacy) » ne couvre ni le classement Infini ni sa file d'attente, ni `accountOnline.js`/`onlineApi.js`.
- [ ] **[serveur] README, « Lien avec le front »** : mentionner `accountOnline.js` et `onlineApi.js`.
- [ ] **[serveur] Ligne de 146 caractères** (`SecurityConfigTest.java:89`, UUID dans un JSON en ligne) → extraire le corps dans une constante.
- [ ] **Commentaires périmés** : prop `devUnlocked` de `BurgerMenu.vue` (« Legacy derrière le bouton DEV »), `username.js:4-8` et le commentaire de `generateRandomUsername` (anti-doublon « à venir avec le réseau », il existe côté serveur).
