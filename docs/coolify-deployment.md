# Coolify Deployment Guide

## 1. Deployment Mode
**Recommended: Dockerfile**
While Nixpacks is excellent for Next.js, creating a multi-stage Dockerfile ensures that you strictly deploy the optimized `.next/standalone` output. This reduces the container image size significantly, avoids unnecessary dev-dependencies, and guarantees the correct runtime environment for your payment gateway.

## 2. Coolify Settings
- **Build Pack:** Dockerfile
- **Port:** `3000`
- **Healthcheck Path:** `/api/health`
- **Environment Variables:** See `.env.example` for required variables. 
  - **Crucial:** `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` MUST be exactly your production HTTPS URL.
  - **Crucial:** Set `AUTH_TRUST_HOST=true` to allow NextAuth to read proxy forwarded headers from Traefik.
- **Domain Setup:** Bind your production domain (e.g., `paydef.io`) directly in Coolify. Traefik will handle SSL automatically. Note: Do not point production DNS to Coolify until staging tests are fully verified.

## 3. Cron Jobs Migration
Vercel previously triggered these cron jobs via `vercel.json`. On Coolify, you must manually create two "Scheduled Tasks" using the `CRON_SECRET` defined in your environment variables.

### A. Reset Volume (Daily)
- **Schedule:** `0 0 * * *` (Every day at midnight)
- **Command:**
  ```bash
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reset-volume
  ```
- **Expected response:** Status 200 OK
- **Log Location:** Check Coolify Scheduled Task execution logs.

### B. Recovery (Minutely)
- **Schedule:** `* * * * *` (Every minute)
- **Command:**
  ```bash
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/recovery
  ```
- **Expected response:** Status 200 OK

**WARNING:** Disable the duplicate cron jobs on Vercel once you cut over DNS to Coolify, to avoid dual-execution.

## 4. Local Validation Commands

### Docker Build
```bash
docker build -t payment-gateway-coolify-test .
```

### Docker Run
```bash
docker run --rm -p 3000:3000 --env-file .env.local payment-gateway-coolify-test
```

### Healthcheck Test
```bash
curl -i http://localhost:3000/api/health
```
