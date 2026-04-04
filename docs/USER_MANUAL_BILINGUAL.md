# Gateway Central User Manual
## English / Vietnamese

Version: Codebase-aligned manual generated from the repository scan on 2026-04-04.

---

## 1. Project Overview

### English

**Gateway Central** is a multi-tenant payment gateway dashboard built for merchants who need to route PayPal payments through multiple merchant accounts while protecting operational data.

Core product goals:

| Area | Description |
| --- | --- |
| **Multi-tenant isolation** | Each merchant works inside a separate tenant boundary for stores, merchant accounts, and transactions. |
| **Payment routing** | The gateway selects an eligible PayPal account based on rotation strategy, account status, limits, and warm-up rules. |
| **Operational masking** | Product names, brand strings, and return/cancel URLs are masked before data reaches PayPal. |
| **Admin control** | Super Admin can manage tenants, shield domains, gateway controls, sessions, audit logs, and master API keys. |
| **Merchant self-service** | Merchants can create stores, manage PayPal accounts, configure rotation, inspect transactions, and enable Telegram alerts. |

Key Lucide icon references used across the UI:

| Icon | Meaning |
| --- | --- |
| `Shield` | Security, gateway protection, shield domains |
| `RefreshCw` | Rotation, sync, key rotation |
| `LayoutDashboard` | Overview / control center |
| `EyeOff` | Item masking / hidden values |
| `Activity` | Health, monitoring, live status |
| `Lock` | Encryption, password, access control |
| `Send` | Telegram alert or outbound notification |
| `AlertTriangle` | Warning, degraded state, suspension risk |

### Tiếng Việt

**Gateway Central** là một hệ thống dashboard cổng thanh toán đa tenant, dành cho merchant cần định tuyến thanh toán PayPal qua nhiều tài khoản khác nhau trong khi vẫn che giấu dữ liệu vận hành nhạy cảm.

Mục tiêu cốt lõi của sản phẩm:

| Hạng mục | Mô tả |
| --- | --- |
| **Cô lập đa tenant** | Mỗi merchant hoạt động trong một tenant riêng cho stores, merchant accounts và transactions. |
| **Định tuyến thanh toán** | Gateway chọn tài khoản PayPal phù hợp dựa trên chiến lược xoay vòng, trạng thái tài khoản, hạn mức và quy tắc warm-up. |
| **Che giấu vận hành** | Tên sản phẩm, thương hiệu và URL trả về/hủy được che giấu trước khi dữ liệu đi tới PayPal. |
| **Điều khiển quản trị** | Super Admin quản lý tenant, shield domain, gateway controls, session, audit log và master API key. |
| **Tự phục vụ cho merchant** | Merchant có thể tạo store, quản lý tài khoản PayPal, cấu hình rotation, xem transaction và bật cảnh báo Telegram. |

Các icon Lucide chính trong giao diện:

| Icon | Ý nghĩa |
| --- | --- |
| `Shield` | Bảo mật, bảo vệ gateway, shield domains |
| `RefreshCw` | Xoay vòng, đồng bộ, xoay key |
| `LayoutDashboard` | Tổng quan / trung tâm điều khiển |
| `EyeOff` | Item masking / dữ liệu ẩn |
| `Activity` | Sức khỏe hệ thống, giám sát, trạng thái live |
| `Lock` | Mã hóa, mật khẩu, kiểm soát truy cập |
| `Send` | Cảnh báo Telegram hoặc thông báo gửi đi |
| `AlertTriangle` | Cảnh báo, trạng thái suy giảm, rủi ro tạm ngưng |

---

## 2. Getting Started

### English

#### 2.1 Login and access

1. Open the **Login** page.
2. Enter your email and password.
3. After authentication, the system redirects by role:
   - **Super Admin** -> `/super-admin`
   - **Merchant** -> `/dashboard`

Session behavior:

| Item | Behavior |
| --- | --- |
| Session type | JWT-based |
| Session lifetime | 8 hours |
| Protected routes | Enforced by middleware based on role |
| Failed login response | Invalid email or password |

#### 2.2 Main navigation

**Merchant navigation**

| Menu | Purpose |
| --- | --- |
| **Overview** | Operational dashboard with metrics, rotation panel, transaction feed, accounts, stores, and shield health |
| **Accounts** | Manage PayPal merchant accounts |
| **Stores** | Manage connected client stores and API keys |
| **Transactions** | Searchable payment history |
| **Analytics** | Revenue, account volume, store volume |
| **Logs** | System event log |
| **Settings** | Telegram, password, email, store API key references |

**Super Admin navigation**

| Menu | Purpose |
| --- | --- |
| **Overview** | Network-wide control center |
| **Tenants** | Merchant tenant management |
| **Analytics** | Cross-tenant analytics |
| **Logs** | System-wide logs |
| **Settings** | Global settings, security, Telegram, profile changes |

### Tiếng Việt

#### 2.1 Đăng nhập và truy cập

1. Mở trang **Login**.
2. Nhập email và mật khẩu.
3. Sau khi xác thực, hệ thống chuyển hướng theo vai trò:
   - **Super Admin** -> `/super-admin`
   - **Merchant** -> `/dashboard`

Hành vi phiên đăng nhập:

| Mục | Hành vi |
| --- | --- |
| Loại session | JWT-based |
| Thời lượng session | 8 giờ |
| Route được bảo vệ | Middleware kiểm soát theo vai trò |
| Phản hồi khi sai thông tin | Invalid email or password |

#### 2.2 Điều hướng chính

**Menu của Merchant**

| Menu | Mục đích |
| --- | --- |
| **Overview** | Dashboard vận hành với metrics, panel rotation, transaction feed, accounts, stores và sức khỏe shield |
| **Accounts** | Quản lý các tài khoản PayPal merchant |
| **Stores** | Quản lý client store kết nối và API key |
| **Transactions** | Lịch sử thanh toán có tìm kiếm |
| **Analytics** | Doanh thu, volume theo account và store |
| **Logs** | Nhật ký sự kiện hệ thống |
| **Settings** | Telegram, mật khẩu, email, tham chiếu API key store |

**Menu của Super Admin**

| Menu | Mục đích |
| --- | --- |
| **Overview** | Trung tâm điều khiển toàn hệ thống |
| **Tenants** | Quản lý merchant tenant |
| **Analytics** | Phân tích đa tenant |
| **Logs** | Log toàn hệ thống |
| **Settings** | Global settings, security, Telegram, thay đổi profile |

---

## 3. Super Admin Guide

### English

#### 3.1 Super Admin Overview

The Super Admin overview combines control and audit operations:

| Section | What you can do |
| --- | --- |
| **Gateway Controls** | Toggle global rotation, toggle maintenance mode |
| **Emergency Actions** | Rotate domains, flush IPN queue, clear fraud blocklist, reset daily counters |
| **Gateway API Key** | Rotate the master gateway API key; old key becomes invalid immediately |
| **Active Sessions** | View sessions from the last 8 hours and revoke a session |
| **Audit Log** | Review recent admin-level actions with timestamps |

Important notes:

- **Maintenance Mode** blocks incoming checkout traffic.
- **Gateway API Key rotation** returns the new plaintext key once. Save it immediately.
- Every important admin action is logged to the audit trail.

#### 3.2 Tenant Management

The **Tenants** screen is the merchant lifecycle workspace.

| Feature | Details |
| --- | --- |
| **Create Tenant** | Creates both the tenant record and its merchant login user |
| **Owner Email** | Set during creation and used for the merchant login |
| **Welcome Email** | Sent asynchronously after tenant creation when email service is configured |
| **Suspend / Unsuspend** | Suspend removes operational access; unsuspend restores it |
| **Commission Rate** | Adjust per-tenant fee percentage |
| **Search / Filter / Sort** | Search by business or email; sort by status or volume |
| **Summary Metrics** | Lifetime volume, monthly volume, active tenants, suspended tenants |

Creation requirements:

- Business name is required.
- Email must be unique.
- Initial password must be at least 8 characters.

#### 3.3 Domain Rotation Pool

The **Domain Rotation Pool** manages shield domains that mask PayPal return and cancel URLs.

| Action | Result |
| --- | --- |
| **Add Domain** | Insert a new shield domain into the pool |
| **Assign to Tenant** | Reserve a domain for one tenant, or leave it in the shared pool |
| **Activate / Deactivate** | Control whether the domain participates in rotation |
| **Delete Domain** | Permanently remove the domain from the pool |
| **Health Review** | Inspect domain health state and assignment |

#### 3.4 Global Settings

Super Admin settings store platform-wide configuration records:

| Group | Purpose |
| --- | --- |
| **Global Rotation Rules** | Store default daily limit, alert threshold, and platform rotation preferences |
| **Notifications** | Save admin Telegram bot token and chat ID, then send a test alert |
| **Security** | Configure price revalidation and API IP whitelist |
| **Profile Security** | Change password and email |

Profile security behavior:

- Password change requires the current password.
- New password must be at least 12 characters.
- Email change uses a 6-digit verification code sent to the current email.

### Tiếng Việt

#### 3.1 Tổng quan Super Admin

Màn hình tổng quan của Super Admin kết hợp điều khiển và audit:

| Khu vực | Bạn có thể làm gì |
| --- | --- |
| **Gateway Controls** | Bật/tắt global rotation, bật/tắt maintenance mode |
| **Emergency Actions** | Rotate domains, flush IPN queue, clear fraud blocklist, reset daily counters |
| **Gateway API Key** | Xoay master gateway API key; key cũ bị vô hiệu ngay lập tức |
| **Active Sessions** | Xem session trong 8 giờ gần nhất và revoke session |
| **Audit Log** | Xem lại các hành động quản trị gần đây theo thời gian |

Lưu ý quan trọng:

- **Maintenance Mode** chặn lưu lượng checkout đi vào.
- **Gateway API Key rotation** chỉ hiển thị plaintext key mới đúng một lần. Cần lưu lại ngay.
- Mọi hành động quản trị quan trọng đều được ghi vào audit trail.

#### 3.2 Quản lý Tenant

Màn hình **Tenants** là nơi quản lý vòng đời merchant.

| Tính năng | Chi tiết |
| --- | --- |
| **Create Tenant** | Tạo đồng thời bản ghi tenant và user đăng nhập merchant |
| **Owner Email** | Thiết lập khi tạo và dùng làm email đăng nhập merchant |
| **Welcome Email** | Gửi bất đồng bộ sau khi tạo tenant nếu email service đã cấu hình |
| **Suspend / Unsuspend** | Suspend sẽ chặn quyền vận hành; unsuspend sẽ khôi phục |
| **Commission Rate** | Chỉnh tỷ lệ phí theo từng tenant |
| **Search / Filter / Sort** | Tìm theo business hoặc email; sắp xếp theo status hoặc volume |
| **Summary Metrics** | Lifetime volume, monthly volume, active tenants, suspended tenants |

Điều kiện khi tạo:

- Bắt buộc có business name.
- Email phải là duy nhất.
- Mật khẩu ban đầu tối thiểu 8 ký tự.

#### 3.3 Domain Rotation Pool

**Domain Rotation Pool** quản lý các shield domain dùng để che URL return/cancel của PayPal.

| Thao tác | Kết quả |
| --- | --- |
| **Add Domain** | Thêm shield domain mới vào pool |
| **Assign to Tenant** | Gán domain cho một tenant riêng hoặc để ở shared pool |
| **Activate / Deactivate** | Bật/tắt việc domain tham gia rotation |
| **Delete Domain** | Xóa vĩnh viễn domain khỏi pool |
| **Health Review** | Kiểm tra tình trạng sức khỏe và trạng thái gán domain |

#### 3.4 Global Settings

Settings của Super Admin lưu cấu hình ở cấp nền tảng:

| Nhóm | Mục đích |
| --- | --- |
| **Global Rotation Rules** | Lưu default daily limit, alert threshold và tùy chọn rotation ở cấp platform |
| **Notifications** | Lưu Telegram bot token và chat ID cho admin, sau đó gửi test alert |
| **Security** | Cấu hình price revalidation và API IP whitelist |
| **Profile Security** | Đổi mật khẩu và email |

Hành vi bảo mật profile:

- Đổi mật khẩu cần xác thực bằng mật khẩu hiện tại.
- Mật khẩu mới phải có ít nhất 12 ký tự.
- Đổi email dùng mã xác minh 6 chữ số gửi về email hiện tại.

---

## 4. Merchant Guide

### English

#### 4.1 Merchant Overview Dashboard

The merchant dashboard combines several operational panels:

| Panel | Purpose |
| --- | --- |
| **Global Metrics** | Today volume, shield domain count, today transaction count |
| **Rotation Logic** | View and change tenant rotation strategy |
| **Live Transaction Feed** | Polling transaction list for recent events |
| **Merchant Accounts** | Quick visibility into status, daily volume, and pause/resume |
| **Connected Stores** | Quick access to store list and store IDs |
| **Shield Domain Health** | Run connectivity checks and review domain status |

#### 4.2 Merchant Accounts

Use **Accounts** to manage PayPal routing accounts.

| Field / Control | Meaning |
| --- | --- |
| **Account Name** | Internal display name |
| **PayPal Email** | Unique per tenant |
| **Client ID / Client Secret** | Credentials used for PayPal API access |
| **Proxy URL** | Optional outbound proxy per account |
| **Shield Domain** | Domain used to mask return and cancel URLs |
| **Status** | Active, Warm-up, Limited, Paused, Suspended |
| **Priority** | Routing weight / preference |
| **Soft Limit** | Threshold where de-weighting begins |
| **Hard Limit** | Daily account cap |
| **Item Masking** | Toggle masked product naming for that account |
| **Fake Product Name** | Custom name sent to PayPal when masking is enabled |

Operational behavior:

| Rule | Actual behavior |
| --- | --- |
| **Warm-up** | New warm-up accounts can only process transactions up to **$50** each |
| **Warm-up ramp** | Daily cap grows from **$100** toward **$500** over 7 days |
| **Soft limit** | Traffic weight is reduced after soft limit is crossed |
| **High-value routing** | Orders of **$100+** prefer `ACTIVE` accounts over `WARMING_UP` accounts |
| **Hourly smoothing** | Accounts with more than 5 recent orders are temporarily de-prioritized |
| **Sync** | Recalculates current volume, checks PayPal connectivity, auto-pauses over-limit accounts |

#### 4.3 Rotation Logic

Merchant rotation is tenant-specific.

| Strategy | How it works |
| --- | --- |
| **Volume Based** | Picks the account with the most remaining daily headroom |
| **Time Based** | Keeps the current account until the configured interval expires, then rotates |
| **Sequential** | Cycles through accounts in list order |

Time-based rotation supports intervals from 1 minute to 24 hours. The UI offers common presets such as 30 minutes, 1 hour, and 2 hours.

#### 4.4 Store Setup

Use **Stores** to create and maintain storefront integrations.

| Action | Behavior |
| --- | --- |
| **Create Store** | Generates a Store ID and API key |
| **API Key display** | Plaintext key is shown once only |
| **Regenerate Key** | Invalidates the old key immediately and returns a new key once |
| **Webhook URL** | Optional callback target for payment events |
| **Enable / Disable** | Disabled stores cannot call the gateway |
| **Delete Store** | Permanently removes the store and invalidates credentials |

Store status in the UI:

| Status | Meaning |
| --- | --- |
| **Trial** | Store exists but has no transactions yet |
| **Active** | Store is enabled and has transaction activity |
| **Suspended** | Store access is disabled |

#### 4.5 Merchant Integration Quick Start

Storefront calls:

| Endpoint | Use |
| --- | --- |
| `POST /api/gateway/checkout` | Create PayPal order and receive `approvalUrl` |
| `POST /api/gateway/capture` | Capture a previously authorized payment |
| `POST /api/webhook/paypal` | PayPal webhook endpoint handled by the platform |

Required headers for store-originated gateway calls:

| Header | Description |
| --- | --- |
| `X-Store-ID` | Store UUID |
| `X-API-Key` | Store API key |

Typical checkout payload:

```json
{
  "amount": 49.99,
  "currency": "USD",
  "itemName": "Original product name",
  "intent": "CAPTURE"
}
```

Typical capture payload:

```json
{
  "authorization_id": "PAYPAL_AUTHORIZATION_ID"
}
```

#### 4.6 Transactions, Analytics, and Logs

| Screen | What it provides |
| --- | --- |
| **Transactions** | Search, status filter, masking filter, date range, CSV export |
| **Analytics** | Revenue summary, success rate, account-volume chart, store-volume chart |
| **Logs** | Real-time event log with level filters, account filters, and CSV export |

#### 4.7 Telegram Alerts

Merchants can configure their own Telegram notifications in **Settings**.

Setup flow:

1. Create a Telegram bot via **@BotFather**.
2. Add the bot to your target Telegram group or chat.
3. Save **Bot Token** and **Chat ID**.
4. Use **Send Test Alert** to verify delivery.

Successful capture alerts include:

- received amount
- store name
- account name

### Tiếng Việt

#### 4.1 Dashboard tổng quan của Merchant

Dashboard merchant gồm nhiều panel vận hành:

| Panel | Mục đích |
| --- | --- |
| **Global Metrics** | Volume hôm nay, số shield domain, số transaction hôm nay |
| **Rotation Logic** | Xem và đổi chiến lược rotation của tenant |
| **Live Transaction Feed** | Danh sách transaction gần nhất được polling liên tục |
| **Merchant Accounts** | Theo dõi nhanh status, daily volume và pause/resume |
| **Connected Stores** | Truy cập nhanh danh sách store và store ID |
| **Shield Domain Health** | Test kết nối và xem trạng thái domain |

#### 4.2 Merchant Accounts

Dùng **Accounts** để quản lý các tài khoản PayPal định tuyến.

| Trường / Điều khiển | Ý nghĩa |
| --- | --- |
| **Account Name** | Tên hiển thị nội bộ |
| **PayPal Email** | Duy nhất trong tenant |
| **Client ID / Client Secret** | Credential dùng để gọi PayPal API |
| **Proxy URL** | Proxy outbound tùy chọn cho từng account |
| **Shield Domain** | Domain dùng để che URL return và cancel |
| **Status** | Active, Warm-up, Limited, Paused, Suspended |
| **Priority** | Trọng số / mức ưu tiên định tuyến |
| **Soft Limit** | Ngưỡng bắt đầu giảm trọng số |
| **Hard Limit** | Trần daily cap của account |
| **Item Masking** | Bật/tắt việc đổi tên sản phẩm cho account đó |
| **Fake Product Name** | Tên tùy chỉnh gửi sang PayPal khi bật masking |

Hành vi vận hành:

| Quy tắc | Hành vi thực tế |
| --- | --- |
| **Warm-up** | Account warm-up chỉ xử lý tối đa **$50** cho mỗi giao dịch |
| **Warm-up ramp** | Daily cap tăng dần từ **$100** lên gần **$500** trong 7 ngày |
| **Soft limit** | Trọng số traffic giảm sau khi vượt soft limit |
| **High-value routing** | Đơn hàng từ **$100+** sẽ ưu tiên account `ACTIVE` hơn `WARMING_UP` |
| **Hourly smoothing** | Account có hơn 5 đơn gần đây sẽ tạm thời bị giảm ưu tiên |
| **Sync** | Tính lại current volume, kiểm tra kết nối PayPal, auto-pause account vượt hard limit |

#### 4.3 Rotation Logic

Rotation của merchant được cấu hình theo từng tenant.

| Chiến lược | Cách hoạt động |
| --- | --- |
| **Volume Based** | Chọn account còn nhiều headroom daily nhất |
| **Time Based** | Giữ account hiện tại cho đến khi hết interval rồi mới xoay |
| **Sequential** | Luân phiên theo thứ tự danh sách account |

Rotation theo thời gian hỗ trợ interval từ 1 phút đến 24 giờ. Giao diện cung cấp các preset phổ biến như 30 phút, 1 giờ và 2 giờ.

#### 4.4 Thiết lập Store

Dùng **Stores** để tạo và bảo trì tích hợp storefront.

| Thao tác | Hành vi |
| --- | --- |
| **Create Store** | Tạo Store ID và API key |
| **API Key display** | Plaintext key chỉ hiển thị một lần |
| **Regenerate Key** | Vô hiệu key cũ ngay lập tức và trả key mới đúng một lần |
| **Webhook URL** | Điểm nhận callback tùy chọn cho các sự kiện thanh toán |
| **Enable / Disable** | Store bị disable sẽ không gọi được gateway |
| **Delete Store** | Xóa vĩnh viễn store và vô hiệu credential |

Trạng thái store trên UI:

| Trạng thái | Ý nghĩa |
| --- | --- |
| **Trial** | Store đã tồn tại nhưng chưa có transaction |
| **Active** | Store đang bật và có hoạt động giao dịch |
| **Suspended** | Store đã bị tắt quyền truy cập |

#### 4.5 Tích hợp Merchant nhanh

Các call từ storefront:

| Endpoint | Mục đích |
| --- | --- |
| `POST /api/gateway/checkout` | Tạo PayPal order và nhận `approvalUrl` |
| `POST /api/gateway/capture` | Capture một thanh toán đã authorize trước đó |
| `POST /api/webhook/paypal` | Endpoint webhook PayPal do platform xử lý |

Header bắt buộc cho gateway call từ store:

| Header | Mô tả |
| --- | --- |
| `X-Store-ID` | UUID của store |
| `X-API-Key` | API key của store |

Payload checkout điển hình:

```json
{
  "amount": 49.99,
  "currency": "USD",
  "itemName": "Original product name",
  "intent": "CAPTURE"
}
```

Payload capture điển hình:

```json
{
  "authorization_id": "PAYPAL_AUTHORIZATION_ID"
}
```

#### 4.6 Transactions, Analytics và Logs

| Màn hình | Nội dung cung cấp |
| --- | --- |
| **Transactions** | Search, lọc status, lọc masking, khoảng ngày, export CSV |
| **Analytics** | Tóm tắt doanh thu, success rate, chart volume theo account và store |
| **Logs** | Event log thời gian thực với level filter, account filter và export CSV |

#### 4.7 Cảnh báo Telegram

Merchant có thể cấu hình thông báo Telegram riêng trong **Settings**.

Quy trình setup:

1. Tạo bot Telegram qua **@BotFather**.
2. Thêm bot vào group hoặc chat đích.
3. Lưu **Bot Token** và **Chat ID**.
4. Dùng **Send Test Alert** để xác minh.

Alert khi capture thành công bao gồm:

- số tiền nhận được
- tên store
- tên account

---

## 5. Technical and Security Notes

### English

| Topic | Current implementation |
| --- | --- |
| **Passwords** | User passwords are hashed with `bcrypt` cost factor 12 |
| **Store API keys** | Stored only as bcrypt hashes; plaintext is shown once on create/regenerate |
| **Merchant client secrets** | Encrypted at rest with **AES-256-GCM** |
| **Item masking** | Original item name is retained internally for audit; masked descriptor is sent to PayPal |
| **Shield URLs** | `return_url` and `cancel_url` are built from shield domains and carry only an opaque transaction reference |
| **Webhook verification** | PayPal webhook signatures are verified through PayPal's official verification endpoint with certificate-domain validation |
| **Role access control** | Middleware restricts route access by role |
| **Session tracking** | JWT sessions include a unique `jti` and 8-hour max age |
| **Revocation registry** | Super Admin session revocation writes revoked `jti` values into `token_blacklist` and logs the action |

How item masking works:

1. The storefront submits the real `itemName`.
2. The gateway stores the original name internally for audit visibility.
3. Before creating the PayPal order, the system replaces the outward-facing item name with a neutral descriptor or account-specific fake product name.
4. PayPal receives the masked value, not the original business-sensitive label.

### Tiếng Việt

| Chủ đề | Cách triển khai hiện tại |
| --- | --- |
| **Mật khẩu** | Mật khẩu user được hash bằng `bcrypt` cost factor 12 |
| **Store API keys** | Chỉ lưu dưới dạng bcrypt hash; plaintext chỉ hiển thị một lần khi tạo/regenerate |
| **Merchant client secrets** | Được mã hóa khi lưu bằng **AES-256-GCM** |
| **Item masking** | Tên sản phẩm gốc được giữ nội bộ để audit; descriptor đã mask mới được gửi sang PayPal |
| **Shield URLs** | `return_url` và `cancel_url` được dựng từ shield domain và chỉ chứa transaction reference dạng opaque |
| **Webhook verification** | Chữ ký webhook PayPal được xác minh qua endpoint chính thức của PayPal, có kiểm tra domain của certificate |
| **Role access control** | Middleware giới hạn truy cập route theo vai trò |
| **Session tracking** | JWT session có `jti` riêng và tuổi thọ tối đa 8 giờ |
| **Revocation registry** | Revoke session từ Super Admin sẽ ghi `jti` vào `token_blacklist` và ghi log hành động |

Cách item masking hoạt động:

1. Storefront gửi `itemName` thật.
2. Gateway lưu tên gốc trong hệ thống để phục vụ audit.
3. Trước khi tạo PayPal order, hệ thống thay tên hiển thị ra ngoài bằng descriptor trung tính hoặc fake product name của account.
4. PayPal chỉ nhận giá trị đã được mask, không nhận nhãn sản phẩm nhạy cảm ban đầu.

---

## 6. Troubleshooting

### English

#### 6.1 Shield Domain Health Status

The product uses three health labels in dashboard views:

| Status | Meaning |
| --- | --- |
| **Healthy** | Domain is reachable and typically responds quickly; live connectivity checks classify `< 200ms` as healthy |
| **Degraded** | Domain is reachable but slower, has SSL issues, or returns a non-ideal HTTP result |
| **Down** | Domain timed out, failed DNS resolution, refused connection, or is effectively unavailable |

#### 6.2 Common Issues

| Problem | Likely cause | Recommended action |
| --- | --- | --- |
| **Store not found or inactive** | Store is disabled or wrong `X-Store-ID` | Verify store status and credentials in **Stores** |
| **Invalid API key** | Old or incorrect store key | Regenerate the store API key and update the integration |
| **No active payment accounts available** | All accounts are paused/suspended or none exist | Review **Accounts** and resume or add accounts |
| **All accounts reached daily limit** | Active accounts have no remaining capacity | Increase limits, add accounts, or wait for counter reset |
| **Warm-up account cannot process this amount** | Transaction exceeds warm-up per-order limit | Route smaller orders or switch account status after warm-up |
| **Gateway in maintenance mode** | Super Admin enabled maintenance mode | Ask Super Admin to disable maintenance mode |
| **Telegram test alert failed** | Invalid bot token/chat ID or Telegram bot access issue | Recheck bot setup and resend a test |
| **Email verification code invalid or expired** | Code expired after 10 minutes or a newer request replaced it | Request a new code and verify again |

### Tiếng Việt

#### 6.1 Ý nghĩa trạng thái Shield Domain

Sản phẩm dùng ba nhãn sức khỏe trong các màn hình dashboard:

| Trạng thái | Ý nghĩa |
| --- | --- |
| **Healthy** | Domain truy cập được và thường phản hồi nhanh; test live phân loại `< 200ms` là healthy |
| **Degraded** | Domain vẫn truy cập được nhưng chậm hơn, có vấn đề SSL hoặc trả về HTTP không lý tưởng |
| **Down** | Domain timeout, lỗi DNS, bị từ chối kết nối hoặc thực tế không còn khả dụng |

#### 6.2 Lỗi thường gặp

| Vấn đề | Nguyên nhân có thể | Cách xử lý khuyến nghị |
| --- | --- | --- |
| **Store not found or inactive** | Store đã bị disable hoặc `X-Store-ID` sai | Kiểm tra status và credential trong **Stores** |
| **Invalid API key** | Store key cũ hoặc sai | Regenerate store API key rồi cập nhật lại tích hợp |
| **No active payment accounts available** | Tất cả account bị pause/suspend hoặc chưa có account | Kiểm tra **Accounts**, resume hoặc thêm account mới |
| **All accounts reached daily limit** | Các account active không còn capacity | Tăng limit, thêm account hoặc đợi reset counter |
| **Warm-up account cannot process this amount** | Giao dịch vượt ngưỡng per-order của warm-up | Chia đơn nhỏ hơn hoặc đổi status sau giai đoạn warm-up |
| **Gateway in maintenance mode** | Super Admin đã bật maintenance mode | Yêu cầu Super Admin tắt maintenance mode |
| **Telegram test alert failed** | Sai bot token/chat ID hoặc bot chưa có quyền | Kiểm tra lại cấu hình bot rồi gửi test lại |
| **Email verification code invalid or expired** | Code hết hạn sau 10 phút hoặc bị request mới ghi đè | Yêu cầu mã mới rồi xác minh lại |

---

## 7. Best-Practice Checklist

### English

- Keep at least one **ACTIVE** account with enough headroom for high-value orders.
- Use **WARMING_UP** only for low-risk, low-value traffic.
- Turn on **Item Masking** for sensitive products.
- Assign stable **Shield Domains** and test them regularly.
- Save every newly generated **Store API key** or **Gateway API key** immediately.
- Use **Telegram test alerts** after every configuration change.
- Review **Transactions**, **Analytics**, and **Logs** together when diagnosing issues.

### Tiếng Việt

- Luôn duy trì ít nhất một account **ACTIVE** còn đủ headroom cho đơn giá trị cao.
- Chỉ dùng **WARMING_UP** cho traffic giá trị thấp, rủi ro thấp.
- Bật **Item Masking** cho sản phẩm nhạy cảm.
- Gán **Shield Domain** ổn định và kiểm tra định kỳ.
- Luôn lưu lại **Store API key** hoặc **Gateway API key** mới ngay khi hệ thống hiển thị.
- Dùng **Telegram test alerts** sau mỗi lần đổi cấu hình.
- Khi chẩn đoán lỗi, nên xem đồng thời **Transactions**, **Analytics** và **Logs**.

