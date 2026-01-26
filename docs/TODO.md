# TODO - La Forge

## En attente

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

(Aucune tâche complétée pour l'instant)
