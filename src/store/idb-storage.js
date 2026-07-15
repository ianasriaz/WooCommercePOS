import { get, set, del } from 'idb-keyval';

// Simple obfuscator to prevent keys from being plainly readable in dev tools.
// Note: This is NOT true encryption and is solely for obfuscation in BYOK setups.
const obfuscate = (str) => {
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
        String.fromCharCode('0x' + p1)
      )
    );
  } catch (e) {
    return str;
  }
};

const deobfuscate = (str) => {
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(str), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch (e) {
    return str;
  }
};

export const idbStorage = {
  getItem: async (name) => {
    const value = await get(name);
    if (!value) return null;
    
    // Deobfuscate if it's the auth store
    if (name === 'pos-auth-store' && typeof value === 'string') {
      try {
        return JSON.parse(deobfuscate(value));
      } catch (e) {
        // Fallback for un-obfuscated legacy data
        return JSON.parse(value);
      }
    }
    
    // Pos store (JSON)
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value;
  },
  setItem: async (name, value) => {
    // Obfuscate if it's the auth store
    if (name === 'pos-auth-store') {
      const stringified = JSON.stringify(value);
      await set(name, obfuscate(stringified));
      return;
    }
    
    // Pos store
    await set(name, JSON.stringify(value));
  },
  removeItem: async (name) => {
    await del(name);
  },
};
