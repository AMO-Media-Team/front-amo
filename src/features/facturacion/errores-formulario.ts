/**
 * Reparto de un fallo de una Server Action entre los campos de un formulario
 * de Finanzas (módulo puro): cada campo conocido recibe su mensaje, el del
 * archivo va a la zona de carga y lo demás queda como error general. Así un
 * error nunca se pierde por venir de un campo que el formulario no pinta.
 */
import type { ResultadoFallo } from "@/lib/result"

/** Nombres con que llega el error del archivo (zod, `hint` de la BD, la acción). */
const CAMPOS_ARCHIVO: readonly string[] = [
  "archivo",
  "archivoPath",
  "soportePath",
]

export interface ErroresRepartidos<C extends string> {
  campos: readonly (readonly [C, string])[]
  archivo: string | null
  general: string | null
}

export function repartirErrores<C extends string>(
  resultado: ResultadoFallo,
  camposConocidos: readonly C[]
): ErroresRepartidos<C> {
  const entradas = Object.entries(resultado.erroresCampo ?? {})
  const campos = entradas.flatMap(([campo, mensajes]) =>
    (camposConocidos as readonly string[]).includes(campo) && mensajes[0]
      ? [[campo as C, mensajes[0]] as const]
      : []
  )
  const archivo =
    entradas.find(
      ([campo, mensajes]) => CAMPOS_ARCHIVO.includes(campo) && mensajes[0]
    )?.[1][0] ?? null
  const general =
    campos.length === 0 && archivo === null ? resultado.error : null
  return { campos, archivo, general }
}

/** `aria-describedby` con la ayuda y, si hay error, su mensaje (se omiten los vacíos). */
export function describir(
  ...ids: readonly (string | false | null | undefined)[]
): string | undefined {
  const lista = ids.filter((id): id is string => Boolean(id))
  return lista.length > 0 ? lista.join(" ") : undefined
}
