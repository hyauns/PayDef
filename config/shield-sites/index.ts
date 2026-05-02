import type { ShieldSiteConfig } from "./types"
import { rainbowPrintHouse } from "./rainbowprinthouse"
import { exampleAutoStore } from "./exampleautostore"
import { bubblyScent } from "./bubblyscent"

export const allShieldSites: ShieldSiteConfig[] = [rainbowPrintHouse, exampleAutoStore, bubblyScent]

export function normalizeShieldHost(host: string | null | undefined): string {
  if (!host) return ""
  return host
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "") // remove port
    .replace(/^https?:\/\//, "") // remove protocol just in case
    .replace(/^www\./, "") // remove www
}

export function getShieldSiteByHost(host: string | null | undefined): ShieldSiteConfig | null {
  const normalized = normalizeShieldHost(host)
  if (!normalized) return null

  return allShieldSites.find((site) => normalizeShieldHost(site.domain) === normalized) || null
}
