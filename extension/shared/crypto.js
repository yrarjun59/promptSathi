// promptSathi — crypto utilities for secure storage
// Uses Web Crypto API (subtle) to encrypt sensitive data before storing in chrome.storage.sync
// Key is derived from a user-specific salt + extension ID (not stored, derived on each use)

async function getEncryptionKey() {
  // Derive a key from extension ID + a fixed salt (not secret, but unique per extension install)
  const encoder = new TextEncoder();
  const extensionId = chrome.runtime.id;
  const salt = encoder.encode("promptSathi-v1-salt-" + extensionId);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(extensionId + "-promptSathi-key-material"),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptForStorage(plaintext) {
  if (!plaintext) return "";
  try {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    // Combine IV + ciphertext and base64 encode
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (e) {
    console.warn("[promptSathi] Encryption failed, storing plaintext:", e);
    return plaintext; // fallback to plaintext if crypto fails
  }
}

export async function decryptFromStorage(ciphertext) {
  if (!ciphertext) return "";
  try {
    const key = await getEncryptionKey();
    const combined = new Uint8Array(atob(ciphertext).split("").map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // If decryption fails, assume it's plaintext (migration from old version)
    console.warn("[promptSathi] Decryption failed, assuming plaintext:", e);
    return ciphertext;
  }
}

// Helper to check if a value looks like it's encrypted (base64 with proper length)
export function isEncrypted(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const decoded = atob(value);
    // Encrypted format: 12 bytes IV + at least 16 bytes ciphertext (auth tag)
    return decoded.length >= 28;
  } catch {
    return false;
  }
}
