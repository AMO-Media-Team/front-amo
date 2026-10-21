import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { headers } from "next/headers"

import { SaltoAlContenido } from "@/components/feedback/salto-contenido"
import { Proveedores } from "@/components/providers/proveedores"
import { envCliente } from "@/lib/env"
import { cn } from "@/lib/utils"

import "./globals.css"

/*
 * Fuentes servidas desde el repositorio (./fuentes, ver su README): compilar
 * o arrancar la app no depende de alcanzar Google Fonts. Son variables: un
 * archivo por familia cubre todos los pesos.
 */
const geistSans = localFont({
  src: "./fuentes/geist-latin-wght-normal.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
  fallback: ["system-ui", "Arial", "sans-serif"],
})

const geistMono = localFont({
  src: "./fuentes/geist-mono-latin-wght-normal.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  // El ajuste automático usa las métricas de Arial: no sirve para monoespaciada.
  adjustFontFallback: false,
})

const jakarta = localFont({
  src: "./fuentes/plus-jakarta-sans-latin-wght-normal.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
  fallback: ["system-ui", "Arial", "sans-serif"],
})

export const metadata: Metadata = {
  metadataBase: new URL(envCliente.NEXT_PUBLIC_SITE_URL),
  title: { default: "AMO", template: "%s · AMO" },
  description:
    "AMO — Advertising Market Optimization. Marketplace de pauta en medios hiperlocales.",
  applicationName: "AMO",
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, email: false, address: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E0B16" },
    { media: "(prefers-color-scheme: light)", color: "#FAF9FD" },
  ],
  colorScheme: "dark light",
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // El proxy genera un nonce por solicitud para la CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html
      lang="es-CO"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={cn(
        geistSans.variable,
        geistMono.variable,
        jakarta.variable,
        "h-full"
      )}
    >
      <body className="min-h-full">
        <SaltoAlContenido />
        <Proveedores nonce={nonce}>{children}</Proveedores>
      </body>
    </html>
  )
}
