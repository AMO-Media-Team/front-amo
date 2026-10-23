/**
 * Colas de trabajo de la verificación (ADM-001 y ADM-003), módulo puro: qué
 * colas hay, cómo viajan en la URL (`?cola=…&pagina=…`, mismos parsers en
 * servidor y cliente) y quién ve cada una. Los parámetros son contrato: el
 * resolvedor `/ir/[entidad]/[id]` enlaza a `?cola=documentos|cuentas|solicitudes`.
 *
 * Quién ve qué lo decide la BD (RLS): las colas de medios, cuentas y
 * solicitudes exigen `medios.verificar`; la de documentos, además,
 * `datos_sensibles.ver` (la política de `documentos_medio` pide ambos); la de
 * anunciantes, `anunciantes.verificar`.
 */
import type { Route } from "next"
import { createLoader, parseAsInteger, parseAsStringLiteral } from "nuqs/server"

export const COLAS = [
  "medios",
  "cuentas",
  "documentos",
  "solicitudes",
  "anunciantes",
] as const

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

/**
 * La cola tal como viene en la URL: `null` si no viene (o no existe), para
 * elegir la de cada rol con `colaPorDefecto`.
 */
export const cargarColaPedida = createLoader({
  cola: parseAsStringLiteral(COLAS),
})

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
  anunciantes: {
    titulo: "Anunciantes",
    descripcion:
      "Empresas enviadas a verificación y documentos por revisar, lo más antiguo primero.",
    vacia: "Ninguna empresa espera verificación.",
  },
}

export interface AccesoColas {
  /** `medios.verificar`: colas de medios, cuentas y solicitudes. */
  verificarMedios: boolean
  /** `medios.verificar` + `datos_sensibles.ver`: cola de documentos. */
  verDocumentos: boolean
  /** `anunciantes.verificar`: cola de anunciantes. */
  verificarAnunciantes: boolean
}

export function accesoColas(permisos: readonly string[]): AccesoColas {
  const verificarMedios = permisos.includes("medios.verificar")
  return {
    verificarMedios,
    verDocumentos: verificarMedios && permisos.includes("datos_sensibles.ver"),
    verificarAnunciantes: permisos.includes("anunciantes.verificar"),
  }
}

/** ¿La persona puede atender esa cola? (lo que no, no se consulta). */
export function tieneAccesoCola(cola: Cola, acceso: AccesoColas): boolean {
  switch (cola) {
    case "documentos":
      return acceso.verDocumentos
    case "anunciantes":
      return acceso.verificarAnunciantes
    default:
      return acceso.verificarMedios
  }
}

/**
 * Colas que se ofrecen en la navegación: las de medios a quien verifica
 * medios (la de documentos aparece aunque le falte el permiso de datos
 * sensibles, para explicarlo) y la de anunciantes a quien verifica empresas.
 */
export function colasVisibles(acceso: AccesoColas): Cola[] {
  return COLAS.filter((cola) =>
    cola === "anunciantes"
      ? acceso.verificarAnunciantes
      : acceso.verificarMedios
  )
}

/** Descripción de la página según las colas que la persona atiende. */
export function descripcionVerificacion(acceso: AccesoColas): string {
  if (!acceso.verificarMedios) {
    return "Empresas anunciantes que enviaron sus documentos y esperan la revisión del equipo AMO."
  }
  return acceso.verificarAnunciantes
    ? "Lo que espera la revisión del equipo AMO: medios que enviaron su perfil, cuentas sociales, documentos, solicitudes para unirse y empresas anunciantes."
    : "Lo que espera la revisión del equipo AMO: medios que enviaron su perfil, cuentas sociales, documentos y solicitudes para unirse."
}

/** Sin `?cola=`: la de medios; un rol que solo verifica empresas cae en la suya. */
export function colaPorDefecto(acceso: AccesoColas): Cola {
  return !acceso.verificarMedios && acceso.verificarAnunciantes
    ? "anunciantes"
    : COLA_POR_DEFECTO
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

/**
 * Pestaña de verificación de la ficha del medio y de la del anunciante
 * (expediente y decisión).
 */
export const PESTANA_VERIFICACION = "verificacion"

/** Pestaña de pertinencia geográfica de la ficha del medio (ADM-006). */
export const PESTANA_PERTINENCIA = "pertinencia"

export function rutaRevisionMedio(medioId: string): Route {
  return `/operacion/medios/${medioId}?pestana=${PESTANA_VERIFICACION}` as Route
}
