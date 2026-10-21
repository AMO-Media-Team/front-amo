/**
 * Esquemas zod de «Mi cuenta»: los MISMOS en el formulario (cliente) y en la
 * Server Action (servidor). Módulo puro.
 */
import { z } from "zod"

import { evaluarContrasena } from "@/features/auth/components/politica-contrasena"
import { MENSAJE_POLITICA } from "@/features/auth/schemas"

import { normalizarCelularColombia } from "./celular"

const LONGITUD_MAXIMA_CONTRASENA = 128

// ── Perfil ───────────────────────────────────────────────────────────────────

const nombre = z
  .string({ error: "Escribe tu nombre." })
  .trim()
  .min(2, "Escribe al menos 2 caracteres.")
  .max(120, "Máximo 120 caracteres.")

/** Celular colombiano opcional; se guarda como `+57 300 123 4567` o `null`. */
const celular = z
  .string()
  .max(30, "El celular es demasiado largo.")
  .transform((valor, contexto) => {
    const resultado = normalizarCelularColombia(valor)
    if (!resultado.valido) {
      contexto.addIssue({ code: "custom", message: resultado.mensaje })
      return z.NEVER
    }
    return resultado.valor
  })

export const esquemaPerfil = z.object({ nombre, celular })

export type EntradaPerfil = z.input<typeof esquemaPerfil>
export type DatosPerfil = z.output<typeof esquemaPerfil>

// ── Contraseña ───────────────────────────────────────────────────────────────

export const esquemaCambioContrasena = z
  .object({
    actual: z
      .string({ error: "Escribe tu contraseña actual." })
      .min(1, "Escribe tu contraseña actual.")
      .max(LONGITUD_MAXIMA_CONTRASENA, "La contraseña es demasiado larga."),
    nueva: z
      .string({ error: "Escribe la contraseña nueva." })
      .max(LONGITUD_MAXIMA_CONTRASENA, "La contraseña es demasiado larga.")
      .refine((valor) => evaluarContrasena(valor).valida, MENSAJE_POLITICA),
    confirmacion: z.string({ error: "Escribe de nuevo la contraseña." }),
    cerrarOtras: z.boolean(),
  })
  .refine((datos) => datos.nueva === datos.confirmacion, {
    path: ["confirmacion"],
    message: "Las contraseñas no coinciden.",
  })
  .refine((datos) => datos.nueva !== datos.actual, {
    path: ["nueva"],
    message: "Elige una contraseña distinta de la actual.",
  })

export type EntradaCambioContrasena = z.input<typeof esquemaCambioContrasena>

// ── Verificación en dos pasos ────────────────────────────────────────────────

const codigo = z
  .string({ error: "Escribe el código de 6 dígitos." })
  .trim()
  .regex(/^\d{6}$/, "Escribe los 6 dígitos del código.")

const factorId = z.uuid({ error: "Identificador inválido." })

export const esquemaFactor = z.object({ factorId })

export const esquemaConfirmarFactor = z.object({ factorId, codigo })

export const esquemaCodigoActual = z.object({ codigo })

export type EntradaConfirmarFactor = z.input<typeof esquemaConfirmarFactor>

// ── Foto y actividad ─────────────────────────────────────────────────────────

export const esquemaRutaAvatar = z.object({
  ruta: z.string().min(1).max(200),
})

export const esquemaPaginaActividad = z.object({
  antesId: z.number().int().positive(),
})
