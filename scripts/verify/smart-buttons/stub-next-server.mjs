// Harness stand-in for next/server: just enough for route handlers.
export class NextRequest {}
export const NextResponse = {
  json: (body, init = {}) =>
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    }),
}
