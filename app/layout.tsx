import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { SessionProvider } from '@/components/auth/session-provider'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'PayDef — Payment Gateway Protection for Ecommerce Teams',
  description: 'Protect checkout continuity, manage merchant accounts, improve payment display clarity, recover failed webhooks, and strengthen dispute readiness from one secure payment operations dashboard.',
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
  metadataBase: new URL('https://www.paydef.io'),
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-mono antialiased bg-background text-foreground">
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
