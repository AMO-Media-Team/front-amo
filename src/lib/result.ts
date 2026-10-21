/**
 * Resultado uniforme de las Server Actions: los errores esperados (validación,
 * reglas de negocio) se devuelven, no se lanzan, para mostrarlos con
 * `useActionState` o `setError` de react-hook-form.
 */
import type { ZodError } from "zod"

export type ErroresCampo = Record<string, string[]>

export interface ResultadoExito<T> {
  ok: true
  datos: T
}

export interface ResultadoFallo {
  ok: false
  error: string
  erroresCampo?: ErroresCampo
}

export type ResultadoAccion<T = void> = ResultadoExito<T> | ResultadoFallo

export const MENSAJE_VALIDACION = "Revisa los campos marcados."

export function exito(): ResultadoExito<void>
export function exito<T>(datos: T): ResultadoExito<T>
export function exito<T>(datos?: T): ResultadoExito<T | undefined> {
  return { ok: true, datos }
}

export function fallo(
  error: string,
  erroresCampo?: ErroresCampo
): ResultadoFallo {
  return erroresCampo
    ? { ok: false, error, erroresCampo }
    : { ok: false, error }
}

/**
 * Agrupa los mensajes por ruta con puntos ("direccion.ciudad"), el mismo
 * formato de nombre que usa `setError`. Los errores sin ruta van al mensaje general.
 */
export function desdeErrorZod(
  error: ZodError,
  mensaje: string = MENSAJE_VALIDACION
): ResultadoFallo {
  const erroresCampo: ErroresCampo = {}
  const generales: string[] = []

  for (const issue of error.issues) {
    const ruta = issue.path.map(String).join(".")
    if (!ruta) {
      generales.push(issue.message)
      continue
    }
    const mensajes = (erroresCampo[ruta] ??= [])
    if (!mensajes.includes(issue.message)) mensajes.push(issue.message)
  }

  const tieneCampos = Object.keys(erroresCampo).length > 0
  return fallo(generales[0] ?? mensaje, tieneCampos ? erroresCampo : undefined)
}
