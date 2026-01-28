# TODO - La Forge

## En attente

### Bug: Détection automatique IDE (PyCharm) ne déclenche pas le timer

**Priorité**: Haute
**Status**: En attente

#### Problème
La surveillance IDE (useIDEMonitor) ne détecte pas quand PyCharm ouvre un projet, donc le timer ne démarre pas automatiquement.

#### Analyse
- La détection utilise `lsof` et `ps aux` pour trouver les processus PyCharm
- PyCharm sur macOS ne montre pas toujours le chemin du projet dans la liste des processus
- `lsof -p PID` peut être lent et ne pas capturer tous les fichiers ouverts

#### Pistes de solution
1. **Utiliser AppleScript** pour interroger PyCharm directement
2. **Lire les fichiers de configuration PyCharm** : `~/Library/Application Support/JetBrains/PyCharm*/options/recentProjects.xml`
3. **Utiliser File System Events** au lieu de polling
4. **Vérifier les fichiers .idea/** dans le dossier projet

#### Fichiers concernés
- `src-tauri/src/ide_monitor.rs` - Détection côté Rust
- `src/hooks/useIDEMonitor.ts` - Hook React
- `src/services/ideMonitorService.ts` - Service frontend

---

### Configurer les mises à jour automatiques Tauri

**Priorité**: Moyenne
**Status**: En attente

#### Contexte
L'updater Tauri est activé dans `tauri.conf.json` mais les releases GitHub ne sont pas configurées. Le fichier `latest.json` n'existe pas sur GitHub Releases.

#### Étapes à réaliser

1. **Générer une paire de clés de signature** (si pas déjà fait)
   ```bash
   npx @tauri-apps/cli signer generate -w ~/.tauri/la-forge.key
   ```
   - Sauvegarder la clé privée en lieu sûr
   - La clé publique est déjà dans `tauri.conf.json` > `updater.pubkey`

2. **Compiler avec signature**
   ```bash
   export TAURI_PRIVATE_KEY=$(cat ~/.tauri/la-forge.key)
   export TAURI_KEY_PASSWORD=""  # Si pas de mot de passe
   npm run tauri build
   ```
   - Cela génère un fichier `.sig` pour chaque bundle

3. **Créer le fichier `latest.json`**
   ```json
   {
     "version": "1.0.1",
     "notes": "Description des changements...",
     "pub_date": "2026-01-26T00:00:00Z",
     "platforms": {
       "darwin-aarch64": {
         "signature": "CONTENU_DU_FICHIER_.sig",
         "url": "https://github.com/flagorn-sudo/Laforge/releases/download/v1.0.1/La.Forge_1.0.1_aarch64.app.tar.gz"
       }
     }
   }
   ```

4. **Créer une GitHub Release**
   - Tag: `v1.0.1`
   - Uploader:
     - `La Forge_1.0.1_aarch64.app.tar.gz`
     - `latest.json`

5. **Réactiver le code de vérification**
   - Fichier: `src/App.tsx`
   - Restaurer le code `checkUpdate()` dans `onCheckUpdates`

#### Fichiers concernés
- `tauri.conf.json` - Configuration updater
- `src/App.tsx` - Code de vérification (actuellement désactivé)
- GitHub Releases - Hébergement des binaires

#### Ressources
- [Documentation Tauri Updater](https://tauri.app/v1/guides/distribution/updater/)
- [Tauri Signer](https://tauri.app/v1/guides/distribution/sign-macos)

---

## Complété

### Import de Projet Existant (2026-01-26)

**Priorité**: Haute
**Status**: Terminé

#### Fonctionnalité
Permet d'importer un dossier existant comme projet Forge sans déplacer les fichiers.

#### Implémentation
- `ImportProjectModal.tsx`: Modal en 2 étapes (sélection + configuration)
- `ImportAnalysis` type dans `types/index.ts`
- `analyzeExistingFolder()` dans `projectService.ts`: Analyse la structure
- `importProject()` dans `projectService.ts`: Crée le projet
- `importProject` action dans `projectStore.ts`
- Bouton "Importer" ajouté dans `ProjectList.tsx`
- Modal conditionnel dans `App.tsx`
- Styles CSS dans `globals.css`

#### Comportement
- Analyse automatique des dossiers existants vs manquants
- Détection du dossier local (www, public, dist, build)
- Option de création des dossiers manquants
- Vérification des doublons (même chemin)
- Génération automatique du profil client si URL fournie
