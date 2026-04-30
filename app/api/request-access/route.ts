import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // In a real application, you would validate the body, send an email/Telegram alert,
    // and save it to a database. For now, we return a success response to satisfy the UI.
    console.log("[Request Access] Received new request:", {
      name: body.name,
      email: body.email,
      company: body.company,
      businessType: body.businessType,
      provider: body.provider,
      volume: body.volume,
      hasMessage: !!body.message
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Request Access] Error handling request:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}
