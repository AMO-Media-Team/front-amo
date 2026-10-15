/**
 * Esquemas de variables de entorno (módulo puro: sin `server-only` ni lecturas
 * de `process.env`). Lo usan `env.ts` (cliente), `env.server.ts` (servidor) y
 * `next.config.ts`, que valida todo durante `next build` para fallar temprano.
 */
import { z } from "zod"

type FuenteEnv = Record<string, string | undefined>

const CLAVE_CIFRADO = /^k(\d+):([A-Za-z0-9+/]{43}=)$/
const BYTES_CLAVE_CIFRADO = 32
const LONGITUD_MINIMA_SECRETO = 32

/** Las claves nuevas de Supabase declaran su alcance en el prefijo. */
const PREFIJO_CLAVE_PUBLICABLE = "sb_publishable_"

export const MAPBOX_ESTILO_POR_DEFECTO = "mapbox://styles/mapbox/standard"
export const SITIO_URL_POR_DEFECTO = "http://localhost:3000"

function longitudBase64Decodificada(base64: string): number {
  try {
    return atob(base64).length
  } catch {
    return -1
  }
}

/** `k<n>:<base64 de 32 bytes>`; el prefijo identifica la versión de la clave (rotación). */
export function esClaveCifradoValida(valor: string): boolean {
  const coincidencia = CLAVE_CIFRADO.exec(valor)
  if (!coincidencia) return false
  return longitudBase64Decodificada(coincidencia[2]) === BYTES_CLAVE_CIFRADO
}

export const esquemaEnvCliente = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  // Exigir el prefijo evita publicar por error la secret key (sb_secret_…) o
  // una clave JWT antigua de service_role en el bundle del navegador.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith(
      PREFIJO_CLAVE_PUBLICABLE,
      `Debe ser la clave publicable de Supabase (${PREFIJO_CLAVE_PUBLICABLE}…).`
    ),
  NEXT_PUBLIC_MAPBOX_TOKEN: z
    .string()
    .startsWith("pk.", "Debe ser un token público de Mapbox (pk.*)."),
  NEXT_PUBLIC_MAPBOX_STYLE: z
    .string()
    .startsWith("mapbox://styles/", "Debe ser una URL mapbox://styles/…")
    .default(MAPBOX_ESTILO_POR_DEFECTO),
  NEXT_PUBLIC_SITE_URL: z
    .url({ protocol: /^https?$/ })
    .default(SITIO_URL_POR_DEFECTO),
})

export const esquemaEnvServidor = z
  .object({
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    AMO_CIFRADO_KEY: z
      .string()
      .refine(
        esClaveCifradoValida,
        "Formato esperado k<n>:<base64 de 32 bytes> (openssl rand -base64 32)."
      ),
    AMO_SERVIDOR_SECRET: z
      .string()
      .min(
        LONGITUD_MINIMA_SECRETO,
        `Debe tener al menos ${LONGITUD_MINIMA_SECRETO} caracteres.`
      ),
    SUPERADMIN_EMAIL: z.email().optional(),
    AMO_SMTP_CONFIGURADO: z
      .enum(["true", "false"])
      .default("false")
      .transform((valor) => valor === "true"),
    TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    AMO_CSP_MODO: z.enum(["enforce", "report"]).default("enforce"),
  })
  .superRefine((env, ctx) => {
    if (env.VERCEL_ENV === "production" && !env.SUPABASE_SECRET_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_SECRET_KEY"],
        message: "Es obligatoria en producción (VERCEL_ENV=production).",
      })
    }
    if (Boolean(env.TURNSTILE_SITE_KEY) !== Boolean(env.TURNSTILE_SECRET_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["TURNSTILE_SECRET_KEY"],
        message: "TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY van juntas.",
      })
    }
  })

export type EnvCliente = z.output<typeof esquemaEnvCliente>
export type EnvServidor = z.output<typeof esquemaEnvServidor>

export class ErrorEnv extends Error {
  constructor(ambito: string, error: z.ZodError) {
    super(`${ambito}\n${describirErroresEnv(error)}`)
    this.name = "ErrorEnv"
  }
}

/** Mensaje legible que nombra variables y problemas, nunca los valores. */
export function describirErroresEnv(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const variable = issue.path.join(".") || "(entorno)"
      const motivo =
        issue.code === "invalid_type" ? "Falta o no es texto." : issue.message
      return `  • ${variable}: ${motivo}`
    })
    .join("\n")
}

/** Las entradas vacías (`CLAVE=`) cuentan como ausentes. */
function sinVacios(fuente: FuenteEnv): FuenteEnv {
  return Object.fromEntries(
    Object.entries(fuente).filter(
      ([, valor]) => valor !== undefined && valor.trim() !== ""
    )
  )
}

export function validarEnvCliente(fuente: FuenteEnv): EnvCliente {
  const resultado = esquemaEnvCliente.safeParse(sinVacios(fuente))
  if (!resultado.success) {
    throw new ErrorEnv(
      "Variables de entorno públicas inválidas:",
      resultado.error
    )
  }
  return resultado.data
}

export function validarEnvServidor(fuente: FuenteEnv): EnvServidor {
  const resultado = esquemaEnvServidor.safeParse(sinVacios(fuente))
  if (!resultado.success) {
    throw new ErrorEnv(
      "Variables de entorno de servidor inválidas:",
      resultado.error
    )
  }
  return resultado.data
}
