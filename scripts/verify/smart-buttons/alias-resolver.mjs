
const ROOT = new URL("../../../", import.meta.url).href // repo root (this file lives in scripts/verify/smart-buttons/)
const STUBS = { "https-proxy-agent": "./stub-proxy-agent.mjs", "@/lib/neon": "./stub-neon.mjs", "next/server": "./stub-next-server.mjs" }

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return next(new URL(STUBS[specifier], import.meta.url).href, context)
  }
  if (specifier.startsWith("@/")) {
    let target = ROOT + specifier.slice(2)
    if (!/\.[a-z]+$/i.test(target)) target += ".ts"
    return next(target, context)
  }
  return next(specifier, context)
}
