import assert from "node:assert/strict"
const m = await import("@/lib/checkout-flow")

// R1 — the new value is accepted per store
assert.equal(m.normalizeCheckoutFlow("SMART_BUTTONS"), "SMART_BUTTONS")
assert.equal(m.normalizeCheckoutFlow("bogus"), "REDIRECT")
assert.equal(m.resolveCheckoutFlow("SMART_BUTTONS", { defaultFlow: "REDIRECT" }), "SMART_BUTTONS")
assert.equal(m.resolveCheckoutFlow(null, { defaultFlow: "POPUP_BRIDGE" }), "POPUP_BRIDGE")

// R2 — never as the platform default
assert.equal(m.normalizePlatformDefaultFlow("SMART_BUTTONS"), "REDIRECT")
assert.equal(m.normalizePlatformDefaultFlow("POPUP_BRIDGE"), "POPUP_BRIDGE")
assert.equal(m.normalizePlatformDefaultFlow(undefined), "REDIRECT")
assert.deepEqual([...m.PLATFORM_DEFAULT_FLOW_VALUES], ["REDIRECT", "POPUP_BRIDGE"])

// R3 — PayPal only
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", "STRIPE"), "REDIRECT")
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", "SHOPIFY"), "REDIRECT")
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", "shopify"), "REDIRECT")
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", "PAYPAL"), "SMART_BUTTONS")
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", null), "SMART_BUTTONS")
assert.equal(m.effectiveFlowForProvider("POPUP_BRIDGE", "STRIPE"), "POPUP_BRIDGE")
assert.equal(m.effectiveFlowForProvider("REDIRECT", "SHOPIFY"), "REDIRECT")

console.log("PASS test-checkout-flow")
