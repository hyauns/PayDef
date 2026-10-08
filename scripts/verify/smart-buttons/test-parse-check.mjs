const sb = await import("@/lib/smart-buttons")
const cfg = { transactionId:"t", executeToken:"e", paypalOrderId:"</script>\u2028x", clientId:"c", currency:"USD", intent:"capture", successUrl:"https://a.com/x", cancelUrl:null }
for (const [name, html] of [["page", sb.renderButtonsPage(cfg, ["https://a.com"])], ["error", sb.renderButtonsErrorPage("expired", ["https://a.com"])], ["session", sb.renderSessionButtonsPage({ sessionId: "s", clientId: "</script>x", currency: "USD", intent: "capture", express: true }, ["https://a.com"])], ["finished", sb.renderButtonsFinishedPage({ type: "approved", status: "COMPLETED", redirectUrl: "https://a.com/x" }, ["https://a.com"], "t")]]) {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  for (const body of inline) new Function(body)   // throws SyntaxError if the emitted JS is broken
  console.log(name, "inline scripts parse:", inline.length)
}
