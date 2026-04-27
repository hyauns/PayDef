import { validateProfileField } from "../lib/profile-validation"

const cases: [string, string | null | undefined, boolean][] = [
  ["email only", "support@test.com", false],
  ["email embedded", "TireVix support@test.com", false],
  ["https url", "https://example.com", false],
  ["www url", "www.example.com", false],
  ["domain", "tirevix.com", false],
  ["phone intl", "+1 323 329 7659", false],
  ["phone dashed", "323-329-7659", false],
  ["script tag", "<script>alert(1)</script>", false],
  ["javascript:", "javascript:alert(1)", false],
  ["html bold", "TireVix Auto <b>test</b>", false],
  ["valid brand", "TireVix Auto", true],
  ["valid brand2", "My Cool Store", true],
  ["empty string", "", true],
  ["null", null, true],
  ["undefined", undefined, true],
]

let allPassed = true
for (const [label, val, shouldAccept] of cases) {
  const r = validateProfileField("Descriptor Prefix", val as any)
  const testPass = shouldAccept ? r.valid : !r.valid
  if (!testPass) allPassed = false
  console.log(
    testPass ? "PASS" : "***FAIL***",
    label.padEnd(20),
    r.valid ? "accepted" : "rejected",
    r.error || `value="${r.value}"`
  )
}
console.log(allPassed ? "\nALL TESTS PASSED" : "\n*** SOME TESTS FAILED ***")
process.exit(allPassed ? 0 : 1)
