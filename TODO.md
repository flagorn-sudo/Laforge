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
- [ ] Tester la sauvegarde et l'affichage des stats

**Fichiers modifiés**:
- `src/types/index.ts` - Nouveau type `ScrapingStats`
- `src/stores/scrapingStore.ts` - Sauvegarde des stats après scraping
- `src/features/scraping/components/ScrapingPanel.tsx` - Affichage des stats précédentes
- `src/components/ProjectDetail.tsx` - Prop `project={project}` ajoutée à `<ScrapingPanel>`
- `src/hooks/useScraping.ts` - Hook mis à jour pour cohérence

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
