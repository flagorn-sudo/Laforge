# Forge - Tâches à faire

## Priorité Haute

### Menu macOS en français (TERMINÉ)
**Objectif**: Ajouter le menu natif macOS en haut de l'écran, avec les labels en français.

**Tâches**:
- [x] Créer le menu dans `src-tauri/src/main.rs` avec les labels français
- [x] Ajouter les items de menu: Forge, Fichier, Édition, Affichage, Projet, Fenêtre, Aide
- [x] Implémenter les handlers de menu avec événements Tauri
- [x] Créer le hook `useMenuEvents` côté React pour écouter les événements
- [x] Intégrer le hook dans `App.tsx`

**Menus implémentés**:
- **Forge**: À propos, Préférences (⌘,), Services, Masquer, Quitter
- **Fichier**: Nouveau projet (⌘N), Fermer (⌘W)
- **Édition**: Annuler, Refaire, Couper, Copier, Coller, Tout sélectionner
- **Affichage**: Actualiser (⌘R), Plein écran
- **Projet**: Ouvrir dans Finder (⌘⇧O), Ouvrir le site (⌘⇧B), Synchroniser (⌘⇧S), Scraper
- **Fenêtre**: Réduire, Zoom, Fermer
- **Aide**: Documentation, Signaler un problème

**Fichiers modifiés**:
- `src-tauri/src/main.rs` - Fonctions `create_menu()` et `handle_menu_event()`
- `src/hooks/useMenuEvents.ts` - Nouveau hook pour écouter les événements menu
- `src/hooks/index.ts` - Export du hook
- `src/App.tsx` - Intégration du hook

---

### Génération de documentation Markdown (Brief projet) (TERMINÉ)
**Objectif**: Bouton pour générer un fichier Markdown complet servant de brief pour la création du nouveau site.

**Contenu du document**:
- [x] **Informations projet**
  - Nom du site / client
  - Description de l'activité (profil client généré par IA)
  - URL du site actuel

- [x] **Arborescence du site**
  - Structure suggérée ou extraite du scraping
  - Format: arbre de pages avec hiérarchie

- [x] **Charte graphique**
  - Palette de couleurs (issues du scraping)
  - Variables CSS suggérées (`--color-primary`, etc.)
  - Polices détectées
  - Orientations design (themeTags)

- [x] **Médiathèque disponible**
  - Tableau des dossiers avec comptage des fichiers:
    - `References/images/` - Images récupérées de l'ancien site
    - `Assets/images/` - Nouvelles images fournies
    - `Assets/design/` - Maquettes, logos

- [x] **Sites de référence graphique**
  - Liste des sites d'inspiration avec liens cliquables

- [x] **Instructions pour le développement**
  - Dossier de travail: `www/`
  - Structure recommandée
  - Points d'attention (checklist)
  - Infos déploiement FTP si configuré

**Fichiers créés/modifiés**:
- `src/services/briefGenerator.ts` - Service de génération du brief
- `src/components/ProjectDetail.tsx` - Bouton "Générer le brief" dans Actions rapides
- Output: `Documentation/brief-projet.md`

---

### Persistance des statistiques de scraping (TERMINÉ)
**Objectif**: Sauvegarder et afficher les résultats du scraping pour voir qu'un scraping a déjà été effectué.

**État actuel**:
- [x] Type `ScrapingStats` ajouté dans `src/types/index.ts`
- [x] `scrapingStore.ts` mis à jour pour sauvegarder les stats dans le projet
- [x] `ScrapingPanel.tsx` mis à jour pour afficher les stats précédentes
- [x] Prop `project` ajoutée à l'appel de ScrapingPanel dans `ProjectDetail.tsx`
- [x] Tester la sauvegarde et l'affichage des stats

**Fichiers modifiés**:
- `src/types/index.ts` - Nouveau type `ScrapingStats`
- `src/stores/scrapingStore.ts` - Sauvegarde des stats après scraping
- `src/features/scraping/components/ScrapingPanel.tsx` - Affichage des stats précédentes
- `src/components/ProjectDetail.tsx` - Prop `project={project}` ajoutée à `<ScrapingPanel>`
- `src/hooks/useScraping.ts` - Hook mis à jour pour cohérence

---

### Indicateur d'avancement du scraping amélioré (TERMINÉ)
**Objectif**: Afficher un stepper visuel montrant les étapes du scraping.

**Étapes affichées**:
1. **Scraping** - Téléchargement des pages et assets
2. **Organisation** - Organisation des fichiers dans les dossiers
3. **Amélioration** - Amélioration des textes avec Gemini (optionnel)
4. **Documentation** - Génération de la documentation

**Fichiers modifiés**:
- `src/features/scraping/components/ScrapingPanel.tsx` - Ajout du composant stepper
- `src/features/scraping/components/ScrapingPanel.css` - Styles du stepper

---

### Suppression des données de scraping améliorée (TERMINÉ)
**Objectif**: Permettre de supprimer les données de scraping avec option de supprimer aussi les fichiers téléchargés.

**Fonctionnalités**:
- [x] Modal de confirmation au lieu d'un simple confirm()
- [x] Checkbox pour supprimer aussi les fichiers téléchargés
- [x] Suppression des dossiers `_Inbox/scraped`, `References/images`, `References/styles`
- [x] Réinitialisation des couleurs et polices si fichiers supprimés
- [x] Indicateur de chargement pendant la suppression

**Fichiers modifiés**:
- `src/features/scraping/components/ScrapingPanel.tsx` - Modal et logique de suppression
- `src/features/scraping/components/ScrapingPanel.css` - Styles du modal

---

### Integration des modules Rust avances (TERMINE)
**Objectif**: Integrer les modules Rust (Delta Sync, Version History, Scheduler, etc.) dans l'interface.

**Modules Rust integres**:
- [x] `delta_sync.rs` - Synchronisation incrementale par chunks
- [x] `version_history.rs` - Snapshots et restauration
- [x] `scheduler.rs` - Planification cron des syncs
- [x] `parallel_sync.rs` - Transfert multi-connexions
- [x] `transfer_resume.rs` - Reprise transferts interrompus
- [x] `full_site_scraper.rs` - Scraping complet de sites

**Integration Frontend**:
- [x] Export des stores dans `stores/index.ts` (versionStore, scheduleStore, hooksStore)
- [x] Ajout des boutons "Outils avances" dans l'onglet FTP
- [x] Modal Version History integre dans ProjectDetail
- [x] Modal Sync Scheduler integre dans ProjectDetail
- [x] Initialisation du scheduler au demarrage de l'app
- [x] Styles CSS pour les boutons d'outils avances

**Fichiers modifies**:
- `src/stores/index.ts` - Exports des nouveaux stores
- `src/components/ProjectDetail.tsx` - Integration des modals
- `src/styles/globals.css` - Styles pour les outils avances
- `src/App.tsx` - Initialisation du scheduler

---

## Priorite Haute

### Revoir système d'affichage des projets (À FAIRE)
**Objectif**: Simplifier l'interface - la sidebar actuelle n'est peut-être pas très utile.

**Problèmes identifiés**:
- La sidebar affiche une liste de projets qui duplique la vue centrale
- Avec l'ajout des filtres et recherche, les deux vues sont redondantes
- Espace gaspillé dans la colonne de gauche

**Options à évaluer**:
1. **Supprimer la sidebar** - Garder uniquement la vue centrale avec filtres/recherche
2. **Sidebar minimale** - Juste le logo, bouton nouveau projet, et bouton paramètres
3. **Sidebar contextuelle** - Afficher infos du projet sélectionné au lieu de la liste

**Fichiers concernés**:
- `src/components/Sidebar.tsx`
- `src/components/ProjectList.tsx`
- `src/App.tsx`
- `src/styles/globals.css`

**Status**: À PLANIFIER

---

## Priorité Moyenne

### Améliorations UX
- [x] Indicateur de progression plus détaillé pendant le scraping
  - Composant `ScrapingProgress.tsx` avec stepper visuel
  - 4 étapes : Scraping → Organisation → Documentation → Amélioration
  - Barre de progression avec gradient
  - Descriptions contextuelles pour chaque étape
- [ ] Historique des scraping (plusieurs runs)
- [ ] Export des résultats de scraping en JSON/CSV

### Indicateur de progression pour la synchronisation FTP (TERMINÉ)
- [x] Store `syncStore.ts` pour gérer l'état de synchronisation
- [x] Composant `SyncProgress.tsx` avec :
  - Barre de progression visuelle
  - Liste des fichiers en cours de sync
  - Statut par fichier (pending, uploading, uploaded, error)
  - Compteur fichiers envoyés / total
- [x] Intégration dans l'onglet FTP de ProjectDetail
- [x] Bascule automatique sur l'onglet FTP au lancement de la sync

### Refactoring restant
- [ ] Finaliser le split de `FTPSection.tsx` en sous-composants
- [ ] Extraire les hooks de `ProjectFileTree.tsx`

---

## Notes techniques

### Rate limiting Gemini API (corrigé)
- Délai de 2s entre les batches d'amélioration de texte
- Retry automatique avec backoff exponentiel sur erreur 429
- Fichier: `src/services/gemini/textProcessor.ts`

---

## Priorité Haute

### Blocage UI lors de sync FTP après timeout (TERMINÉ)
**Objectif**: L'application plante/ne répond plus si on clique sur "Synchroniser" après un timeout de connexion FTP.

**Problème identifié**:
1. Les opérations FTP côté Rust sont **synchrones et bloquantes** (main.rs)
2. Le timeout côté Rust est de 10s sur le connect, mais les opérations de lecture/écriture n'ont pas de timeout global
3. Après un timeout frontend (15s), rien n'empêche de relancer une sync
4. Le `syncStore.ts` retente jusqu'à 4 fois de se connecter (4 x 10s = 40s de blocage potentiel)
5. Pendant ce temps, l'UI React attend la réponse Tauri et devient non-responsive

**Solutions implementees**:
- [x] **Timeout global frontend** : `withTimeout()` dans sftpService.ts avec Promise.race
  - Connection: 15s
  - Diff: 30s
  - Sync: 5min
  - List: 20s
- [x] **Protection contre les syncs multiples** : Map `ongoingOperations` dans sftpService
- [x] **État de connexion persistant** : `lastConnectionFailed` et `lastConnectionAttempt` dans syncStore
- [x] **Cooldown après échec** : 5 secondes avant de pouvoir relancer une sync après un timeout
- [x] **Méthode canStartSync()** : Vérifie si une sync peut démarrer avant de lancer
- [x] **Bouton désactivé** : Le bouton Sync est désactivé pendant le cooldown
- [x] **Bouton Réessayer** : Permet de réinitialiser l'état de connexion manuellement

**Fichiers modifies**:
- `src/services/sftpService.ts` - Ajout withTimeout, ongoingOperations, isSyncInProgress, clearOperationLock
- `src/stores/syncStore.ts` - Ajout canStartSync, clearConnectionError, lastConnectionFailed, lastConnectionAttempt
- `src/components/ProjectDetail.tsx` - Utilisation de syncAllowed, bouton Réessayer

---

### Blocage UI lors du scraping (TERMINÉ)
**Objectif**: L'application ne répond plus pendant le scraping.

**Solutions implementees**:
- [x] **Timeout global** : 5 minutes max pour le scraping complet
- [x] **Protection contre les scrapings multiples** : Variable `currentScrapingProjectId`
- [x] **Fonction withTimeout()** dans scrapingService.ts
- [x] **Transformation snake_case -> camelCase** pour compatibilité frontend

**Fichiers modifies**:
- `src/services/scrapingService.ts` - Ajout withTimeout, isScrapingInProgress, scrapeWebsiteWithEvents
- `src/features/scraping/components/ScrapingPanel.tsx` - Utilisation du nouveau service

---

## Prochaines tâches

### Revoir système d'affichage des projets (À FAIRE)
**Objectif**: Simplifier l'interface (sidebar redondante avec liste centrale)

### FileWatcher (_Inbox) (PLANIFIÉ)
**Objectif**: Trier automatiquement les fichiers déposés dans _Inbox

### Cache Scraping (Rust) (PLANIFIÉ)
**Objectif**: Éviter de re-scraper les mêmes pages
