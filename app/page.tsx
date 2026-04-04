"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import {
  Shield,
  RefreshCw,
  EyeOff,
  LayoutDashboard,
  Lock,
  Activity,
  CheckCircle,
  ArrowRight,
  MessageCircle,
  Send,
  ChevronRight,
  Globe,
  Menu,
  X,
  Zap,
  Server,
} from "lucide-react"

// ─── Translations ──────────────────────────────────────────────────────────────
const CONTENT = {
  en: {
    nav: {
      features: "Features",
      security: "Security",
      integrations: "Integrations",
      contact: "Contact",
      login: "Login",
    },
    hero: {
      badge: "Enterprise Payment Infrastructure",
      headline1: "Secure Your Revenue.",
      headline2: "Rotate Your Success.",
      sub: "The ultimate payment infrastructure for modern e-commerce. High-volume protection with intelligent PayPal rotation and advanced item masking.",
      cta_primary: "Login Now",
      cta_secondary: "Contact Us",
      already: "Already our customer?",
      not_yet: "Not our customer yet?",
    },
    stats: [
      { value: "$50M+", label: "Monthly Volume Protected" },
      { value: "99.97%", label: "Uptime SLA" },
      { value: "500+", label: "Active Merchants" },
      { value: "< 200ms", label: "Avg. Response Time" },
    ],
    features: {
      title: "Core Services",
      sub: "Everything you need to process at scale, stay protected, and grow without limits.",
      items: [
        {
          icon: "RefreshCw",
          title: "Merchant Rotation",
          desc: "Distribute volume across multiple accounts intelligently to prevent limitations and maximize throughput.",
          tag: "Rotation Engine",
        },
        {
          icon: "Globe",
          title: "Domain Shielding",
          desc: "Hide your store's origin from payment processors using safe bridge domains. Stay invisible, stay protected.",
          tag: "Shield Network",
        },
        {
          icon: "EyeOff",
          title: "Item Masking",
          desc: "Automatically replace sensitive product names with generic enterprise descriptors before they reach PayPal.",
          tag: "Stealth Layer",
        },
        {
          icon: "LayoutDashboard",
          title: "Multi-tenant Dashboard",
          desc: "Complete control over stores and transactions with real-time analytics and role-based access control.",
          tag: "Command Center",
        },
        {
          icon: "Zap",
          title: "Instant Webhooks",
          desc: "Real-time payment notifications delivered to your store with automatic retry and exponential backoff.",
          tag: "Event System",
        },
        {
          icon: "Server",
          title: "API-First Architecture",
          desc: "RESTful API with API key authentication. Integrate in minutes with any stack or platform.",
          tag: "Developer Ready",
        },
      ],
    },
    security: {
      title: "Enterprise-Grade Security",
      sub: "Your accounts are protected by the same technology used by Fortune 500 financial institutions.",
      badges: [
        { icon: "Lock", label: "AES-256 Encrypted", desc: "All credentials encrypted at rest" },
        { icon: "Activity", label: "24/7 Monitoring", desc: "Continuous threat detection" },
        { icon: "Shield", label: "PCI DSS Strategy", desc: "Compliant security posture" },
        { icon: "CheckCircle", label: "Bcrypt Hashing", desc: "Zero plaintext storage" },
      ],
    },
    integrations: {
      title: "Works With Every Platform",
      sub: "Plug into your existing e-commerce stack in minutes. No platform lock-in.",
      platforms: ["WooCommerce", "Shopify", "Magento", "PrestaShop", "OpenCart", "Custom API"],
    },
    contact: {
      title: "Get Started Today",
      sub: "Tell us about your processing volume and we will set up your account within 24 hours.",
      name: "Full Name",
      email: "Work Email",
      volume: "Monthly Processing Volume",
      message: "Message (optional)",
      submit: "Send Message",
      volumes: [
        "Under $10,000 / month",
        "$10,000 – $50,000 / month",
        "$50,000 – $200,000 / month",
        "$200,000+ / month",
      ],
      sending: "Sending...",
      sent: "Message sent! We will contact you within 24 hours.",
    },
    footer: {
      tagline: "Powered by Gateway Central Enterprise",
      links: [
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms of Use", href: "/terms" },
        { label: "API Docs", href: "#" },
        { label: "Support", href: "#" },
      ],
    },
  },
  vi: {
    nav: {
      features: "Tính năng",
      security: "Bảo mật",
      integrations: "Tích hợp",
      contact: "Liên hệ",
      login: "Đăng nhập",
    },
    hero: {
      badge: "Hạ tầng thanh toán doanh nghiệp",
      headline1: "Bảo mật doanh thu.",
      headline2: "Xoay chuyển thành công.",
      sub: "Hạ tầng thanh toán tối ưu cho thương mại điện tử hiện đại. Bảo vệ dòng tiền lớn với công nghệ xoay vòng PayPal thông minh và che giấu thông tin nâng cao.",
      cta_primary: "Đăng nhập ngay",
      cta_secondary: "Liên hệ ngay",
      already: "Đã là khách hàng?",
      not_yet: "Chưa là khách hàng?",
    },
    stats: [
      { value: "$50M+", label: "Khối lượng được bảo vệ hàng tháng" },
      { value: "99.97%", label: "Cam kết thời gian hoạt động" },
      { value: "500+", label: "Merchant đang hoạt động" },
      { value: "< 200ms", label: "Thời gian phản hồi trung bình" },
    ],
    features: {
      title: "Dịch vụ cốt lõi",
      sub: "Mọi thứ bạn cần để xử lý quy mô lớn, được bảo vệ và phát triển không giới hạn.",
      items: [
        {
          icon: "RefreshCw",
          title: "Xoay vòng Merchant",
          desc: "Phân phối khối lượng thông minh trên nhiều tài khoản để tránh bị giới hạn và tối đa hóa thông lượng.",
          tag: "Rotation Engine",
        },
        {
          icon: "Globe",
          title: "Chắn tên miền",
          desc: "Ẩn nguồn gốc cửa hàng khỏi bộ xử lý thanh toán bằng tên miền cầu nối an toàn.",
          tag: "Shield Network",
        },
        {
          icon: "EyeOff",
          title: "Che giấu sản phẩm",
          desc: "Tự động thay thế tên sản phẩm nhạy cảm bằng các mô tả doanh nghiệp chung trước khi đến PayPal.",
          tag: "Stealth Layer",
        },
        {
          icon: "LayoutDashboard",
          title: "Dashboard đa thuê bao",
          desc: "Kiểm soát hoàn toàn các cửa hàng và giao dịch với phân tích thời gian thực và kiểm soát truy cập.",
          tag: "Command Center",
        },
        {
          icon: "Zap",
          title: "Webhook tức thì",
          desc: "Thông báo thanh toán thời gian thực đến cửa hàng của bạn với tự động thử lại.",
          tag: "Event System",
        },
        {
          icon: "Server",
          title: "Kiến trúc API-First",
          desc: "REST API với xác thực API key. Tích hợp trong vài phút với bất kỳ stack hoặc nền tảng nào.",
          tag: "Developer Ready",
        },
      ],
    },
    security: {
      title: "Bảo mật cấp doanh nghiệp",
      sub: "Tài khoản của bạn được bảo vệ bởi công nghệ tương tự các tổ chức tài chính Fortune 500.",
      badges: [
        { icon: "Lock", label: "Mã hóa AES-256", desc: "Tất cả thông tin xác thực được mã hóa" },
        { icon: "Activity", label: "Giám sát 24/7", desc: "Phát hiện mối đe dọa liên tục" },
        { icon: "Shield", label: "Chiến lược PCI DSS", desc: "Tư thế bảo mật tuân thủ" },
        { icon: "CheckCircle", label: "Bcrypt Hashing", desc: "Không lưu trữ văn bản thuần túy" },
      ],
    },
    integrations: {
      title: "Tích hợp mọi nền tảng",
      sub: "Kết nối vào stack thương mại điện tử hiện có trong vài phút. Không bị khóa nền tảng.",
      platforms: ["WooCommerce", "Shopify", "Magento", "PrestaShop", "OpenCart", "Custom API"],
    },
    contact: {
      title: "Bắt đầu ngay hôm nay",
      sub: "Cho chúng tôi biết về khối lượng xử lý của bạn và chúng tôi sẽ thiết lập tài khoản trong 24 giờ.",
      name: "Họ và tên",
      email: "Email công việc",
      volume: "Khối lượng xử lý hàng tháng",
      message: "Tin nhắn (tùy chọn)",
      submit: "Gửi tin nhắn",
      volumes: [
        "Dưới $10,000 / tháng",
        "$10,000 – $50,000 / tháng",
        "$50,000 – $200,000 / tháng",
        "$200,000+ / tháng",
      ],
      sending: "Đang gửi...",
      sent: "Đã gửi tin nhắn! Chúng tôi sẽ liên hệ trong 24 giờ.",
    },
    footer: {
      tagline: "Được cung cấp bởi Gateway Central Enterprise",
      links: [
        { label: "Chính sách Bảo mật", href: "/privacy" },
        { label: "Điều khoản Sử dụng", href: "/terms" },
        { label: "Tài liệu API", href: "#" },
        { label: "Hỗ trợ", href: "#" },
      ],
    },
  },
}

type Lang = "en" | "vi"

// ─── Icon map ─────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  RefreshCw, Globe, EyeOff, LayoutDashboard, Zap, Server, Lock, Activity, Shield, CheckCircle,
}

// ─── Platform logos (text-based, muted) ───────────────────────────────────────
const PLATFORM_STYLES: Record<string, string> = {
  WooCommerce: "font-sans font-bold text-lg",
  Shopify: "font-sans font-semibold text-lg",
  Magento: "font-sans font-bold text-lg",
  PrestaShop: "font-sans font-semibold text-base",
  OpenCart: "font-sans font-semibold text-base",
  "Custom API": "font-mono font-bold text-sm",
}

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("en")
  const [menuOpen, setMenuOpen] = useState(false)
  const [formState, setFormState] = useState({ name: "", email: "", volume: "", message: "" })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user

  const t = CONTENT[lang]

  // Smooth font switch: fade out → swap lang → fade in
  // Font-family is not CSS-animatable, so we use a 120ms opacity dip
  // (matching the transition defined in globals.css) to mask the reflow.
  const switchLang = useCallback((next: Lang) => {
    const el = wrapperRef.current
    if (!el) { setLang(next); return }
    el.classList.add("lang-switching")
    setTimeout(() => {
      setLang(next)
      el.classList.remove("lang-switching")
    }, 120)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    await new Promise((r) => setTimeout(r, 1200))
    setSending(false)
    setSent(true)
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
    setMenuOpen(false)
  }

  return (
    <div ref={wrapperRef} className="min-h-screen bg-background text-foreground antialiased" data-lang={lang}>

      {/* ─── STICKY NAV ─────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-mono font-bold text-sm text-foreground tracking-tight">
              Gateway<span className="text-primary">Central</span>
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {(["features", "security", "integrations", "contact"] as const).map((id) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.nav[id]}
              </button>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={() => switchLang(lang === "en" ? "vi" : "en")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border text-[11px] font-mono text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <Globe className="w-3 h-3" />
              {lang === "en" ? "EN" : "VI"}
            </button>
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-white text-xs font-mono font-semibold hover:bg-emerald-400 transition-colors"
              >
                <LayoutDashboard className="w-3 h-3" />
                Control Center
              </Link>
            ) : (
              <Link
                href="/login"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-mono font-semibold hover:bg-primary/90 transition-colors"
              >
                {t.nav.login}
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
            {/* Mobile menu */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-1.5 text-muted-foreground hover:text-foreground"
            >
              {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-4 flex flex-col gap-3">
            {(["features", "security", "integrations", "contact"] as const).map((id) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className="text-sm font-mono text-muted-foreground hover:text-foreground text-left transition-colors"
              >
                {t.nav[id]}
              </button>
            ))}
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-emerald-500 text-white text-sm font-mono font-semibold w-fit"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Control Center
              </Link>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-primary text-primary-foreground text-sm font-mono font-semibold w-fit"
              >
                {t.nav.login} <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        )}
      </header>

      {/* ─── HERO ───────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-4 md:px-6 max-w-7xl mx-auto">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-[11px] font-mono mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {t.hero.badge}
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-sans font-bold text-foreground leading-[1.1] tracking-tight mb-6 text-balance">
            {t.hero.headline1}{" "}
            <span className="text-primary">{t.hero.headline2}</span>
          </h1>

          <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-10 text-pretty">
            {t.hero.sub}
          </p>

          {/* CTA group */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="text-center">
              <p className="text-[10px] font-mono text-muted-foreground mb-2 uppercase tracking-widest">
                {t.hero.already}
              </p>
              <Link
                href={isLoggedIn ? "/dashboard" : "/login"}
                className="inline-flex items-center gap-2 px-6 py-3 rounded bg-primary text-primary-foreground font-mono font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                {isLoggedIn ? (
                  <><LayoutDashboard className="w-4 h-4" /> Open Dashboard</>
                ) : (
                  <>{t.hero.cta_primary} <ArrowRight className="w-4 h-4" /></>
                )}
              </Link>
            </div>
            <div className="hidden sm:block w-px h-12 bg-border" />
            <div className="text-center">
              <p className="text-[10px] font-mono text-muted-foreground mb-2 uppercase tracking-widest">
                {t.hero.not_yet}
              </p>
              <button
                onClick={() => scrollTo("contact")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded border border-border text-foreground font-mono font-semibold text-sm hover:border-primary/50 hover:text-primary transition-colors"
              >
                {t.hero.cta_secondary}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {t.stats.map((stat) => (
            <div key={stat.label} className="bg-card px-6 py-5 text-center">
              <div className="text-2xl md:text-3xl font-mono font-bold text-primary mb-1">
                {stat.value}
              </div>
              <div className="text-xs text-muted-foreground font-mono">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4 md:px-6 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-3 text-balance">
              {t.features.title}
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto text-pretty">
              {t.features.sub}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.features.items.map((item, i) => {
              const Icon = ICON_MAP[item.icon]
              return (
                <div
                  key={i}
                  className="group relative bg-card border border-border rounded-lg p-6 hover:border-primary/40 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-9 h-9 rounded bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                      {Icon && <Icon className="w-4 h-4 text-primary" />}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground border border-border px-2 py-0.5 rounded-full">
                      {item.tag}
                    </span>
                  </div>
                  <h3 className="font-mono font-semibold text-foreground text-sm mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── SECURITY BADGES ────────────────────────────────────────────────── */}
      <section id="security" className="py-20 px-4 md:px-6 border-t border-border bg-card/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[11px] font-mono text-primary uppercase tracking-widest mb-3">
              {lang === "en" ? "Security" : "Bảo mật"}
            </p>
            <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4 text-balance">
              {t.security.title}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto text-pretty">
              {t.security.sub}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {t.security.badges.map((badge, i) => {
              const Icon = ICON_MAP[badge.icon]
              return (
                <div
                  key={i}
                  className="bg-card border border-border rounded-lg p-5 flex flex-col items-center text-center gap-3 hover:border-primary/30 transition-colors"
                >
                  <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    {Icon && <Icon className="w-5 h-5 text-primary" />}
                  </div>
                  <div>
                    <div className="text-xs font-mono font-semibold text-foreground mb-1">
                      {badge.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{badge.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Security feature highlight */}
          <div className="mt-8 bg-card border border-primary/20 rounded-lg p-6 flex flex-col md:flex-row items-center gap-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div className="text-center md:text-left">
              <p className="text-xs font-mono font-semibold text-foreground mb-1">
                {lang === "en"
                  ? "Your PayPal credentials are never stored in plaintext"
                  : "Thông tin PayPal của bạn không bao giờ được lưu dưới dạng văn bản thuần túy"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "en"
                  ? "All API keys and credentials are hashed with bcrypt (cost 12) before being written to the database. Even our engineers cannot read them."
                  : "Tất cả API key và thông tin xác thực được hash bằng bcrypt (cost 12) trước khi ghi vào database. Ngay cả kỹ sư của chúng tôi cũng không thể đọc chúng."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── INTEGRATIONS / PLATFORM LOGOS ─────────────────────────────────── */}
      <section id="integrations" className="py-20 px-4 md:px-6 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[11px] font-mono text-primary uppercase tracking-widest mb-3">
              {lang === "en" ? "Integrations" : "Tích hợp"}
            </p>
            <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4 text-balance">
              {t.integrations.title}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto text-pretty">
              {t.integrations.sub}
            </p>
          </div>

          {/* Platform logos row — muted, professional */}
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {t.integrations.platforms.map((name) => (
              <div
                key={name}
                className={`text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors select-none ${PLATFORM_STYLES[name] ?? "font-sans font-semibold text-base"}`}
              >
                {name}
              </div>
            ))}
          </div>

          {/* Integration badge row */}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {[
              lang === "en" ? "REST API" : "REST API",
              lang === "en" ? "Webhook Events" : "Sự kiện Webhook",
              lang === "en" ? "JSON Payloads" : "JSON Payload",
              lang === "en" ? "API Key Auth" : "Xác thực API Key",
              lang === "en" ? "SDK Agnostic" : "Không phụ thuộc SDK",
            ].map((badge) => (
              <span
                key={badge}
                className="px-3 py-1 rounded-full border border-border text-[11px] font-mono text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CONTACT FORM ───────────────────────────────────────────────────── */}
      <section id="contact" className="py-20 px-4 md:px-6 border-t border-border bg-card/30">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] font-mono text-primary uppercase tracking-widest mb-3">
              {lang === "en" ? "Contact" : "Liên hệ"}
            </p>
            <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4 text-balance">
              {t.contact.title}
            </h2>
            <p className="text-sm text-muted-foreground text-pretty">{t.contact.sub}</p>
          </div>

          {sent ? (
            <div className="bg-card border border-primary/30 rounded-lg p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-mono text-foreground">{t.contact.sent}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 md:p-8 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">
                    {t.contact.name}
                  </label>
                  <input
                    required
                    type="text"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="John Doe"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">
                    {t.contact.email}
                  </label>
                  <input
                    required
                    type="email"
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    className="bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="john@company.com"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">
                  {t.contact.volume}
                </label>
                <select
                  required
                  value={formState.volume}
                  onChange={(e) => setFormState({ ...formState, volume: e.target.value })}
                  className="bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50 transition-colors appearance-none"
                >
                  <option value="" disabled>—</option>
                  {t.contact.volumes.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">
                  {t.contact.message}
                </label>
                <textarea
                  rows={4}
                  value={formState.message}
                  onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                  className="bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors resize-none"
                  placeholder={lang === "en" ? "Tell us more about your use case..." : "Cho chúng tôi biết thêm về trường hợp sử dụng của bạn..."}
                />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded bg-primary text-primary-foreground font-mono font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {sending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t.contact.sending}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t.contact.submit}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 px-4 md:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Shield className="w-2.5 h-2.5 text-primary" />
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {t.footer.tagline}
            </span>
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {t.footer.links.map((link) => (
              <Link key={link.label} href={link.href} className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>

      {/* ─── FLOATING CHAT BUTTON ───────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2 z-40">
        <a
          href="https://t.me/gatewayCentral"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 bg-[#0088cc] text-white rounded-full text-xs font-mono shadow-lg hover:bg-[#0077bb] transition-colors"
          title="Telegram"
        >
          <Send className="w-3.5 h-3.5" />
          Telegram
        </a>
        <a
          href="https://wa.me/gatewayCentral"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 bg-[#25d366] text-white rounded-full text-xs font-mono shadow-lg hover:bg-[#20c05e] transition-colors"
          title="WhatsApp"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          WhatsApp
        </a>
      </div>
    </div>
  )
}