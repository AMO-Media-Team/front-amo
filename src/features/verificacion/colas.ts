/**
 * Colas de trabajo de la verificación (ADM-001), módulo puro: qué colas hay,
 * cómo viajan en la URL (`?cola=…&pagina=…`, mismos parsers en servidor y
 * cliente) y quién ve cada una. Los parámetros son contrato: el resolvedor
 * `/ir/[entidad]/[id]` enlaza a `?cola=documentos|cuentas|solicitudes`.
 *
 * Quién ve qué lo decide la BD (RLS): las colas de medios, cuentas y
 * solicitudes exigen `medios.verificar`; la de documentos, además,
 * `datos_sensibles.ver` (la política de `documentos_medio` pide ambos).
 */
import type { Route } from "next"
import { createLoader, parseAsInteger, parseAsStringLiteral } from "nuqs/server"

export const COLAS = ["medios", "cuentas", "documentos", "solicitudes"] as const

export type Cola = (typeof COLAS)[number]

export const COLA_POR_DEFECTO: Cola = "medios"

/** Elementos por página en cada cola (las más antiguas primero). */
export const TAMANO_PAGINA = 20

export const parsersVerificacion = {
  cola: parseAsStringLiteral(COLAS).withDefault(COLA_POR_DEFECTO),
  pagina: parseAsInteger.withDefault(1),
}

/** Servidor: `await cargarParametrosVerificacion(searchParams)`. */
export const cargarParametrosVerificacion = createLoader(parsersVerificacion)

export interface PresentacionCola {
  titulo: string
  /** Qué contiene la cola (ayuda bajo el título y lectores de pantalla). */
  descripcion: string
  /** Texto del estado vacío. */
  vacia: string
}

export const COLAS_VERIFICACION: Readonly<Record<Cola, PresentacionCola>> = {
  medios: {
    titulo: "Medios",
    descripcion: "Perfiles enviados a verificación, el más antiguo primero.",
    vacia: "Ningún medio espera verificación.",
  },
  cuentas: {
    titulo: "Cuentas",
    descripcion: "Cuentas sociales que piden verificar sus seguidores.",
    vacia: "No hay cuentas por verificar.",
  },
  documentos: {
    titulo: "Documentos",
    descripcion: "Documentos cargados que esperan revisión.",
    vacia: "No hay documentos por revisar.",
  },
  solicitudes: {
    titulo: "Solicitudes",
    descripcion: "Medios que pidieron unirse desde el formulario público.",
    vacia: "No hay solicitudes de vinculación pendientes.",
  },
}

export interface AccesoColas {
  /** `medios.verificar`: colas de medios, cuentas y solicitudes. */
  verificarMedios: boolean
  /** `medios.verificar` + `datos_sensibles.ver`: cola de documentos. */
  verDocumentos: boolean
}

export function accesoColas(permisos: readonly string[]): AccesoColas {
  const verificarMedios = permisos.includes("medios.verificar")
  return {
    verificarMedios,
    verDocumentos: verificarMedios && permisos.includes("datos_sensibles.ver"),
  }
}

/** Página dentro de [1, última]; con 0 elementos, la 1. */
export function paginaAcotada(
  pagina: number,
  total: number,
  tamano: number = TAMANO_PAGINA
): number {
  const ultima = Math.max(1, Math.ceil(Math.max(0, total) / tamano))
  if (!Number.isFinite(pagina)) return 1
  return Math.min(ultima, Math.max(1, Math.trunc(pagina)))
}

/**
 * Página a la que se cae cuando la pedida ya no existe (otro vació la cola):
 * la última con `total` elementos y siempre menor que la pedida (la primera
 * nunca está fuera de rango), así el reintento termina aunque el total
 * cambie entre la consulta y el conteo.
 */
export function paginaTrasFueraDeRango(pagina: number, total: number): number {
  return Math.max(
    1,
    Math.min(Math.trunc(pagina) - 1, paginaAcotada(pagina, total))
  )
}

/** Rango `[desde, hasta]` (inclusivo) de PostgREST para una página. */
export function rangoPagina(
  pagina: number,
  tamano: number = TAMANO_PAGINA
): [number, number] {
  const desde = (Math.max(1, Math.trunc(pagina)) - 1) * tamano
  return [desde, desde + tamano - 1]
}

const RUTA_VERIFICACION = "/operacion/verificacion"

/** `/operacion/verificacion?cola=…&pagina=…` sin los valores por defecto. */
export function rutaCola(cola: Cola, pagina = 1): Route {
  const parametros = new URLSearchParams()
  if (cola !== COLA_POR_DEFECTO) parametros.set("cola", cola)
  if (pagina > 1) parametros.set("pagina", String(Math.trunc(pagina)))
  const consulta = parametros.toString()
  return (
    consulta ? `${RUTA_VERIFICACION}?${consulta}` : RUTA_VERIFICACION
  ) as Route
}

/** Pestaña de verificación de la ficha del medio (expediente y decisión). */
export const PESTANA_VERIFICACION = "verificacion"

/** Pestaña de pertinencia geográfica de la ficha del medio (ADM-006). */
export const PESTANA_PERTINENCIA = "pertinencia"

export function rutaRevisionMedio(medioId: string): Route {
  return `/operacion/medios/${medioId}?pestana=${PESTANA_VERIFICACION}` as Route
}
