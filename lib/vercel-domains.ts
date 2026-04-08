type VerificationRecord = {
  type?: string
  domain?: string
  value?: string
  reason?: string
}

type ProjectDomainResponse = {
  name?: string
  apexName?: string
  projectId?: string
  verified?: boolean
  verification?: VerificationRecord[]
}

type RecommendedIPv4 = {
  rank?: number
  value?: string[]
}

type RecommendedCNAME = {
  rank?: number
  value?: string
}

type DomainConfigResponse = {
  configuredBy?: "CNAME" | "A" | "http" | "dns-01" | null
  acceptedChallenges?: string[]
  recommendedIPv4?: RecommendedIPv4[]
  recommendedCNAME?: RecommendedCNAME[]
  misconfigured?: boolean
}

type VercelErrorBody = {
  error?: {
    code?: string
    message?: string
  }
  message?: string
}

export type VercelDomainState = {
  integrationEnabled: boolean
  projectRef: string | null
  teamContext: string | null
  domainAdded: boolean
  verified: boolean | null
  projectStatus: "Integration Off" | "Linked" | "Not Linked" | "Error"
  dnsStatus: "Integration Off" | "Ready" | "Verification Required" | "Needs DNS" | "Not Linked" | "Error"
  configuredBy: string | null
  misconfigured: boolean | null
  requiredRecordType: string | null
  requiredRecordName: string | null
  requiredRecordValue: string | null
  verificationReason: string | null
  bridgeOk: boolean
  bridgeUrl: string
  bridgeHealthy: boolean | null
  bridgeStatusCode: number | null
  bridgeCheckedAt: string | null
  bridgeMessage: string | null
  statusMessage: string
  lastCheckedAt: string
}

class VercelApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "VercelApiError"
    this.status = status
  }
}

function getIntegrationEnv() {
  const token = process.env.VERCEL_API_TOKEN?.trim() || null
  const projectRef =
    process.env.VERCEL_PROJECT_ID?.trim() ||
    process.env.VERCEL_PROJECT_NAME?.trim() ||
    null
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || null
  const teamSlug = process.env.VERCEL_TEAM_SLUG?.trim() || null

  return {
    enabled: Boolean(token && projectRef),
    token,
    projectRef,
    teamId,
    teamSlug,
  }
}

function buildQuery(extra?: Record<string, string | undefined>) {
  const env = getIntegrationEnv()
  const params = new URLSearchParams()

  if (env.teamId) params.set("teamId", env.teamId)
  if (env.teamSlug) params.set("slug", env.teamSlug)

  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) params.set(key, value)
  }

  const query = params.toString()
  return query ? `?${query}` : ""
}

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function vercelRequest<T>(
  path: string,
  init?: RequestInit,
  query?: Record<string, string | undefined>
): Promise<T> {
  const env = getIntegrationEnv()

  if (!env.enabled || !env.token) {
    throw new Error("Vercel API integration is not configured.")
  }

  const res = await fetch(`https://api.vercel.com${path}${buildQuery(query)}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const payload = await readJsonSafe<VercelErrorBody>(res)
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Vercel API request failed with status ${res.status}`
    throw new VercelApiError(message, res.status)
  }

  return (await res.json()) as T
}

function firstVerificationRecord(records?: VerificationRecord[]) {
  return records?.find((record) => record.type && record.domain && record.value) ?? null
}

function selectRecommendedRecord(config: DomainConfigResponse, domain: string) {
  const cname = config.recommendedCNAME?.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0]
  if (cname?.value) {
    return {
      type: "CNAME",
      name: domain,
      value: cname.value,
    }
  }

  const ipv4 = config.recommendedIPv4?.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0]
  const firstIp = ipv4?.value?.[0]
  if (firstIp) {
    return {
      type: "A",
      name: domain,
      value: firstIp,
    }
  }

  return null
}

async function probeHealthUrl(targetUrl: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Gateway-BridgeCheck/1.0",
      },
    })

    const body = await response.text()
    return {
      healthy:
        response.ok &&
        (body.includes("shield-popup-ok") || response.headers.get("x-shield-popup-health") === "ok"),
      statusCode: response.status,
      checkedAt: new Date().toISOString(),
      detail: body,
    }
  } catch (error) {
    return {
      healthy: false,
      statusCode: null,
      checkedAt: new Date().toISOString(),
      detail:
        error instanceof Error
          ? error.name === "AbortError"
            ? "Popup bridge health check timed out."
            : error.message
          : "Popup bridge health check failed.",
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function checkPopupBridgeHealth(domain: string) {
  const directHealthUrl = `https://${domain}/api/health/shield-popup`
  const directProbe = await probeHealthUrl(directHealthUrl)
  if (directProbe.healthy) {
    return {
      healthy: true,
      statusCode: directProbe.statusCode,
      checkedAt: directProbe.checkedAt,
      detail: "Popup bridge health endpoint responded successfully.",
    }
  }

  const routeHealthUrl = `https://${domain}/checkout/popup?health=1`
  const routeProbe = await probeHealthUrl(routeHealthUrl)
  if (routeProbe.healthy) {
    return {
      healthy: true,
      statusCode: routeProbe.statusCode,
      checkedAt: routeProbe.checkedAt,
      detail: "Popup bridge route responded successfully.",
    }
  }

  const primaryFailure = directProbe.statusCode === 404 ? routeProbe : directProbe
  const detail =
    primaryFailure.detail === "Popup bridge health check failed."
      ? primaryFailure.detail
      : primaryFailure.statusCode === 404
        ? "Popup bridge health endpoint returned HTTP 404. Re-sync after deploying the latest build."
        : "Popup bridge route did not return the expected health marker."

  return {
    healthy: false,
    statusCode: primaryFailure.statusCode,
    checkedAt: primaryFailure.checkedAt,
    detail,
  }
}

function buildState(params: {
  domain: string
  projectDomain: ProjectDomainResponse | null
  config: DomainConfigResponse | null
  bridgeHealth?: {
    healthy: boolean
    statusCode: number | null
    checkedAt: string | null
    detail: string | null
  } | null
  error?: string | null
}): VercelDomainState {
  const env = getIntegrationEnv()
  const { domain, projectDomain, config, bridgeHealth, error } = params
  const verification = firstVerificationRecord(projectDomain?.verification)
  const recommendedRecord = config ? selectRecommendedRecord(config, domain) : null

  if (!env.enabled || !env.projectRef) {
    return {
      integrationEnabled: false,
      projectRef: null,
      teamContext: env.teamId ?? env.teamSlug,
      domainAdded: false,
      verified: null,
      projectStatus: "Integration Off",
      dnsStatus: "Integration Off",
      configuredBy: null,
      misconfigured: null,
      requiredRecordType: null,
      requiredRecordName: null,
      requiredRecordValue: null,
      verificationReason: null,
      bridgeOk: false,
      bridgeUrl: `https://${domain}/checkout/popup`,
      bridgeHealthy: null,
      bridgeStatusCode: null,
      bridgeCheckedAt: null,
      bridgeMessage: null,
      statusMessage: "Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID to enable live domain onboarding.",
      lastCheckedAt: new Date().toISOString(),
    }
  }

  if (error) {
    return {
      integrationEnabled: true,
      projectRef: env.projectRef,
      teamContext: env.teamId ?? env.teamSlug,
      domainAdded: Boolean(projectDomain),
      verified: projectDomain?.verified ?? null,
      projectStatus: projectDomain ? "Linked" : "Error",
      dnsStatus: projectDomain ? "Error" : "Not Linked",
      configuredBy: config?.configuredBy ?? null,
      misconfigured: config?.misconfigured ?? null,
      requiredRecordType: verification?.type ?? recommendedRecord?.type ?? null,
      requiredRecordName: verification?.domain ?? recommendedRecord?.name ?? null,
      requiredRecordValue: verification?.value ?? recommendedRecord?.value ?? null,
      verificationReason: verification?.reason ?? null,
      bridgeOk: false,
      bridgeUrl: `https://${domain}/checkout/popup`,
      bridgeHealthy: bridgeHealth?.healthy ?? null,
      bridgeStatusCode: bridgeHealth?.statusCode ?? null,
      bridgeCheckedAt: bridgeHealth?.checkedAt ?? null,
      bridgeMessage: bridgeHealth?.detail ?? null,
      statusMessage: error,
      lastCheckedAt: new Date().toISOString(),
    }
  }

  const domainAdded = Boolean(projectDomain)
  const verified = projectDomain?.verified ?? null
  const misconfigured = config?.misconfigured ?? null
  const configuredBy = config?.configuredBy ?? null
  const dnsReady = Boolean(domainAdded && verified && misconfigured !== true)
  const bridgeHealthy = dnsReady ? bridgeHealth?.healthy ?? null : null
  const ready = Boolean(dnsReady && bridgeHealthy)

  let dnsStatus: VercelDomainState["dnsStatus"] = "Not Linked"
  let statusMessage = "Domain has not been linked to the Vercel project yet."

  if (ready) {
    dnsStatus = "Ready"
    statusMessage = "DNS is linked and popup bridge routes are serving correctly on this project."
  } else if (dnsReady) {
    dnsStatus = "Ready"
    statusMessage = "DNS is correctly linked on Vercel."
  } else if (verification) {
    dnsStatus = "Verification Required"
    statusMessage = verification.reason || "Add the verification record, then run Verify DNS."
  } else if (domainAdded && (misconfigured || configuredBy === null)) {
    dnsStatus = "Needs DNS"
    statusMessage = "Point this domain to Vercel using the recommended DNS record below."
  } else if (domainAdded) {
    dnsStatus = "Needs DNS"
    statusMessage = "Domain is linked but DNS is not fully ready yet."
  }

  return {
    integrationEnabled: true,
    projectRef: env.projectRef,
    teamContext: env.teamId ?? env.teamSlug,
    domainAdded,
    verified,
    projectStatus: domainAdded ? "Linked" : "Not Linked",
    dnsStatus,
    configuredBy,
    misconfigured,
    requiredRecordType: verification?.type ?? recommendedRecord?.type ?? null,
    requiredRecordName: verification?.domain ?? recommendedRecord?.name ?? null,
    requiredRecordValue: verification?.value ?? recommendedRecord?.value ?? null,
    verificationReason: verification?.reason ?? null,
    bridgeOk: ready,
    bridgeUrl: `https://${domain}/checkout/popup`,
    bridgeHealthy,
    bridgeStatusCode: bridgeHealth?.statusCode ?? null,
    bridgeCheckedAt: bridgeHealth?.checkedAt ?? null,
    bridgeMessage: bridgeHealth?.detail ?? (dnsReady ? "DNS is ready. Waiting for popup bridge health result." : null),
    statusMessage,
    lastCheckedAt: new Date().toISOString(),
  }
}

async function getProjectDomain(domain: string): Promise<ProjectDomainResponse | null> {
  const env = getIntegrationEnv()
  if (!env.enabled || !env.projectRef) return null

  try {
    return await vercelRequest<ProjectDomainResponse>(
      `/v9/projects/${encodeURIComponent(env.projectRef)}/domains/${encodeURIComponent(domain)}`
    )
  } catch (error) {
    if (error instanceof VercelApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

async function getDomainConfig(domain: string): Promise<DomainConfigResponse | null> {
  const env = getIntegrationEnv()
  if (!env.enabled || !env.projectRef) return null

  try {
    return await vercelRequest<DomainConfigResponse>(
      `/v6/domains/${encodeURIComponent(domain)}/config`,
      undefined,
      { projectIdOrName: env.projectRef }
    )
  } catch (error) {
    if (error instanceof VercelApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

async function addDomainToProject(domain: string): Promise<ProjectDomainResponse> {
  const env = getIntegrationEnv()
  if (!env.enabled || !env.projectRef) {
    throw new Error("Vercel API integration is not configured.")
  }

  try {
    return await vercelRequest<ProjectDomainResponse>(
      `/v10/projects/${encodeURIComponent(env.projectRef)}/domains`,
      {
        method: "POST",
        body: JSON.stringify({ name: domain }),
      }
    )
  } catch (error) {
    if (error instanceof VercelApiError && error.status === 400) {
      const existing = await getProjectDomain(domain)
      if (existing) return existing
    }
    throw error
  }
}

async function verifyProjectDomain(domain: string): Promise<ProjectDomainResponse> {
  const env = getIntegrationEnv()
  if (!env.enabled || !env.projectRef) {
    throw new Error("Vercel API integration is not configured.")
  }

  return vercelRequest<ProjectDomainResponse>(
    `/v9/projects/${encodeURIComponent(env.projectRef)}/domains/${encodeURIComponent(domain)}/verify`,
    { method: "POST" }
  )
}

export function getVercelDomainIntegrationInfo() {
  const env = getIntegrationEnv()
  return {
    enabled: env.enabled,
    projectRef: env.projectRef,
    teamContext: env.teamId ?? env.teamSlug,
  }
}

export async function inspectVercelDomain(domain: string): Promise<VercelDomainState> {
  const env = getIntegrationEnv()
  if (!env.enabled) {
    return buildState({ domain, projectDomain: null, config: null })
  }

  try {
    const [projectDomain, config] = await Promise.all([
      getProjectDomain(domain),
      getDomainConfig(domain),
    ])

    const bridgeHealth =
      projectDomain?.verified && config?.misconfigured !== true
        ? await checkPopupBridgeHealth(domain)
        : null

    return buildState({ domain, projectDomain, config, bridgeHealth })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to inspect Vercel domain state."
    return buildState({ domain, projectDomain: null, config: null, error: message })
  }
}

export async function provisionVercelDomain(domain: string): Promise<VercelDomainState> {
  const env = getIntegrationEnv()
  if (!env.enabled) {
    return buildState({ domain, projectDomain: null, config: null })
  }

  try {
    const projectDomain = await addDomainToProject(domain)
    const config = await getDomainConfig(domain)
    const bridgeHealth =
      projectDomain?.verified && config?.misconfigured !== true
        ? await checkPopupBridgeHealth(domain)
        : null
    return buildState({ domain, projectDomain, config, bridgeHealth })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add domain to Vercel."
    return buildState({ domain, projectDomain: null, config: null, error: message })
  }
}

export async function verifyVercelDomain(domain: string): Promise<VercelDomainState> {
  const env = getIntegrationEnv()
  if (!env.enabled) {
    return buildState({ domain, projectDomain: null, config: null })
  }

  try {
    const projectDomain = await verifyProjectDomain(domain)
    const config = await getDomainConfig(domain)
    const bridgeHealth =
      projectDomain?.verified && config?.misconfigured !== true
        ? await checkPopupBridgeHealth(domain)
        : null
    return buildState({ domain, projectDomain, config, bridgeHealth })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify domain on Vercel."
    return buildState({ domain, projectDomain: null, config: null, error: message })
  }
}

export async function syncVercelDomain(domain: string): Promise<VercelDomainState> {
  const env = getIntegrationEnv()
  if (!env.enabled) {
    return buildState({ domain, projectDomain: null, config: null })
  }

  const existing = await getProjectDomain(domain)
  if (!existing) {
    return provisionVercelDomain(domain)
  }

  return inspectVercelDomain(domain)
}
