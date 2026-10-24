/**
 * Colas de la validación del equipo AMO (ADM-007, ADM-008, ADM-009), módulo
 * puro: cómo viajan en la URL (`?cola=…&pagina=…&alertas=true`, mismos
 * parsers en servidor y cliente), quién atiende cada una y sus textos. La
 * ruta y los nombres de las colas son contrato (`rutas.ts`).
 *
 * Quién ve qué lo decide la BD: `cola_evidencias` exige `evidencias.validar`;
 * `cola_metricas` y `cola_verificacion`, `metricas.validar`. Aquí no se
 * consulta lo que el rol no puede ver.
 */
import type { Route } from "next"
import {
  createLoader,
  parseAsBoolean,
  parseAsInteger,
  parseAsStringLiteral,
} from "nuqs/server"

import { type ColaValidacion, COLAS_VALIDACION, RUTA_VALIDACION } from "./rutas"

export type { ColaValidacion }
export { COLAS_VALIDACION, RUTA_VALIDACION }

/** Elementos por página de cada cola (lo más antiguo primero). */
export const TAMANO_PAGINA_VALIDACION = 20

export const parsersValidacion = {
  pagina: parseAsInteger.withDefault(1),
  /** Solo las métricas con alerta (cola de métricas). */
  alertas: parseAsBoolean.withDefault(false),
}

/** Servidor: `await cargarParametrosValidacion(searchParams)`. */
export const cargarParametrosValidacion = createLoader(parsersValidacion)

/**
 * La cola tal como viene en la URL: `null` si no viene (o no existe), para
 * elegir la del rol con `colaPorDefecto`.
 */
export const cargarColaPedida = createLoader({
  cola: parseAsStringLiteral(COLAS_VALIDACION),
})

export interface AccesoValidacion {
  /** `evidencias.validar`: cola de evidencias. */
  evidencias: boolean
  /** `metricas.validar`: colas de métricas y de verificación. */
  metricas: boolean
  /** `metricas.editar_validadas`: constancia manual de permanencia y correcciones. */
  administrar: boolean
}

export function accesoValidacion(permisos: Iterable<string>): AccesoValidacion {
  const disponibles = new Set(permisos)
  return {
    evidencias: disponibles.has("evidencias.validar"),
    metricas: disponibles.has("metricas.validar"),
    administrar: disponibles.has("metricas.editar_validadas"),
  }
}

export function tieneAccesoCola(
  cola: ColaValidacion,
  acceso: AccesoValidacion
): boolean {
  return cola === "evidencias" ? acceso.evidencias : acceso.metricas
}

/** Colas que se ofrecen en la navegación (las que el rol atiende). */
export function colasVisibles(acceso: AccesoValidacion): ColaValidacion[] {
  return COLAS_VALIDACION.filter((cola) => tieneAccesoCola(cola, acceso))
}

/** Sin `?cola=`: la de evidencias; quien solo valida métricas cae en la suya. */
export function colaPorDefecto(acceso: AccesoValidacion): ColaValidacion {
  return acceso.evidencias || !acceso.metricas ? "evidencias" : "metricas"
}

export interface PresentacionCola {
  titulo: string
  /** Qué contiene la cola (ayuda bajo el título y lectores de pantalla). */
  descripcion: string
  /** Título del estado vacío. */
  vacia: string
  /** Texto del estado vacío. */
  ayudaVacia: string
}

export const COLAS: Readonly<Record<ColaValidacion, PresentacionCola>> = {
  evidencias: {
    titulo: "Evidencias",
    descripcion:
      "Publicaciones que los medios reportaron, la cargada hace más tiempo primero.",
    vacia: "No hay evidencias por validar",
    ayudaVacia:
      "Cuando un medio cargue el enlace y la captura de su publicación, aparecerá aquí para que la revises.",
  },
  metricas: {
    titulo: "Métricas",
    descripcion:
      "Cortes de métricas por revisar: primero los que tienen alerta, después el más antiguo.",
    vacia: "No hay métricas por validar",
    ayudaVacia:
      "Cuando un medio cargue las cifras de un corte, aparecerán aquí con la captura del panel.",
  },
  verificar: {
    titulo: "Por verificar",
    descripcion:
      "Asignaciones con todas sus métricas cargadas: las listas primero. Verificar es la puerta a la liquidación.",
    vacia: "No hay asignaciones por verificar",
    ayudaVacia:
      "Cuando una asignación tenga todos sus cortes cargados, aparecerá aquí para verificarla.",
  },
}

/** Descripción de la página según las colas que la persona atiende. */
export function descripcionValidacion(acceso: AccesoValidacion): string {
  if (acceso.evidencias && acceso.metricas) {
    return "Revisa la evidencia y las métricas que cargan los medios y verifica las asignaciones que cumplen todo: solo las verificadas entran a liquidación."
  }
  return acceso.evidencias
    ? "Revisa la evidencia de publicación que cargan los medios: el enlace del post, la captura y la etiqueta de publicidad."
    : "Revisa las métricas que cargan los medios y verifica las asignaciones que cumplen todo: solo las verificadas entran a liquidación."
}

export interface OpcionesRutaCola {
  pagina?: number
  /** Solo en la cola de métricas. */
  soloAlertas?: boolean
}

/** `/operacion/validacion?cola=…` con la página y el filtro si no son los de por defecto. */
export function rutaCola(
  cola: ColaValidacion,
  { pagina = 1, soloAlertas = false }: OpcionesRutaCola = {}
): Route {
  const parametros = new URLSearchParams({ cola })
  if (cola === "metricas" && soloAlertas) parametros.set("alertas", "true")
  if (pagina > 1) parametros.set("pagina", String(Math.trunc(pagina)))
  return `${RUTA_VALIDACION}?${parametros.toString()}` as Route
}

/** Página dentro de [1, última] con `total` elementos; con 0, la 1. */
export function paginaAcotada(pagina: number, total: number): number {
  const ultima = Math.max(
    1,
    Math.ceil(Math.max(0, total) / TAMANO_PAGINA_VALIDACION)
  )
  if (!Number.isFinite(pagina)) return 1
  return Math.min(ultima, Math.max(1, Math.trunc(pagina)))
}

/** Desplazamiento de la RPC para una página (`p_desplazamiento`). */
export function desplazamientoDe(pagina: number): number {
  return (
    (Math.max(1, Number.isFinite(pagina) ? Math.trunc(pagina) : 1) - 1) *
    TAMANO_PAGINA_VALIDACION
  )
}

/** Id del encabezado de la cola activa (destino del foco al vaciarse la hoja). */
export const ID_TITULO_COLA = "titulo-cola-validacion"

export function tituloCola(): HTMLElement | null {
  return document.getElementById(ID_TITULO_COLA)
}
