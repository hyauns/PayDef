# SYSTEM ARCHITECTURE REPORT
### Payment Account Rotation & Items Masking Gateway
**Audit Date:** 2026-04-26 | **Auditor Role:** Principal System Architect & Payment Security Expert  
**Codebase:** Next.js 14 (App Router) on Vercel | **Database:** Neon PostgreSQL | **Gateway:** PayPal REST API v2

---

## PHẦN 1: TÌNH TRẠNG HIỆN TẠI (CURRENT STATE)

### 1.1 Tổng Quan Kiến Trúc

```
┌──────────────────┐     ┌──────────────────────────────────────┐     ┌──────────────┐
│  Client Store    │────▶│  Payment Gateway (this system)       │────▶│  PayPal API  │
│  (Next.js App)   │◀────│  Vercel Serverless Functions          │◀────│  v2 REST     │
│                  │     │                                      │     │              │
│  Headers:        │     │  ┌─────────────┐  ┌───────────────┐  │     │  Sandbox /   │
│  X-Store-ID      │     │  │ Rotation    │  │ Masking       │  │     │  Live        │
│  X-API-Key       │     │  │ Engine      │  │ Engine        │  │     └──────────────┘
└──────────────────┘     │  └─────────────┘  └───────────────┘  │
                         │  ┌─────────────┐  ┌───────────────┐  │
                         │  │ Webhook     │  │ Shield Domain │  │
                         │  │ Delivery    │  │ Service       │  │
                         │  └─────────────┘  └───────────────┘  │
                         └──────────────────────────────────────┘
```

**Multi-Tenancy Model:** `Tenant` → nhiều `Store` → nhiều `MerchantAccount` (PayPal credentials). Mỗi Store có API Key riêng (bcrypt hashed). Tenant isolation được enforce ở mọi query.

### 1.2 Tính Năng Cốt Lõi Đã Hoàn Thiện

#### A. Thuật Toán Xoay Tài Khoản PayPal (`lib/merchant-rotation.ts`)

**3 chiến lược rotation được implement đầy đủ:**

| Strategy | Cơ chế | Use Case |
|----------|--------|----------|
| `SEQUENTIAL` | Round-robin qua danh sách account theo thứ tự priority | Default, phân bổ đều |
| `VOLUME` | Chọn account có remaining daily capacity lớn nhất | Tối ưu hóa coverage |
| `TIME` | Rotate sau mỗi N phút (configurable per-tenant) | Giảm velocity detection |

**Các cơ chế bảo vệ đã implement:**
- **Daily Volume Cap:** Mỗi account có `daily_limit` + `soft_limit`. Khi vượt `soft_limit`, priority giảm progressive (de-weighting factor 0.1–1.0).
- **Warm-up Progressive Cap:** Account mới (status `WARMING_UP`) có daily cap ramp từ $100 (day 0) → $500 (day 7+), và per-transaction cap $50.
- **Hourly Smoothing:** Account có >5 orders/giờ bị halve priority — chống velocity-based detection.
- **Weighted Random Fallback:** Khi chỉ có 1 account hoặc strategy unknown, fallback về weighted random.
- **Settings Cache:** Rotation config cached 60s in-memory (`_settingsCache` Map) để giảm DB load.

#### B. Cơ Chế Masking Data (`lib/masking.ts` + `lib/behavioral-randomization.ts`)

**Lớp 1 — Item Masking:**
- 16 masked descriptors pool ("Technical Support", "Service Extension", etc.)
- Mapping deterministic (cùng `realName` → cùng masked output) qua `simpleHash()`
- Per-account custom `fake_product_name` override (field `item_masking` + `fake_product_name` trên `MerchantAccount`)
- Brand name masking: 8 generic brands ("Secure Checkout", "Global Services", etc.)
- Description masking: 5 neutral descriptions

**Lớp 2 — Behavioral Randomization:**
- **Amount Jitter:** ±$0.01–$0.03 trên unit price (seeded by transaction ID — deterministic per-retry)
- **Category Rotation:** `DIGITAL_GOODS` / `PHYSICAL_GOODS` switching
- **Item Splitting:** Single item >$20 → 2–3 line items (60% probability), tổng LUÔN = original amount (invariant verified)
- **Time Jitter:** 500ms–2500ms delay trước PayPal API call
- **User-Agent Rotation:** 25 realistic UA strings (Node, Java, Python, PHP, Ruby, Go, .NET), deterministic per-merchant via MD5 hash

**Lớp 3 — Shield Domain:**
- Return/cancel URLs qua shield domain (ẩn real store domain khỏi PayPal records)
- Fallback domain: `checkout.service-portal.com`
- Shield domain management: Vercel DNS provisioning, health checks, per-tenant/shared ownership
- `sanitizePayPalField()`: Strip URLs, emails, phone numbers, injection chars, 127-char limit

**Lớp 4 — Proxy Support:**
- Per-account `proxy_url` (HTTP/HTTPS/SOCKS5 via `HttpsProxyAgent`)
- Proxy URL có thể encrypted trong DB

#### C. API Gateway Endpoints

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `POST /api/gateway/checkout` | X-Store-ID + X-API-Key | Tạo PayPal order, return `approvalUrl` + `transactionId` |
| `POST /api/gateway/execute` | transactionId (UUID) | Capture/Authorize sau buyer approval |
| `POST /api/gateway/capture` | X-Store-ID + X-API-Key | Manual capture cho AUTHORIZE flow |
| `POST /api/gateway/refund` | X-Store-ID + X-API-Key | Full refund captured payment |
| `POST /api/gateway/void` | X-Store-ID + X-API-Key | Release authorization |
| `POST /api/gateway/mock-charge` | X-Store-ID + X-API-Key hoặc Session | Mock card charge (CUSTOM_MOCK stores) |
| `GET /api/gateway/browser-status` | transactionId | Poll transaction status (cho browser client) |
| `GET /api/gateway/browser-result` | transactionId | Final result page data |
| `POST /api/webhook/paypal` | PayPal Signature Verification | Receive PayPal IPN callbacks |

#### D. Luồng Webhook — PayPal → Gateway → Client Store

```
PayPal IPN ──▶ POST /api/webhook/paypal
                │
                ├─ 1. Extract PayPal security headers
                ├─ 2. Resolve transaction → merchant_id → paypal_webhook_id
                ├─ 3. Verify signature (PayPal /v1/notifications/verify-webhook-signature)
                ├─ 4. BEGIN transaction, FOR UPDATE lock
                ├─ 5. Dispatch to event handler:
                │     • PAYMENT.AUTHORIZATION.CREATED → AUTHORIZED
                │     • PAYMENT.CAPTURE.COMPLETED → COMPLETED
                │     • PAYMENT.CAPTURE.DENIED → FAILED (+ volume reverse)
                │     • PAYMENT.CAPTURE.REFUNDED → REFUNDED (+ volume reverse)
                │     • CUSTOMER.DISPUTE.CREATED → DISPUTED
                ├─ 6. COMMIT
                └─ 7. persistWebhookEventSafe() → deliverWebhookEvent()
                       │
                       ├─ POST to store's webhook_url
                       ├─ Headers: X-Webhook-Signature (HMAC-SHA256), X-Webhook-Event, etc.
                       └─ Retry schedule: 0s, 30s, 2m, 10m, 30m, 2h, 12h, 24h (8 attempts)
```

**Webhook Events gửi về Client Store:**
`payment.authorization.created`, `payment.capture.completed`, `payment.capture.denied`, `payment.capture.refunded`, `payment.dispute.created`, `payment.checkout.canceled`, `payment.session.expired`, `payment.authorization.expired`, `payment.authorization.voided`

#### E. Cron Jobs (Vercel Cron)

| Schedule | Path | Chức năng |
|----------|------|-----------|
| `* * * * *` (mỗi phút) | `/api/cron/recovery` | Retry failed webhooks + expire stale PENDING/AUTHORIZED transactions |
| `0 0 * * *` (midnight UTC) | `/api/cron/reset-volume` | Reset `current_volume = 0` trên tất cả merchant accounts |

#### F. Security Đã Implement

- **AES-256-GCM encryption** cho PayPal `client_secret` at rest (`lib/encryption.ts`)
- **bcrypt** hashed API keys (stores)
- **PayPal signature verification** (production-enforced, dev-skip mode)
- **Cert URL domain validation** (chỉ accept `api.paypal.com`, `api.sandbox.paypal.com`, etc.)
- **NextAuth JWT** session (8h TTL, CredentialsProvider)
- **Constant-time rejection** trên login (bcrypt on miss to prevent timing attacks)
- **Token blacklist** table (JTI-based session revocation)
- **Fraud blocklist** table (IP-based blocking)
- **CRON_SECRET** protection cho cron endpoints
- **Telegram alerts** cho mỗi transaction (per-tenant bot_token + chat_id)

---

## PHẦN 2: LỖ HỔNG & CẢI THIỆN (PRODUCTION READINESS GAPS)

### 🔴 2.1 CRITICAL — Webhook Idempotency

**Hiện trạng:** ✅ **ĐÃ IMPLEMENT TỐT**

- `webhook_events.business_key` column có `@unique` constraint — đảm bảo không duplicate event.
- `buildWebhookBusinessKey()` tạo key dạng `{event}:{transactionId}:{reference}` (ví dụ: `payment.capture.completed:uuid:captureId`).
- `persistWebhookEventSafe()` kiểm tra `business_key` trước khi INSERT — nếu đã tồn tại, update payload và chỉ re-deliver nếu status vẫn `pending`/`retrying`.
- `enqueueStoreWebhookEvent()` sử dụng `SELECT ... FOR UPDATE` trong transaction — chống race condition.
- `claimDeliveryAttempt()` có lease mechanism (15s) — chống concurrent delivery.

**Remaining Gap:** PayPal `PayPal-Request-Id` header được set = `transactionId` (UUID) — đây là idempotency key phía PayPal. ✅ OK.

**⚠️ Minor Concern:** `deliverWebhookEvent()` không có distributed lock — trên multi-instance deploy, 2 instances có thể cùng pick 1 event từ recovery sweep. Lease mechanism 15s mitigates nhưng không triệt để.

### 🔴 2.2 CRITICAL — API Key Management

**Hiện trạng:** ⚠️ **CẦN CẢI THIỆN**

| Aspect | Status | Chi tiết |
|--------|--------|----------|
| API Key Storage | ✅ | bcrypt hashed (`api_key_hash`) |
| API Key Verification | ✅ | `bcrypt.compare()` trên mỗi request |
| API Key Rotation | ❌ | **KHÔNG CÓ** endpoint rotate key mà không downtime |
| Rate Limiting | ❌ | **KHÔNG CÓ** rate limit trên gateway endpoints |
| Key Scoping | ❌ | 1 key = full access. Không có read-only/write-only scopes |
| Key Audit Trail | ❌ | Không log API key usage (chỉ log failed auth) |

**Khuyến nghị:**
1. Thêm `POST /api/merchant/stores/{id}/rotate-key` — generate new key, return plaintext 1 lần, grace period cho old key (24h).
2. Implement rate limiting (ví dụ: Vercel KV hoặc Upstash Redis) — 100 req/min/store.
3. Log mọi API key usage vào `system_logs` (ít nhất store_id + endpoint + timestamp).

### 🔴 2.3 CRITICAL — Error Handling & Fallback khi PayPal Account Bị Limit/Ban

**Hiện trạng:** ✅ **CÓ CƠ CHẾ, NHƯNG CẦN BỔ SUNG**

**Đã implement:**
- `quarantineMerchantAccount()` — tự động set `status = 'SUSPENDED'` khi detect `invalid_client` (401) hoặc credential decryption failure.
- Checkout retry loop (`while (true)`) — nếu account bị invalid, exclude và thử account tiếp theo trong cùng request.
- `clearPayPalTokenCache()` — xóa cached OAuth token khi account bị invalid.
- `isInvalidClientError()` — detect PayPal 401 + `invalid_client` response.

**Chưa implement:**
| Gap | Severity | Mô tả |
|-----|----------|-------|
| Proactive Health Check | 🟡 Medium | Không có cơ chế kiểm tra sức khỏe account TRƯỚC khi route traffic đến |
| Alert khi SUSPENDED | 🔴 High | **Không có Telegram/email alert** khi account bị auto-quarantine. Admin chỉ biết khi nhìn dashboard. |
| Auto-Recovery | 🟡 Medium | Account bị SUSPENDED không tự động re-check. Phải manual unSuspend qua admin UI. |
| PayPal 403/429 Handling | 🔴 High | Chỉ handle `invalid_client` (401). PayPal rate limit (429) hoặc account restriction (403) **KHÔNG trigger quarantine** — có thể gây retry loop vô tận. |
| Circuit Breaker | 🔴 High | Không có circuit breaker pattern. Nếu PayPal outage, mọi request sẽ timeout 1 by 1. |

**Khuyến nghị:**
1. Thêm Telegram alert trong `quarantineMerchantAccount()`.
2. Handle PayPal 403 + 429 tương tự 401 (quarantine hoặc temporary cooldown).
3. Implement circuit breaker: sau 3 consecutive failures trên cùng account trong 5 phút → auto-pause 15 phút.

### 🟡 2.4 MEDIUM — Performance & N+1 Query Analysis

**Checkout Route (`/api/gateway/checkout`):**
- ✅ Single JOIN query cho merchant accounts + hourly order counts (không N+1).
- ⚠️ PayPal API call NẰM TRONG DB transaction (row lock held ~500ms–3000ms kể cả time jitter). Đây là trade-off có chủ đích (documented) nhưng sẽ thành bottleneck khi traffic cao.
- ⚠️ `bcrypt.compare()` trên mỗi request (~100ms). Cần cache result hoặc switch sang faster hash cho API keys.

**Execute Route (`/api/gateway/execute`):**
- ⚠️ **3 sequential DB queries** sau COMMIT: 2 queries lấy store name + account name cho Telegram, 1 query cho webhook persist. Có thể parallelize.

**Webhook Delivery (`lib/webhook-delivery.ts`):**
- ⚠️ Recovery sweep xử lý SEQUENTIAL (for loop) — 50 events/sweep. Nếu mỗi delivery timeout 10s, sweep có thể mất 500s → vượt Vercel function timeout (30s trên Hobby, 60s trên Pro).

**PayPal Webhook Handler:**
- ✅ Signature verification gọi PayPal API (có timeout 10s).
- ⚠️ Sau COMMIT, lại query `stores` table để lấy `webhook_url` — dữ liệu này đã có trong transaction query, có thể JOIN sẵn.

**Khuyến nghị:**
1. Di chuyển PayPal API call ra ngoài DB transaction (optimistic locking thay vì pessimistic).
2. Parallelize Telegram queries: `Promise.all([storeNameQuery, accountNameQuery])`.
3. Recovery sweep: xử lý `Promise.allSettled()` thay vì sequential, hoặc giới hạn concurrency (5 concurrent).

### 🟡 2.5 MEDIUM — Logging & Observability

**Đã implement:**
- `system_logs` table (action, status, level, metadata JSONB) — comprehensive audit trail.
- Console logging (`console.info`, `console.error`, `console.warn`) — visible in Vercel function logs.
- Telegram alerts cho mỗi payment success.

**Chưa implement:**
- ❌ Structured logging format (JSON) — hiện tại mix free-text + template literals.
- ❌ Request tracing (correlation ID / trace ID across checkout → execute → webhook).
- ❌ Metrics/monitoring dashboard (error rate, latency percentiles, volume per account).
- ❌ Alerting on error spikes (chỉ alert khi payment success, không alert khi failure rate tăng).

### 🟢 2.6 LOW — Miscellaneous

- **`GATEWAY_FEE_PERCENT = 0.02`** hardcoded ở 3 files (`execute/route.ts`, `capture/route.ts`, `webhook/paypal/route.ts`). Nên centralize vào constant hoặc lấy từ `tenants.gateway_fee_percent` (field đã tồn tại trong schema nhưng KHÔNG ĐƯỢC SỬ DỤNG).
- **Dead code:** `checkout/route.ts` lines 349–370 chứa `if (false && ...)` blocks — dead code từ migration.
- **`/api/gateway/execute` không require auth:** Endpoint chỉ dùng `transactionId` (UUID) làm secret. Đây là design choice có document, nhưng nếu UUID bị leak (ví dụ qua browser URL), attacker có thể trigger capture. Nên thêm HMAC signature.
- **Billing record chỉ được tạo ở `mock-charge`**, không ở `execute` hay `capture` routes — inconsistent.
- **Refund route dùng stateless SQL** (không transaction/lock) cho DB update — race condition nếu 2 refund requests đồng thời.

---

## PHẦN 3: KIẾN TRÚC MỞ RỘNG (SCALABILITY FOR FUTURE PLATFORMS)

### 3.1 Đánh Giá Mức Độ Coupling Với PayPal

| Layer | PayPal-Specific? | Chi tiết |
|-------|-------------------|----------|
| **Database Schema** | 🟡 Partially | `paypal_order_id`, `paypal_capture_id`, `paypal_webhook_id` — hardcoded column names. Nhưng `authorization_id` là generic. `Store.provider_type` field tồn tại (default `PAYPAL`) — cho thấy multi-provider đã được plan. |
| **API Routes** | 🔴 Heavily | `/api/gateway/checkout` trực tiếp gọi `createPayPalOrder()`. `/api/gateway/execute` gọi `captureApprovedOrder()` / `authorizeApprovedOrder()`. Không có abstract interface. |
| **Webhook Handler** | 🔴 Heavily | `/api/webhook/paypal` hardcoded cho PayPal event types. Event name mapping (`PAYMENT.CAPTURE.COMPLETED` → `payment.capture.completed`) nằm trong `store-webhooks.ts`. |
| **Masking Engine** | 🟢 Generic | `lib/masking.ts` và `lib/behavioral-randomization.ts` không phụ thuộc PayPal — có thể reuse cho Stripe. |
| **Rotation Engine** | 🟢 Generic | `lib/merchant-rotation.ts` chọn account dựa trên volume/priority — payment-provider agnostic. |
| **Webhook Delivery** | 🟢 Generic | `lib/webhook-delivery.ts` gửi webhook đến store — hoàn toàn generic, không biết PayPal. |
| **Encryption** | 🟢 Generic | AES-256-GCM — reusable cho mọi provider secret. |

### 3.2 Đề Xuất Abstract Interface — Payment Provider Adapter

```typescript
// ─── Proposed: lib/providers/types.ts ─────────────────────────────

export interface PaymentProviderAdapter {
  readonly providerName: "paypal" | "stripe"

  /** Create a payment session (order/checkout) */
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult>

  /** Execute payment after buyer approval */
  executePayment(params: ExecuteParams): Promise<ExecuteResult>

  /** Capture an authorized payment */
  capturePayment(params: CaptureParams): Promise<CaptureResult>

  /** Refund a captured payment */
  refundPayment(params: RefundParams): Promise<RefundResult>

  /** Void/release an authorization */
  voidAuthorization(params: VoidParams): Promise<void>

  /** Verify incoming webhook signature */
  verifyWebhookSignature(req: NextRequest, body: string): Promise<VerifyResult>

  /** Parse webhook event into canonical format */
  parseWebhookEvent(body: string): CanonicalWebhookEvent | null
}

// ─── Canonical types (provider-agnostic) ─────────────────────────

export interface CreateCheckoutParams {
  credentials: ProviderCredentials
  amount: string
  currency: string
  items: MaskedLineItem[]
  returnUrl: string
  cancelUrl: string
  idempotencyKey: string
  intent: "CAPTURE" | "AUTHORIZE"
  proxyUrl?: string
}

export interface CheckoutResult {
  providerOrderId: string
  approvalUrl: string
  status: string
}

export interface CanonicalWebhookEvent {
  type: "capture.completed" | "capture.denied" | "capture.refunded"
      | "authorization.created" | "dispute.created"
  transactionId: string      // our internal ID
  providerOrderId?: string
  providerCaptureId?: string
  providerAuthorizationId?: string
  amount?: { value: string; currency: string }
}
```

### 3.3 Migration Plan — 3 Phases

#### Phase 1: Abstract Core (Không break existing functionality)

| Task | Files | Impact |
|------|-------|--------|
| Create `PaymentProviderAdapter` interface | `lib/providers/types.ts` [NEW] | None |
| Wrap existing PayPal code in `PayPalAdapter` class | `lib/providers/paypal-adapter.ts` [NEW] | None |
| Refactor checkout/execute/capture/refund/void to use adapter | `app/api/gateway/*/route.ts` [MODIFY] | Internal refactor |
| Add `provider_order_id` + `provider_capture_id` columns (rename from `paypal_*`) | `prisma/schema.prisma` [MODIFY] | DB migration |
| Factory function: `getProviderAdapter(providerType)` | `lib/providers/factory.ts` [NEW] | None |

#### Phase 2: Add Stripe Provider

| Task | Files |
|------|-------|
| Implement `StripeAdapter` class | `lib/providers/stripe-adapter.ts` [NEW] |
| Add Stripe webhook handler | `app/api/webhook/stripe/route.ts` [NEW] |
| Add Stripe-specific columns nếu cần | `prisma/schema.prisma` [MODIFY] |
| Update `MerchantAccount` to support Stripe credentials | Schema + admin UI |

#### Phase 3: E-commerce Platform Plugins

| Platform | Integration Approach |
|----------|---------------------|
| **WooCommerce** | WordPress plugin gọi gateway API (X-Store-ID + X-API-Key). Webhook receiver = WooCommerce REST API endpoint. |
| **Shopify** | Shopify App (OAuth flow) hoặc Custom Payment Gateway. Webhook receiver = Shopify webhook subscription. |
| **BigCommerce** | BigCommerce App với Payment Gateway API. |

**Key Insight:** Store webhook system hiện tại (`lib/webhook-delivery.ts` + `lib/store-webhooks.ts`) đã hoàn toàn generic — chỉ cần map canonical events đúng format cho từng platform.

### 3.4 Schema Changes Cần Thiết

```sql
-- Phase 1: Rename PayPal-specific columns to generic names
ALTER TABLE transactions RENAME COLUMN paypal_order_id TO provider_order_id;
ALTER TABLE transactions RENAME COLUMN paypal_capture_id TO provider_capture_id;
ALTER TABLE merchant_accounts RENAME COLUMN paypal_webhook_id TO provider_webhook_id;

-- Phase 1: Add provider_type to merchant_accounts
ALTER TABLE merchant_accounts ADD COLUMN provider_type TEXT NOT NULL DEFAULT 'PAYPAL';

-- Phase 2: Stripe-specific (nếu cần)
ALTER TABLE merchant_accounts ADD COLUMN stripe_account_id TEXT;
```

> **Lưu ý:** `stores.provider_type` đã tồn tại (default `PAYPAL`). `MerchantAccount` chưa có — cần thêm để 1 tenant có thể mix PayPal + Stripe accounts.

### 3.5 Điểm Mạnh Cho Mở Rộng

1. **Rotation engine hoàn toàn generic** — chỉ cần eligible accounts có `daily_limit`, `current_volume`, `priority`, `status`. Stripe accounts sẽ plug-and-play.
2. **Webhook delivery system mature** — retry schedule, business_key idempotency, delivery lease, recovery cron. Chỉ cần map thêm Stripe event types.
3. **Masking engine reusable** — `maskItemName()`, `sanitizePayPalField()` có thể dùng cho Stripe descriptions.
4. **Encryption layer generic** — AES-256-GCM cho mọi provider secret.
5. **Multi-tenant architecture solid** — tenant isolation enforced ở mọi query.

---

## TÓM TẮT ĐÁNH GIÁ

| Tiêu chí | Điểm | Ghi chú |
|----------|-------|---------|
| **Core Functionality** | ✅ 9/10 | Rotation, masking, webhook delivery đều production-quality |
| **Security** | ✅ 8/10 | AES-256-GCM, bcrypt, PayPal signature verification. Thiếu rate limiting + execute auth. |
| **Webhook Idempotency** | ✅ 9/10 | business_key unique constraint + lease mechanism |
| **Error Handling** | ⚠️ 6/10 | Auto-quarantine tốt nhưng thiếu alert, circuit breaker, 403/429 handling |
| **Performance** | ⚠️ 6/10 | PayPal call trong DB transaction, bcrypt trên mỗi request, sequential recovery sweep |
| **Observability** | ⚠️ 5/10 | system_logs table tốt nhưng thiếu structured logging, tracing, metrics |
| **Scalability (Multi-Provider)** | ⚠️ 5/10 | Schema có `provider_type` nhưng code heavily coupled với PayPal. Cần abstract adapter layer. |
| **Code Quality** | ✅ 9/10 | Well-documented, clear invariants, defensive programming |

**Overall Production Readiness: 70%** — Core payment flow hoạt động đúng và an toàn. Cần bổ sung rate limiting, circuit breaker, alerts on failure, và execute endpoint authentication trước khi public production với volume lớn.
