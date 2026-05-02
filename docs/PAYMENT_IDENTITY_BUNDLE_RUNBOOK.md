# Payment Identity Bundle: Operational Runbook

## 1. Overview
The **Payment Identity Bundle** module enforces consistent, semantic buyer-facing descriptors on the PayPal checkout line item. It connects the Payment Display Profile, merchant account, shield domain, descriptor item, and support/policy identity into a single cohesive candidate descriptor.

In **Enforce Mode**, the checkout payload automatically overrides generic descriptors (like "Payment Display Profile Item") with the specific Identity Bundle candidate descriptor (e.g., "TireVix Auto - Tire & Wheel Order").

## 2. Environment Variables
The module operates via explicit feature flags to guarantee safety and provide instant kill switches without code deployment.

### `PAYMENT_DISPLAY_PROFILE_MODE`
Controls the existing baseline Payment Display Profile system.
- Normally set to `enforce` in production to ensure proper tenant/merchant-account alignment and initial fallback behavior.
- Remains strictly independent of the Identity Bundle mode.

### `PAYMENT_IDENTITY_BUNDLE_MODE`
Controls the new Identity Bundle payload mutation system.
- `disabled`: The resolver is turned off completely. Checkout uses the existing Payment Display Profile.
- `shadow`: The resolver evaluates and logs candidate descriptors, but the PayPal payload remains entirely unchanged. Safe for monitoring.
- `enforce`: If a valid active bundle and selected item exist, the buyer-facing PayPal line item name is overridden by the candidate descriptor.

## 3. Recommended Rollout Stages
1. **Stage 1**: `disabled` — Initial deployment, verifying no system regressions.
2. **Stage 2**: `shadow` — Monitoring production checkouts to evaluate what descriptors *would* be used and verify there are no validation warnings.
3. **Stage 3**: `enforce` (Sandbox) — Execute end-to-end sandbox QA with a test store to confirm PayPal API compatibility.
4. **Stage 4**: `enforce` (Single Production Store) — Roll out enforcement on an isolated production store to monitor live behavior.
5. **Stage 5**: Broader rollout after successful monitoring.

## 4. Pre-Enforce Checklist
Before enabling `enforce` mode, confirm the following for the target store:
- [ ] Bundle is `active`.
- [ ] Bundle has a `publicBrandName` configured.
- [ ] Bundle has at least one `active` item.
- [ ] Candidate descriptor length (Brand + Item Name) is `<= 127` characters.
- [ ] Merchant account is assigned to the bundle.
- [ ] Shield domain is assigned to the bundle (if applicable).
- [ ] Shield domain ID resolves correctly during checkout fallback.
- [ ] Payment Display Profile remains valid and aligned.
- [ ] At least one `shadow` mode checkout has passed and generated logs.
- [ ] No `resolve_warning` logs appear for the bundle.
- [ ] Amount invariant passes (Candidate Amount === Checkout Total Amount).

## 5. Enforce Test Checklist
After enabling `enforce` mode on a target store:
- [ ] Run a checkout transaction.
- [ ] Confirm PayPal buyer view shows the *Candidate Descriptor* as the item name.
- [ ] Confirm `amount` remains completely unchanged.
- [ ] Confirm `currency` remains completely unchanged.
- [ ] Confirm item count is exactly `1`.
- [ ] Confirm PayPal authorization succeeds (`POST 201`).
- [ ] Confirm `payment.authorization.created` webhook is created.
- [ ] Confirm webhook is delivered to the merchant with an `HTTP 200` response.
- [ ] Confirm Vercel logs show `enforce_applied`.
- [ ] Confirm there are no unexpected `enforce_fallback` logs.

## 6. Expected Logs
In Datadog / Vercel Logs, look for the following JSON telemetry:

**Enforce Applied (Info):**
```json
{
  "event": "payment_identity_bundle.enforce_applied",
  "msg": "Identity bundle enforced on PayPal payload",
  "candidateDescriptor": "TireVix Auto - Tire & Wheel Order",
  "amountInvariantPassed": true
}
```

**Enforce Fallback (Warn):**
```json
{
  "event": "payment_identity_bundle.enforce_fallback",
  "msg": "Bundle has no active selected item",
  "fallbackReason": "no_selected_item"
}
```

**Resolve Result (Info):**
```json
{
  "event": "payment_identity_bundle.resolve_result",
  "mode": "enforce",
  "assignmentMatch": { "merchantAccount": true, "shieldDomain": true }
}
```

**Webhook Success (Info):**
```json
{
  "event": "webhook.delivery_success",
  "msg": "Webhook delivered successfully",
  "status": 200
}
```

## 7. Common Fallback Reasons
When `enforce` mode encounters an invalid state, it safely aborts mutation and falls back to the existing Payment Display Profile.
- `no_bundle`: The store or merchant account is not mapped to any active Identity Bundle.
- `no_selected_item`: The mapped bundle does not have any active items.
- `missing_candidate_descriptor`: An item exists, but the descriptor string failed to build.
- `descriptor_too_long`: The generated string exceeds PayPal's 127-character limit for line item names.
- `resolver_warning`: The system caught a missing DB reference or invalid ID.
- `invalid_candidate`: Security or content length violations were caught during preflight.
- `amount_invariant_failed`: The amount validation policy check failed, triggering a hard block or safe fallback.

## 8. Rollback / Kill Switch
No code deployment or Git revert is required for rollback.

**To stop payload mutation but keep logging:**
```env
PAYMENT_IDENTITY_BUNDLE_MODE=shadow
```
**To fully disable the resolver:**
```env
PAYMENT_IDENTITY_BUNDLE_MODE=disabled
```
*Note: Any environment variable changes require a Vercel Redeployment to propagate.*

## 9. Emergency Troubleshooting
- **PayPal buyer item did not change:** Check `PAYMENT_IDENTITY_BUNDLE_MODE` in Vercel. Ensure it is set to `enforce`. Verify the transaction triggered a `shadow_comparison` log.
- **`enforce_applied` missing:** Look for `enforce_fallback` or `resolve_warning` logs immediately preceding the checkout attempt.
- **`no_bundle`:** Ensure the Merchant Account is assigned to an active bundle in the UI.
- **`no_selected_item`:** Ensure the bundle has at least one active Item assigned to it.
- **`descriptor_too_long`:** Shorten the `publicBrandName` or the specific Item Name.
- **`shieldDomainId` missing:** Verify the fallback resolution logic in Phase 5E is functioning. Ensure the Shield Domain is assigned in the Bundle Assign UI.
- **`profileMatched=false` but `fallbackIdResolved=true`:** Normal behavior if the Shield Domain is valid but the original profile match was weak. The fallback successfully rescued the ID.
- **Webhook delivery failed:** Ensure the merchant webhook URL is responding. (This is strictly outside the scope of Identity Bundles).
- **Checkout failed (HTTP 5xx):** Immediately engage the Kill Switch (`PAYMENT_IDENTITY_BUNDLE_MODE=disabled`) and check standard Gateway error logs.

## 10. Known Safe State
Current confirmed Production Sandbox parameters:
- **Test Store:** TireVix Auto
- **Buyer item:** `TireVix Auto - Tire & Wheel Order`
- **amountInvariantPassed:** `true`
- **Item count:** `1`
- **AUTHORIZE:** Succeeded (`POST 201`)
- **Webhook Delivery:** `HTTP 200`
