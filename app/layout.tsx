import type { Metadata } from 'next'
import { Geist, Geist_Mono, Be_Vietnam_Pro } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SessionProvider } from '@/components/auth/session-provider'
import { Toaster } from 'sonner'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

// Be Vietnam Pro: geometric sans-serif designed for Vietnamese diacritics.
// Loaded with the "vietnamese" subset so only required glyphs are fetched.
// Weights 400 + 600 + 700 match the landing page's body/heading usage.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});

export const metadata: Metadata = {
  title: 'Gateway Central Dashboard',
  description: 'Universal Payment Gateway Controller — multi-store management',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-mono antialiased bg-background text-foreground ${beVietnamPro.variable}`}>
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            classNames: {
              toast: "bg-card border border-border font-mono text-foreground",
              title: "text-foreground text-xs font-semibold",
              description: "text-muted-foreground text-[11px]",
              success: "border-emerald-400/30",
              error: "border-red-400/30",
            },
          }}
        />
        <Analytics />
      </body>
    </html>
  )
}
