# Notes Techniques - Forge App

## Dernière mise à jour: 2026-01-19

---

## Bugs Identifiés et Corrigés

### 1. Sauvegarde FTP Settings - Problème de persistance

**Symptôme**: Le mot de passe FTP s'affiche comme "manquant" après fermeture/réouverture de l'app.

**Causes identifiées**:
1. Le flag `passwordAvailable` n'était pas mis à jour après sauvegarde
2. Le `projectId` utilisé comme clé keychain contenait des `/` (chemin complet)
3. **NOUVEAU (2026-01-18)**: Le nom du service keyring "forge-app" causait des problèmes sur macOS
   - `set_password()` retournait Ok() mais le password n'était pas réellement stocké
   - Erreur: "No matching entry found in secure storage" immédiatement après save

**Solutions appliquées**:

1. (`src/components/ProjectDetail.tsx`) - Mise à jour du flag:
```typescript
const hasPassword = passwordSaved || Boolean(hasSftp && sftpForm.password);
const finalProject: Project = {
  ...updated,
  sftp: { ...updated.sftp, passwordAvailable: hasPassword },
};
```

2. (`src/services/sftpService.ts`) - Clé keychain sanitisée:
```typescript
function sanitizeKeyForKeychain(projectId: string): string {
  const parts = projectId.split('/').filter(Boolean);
  const projectName = parts[parts.length - 1] || 'unknown';
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash) + projectId.charCodeAt(i);
  }
  return `${projectName.replace(/[^a-zA-Z0-9-_]/g, '_')}_${Math.abs(hash).toString(36)}`;
}
// Exemple: /Users/.../Novamind -> Novamind_abc123
```

3. **NOUVEAU** (`src-tauri/src/main.rs`) - Nom de service keyring corrigé:
```rust
// Avant: "forge-app" (problématique)
// Après: "com.forge.app" (format bundle ID standard macOS)
const KEYRING_SERVICE: &str = "com.forge.app";

// + Vérification immédiate après save
fn save_password(key: String, password: String) -> Result<(), String> {
    // ... save ...
    // Vérifier que le password est vraiment là
    let verify_entry = keyring::Entry::new(KEYRING_SERVICE, &key)?;
    match verify_entry.get_password() {
        Ok(retrieved) if retrieved == password => Ok(()),
        _ => Err("Password was not saved correctly".to_string())
    }
}
```

4. (`src/services/sftpService.ts`) - Logs d'erreur supprimés pour les cas attendus:
   - Ne pas trouver un password est normal pour les projets sans credentials sauvegardés
   - Plus de spam d'erreurs dans la console au chargement de la page d'accueil

**Status**: ABANDONNE - Le keyring crate v3 ne fonctionne pas sur macOS

### 1b. Sauvegarde FTP Settings - NOUVELLE SOLUTION (2026-01-18)

**Problème**: Le keyring crate v3 ne sauvegarde pas réellement les mots de passe sur macOS.

**Nouvelle solution**: Utiliser le Tauri Store (même technologie que pour les configs projet)

**Fichiers modifiés**:
- `src/services/configStore.ts` - Ajout des méthodes `saveCredential`, `getCredential`, `hasCredential`, `deleteCredential`
- `src/services/sftpService.ts` - Utilise `configStore` au lieu du keychain Rust

**Stockage**: `~/Library/Application Support/com.forge.app/credentials.dat`

**Sécurité**: Les mots de passe sont obfusqués (XOR + Base64), pas cryptographiquement sécurisé mais:
- Mieux que du texte en clair
- Le dossier Application Support est protégé par les permissions utilisateur
- Suffisant pour une app de développement local

**Status**: IMPLÉMENTÉ - À TESTER

---

### 2. TreeView DnD (Paramètres > Structure dossiers)

**Symptôme**: Le drag & drop dans la structure des dossiers (Settings) ne fonctionnait pas.

**Cause identifiée**:
- Implémentation custom HTML5 DnD avec problèmes de refs désynchronisées
- Stale closures dans les callbacks useCallback
- État du drag perdu entre dragOver et drop

**Solution appliquée**:
- Réécriture complète avec `@dnd-kit/core`
- Fichiers modifiés:
  - `src/components/ui/TreeView.tsx` - Réécriture avec dnd-kit
  - `src/components/ui/TreeViewUtils.ts` - Utilitaires extraits

**Status**: IMPLÉMENTÉ - À TESTER

---

### 3. ProjectFileTree DnD (Explorateur fichiers projet)

**Symptôme**: Le drag & drop dans l'explorateur de fichiers du projet ne fonctionnait pas.

**Cause identifiée**:
- HTML5 drag & drop API peu fiable avec React
- Zones de drop trop petites
- Événement `drop` ne se déclenchait jamais malgré `dragEnter` fonctionnel

**Solution appliquée**:
- Réécriture complète avec `@dnd-kit/core` (comme TreeView)
- Pattern IDs séparés: draggable=`path`, droppable=`drop:${path}`
- Augmentation taille des éléments (padding: 10px 12px, min-height: 36px)

**Fichier modifié**: `src/features/projects/components/ProjectFileTree.tsx`

**Logs ajoutés**:
- `[ProjectFileTree] dragStart: <path>`
- `[ProjectFileTree] Moving: <source> -> <target>`
- `[ProjectFileTree] Move successful`

**Status**: IMPLÉMENTÉ - À TESTER

---

### 4. Bouton "Ouvrir URL de test"

**Symptôme**: Le bouton ne fait rien quand on clique dessus.

**Investigation**:
- Handler `onClick` correctement attaché (vérifié dans `ProjectDetail.tsx` lignes 329, 445)
- Appelle `projectService.openInBrowser(testUrl)`
- `openInBrowser` utilise `@tauri-apps/api/shell` > `open(url)`
- Permission `shell.open: true` activée dans `tauri.conf.json`

**Logs ajoutés** (`src/services/projectService.ts`):
```typescript
async openInBrowser(url: string): Promise<void> {
  console.log('[projectService] Opening URL in browser:', url);
  if (!url) {
    console.error('[projectService] openInBrowser: URL is empty');
    return;
  }
  try {
    await open(url);
    console.log('[projectService] URL opened successfully');
  } catch (err) {
    console.error('[projectService] Failed to open URL:', err);
  }
}
```

**Pour diagnostiquer**: Cliquer sur le bouton et vérifier la console pour les messages.

**Status**: DIAGNOSTICS EN PLACE - EN ATTENTE DE TEST

---

## Changements d'Architecture Effectués

### Migration vers Tauri Plugin Store

**Problème original**:
- `writeTextFile` pour `.project-config.json` dans le dossier projet
- Problèmes de permissions sur Dropbox/disques externes

**Solution**:
- Utilisation de `@tauri-apps/plugin-store` (v1 branch pour Tauri 1.x)
- Stockage dans `~/Library/Application Support/com.forge.app/`
- Écriture atomique

**Fichiers créés/modifiés**:
- `src-tauri/Cargo.toml` - Ajout dépendance tauri-plugin-store
- `src-tauri/src/main.rs` - Enregistrement plugin
- `src/services/configStore.ts` - NOUVEAU service wrapper
- `src/services/projectService.ts` - Utilise configStore avec migration

### Migration DnD vers dnd-kit

**Dépendances ajoutées**:
```json
"@dnd-kit/core": "^6.x",
"@dnd-kit/sortable": "^8.x",
"@dnd-kit/utilities": "^3.x"
```

**Pattern utilisé**:
- IDs séparés pour draggable et droppable (évite conflits)
- `useDraggable` avec `node.id`
- `useDroppable` avec `drop:${node.id}`
- Fonction `fromDroppableId()` pour extraire l'ID réel

---

## Nouvelles Fonctionnalités (2026-01-18)

### Scraping amélioré

- **Store global pour le scraping** (`src/stores/scrapingStore.ts`)
  - Le scraping persiste quand on change d'onglet
  - État géré globalement par projet

- **Option Gemini cochée par défaut** si clé API configurée

- **Affichage de toutes les couleurs** (plus de limite à 10-12)

- **Bouton "Fusionner similaires"** pour les couleurs
  - Fusionne les couleurs dont la distance RGB < 30
  - Fonction `mergeSimilarColors()` dans ProjectDetail.tsx

- **Meilleure UX pendant le scraping**
  - Message "Veuillez patienter..." avec spinner
  - Bouton "Annuler" pour interrompre
  - Barre de progression avec messages contextuels

### Création de projet simplifiée

- Formulaire réduit à 2 champs : nom + URL (optionnel)
- Génération automatique du profil client si URL fournie
- Structure de dossiers `www/css` et `www/js` ajoutée

### Corrections d'erreurs

- `text.elementType.startsWith` undefined → ajout fallback
- `img.localPath.split` undefined → ajout vérification optionnelle

---

## À Faire

### Terminé
1. [x] Finaliser ProjectFileTree avec dnd-kit
2. [x] Investiguer bouton URL de test (logs ajoutés)
3. [x] Scraping en tâche de fond (store global)
4. [x] Option Gemini cochée par défaut
5. [x] Afficher toutes les couleurs
6. [x] Bouton fusion couleurs similaires

### En cours / À tester
1. [ ] Tester sauvegarde FTP après corrections
2. [ ] Tester TreeView DnD (Settings)
3. [ ] Tester ProjectFileTree DnD (Explorateur fichiers)

### Prochaine session - FileWatcher (_Inbox)

**Objectif**: Trier automatiquement les fichiers déposés dans `_Inbox` vers les bons dossiers.

**Approche choisie**: Hybride (global + override par projet)
- Toggle global dans Settings (`autoOrganize.enabled`)
- Override par projet pour exclure certains projets
- Tri automatique si confiance Gemini ≥ 80%, sinon confirmation

**Backend**: Déjà implémenté
- `src-tauri/src/watcher.rs` - Rust watcher avec notify
- `src/services/fileWatcherService.ts` - Service TypeScript

**Fichiers à créer**:
- `src/stores/fileWatcherStore.ts` - Store Zustand pour l'état global
- `src/hooks/useFileWatcher.ts` - Hook d'initialisation
- `src/components/FileCategorizationModal.tsx` - Modal de confirmation

**Fichiers à modifier**:
- `src/types/index.ts` - Ajouter `fileWatcher?: { excluded: boolean }`
- `src/components/ProjectDetail.tsx` - Toggle par projet
- `src/components/Sidebar.tsx` - Indicateur visuel (Eye icon)
- `src/App.tsx` - Intégration du hook

**Estimation**: ~10-12h

### Prochaine session - Cache Scraping (Rust)

**Objectif**: Éviter de re-scraper les mêmes pages déjà traitées.

**Approche**:
- Stocker les URLs/hashes des pages scrapées dans un fichier cache
- Vérifier le cache avant chaque scrape
- Ajouter option "Force refresh" pour ignorer le cache

**Fichiers à modifier**:
- `src-tauri/src/scraper.rs` - Ajouter logique de cache
- Créer fichier cache dans `_Inbox/.scrape-cache.json`

---

## Commandes Utiles

```bash
# Lancer l'app en dev
npm run tauri dev

# Rebuild Rust uniquement
cd src-tauri && cargo build

# Voir les logs
# Les logs apparaissent dans la console du terminal (pas DevTools)
```

---

## Structure des Fichiers Clés

```
src/
├── components/
│   ├── ui/
│   │   ├── TreeView.tsx      # DnD avec dnd-kit (Settings)
│   │   └── TreeViewUtils.ts  # Utilitaires arbre
│   ├── Sidebar.tsx           # Navigation + recherche/tri
│   ├── ProjectList.tsx       # Liste projets + filtres
│   └── ProjectDetail.tsx     # Détail projet + FTP form
├── features/
│   └── projects/
│       └── components/
│           └── ProjectFileTree.tsx  # Explorateur fichiers (dnd-kit)
├── services/
│   ├── configStore.ts        # Wrapper Tauri Store
│   ├── projectService.ts     # Gestion projets
│   └── sftpService.ts        # FTP/SFTP
├── hooks/
│   ├── useProjectFiltering.ts # Filtrage/tri projets (centralisé)
│   └── ...
└── stores/
    └── projectStore.ts       # Zustand store
```

---

## Refactoring Effectué (2026-01-19)

### Extraction du hook useProjectFiltering

**Problème**: Logique de filtrage/tri dupliquée dans `Sidebar.tsx` et `ProjectList.tsx`.

**Solution**: Création d'un hook centralisé `useProjectFiltering`.

**Fichiers créés**:
- `src/hooks/useProjectFiltering.ts` - Hook avec state et logique mémoïsée

**Fichiers modifiés**:
- `src/hooks/index.ts` - Export du nouveau hook
- `src/components/Sidebar.tsx` - Utilise le hook
- `src/components/ProjectList.tsx` - Utilise le hook

**API du hook**:
```typescript
const {
  searchQuery,      // Terme de recherche
  setSearchQuery,   // Setter
  sortBy,           // 'name' | 'date'
  setSortBy,        // Setter
  filteredProjects, // Projets filtrés et triés
  clearSearch,      // Vide la recherche
  hasActiveFilter,  // true si recherche active
} = useProjectFiltering(projects, { initialSortBy: 'name' });
```

**Avantages**:
- Code DRY (Don't Repeat Yourself)
- Logique testable isolément
- Comportement cohérent entre les deux vues
- Facile à étendre (ex: filtrer par statut)

---

## Nouvelles Fonctionnalités (2026-01-19)

### Recherche et tri dans Sidebar et ProjectList

- Barre de recherche avec icône
- Boutons de tri (nom A-Z, date récente)
- Compteur de projets filtrés
- État "Aucun résultat" si recherche vide
- Liste scrollable dans la Sidebar

**CSS ajouté** (`globals.css`):
- `.filter-bar`, `.search-input`, `.sort-buttons` (ProjectList)
- `.sidebar-filter-bar`, `.sidebar-search`, `.sidebar-sort-buttons` (Sidebar)
- `.sidebar-projects-list` (scroll)
- `.sidebar-no-results` (état vide)

---

## À Planifier

### Revoir système d'affichage des projets

La sidebar actuelle duplique la liste de projets de la vue centrale. Options à évaluer:
1. Supprimer la sidebar
2. Sidebar minimale (logo + actions)
3. Sidebar contextuelle (infos projet sélectionné)

Voir `TODO.md` pour plus de détails.
