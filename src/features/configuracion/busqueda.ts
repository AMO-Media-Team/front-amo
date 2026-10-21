/**
 * Búsqueda de anunciantes para el selector de una excepción de comisión
 * (módulo puro). Sigue las mismas reglas que Operación: se busca por nombre
 * sin tildes (`nombre_normalizado`) o por NIT, que es un dato público de la
 * empresa (se muestra completo a quien puede ver al anunciante).
 */
import {
  DIGITOS_MINIMOS_NIT,
  formatearNit,
  normalizarBusqueda,
  patronContiene,
} from "@/features/operacion/formato"

export interface FiltroAnunciantes {
  /** Patrón `ilike` sobre `nombre_normalizado`; `null` sin texto útil. */
  nombre: string | null
  /** Dígitos a buscar dentro del NIT; `null` si el texto no parece un NIT. */
  nit: string | null
}

export function filtroAnunciantes(q: string): FiltroAnunciantes {
  const digitos = q.replace(/\D/g, "")
  return {
    nombre: patronContiene(normalizarBusqueda(q)),
    nit: digitos.length >= DIGITOS_MINIMOS_NIT ? digitos : null,
  }
}

/** Segunda línea de un anunciante en el selector: su NIT o su razón social. */
export function detalleAnunciante(anunciante: {
  nombre_comercial: string
  razon_social: string
  nit: string | null
  digito_verificacion: string | null
}): string | null {
  const identificacion = formatearNit(
    anunciante.nit,
    anunciante.digito_verificacion
  )
  if (identificacion) return `NIT ${identificacion}`
  return anunciante.razon_social !== anunciante.nombre_comercial
    ? anunciante.razon_social
    : null
}
