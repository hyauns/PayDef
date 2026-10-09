import assert from "node:assert/strict"
const { nextHealth } = await import("@/lib/shield-health")

// never probed
assert.deepEqual(nextHealth({ probe_up: null, probe_failures: 0 }, true), { probe_up: true, probe_failures: 0, flipped: null })
assert.deepEqual(nextHealth({ probe_up: null, probe_failures: 0 }, false), { probe_up: null, probe_failures: 1, flipped: null })
assert.deepEqual(nextHealth({ probe_up: null, probe_failures: 1 }, false), { probe_up: false, probe_failures: 2, flipped: "down" })
// UP: one failure is tolerated, the second flips
assert.deepEqual(nextHealth({ probe_up: true, probe_failures: 0 }, false), { probe_up: true, probe_failures: 1, flipped: null })
assert.deepEqual(nextHealth({ probe_up: true, probe_failures: 1 }, false), { probe_up: false, probe_failures: 2, flipped: "down" })
assert.deepEqual(nextHealth({ probe_up: true, probe_failures: 1 }, true), { probe_up: true, probe_failures: 0, flipped: null })
// DOWN stays down quietly, one success recovers
assert.deepEqual(nextHealth({ probe_up: false, probe_failures: 7 }, false), { probe_up: false, probe_failures: 8, flipped: null })
assert.deepEqual(nextHealth({ probe_up: false, probe_failures: 8 }, true), { probe_up: true, probe_failures: 0, flipped: "up" })
console.log("PASS test-next-health")
