/**
 * Formulario de aceptación de términos (AUT-012), módulo puro: lo usan la
 * pantalla (nombres de campo) y la acción (validación). Es un `<form action>`
 * nativo: funciona también antes de hidratar o sin JavaScript.
 */
import { z } from "zod"

/** Nombres de campo del `FormData`. */
export const CAMPOS_ACEPTACION = {
  /** Una por casilla marcada: id de la versión aceptada. */
  aceptada: "aceptada",
  /** Una por documento en pantalla: lo que la persona tuvo delante. */
  mostrada: "mostrada",
  /** Ruta interna a la que continuar (se valida en la acción). */
  siguiente: "next",
} as const

/** Hay cuatro tipos de documento; el margen absorbe una página desactualizada. */
const MAXIMO_DOCUMENTOS = 8
const LONGITUD_MAXIMA_RUTA = 2048

const MENSAJE_SOLICITUD_INVALIDA =
  "No pudimos leer tu aceptación. Actualiza la página e intenta de nuevo."

const versiones = z
  .array(z.uuid(MENSAJE_SOLICITUD_INVALIDA))
  .max(MAXIMO_DOCUMENTOS, MENSAJE_SOLICITUD_INVALIDA)

export const esquemaAceptacion = z.object({
  aceptadas: versiones,
  mostradas: versiones.min(1, MENSAJE_SOLICITUD_INVALIDA),
  siguiente: z.string().max(LONGITUD_MAXIMA_RUTA).optional(),
})

export type EntradaAceptacion = z.input<typeof esquemaAceptacion>

function textos(valores: FormDataEntryValue[]): string[] {
  return valores.filter((valor): valor is string => typeof valor === "string")
}

/** `FormData` → entrada del esquema (los campos repetidos llegan como lista). */
export function leerFormularioAceptacion(datos: FormData): EntradaAceptacion {
  const siguiente = datos.get(CAMPOS_ACEPTACION.siguiente)
  return {
    aceptadas: textos(datos.getAll(CAMPOS_ACEPTACION.aceptada)),
    mostradas: textos(datos.getAll(CAMPOS_ACEPTACION.mostrada)),
    siguiente:
      typeof siguiente === "string" && siguiente ? siguiente : undefined,
  }
}
