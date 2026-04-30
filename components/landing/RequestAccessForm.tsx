"use client"

import { useState, useEffect } from "react"
import { Loader2, CheckCircle2, AlertCircle, Send, MessageCircle, MessageSquare, Copy, Check } from "lucide-react"

export default function RequestAccessForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    website: "",
    businessType: "Ecommerce Store",
    provider: "PayPal",
    volume: "Under $10k",
    message: "",
    agree: false
  })
  
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  
  // Contact Envs
  const telegramUrl = process.env.NEXT_PUBLIC_CONTACT_TELEGRAM_URL || ""
  const whatsappUrl = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_URL || ""
  const messengerUrl = process.env.NEXT_PUBLIC_CONTACT_MESSENGER_URL || ""
  const zaloUrl = process.env.NEXT_PUBLIC_CONTACT_ZALO_URL || ""
  const wechatId = process.env.NEXT_PUBLIC_CONTACT_WECHAT_ID || ""
  const wechatQr = process.env.NEXT_PUBLIC_CONTACT_WECHAT_QR_URL || ""

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })
      if (!res.ok) throw new Error("Failed")
      setSuccess(true)
    } catch (err) {
      setError("Something went wrong while sending your request. Please try again or contact us using one of the channels below.")
    } finally {
      setLoading(false)
    }
  }

  const handleCopyWeChat = () => {
    if (!wechatId) return
    navigator.clipboard.writeText(wechatId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Animation mock state
  const [animStep, setAnimStep] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimStep(s => (s + 1) % 4)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col lg:flex-row w-full gap-12 mt-12 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Left Form */}
      <div className="flex-1 flex flex-col gap-10">
        
        {/* Form Card */}
        <div className="bg-[#0A0A0A]/90 backdrop-blur-xl border border-[#2D2D2D] rounded-none shadow-[0_0_40px_rgba(255,214,0,0.05)] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--landing-yellow)]" />
          
          <div className="px-6 md:px-10 py-8">
            {success ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-4 animate-in zoom-in-95 duration-500">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="font-grotesk text-[20px] font-bold text-[#F5F5F0] tracking-[1px] uppercase mt-2">Request Received</h3>
                <p className="font-ibm-mono text-[12px] text-[#888] tracking-[1px] leading-relaxed uppercase max-w-[300px]">
                  Thanks — your request has been received. Our team will review it and contact you shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                
                {error && (
                  <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-none">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="font-ibm-mono text-[11px] text-red-500 tracking-[1px] uppercase leading-relaxed">{error}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="font-ibm-mono text-[10px] font-bold text-[#888] tracking-[1px] uppercase">Full Name *</label>
                    <input required name="name" value={formData.name} onChange={handleChange} className="w-full bg-[#111111] border border-[#2D2D2D] px-4 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] placeholder:text-[#444] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors" placeholder="John Doe" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-ibm-mono text-[10px] font-bold text-[#888] tracking-[1px] uppercase">Work Email *</label>
                    <input required type="email" name="email" value={formData.email} onChange={handleChange} className="w-full bg-[#111111] border border-[#2D2D2D] px-4 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] placeholder:text-[#444] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors" placeholder="john@company.com" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="font-ibm-mono text-[10px] font-bold text-[#888] tracking-[1px] uppercase">Company / Store Name *</label>
                    <input required name="company" value={formData.company} onChange={handleChange} className="w-full bg-[#111111] border border-[#2D2D2D] px-4 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] placeholder:text-[#444] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors" placeholder="Acme Corp" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-ibm-mono text-[10px] font-bold text-[#888] tracking-[1px] uppercase">Website URL</label>
                    <input type="url" name="website" value={formData.website} onChange={handleChange} className="w-full bg-[#111111] border border-[#2D2D2D] px-4 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] placeholder:text-[#444] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors" placeholder="https://..." />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="font-ibm-mono text-[10px] font-bold text-[#888] tracking-[1px] uppercase">Business Type</label>
                    <select name="businessType" value={formData.businessType} onChange={handleChange} className="w-full bg-[#111111] border border-[#2D2D2D] px-4 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors appearance-none cursor-pointer">
                      <option>Ecommerce Store</option>
                      <option>Agency / Client Stores</option>
                      <option>Subscription Business</option>
                      <option>Digital Products</option>
                      <option>Physical Goods</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-ibm-mono text-[10px] font-bold text-[#888] tracking-[1px] uppercase">Payment Provider</label>
                    <select name="provider" value={formData.provider} onChange={handleChange} className="w-full bg-[#111111] border border-[#2D2D2D] px-4 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors appearance-none cursor-pointer">
                      <option>PayPal</option>
                      <option>Stripe</option>
                      <option>Authorize.Net</option>
                      <option>Other</option>
                      <option>Not sure yet</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-ibm-mono text-[10px] font-bold text-[#888] tracking-[1px] uppercase">Monthly Volume</label>
                    <select name="volume" value={formData.volume} onChange={handleChange} className="w-full bg-[#111111] border border-[#2D2D2D] px-4 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors appearance-none cursor-pointer">
                      <option>Under $10k</option>
                      <option>$10k - $50k</option>
                      <option>$50k - $250k</option>
                      <option>$250k+</option>
                      <option>Prefer not to say</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-ibm-mono text-[10px] font-bold text-[#888] tracking-[1px] uppercase">Message *</label>
                  <textarea required name="message" value={formData.message} onChange={handleChange} rows={4} className="w-full bg-[#111111] border border-[#2D2D2D] px-4 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] placeholder:text-[#444] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors resize-none" placeholder="Tell us what you want to improve: checkout reliability, account routing, webhook recovery, dispute readiness, payment display clarity, or refund/capture operations." />
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <input type="checkbox" id="agree" name="agree" checked={formData.agree} onChange={handleChange} className="w-4 h-4 accent-[var(--landing-yellow)] bg-[#111] border-[#2D2D2D] cursor-pointer" />
                  <label htmlFor="agree" className="font-ibm-mono text-[11px] text-[#888] tracking-[1px] uppercase cursor-pointer select-none mt-0.5">
                    I agree to be contacted by the PayDef team about my request.
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--landing-yellow)] hover:bg-[#F5F5F0] disabled:opacity-60 disabled:cursor-not-allowed text-[#0A0A0A] font-grotesk font-bold text-[13px] tracking-[2px] uppercase py-4 rounded-none transition-colors mt-4 group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      SUBMITTING...
                    </>
                  ) : (
                    "REQUEST ACCESS"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Contact Channels */}
        <div className="flex flex-col gap-6 pt-6 border-t border-[#2D2D2D]">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <h3 className="font-grotesk text-[14px] font-bold text-[#F5F5F0] uppercase tracking-[2px]">Prefer to talk directly?</h3>
          </div>
          <p className="font-ibm-mono text-[11px] text-[#888] tracking-[1px] uppercase leading-relaxed max-w-[480px]">
            Reach our team through your preferred channel. We usually respond faster when you include your store URL and current payment provider.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            {telegramUrl && (
              <a href={telegramUrl} target="_blank" rel="noreferrer" className="flex flex-col gap-3 p-4 border border-[#2D2D2D] bg-[#111111] hover:border-[var(--landing-yellow)] transition-colors group cursor-pointer">
                <Send className="w-5 h-5 text-[#888] group-hover:text-[var(--landing-yellow)] transition-colors" />
                <div className="flex flex-col">
                  <span className="font-grotesk text-[12px] font-bold text-[#F5F5F0] uppercase tracking-[1px]">Telegram</span>
                  <span className="font-ibm-mono text-[9px] text-[#555] uppercase mt-1">@mrhoibeo</span>
                </div>
              </a>
            )}
            
            {whatsappUrl && (
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex flex-col gap-3 p-4 border border-[#2D2D2D] bg-[#111111] hover:border-[#25D366] transition-colors group cursor-pointer">
                <MessageCircle className="w-5 h-5 text-[#888] group-hover:text-[#25D366] transition-colors" />
                <div className="flex flex-col">
                  <span className="font-grotesk text-[12px] font-bold text-[#F5F5F0] uppercase tracking-[1px]">WhatsApp</span>
                  <span className="font-ibm-mono text-[9px] text-[#555] uppercase mt-1">Direct Chat</span>
                </div>
              </a>
            )}

            {messengerUrl && (
              <a href={messengerUrl} target="_blank" rel="noreferrer" className="flex flex-col gap-3 p-4 border border-[#2D2D2D] bg-[#111111] hover:border-[#0084FF] transition-colors group cursor-pointer">
                <MessageCircle className="w-5 h-5 text-[#888] group-hover:text-[#0084FF] transition-colors" />
                <div className="flex flex-col">
                  <span className="font-grotesk text-[12px] font-bold text-[#F5F5F0] uppercase tracking-[1px]">Messenger</span>
                  <span className="font-ibm-mono text-[9px] text-[#555] uppercase mt-1">Inbox us</span>
                </div>
              </a>
            )}

            {wechatId && (
              <button onClick={handleCopyWeChat} className="flex flex-col gap-3 p-4 border border-[#2D2D2D] bg-[#111111] hover:border-[#07C160] transition-colors group cursor-pointer text-left relative">
                <MessageSquare className="w-5 h-5 text-[#888] group-hover:text-[#07C160] transition-colors" />
                <div className="flex flex-col">
                  <span className="font-grotesk text-[12px] font-bold text-[#F5F5F0] uppercase tracking-[1px]">WeChat</span>
                  <span className="font-ibm-mono text-[9px] text-[#555] uppercase mt-1">
                    {copied ? "COPIED ID" : "COPY ID"}
                  </span>
                </div>
                {copied ? <Check className="w-3 h-3 text-[#07C160] absolute top-4 right-4" /> : <Copy className="w-3 h-3 text-[#555] group-hover:text-[#07C160] absolute top-4 right-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Mock Animation */}
      <div className="hidden lg:flex w-[380px] shrink-0 flex-col pt-8">
        <div className="bg-[#0A0A0A] border border-[#2D2D2D] flex flex-col relative overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-[#2D2D2D] bg-[#111111]">
            <div className="w-2 h-2 bg-[var(--landing-yellow)] rounded-full animate-pulse" />
            <span className="font-ibm-mono text-[10px] font-bold text-[#F5F5F0] uppercase tracking-[2px]">PayDef Intake</span>
          </div>
          <div className="p-6 flex flex-col gap-6 min-h-[300px]">
            <div className={`flex flex-col gap-1 transition-all duration-500 ${animStep >= 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <span className="font-ibm-mono text-[9px] text-[#555] uppercase tracking-[1px]">00:00:01</span>
              <div className="bg-[#1A1A1A] border border-[#3D3D3D] p-3 text-[#F5F5F0] font-ibm-mono text-[11px] uppercase tracking-[1px]">
                New request received
              </div>
            </div>
            <div className={`flex flex-col gap-1 transition-all duration-500 ${animStep >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <span className="font-ibm-mono text-[9px] text-[#555] uppercase tracking-[1px]">00:00:02</span>
              <div className="bg-[var(--landing-yellow)]/10 border border-[var(--landing-yellow)] p-3 text-[var(--landing-yellow)] font-ibm-mono text-[11px] uppercase tracking-[1px]">
                Store profile reviewed
              </div>
            </div>
            <div className={`flex flex-col gap-1 transition-all duration-500 ${animStep >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <span className="font-ibm-mono text-[9px] text-[#555] uppercase tracking-[1px]">00:00:05</span>
              <div className="bg-[#1A1A1A] border border-[#3D3D3D] p-3 text-[#F5F5F0] font-ibm-mono text-[11px] uppercase tracking-[1px]">
                Payment workflow assessment pending
              </div>
            </div>
            <div className={`flex flex-col gap-1 transition-all duration-500 ${animStep >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <span className="font-ibm-mono text-[9px] text-[#555] uppercase tracking-[1px]">00:00:06</span>
              <div className="bg-emerald-500/10 border border-emerald-500 p-3 text-emerald-500 font-ibm-mono text-[11px] uppercase tracking-[1px] flex items-center justify-between">
                <span>Routing to specialist</span>
                <Loader2 className="w-3 h-3 animate-spin" />
              </div>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  )
}
