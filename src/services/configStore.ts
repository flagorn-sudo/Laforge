import { Store } from 'tauri-plugin-store-api';
import CryptoJS from 'crypto-js';

const PROJECTS_STORE = 'projects-config.json';
const BACKUP_STORE = 'backups/projects-config.backup.json';
const CREDENTIALS_STORE = 'credentials.dat';

let storeInstance: Store | null = null;
let backupStoreInstance: Store | null = null;
let credentialsStoreInstance: Store | null = null;

// Simple mutex for preventing concurrent operations
let operationInProgress = false;
const operationQueue: (() => void)[] = [];

async function acquireLock(): Promise<void> {
  if (!operationInProgress) {
    operationInProgress = true;
    return;
  }
  return new Promise((resolve) => {
    operationQueue.push(() => {
      operationInProgress = true;
      resolve();
    });
  });
}

function releaseLock(): void {
  if (operationQueue.length > 0) {
    const next = operationQueue.shift();
    if (next) next();
  } else {
    operationInProgress = false;
  }
}

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = new Store(PROJECTS_STORE);
  }
  return storeInstance;
}

async function getBackupStore(): Promise<Store> {
  if (!backupStoreInstance) {
    backupStoreInstance = new Store(BACKUP_STORE);
  }
  return backupStoreInstance;
}

async function getCredentialsStore(): Promise<Store> {
  if (!credentialsStoreInstance) {
    credentialsStoreInstance = new Store(CREDENTIALS_STORE);
  }
  return credentialsStoreInstance;
}

// ============================================
// AES-256 Encryption (replaces weak XOR obfuscation)
// ============================================

// Encryption key - based on stable machine identifier
// Using app identifier + constant for consistent key across sessions
const ENCRYPTION_KEY = 'forge-app-2024-aes256-key-v1';

/**
 * Encrypt a string using AES-256
 * @param text - Plain text to encrypt
 * @returns Encrypted string (IV:Ciphertext format, base64 encoded)
 */
export function encrypt(text: string): string {
  if (!text) return '';

  // Generate random IV for each encryption
  const iv = CryptoJS.lib.WordArray.random(16);

  // Encrypt with AES
  const encrypted = CryptoJS.AES.encrypt(text, ENCRYPTION_KEY, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  // Return IV + ciphertext (both base64)
  return iv.toString(CryptoJS.enc.Base64) + ':' + encrypted.toString();
}

/**
 * Decrypt an AES-256 encrypted string
 * @param encryptedText - Encrypted string (IV:Ciphertext format)
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';

  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      // Try legacy XOR deobfuscation for migration
      return deobfuscateLegacy(encryptedText);
    }

    const iv = CryptoJS.enc.Base64.parse(parts[0]);
    const ciphertext = parts[1];

    const decrypted = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result && encryptedText) {
      // Decryption failed, might be legacy format
      return deobfuscateLegacy(encryptedText);
    }

    return result;
  } catch {
    // Try legacy format
    return deobfuscateLegacy(encryptedText);
  }
}

// ============================================
// Legacy obfuscation for migration support
// ============================================

const LEGACY_OBFUSCATION_KEY = 'forge-app-2024-secure-key';

function deobfuscateLegacy(encoded: string): string {
  try {
    const decoded = atob(encoded);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ LEGACY_OBFUSCATION_KEY.charCodeAt(i % LEGACY_OBFUSCATION_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch {
    return '';
  }
}

// ============================================
// Backup System
// ============================================

/**
 * Create a backup of all project configurations
 */
async function createBackup(): Promise<void> {
  console.log('[configStore] Creating backup...');
  try {
    const store = await getStore();
    const backupStore = await getBackupStore();

    // Get all keys from main store
    const keys = await store.keys();

    // Copy all entries to backup store
    for (const key of keys) {
      const value = await store.get(key);
      if (value !== null && value !== undefined) {
        await backupStore.set(key, value);
      }
    }

    await backupStore.save();
    console.log('[configStore] Backup created successfully with', keys.length, 'entries');
  } catch (error) {
    console.error('[configStore] Backup creation failed:', error);
    // Don't throw - backup failure shouldn't block operations
  }
}

/**
 * Restore project configurations from backup
 */
async function restoreBackup(): Promise<boolean> {
  console.log('[configStore] Restoring from backup...');
  try {
    const store = await getStore();
    const backupStore = await getBackupStore();

    // Load backup
    await backupStore.load();

    // Get all keys from backup
    const keys = await backupStore.keys();

    if (keys.length === 0) {
      console.warn('[configStore] Backup is empty, cannot restore');
      return false;
    }

    // Restore all entries
    for (const key of keys) {
      const value = await backupStore.get(key);
      if (value !== null && value !== undefined) {
        await store.set(key, value);
      }
    }

    await store.save();
    console.log('[configStore] Restored', keys.length, 'entries from backup');
    return true;
  } catch (error) {
    console.error('[configStore] Restore failed:', error);
    return false;
  }
}

export const configStore = {
  /**
   * Save project configuration to the store (atomic operation with backup)
   * Data is stored in ~/Library/Application Support/com.forge.app/
   */
  async saveProjectConfig(projectId: string, config: object): Promise<void> {
    await acquireLock();

    try {
      console.log('[configStore] Saving project config for:', projectId);

      // 1. Create backup before modification
      await createBackup();

      // 2. Save to main store
      const store = await getStore();
      await store.set(projectId, config);
      await store.save(); // Atomic write to disk

      // 3. Verify the save
      const verification = await store.get(projectId);
      if (!verification) {
        console.error('[configStore] Verification failed, attempting restore...');
        const restored = await restoreBackup();
        if (restored) {
          throw new Error('Save verification failed - restored from backup');
        } else {
          throw new Error('Save verification failed - backup restore also failed');
        }
      }

      console.log('[configStore] Project config saved and verified successfully');
    } catch (error) {
      console.error('[configStore] Failed to save project config:', error);
      throw error;
    } finally {
      releaseLock();
    }
  },

  /**
   * Get project configuration from the store
   * @returns null if not found
   */
  async getProjectConfig<T>(projectId: string): Promise<T | null> {
    const store = await getStore();
    const value = await store.get<T>(projectId);
    return value ?? null;
  },

  /**
   * Delete project configuration from the store
   */
  async deleteProjectConfig(projectId: string): Promise<void> {
    await acquireLock();

    try {
      // Create backup before deletion
      await createBackup();

      const store = await getStore();
      await store.delete(projectId);
      await store.save();
    } finally {
      releaseLock();
    }
  },

  /**
   * Check if a project config exists in the store
   */
  async hasProjectConfig(projectId: string): Promise<boolean> {
    const store = await getStore();
    return await store.has(projectId);
  },

  /**
   * Get all project keys stored
   */
  async getAllProjectKeys(): Promise<string[]> {
    const store = await getStore();
    return await store.keys();
  },

  // ============================================
  // Credentials Management (AES-256 encryption)
  // ============================================

  /**
   * Save a credential (password) for a project
   * Credentials are encrypted with AES-256 and stored separately
   */
  async saveCredential(key: string, password: string): Promise<void> {
    await acquireLock();

    try {
      console.log('[configStore] saveCredential called for key:', key);
      const store = await getCredentialsStore();
      const encrypted = encrypt(password);
      await store.set(key, encrypted);
      await store.save();

      // Verify it was saved
      const verification = await store.get<string>(key);
      if (verification !== encrypted) {
        throw new Error('Credential verification failed after save');
      }
      console.log('[configStore] saveCredential SUCCESS for key:', key);
    } finally {
      releaseLock();
    }
  },

  /**
   * Get a credential (password) for a project
   * @returns null if not found
   */
  async getCredential(key: string): Promise<string | null> {
    const store = await getCredentialsStore();
    const encrypted = await store.get<string>(key);
    if (!encrypted) {
      return null;
    }
    const password = decrypt(encrypted);
    return password || null;
  },

  /**
   * Check if a credential exists for a project
   */
  async hasCredential(key: string): Promise<boolean> {
    const store = await getCredentialsStore();
    return await store.has(key);
  },

  /**
   * Delete a credential for a project
   */
  async deleteCredential(key: string): Promise<void> {
    await acquireLock();

    try {
      const store = await getCredentialsStore();
      await store.delete(key);
      await store.save();
    } finally {
      releaseLock();
    }
  },

  // ============================================
  // Utility functions exposed for migration
  // ============================================

  /**
   * Create manual backup
   */
  createBackup,

  /**
   * Restore from backup
   */
  restoreBackup,

  /**
   * Encrypt a password (for inline storage in project config)
   */
  encrypt,

  /**
   * Decrypt a password
   */
  decrypt,

  /**
   * Migrate old credentials from XOR obfuscation to AES-256 encryption
   * This function should be called once at app startup
   */
  async migrateCredentials(): Promise<{ migrated: number; errors: number }> {
    console.log('[configStore] Starting credential migration...');
    let migrated = 0;
    let errors = 0;

    try {
      const credStore = await getCredentialsStore();
      await credStore.load();
      const keys = await credStore.keys();

      for (const key of keys) {
        try {
          const stored = await credStore.get<string>(key);
          if (!stored) continue;

          // Check if already encrypted with new format (contains ':')
          if (stored.includes(':')) {
            console.log('[configStore] Key already migrated:', key);
            continue;
          }

          // Decrypt with legacy method
          const password = deobfuscateLegacy(stored);
          if (!password) {
            console.warn('[configStore] Could not decrypt legacy credential for key:', key);
            errors++;
            continue;
          }

          // Re-encrypt with AES-256
          const encrypted = encrypt(password);
          await credStore.set(key, encrypted);
          migrated++;
          console.log('[configStore] Migrated credential for key:', key);
        } catch (e) {
          console.error('[configStore] Error migrating key:', key, e);
          errors++;
        }
      }

      if (migrated > 0) {
        await credStore.save();
        console.log('[configStore] Migration complete:', migrated, 'credentials migrated,', errors, 'errors');
      } else {
        console.log('[configStore] No credentials needed migration');
      }
    } catch (e) {
      console.error('[configStore] Migration failed:', e);
    }

    return { migrated, errors };
  },
};
