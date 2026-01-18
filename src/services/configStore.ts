import { Store } from 'tauri-plugin-store-api';

const PROJECTS_STORE = 'projects-config.json';
const CREDENTIALS_STORE = 'credentials.dat';

let storeInstance: Store | null = null;
let credentialsStoreInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = new Store(PROJECTS_STORE);
  }
  return storeInstance;
}

async function getCredentialsStore(): Promise<Store> {
  if (!credentialsStoreInstance) {
    credentialsStoreInstance = new Store(CREDENTIALS_STORE);
  }
  return credentialsStoreInstance;
}

// Simple obfuscation for credentials (not cryptographically secure, but better than plaintext)
// The credentials are stored in ~/Library/Application Support/ which is user-protected
const OBFUSCATION_KEY = 'forge-app-2024-secure-key';

function obfuscate(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    result += String.fromCharCode(charCode);
  }
  // Base64 encode to make it safe for JSON storage
  return btoa(result);
}

function deobfuscate(encoded: string): string {
  try {
    const decoded = atob(encoded);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch {
    return '';
  }
}

export const configStore = {
  /**
   * Save project configuration to the store
   * Data is stored in ~/Library/Application Support/com.forge.app/
   */
  async saveProjectConfig(projectId: string, config: object): Promise<void> {
    try {
      console.log('[configStore] Saving project config for:', projectId);
      const store = await getStore();
      await store.set(projectId, config);
      await store.save(); // Atomic write to disk
      console.log('[configStore] Project config saved successfully');
    } catch (error) {
      console.error('[configStore] Failed to save project config:', error);
      throw error;
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
    const store = await getStore();
    await store.delete(projectId);
    await store.save();
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
  // Credentials Management (replaces Keychain)
  // ============================================

  /**
   * Save a credential (password) for a project
   * Credentials are obfuscated and stored in a separate file
   */
  async saveCredential(key: string, password: string): Promise<void> {
    console.log('[configStore] saveCredential called for key:', key);
    const store = await getCredentialsStore();
    const obfuscated = obfuscate(password);
    await store.set(key, obfuscated);
    await store.save();

    // Verify it was saved
    const verification = await store.get<string>(key);
    if (verification !== obfuscated) {
      throw new Error('Credential verification failed after save');
    }
    console.log('[configStore] saveCredential SUCCESS for key:', key);
  },

  /**
   * Get a credential (password) for a project
   * @returns null if not found
   */
  async getCredential(key: string): Promise<string | null> {
    const store = await getCredentialsStore();
    const obfuscated = await store.get<string>(key);
    if (!obfuscated) {
      return null;
    }
    const password = deobfuscate(obfuscated);
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
    const store = await getCredentialsStore();
    await store.delete(key);
    await store.save();
  },
};
