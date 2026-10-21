import type { NextConfig } from "next"
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants"

import {
  ErrorEnv,
  validarEnvCliente,
  validarEnvServidor,
} from "./src/lib/env-esquema"

const SUPABASE_PROYECTO = "zygfqfvqwfvhbirmjojp"

/**
 * La CSP con nonce la emite `src/proxy.ts` (necesita un valor por solicitud);
 * aquí solo van las cabeceras estáticas.
 */
const CABECERAS_SEGURIDAD = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Mapbox valida los tokens restringidos por URL con el Referer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
]

/**
 * Polígonos de `public/data/geo` (países, departamentos y municipios). Son
 * públicos, no dependen de la sesión y solo cambian con un despliegue
 * (`pnpm geo:build`), pero su nombre no lleva hash: sin esta cabecera Next
 * los sirve con `max-age=0` y el explorador los vuelve a validar en cada
 * visita. Un día de caché y una semana sirviendo la copia mientras se
 * revalida en segundo plano.
 */
const CACHE_GEODATOS = [
  {
    key: "Cache-Control",
    value: "public, max-age=86400, stale-while-revalidate=604800",
  },
]

/** Mensajes de todos los grupos inválidos (públicas y de servidor) a la vez. */
function erroresDeEntorno(): string[] {
  const errores: string[] = []
  for (const validar of [validarEnvCliente, validarEnvServidor]) {
    try {
      validar(process.env)
    } catch (error) {
      if (!(error instanceof ErrorEnv)) throw error
      errores.push(error.message)
    }
  }
  return errores
}

/** Falla el build (o avisa en desarrollo) si falta una variable obligatoria. */
function validarEntorno(fase: string): void {
  if (fase !== PHASE_PRODUCTION_BUILD && fase !== PHASE_DEVELOPMENT_SERVER) {
    return
  }
  const errores = erroresDeEntorno()
  if (errores.length === 0) return

  const mensaje = `\n${errores.join("\n")}\nRevisa .env.local (plantilla en .env.example).\n`
  if (fase === PHASE_PRODUCTION_BUILD) throw new Error(mensaje)
  console.warn(`⚠${mensaje}`)
}

export default function configuracion(fase: string): NextConfig {
  validarEntorno(fase)

  return {
    // Permite servidores de desarrollo paralelos (una carpeta de compilación por
    // proceso). En Vercel y en el uso normal queda en ".next".
    distDir: process.env.AMO_DIST_DIR ?? ".next",
    typedRoutes: true,
    poweredByHeader: false,
    reactStrictMode: true,
    experimental: {
      authInterrupts: true,
    },
    images: {
      qualities: [75, 90],
      remotePatterns: [
        new URL(
          `https://${SUPABASE_PROYECTO}.supabase.co/storage/v1/object/**`
        ),
      ],
    },
    async headers() {
      return [
        { source: "/:path*", headers: CABECERAS_SEGURIDAD },
        { source: "/data/geo/:path*", headers: CACHE_GEODATOS },
      ]
    },
  }
}
