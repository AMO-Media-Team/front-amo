"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { LazyMotion, MotionConfig } from "motion/react"
import { ThemeProvider } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import type { ReactNode } from "react"

import { IndicadorConexion } from "@/components/feedback/indicador-conexion"
import { GuardiaTransiciones } from "@/components/motion/guardia-transiciones"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import { getQueryClient } from "./query-client"

const cargarCaracteristicasMotion = () =>
  import("@/components/motion/caracteristicas").then((modulo) => modulo.default)

interface ProveedoresProps {
  children: ReactNode
  /** Nonce de la CSP (lo emite el proxy) para el script anti-parpadeo de next-themes. */
  nonce?: string
}

/**
 * Proveedores globales. Viven solo en el layout raíz: next-themes falla si se
 * remonta en layouts de segmento.
 */
export function Proveedores({ children, nonce }: ProveedoresProps) {
  const queryClient = getQueryClient()

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>
          <MotionConfig reducedMotion="user">
            <LazyMotion features={cargarCaracteristicasMotion}>
              <TooltipProvider>
                {children}
                <Toaster position="top-right" richColors closeButton />
                <IndicadorConexion />
                <GuardiaTransiciones />
              </TooltipProvider>
            </LazyMotion>
          </MotionConfig>
        </NuqsAdapter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
