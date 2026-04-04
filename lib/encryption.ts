/**
 * lib/encryption.ts — AES-256-GCM Encryption for Sensitive Credentials
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  PURPOSE                                                           │
 * │  Protect PayPal client_secret (and any future secrets) at rest.    │
 * │  Secrets are encrypted before INSERT and decrypted just-in-time    │
 * │  before PayPal API calls. The encryption key never touches the     │
 * │  database — it lives only in environment variables.                │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Format of encrypted output:  iv_hex:ciphertext_hex:authTag_hex
 *   • iv         — 12 bytes (96 bits), random per encryption
 *   • ciphertext — variable length
 *   • authTag    — 16 bytes (128 bits), GCM authentication tag
 *
 * Environment:
 *   ENCRYPTION_KEY  — 64-char hex string (32 bytes = 256 bits)
 *                     Generate with: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

// ─── Constants ────────────────────────────────────────────────────────────────

const ALGORITHM   = "aes-256-gcm"
const IV_LENGTH   = 12  // 96-bit IV (recommended for GCM)
const TAG_LENGTH  = 16  // 128-bit auth tag
const SEPARATOR   = ":"  // delimiter in the stored format
const KEY_HEX_LEN = 64  // 32 bytes as hex

// ─── Key Management ───────────────────────────────────────────────────────────

let _keyBuffer: Buffer | null = null

/**
 * Lazily loads and validates the encryption key.
 * Throws a clear error if the key is missing or malformed.
 */
function getKey(): Buffer {
  if (_keyBuffer) return _keyBuffer

  const hex = process.env.ENCRYPTION_KEY
  if (!hex) {
    throw new EncryptionError(
      "ENCRYPTION_KEY environment variable is not set. " +
      "Generate one with: openssl rand -hex 32"
    )
  }

  if (hex.length !== KEY_HEX_LEN || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new EncryptionError(
      `ENCRYPTION_KEY must be exactly ${KEY_HEX_LEN} hex characters (${KEY_HEX_LEN / 2} bytes). ` +
      `Got ${hex.length} characters.`
    )
  }

  _keyBuffer = Buffer.from(hex, "hex")
  return _keyBuffer
}

// ─── Error Class ──────────────────────────────────────────────────────────────

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EncryptionError"
  }
}

// ─── Encrypt ──────────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext — the sensitive value to encrypt (e.g. PayPal client_secret)
 * @returns encrypted string in format: iv:ciphertext:authTag (all hex)
 * @throws {EncryptionError} if the key is missing or encryption fails
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new EncryptionError("Cannot encrypt an empty string.")
  }

  try {
    const key = getKey()
    const iv  = randomBytes(IV_LENGTH)

    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()

    return [
      iv.toString("hex"),
      encrypted.toString("hex"),
      authTag.toString("hex"),
    ].join(SEPARATOR)
  } catch (err) {
    if (err instanceof EncryptionError) throw err
    throw new EncryptionError(`Encryption failed: ${(err as Error).message}`)
  }
}

// ─── Decrypt ──────────────────────────────────────────────────────────────────

/**
 * Decrypts an AES-256-GCM encrypted string.
 *
 * @param encryptedText — the encrypted string in format: iv:ciphertext:authTag
 * @returns the original plaintext
 * @throws {EncryptionError} if the format is invalid, key is wrong, or data is tampered
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) {
    throw new EncryptionError("Cannot decrypt an empty string.")
  }

  // If the value doesn't look encrypted (no separator), it's likely a plaintext
  // secret from before the encryption migration. Return it as-is for backward
  // compatibility, but log a warning.
  if (!encryptedText.includes(SEPARATOR)) {
    console.warn(
      "[encryption] Detected plaintext secret — returning as-is. " +
      "Run the encryption migration to encrypt existing secrets."
    )
    return encryptedText
  }

  const parts = encryptedText.split(SEPARATOR)
  if (parts.length !== 3) {
    throw new EncryptionError(
      `Invalid encrypted format: expected 3 parts (iv:ciphertext:tag), got ${parts.length}.`
    )
  }

  try {
    const key       = getKey()
    const iv        = Buffer.from(parts[0], "hex")
    const encrypted = Buffer.from(parts[1], "hex")
    const authTag   = Buffer.from(parts[2], "hex")

    if (iv.length !== IV_LENGTH) {
      throw new EncryptionError(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}.`)
    }
    if (authTag.length !== TAG_LENGTH) {
      throw new EncryptionError(`Invalid auth tag length: expected ${TAG_LENGTH}, got ${authTag.length}.`)
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    return decrypted.toString("utf8")
  } catch (err) {
    if (err instanceof EncryptionError) throw err
    throw new EncryptionError(`Decryption failed: ${(err as Error).message}`)
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Checks whether a string appears to be in encrypted format (iv:cipher:tag).
 * Useful for migration scripts to skip already-encrypted rows.
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false
  const parts = value.split(SEPARATOR)
  if (parts.length !== 3) return false
  // IV should be exactly 24 hex chars (12 bytes), auth tag exactly 32 hex chars (16 bytes)
  return parts[0].length === IV_LENGTH * 2 && parts[2].length === TAG_LENGTH * 2
}
