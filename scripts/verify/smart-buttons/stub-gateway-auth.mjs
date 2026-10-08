// Harness: the store a test installs in globalThis.__harnessStore, else "Missing headers".
export async function authenticateStoreHeaders() {
  if (globalThis.__harnessStore) return globalThis.__harnessStore
  throw new Error("Missing X-Store-ID or X-API-Key header.")
}
