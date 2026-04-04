/**
 * scripts/encrypt-secrets.mjs
 *
 * One-time migration: encrypts all plaintext client_secret values in
 * merchant_accounts using AES-256-GCM.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  USAGE                                                             │
 * │                                                                     │
 * │  1. Set environment variables:                                      │
 * │       DATABASE_URL_UNPOOLED=postgres://...                          │
 * │       ENCRYPTION_KEY=<64-char hex from openssl rand -hex 32>        │
 * │                                                                     │
 * │  2. Run:                                                            │
 * │       node scripts/encrypt-secrets.mjs                              │
 * │                                                                     │
 * │  3. The script is idempotent — already-encrypted values are         │
 * │     skipped.  Safe to re-run.                                       │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * NOTE: This is a standalone Node.js script — it does NOT use Next.js
 * module resolution. The crypto functions are inlined here to avoid
 * import path issues.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import pg from "pg"

const { Pool } = pg

// ─── Inline Encryption (mirrors lib/encryption.ts logic) ──────────────────────

const ALGORITHM   = "aes-256-gcm"
const IV_LENGTH   = 12
const TAG_LENGTH  = 16
const SEPARATOR   = ":"

function getKey() {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    console.error("❌ ENCRYPTION_KEY must be exactly 64 hex characters.")
    console.error("   Generate one with: openssl rand -hex 32")
    process.exit(1)
  }
  return Buffer.from(hex, "hex")
}

function encryptValue(plaintext, key) {
  const iv     = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag   = cipher.getAuthTag()
  return [iv.toString("hex"), encrypted.toString("hex"), authTag.toString("hex")].join(SEPARATOR)
}

function isAlreadyEncrypted(value) {
  if (!value) return false
  const parts = value.split(SEPARATOR)
  if (parts.length !== 3) return false
  return parts[0].length === IV_LENGTH * 2 && parts[2].length === TAG_LENGTH * 2
}

// Verify round-trip works
function decryptValue(encryptedText, key) {
  const parts     = encryptedText.split(SEPARATOR)
  const iv        = Buffer.from(parts[0], "hex")
  const encrypted = Buffer.from(parts[1], "hex")
  const authTag   = Buffer.from(parts[2], "hex")
  const decipher  = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connStr = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_PRISMA_URL
  if (!connStr) {
    console.error("❌ DATABASE_URL_UNPOOLED or POSTGRES_PRISMA_URL is required.")
    process.exit(1)
  }

  const key  = getKey()
  const pool = new Pool({ connectionString: connStr })

  console.log("🔐 Starting client_secret encryption migration...\n")

  try {
    const { rows } = await pool.query(
      "SELECT id, name, client_secret FROM merchant_accounts ORDER BY created_at"
    )

    console.log(`   Found ${rows.length} merchant account(s).\n`)

    let encrypted = 0
    let skipped   = 0
    let failed    = 0

    for (const row of rows) {
      const label = `${row.name} (${row.id.slice(0, 8)}…)`

      // Skip already-encrypted values
      if (isAlreadyEncrypted(row.client_secret)) {
        console.log(`   ⏭  ${label} — already encrypted, skipping`)
        skipped++
        continue
      }

      // Skip empty values
      if (!row.client_secret || row.client_secret.trim() === "") {
        console.log(`   ⚠️  ${label} — empty secret, skipping`)
        skipped++
        continue
      }

      try {
        // Encrypt
        const ciphertext = encryptValue(row.client_secret, key)

        // Verify round-trip before committing
        const roundTrip = decryptValue(ciphertext, key)
        if (roundTrip !== row.client_secret) {
          throw new Error("Round-trip verification failed — decrypted value doesn't match original.")
        }

        // Update in DB
        await pool.query(
          "UPDATE merchant_accounts SET client_secret = $1, updated_at = NOW() WHERE id = $2",
          [ciphertext, row.id]
        )

        console.log(`   ✅ ${label} — encrypted successfully`)
        encrypted++
      } catch (err) {
        console.error(`   ❌ ${label} — FAILED: ${err.message}`)
        failed++
      }
    }

    console.log(`\n🏁 Migration complete:`)
    console.log(`   ✅ Encrypted: ${encrypted}`)
    console.log(`   ⏭  Skipped:   ${skipped}`)
    console.log(`   ❌ Failed:    ${failed}`)

    if (failed > 0) {
      console.error("\n⚠️  Some rows failed. Review errors above and re-run.")
      process.exit(1)
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error("💥 Unexpected error:", err)
  process.exit(1)
})
