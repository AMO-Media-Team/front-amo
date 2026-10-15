/**
 * Esquemas zod de las acciones de acceso (los mismos nombres de campo que
 * `acciones-contrato.ts`). Módulo puro: se prueba sin servidor.
 */
import { z } from "zod"

import {
  evaluarContrasena,
  LONGITUD_MINIMA_CONTRASENA,
} from "./components/politica-contrasena"

const LONGITUD_MAXIMA_CONTRASENA = 128
const LONGITUD_MAXIMA_RUTA = 2048

const correo = z
  .string({ error: "Escribe tu correo." })
  .trim()
  .toLowerCase()
  .min(1, "Escribe tu correo.")
  .max(254, "El correo es demasiado largo.")
  .pipe(z.email("Escribe un correo válido."))

/** `next` llega de la URL: se valida como ruta interna en la acción. */
const siguiente = z.string().max(LONGITUD_MAXIMA_RUTA).optional()

export const esquemaIngreso = z.object({
  email: correo,
  password: z
    .string({ error: "Escribe tu contraseña." })
    .min(1, "Escribe tu contraseña.")
    .max(LONGITUD_MAXIMA_CONTRASENA, "La contraseña es demasiado larga."),
  next: siguiente,
})

export const esquemaRecuperacion = z.object({ email: correo })

export const MENSAJE_POLITICA = `Usa al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres con mayúscula, minúscula, número y símbolo.`

export const esquemaNuevaContrasena = z
  .object({
    password: z
      .string({ error: "Escribe la contraseña nueva." })
      .max(LONGITUD_MAXIMA_CONTRASENA, "La contraseña es demasiado larga.")
      .refine((valor) => evaluarContrasena(valor).valida, MENSAJE_POLITICA),
    confirmacion: z.string({ error: "Escribe de nuevo la contraseña." }),
  })
  .refine((datos) => datos.password === datos.confirmacion, {
    path: ["confirmacion"],
    message: "Las contraseñas no coinciden.",
  })

export const esquemaCodigoMfa = z.object({
  codigo: z
    .string({ error: "Escribe el código de 6 dígitos." })
    .trim()
    .regex(/^\d{6}$/, "Escribe los 6 dígitos del código."),
  factorId: z.uuid().optional(),
  next: siguiente,
})

export const TIPOS_ENLACE = [
  "invite",
  "recovery",
  "email_change",
  "email",
  "signup",
  "magiclink",
] as const

export type TipoEnlace = (typeof TIPOS_ENLACE)[number]

export const esquemaConfirmacionEnlace = z.object({
  token_hash: z
    .string()
    .min(8)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(TIPOS_ENLACE),
  next: siguiente,
})

/** Solo los campos de texto pedidos; los vacíos cuentan como ausentes. */
export function leerFormulario<const C extends string>(
  datos: FormData,
  campos: readonly C[]
): Partial<Record<C, string>> {
  const resultado: Partial<Record<C, string>> = {}
  for (const campo of campos) {
    const valor = datos.get(campo)
    if (typeof valor === "string" && valor !== "") resultado[campo] = valor
  }
  return resultado
}
