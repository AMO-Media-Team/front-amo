/**
 * Bandeja de solicitudes de titulares (CTA-007), módulo puro: su estado en la
 * URL (`?estado=&tipo=&vence=`, búsqueda, orden y página, con los MISMOS
 * parsers en el servidor y en la tabla) y la traducción del semáforo a un
 * filtro de PostgREST. Por defecto, las abiertas primero (el enum de estado
 * está en ese orden) y, dentro de cada estado, la que vence antes.
 */
import type { Route } from "next"

import {
  definirEstadoTabla,
  type EstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"

import { type Semaforo, SEMAFOROS } from "./presentacion"
import { RUTA_PRIVACIDAD_ADMIN } from "./rutas"
import { ESTADOS_SOLICITUD, TIPOS_SOLICITUD } from "./tipos"

/** `estado` (abiertas primero), `recibida`, `vence` y `numero` (radicado). */
export const CAMPOS_ORDEN_SOLICITUDES = [
  "estado",
  "recibida",
  "vence",
  "numero",
] as const

export type CampoOrdenSolicitudes = (typeof CAMPOS_ORDEN_SOLICITUDES)[number]

export const estadoTablaSolicitudes = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_SOLICITUDES,
  ordenPorDefecto: { campo: "estado", descendente: false },
  filtros: {
    estado: filtroDeOpciones(ESTADOS_SOLICITUD),
    tipo: filtroDeOpciones(TIPOS_SOLICITUD),
    vence: filtroDeOpciones(SEMAFOROS),
  },
})

export type EstadoTablaSolicitudes = EstadoTabla<typeof estadoTablaSolicitudes>

/** Columna de la BD de cada campo de orden. */
export const COLUMNA_ORDEN: Readonly<Record<CampoOrdenSolicitudes, string>> = {
  estado: "estado",
  recibida: "recibida_at",
  vence: "plazo_vence",
  numero: "numero",
}

const DIA = /^\d{4}-\d{2}-\d{2}$/

/** Condición de PostgREST de cada semáforo (sobre las que tienen plazo corriendo). */
function condicion(semaforo: Semaforo, hoy: string): string {
  switch (semaforo) {
    case "vencida":
      return `plazo_vence.lt.${hoy}`
    case "hoy":
      return `plazo_vence.eq.${hoy}`
    case "por_vencer":
      return `and(alerta_desde.lte.${hoy},plazo_vence.gt.${hoy})`
    case "en_plazo":
      return `alerta_desde.gt.${hoy}`
  }
}

/**
 * Filtro `or=(…)` de los semáforos elegidos; `null` si no hay ninguno. Quien
 * lo use limita además a los estados con plazo corriendo
 * (`ESTADOS_CON_PLAZO`): en «Requiere información» se espera al titular.
 */
export function filtroVencimiento(
  semaforos: readonly Semaforo[],
  hoy: string
): string | null {
  if (!DIA.test(hoy)) throw new Error("El día debe tener la forma YYYY-MM-DD.")
  const elegidos = SEMAFOROS.filter((semaforo) => semaforos.includes(semaforo))
  if (elegidos.length === 0) return null
  return elegidos.map((semaforo) => condicion(semaforo, hoy)).join(",")
}

/** La búsqueda por radicado: «41», «N.º 41» o «#41». */
export function radicadoBuscado(texto: string): number | null {
  const coincidencia = /^\s*(?:n\.?\s*º?\s*|#)?\s*(\d{1,12})\s*$/i.exec(texto)
  if (!coincidencia) return null
  const numero = Number(coincidencia[1])
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null
}

/** La bandeja con unos semáforos (enlaces desde el panel o los avisos). */
export function rutaBandeja(vence: readonly Semaforo[] = []): Route {
  return estadoTablaSolicitudes.serializar(RUTA_PRIVACIDAD_ADMIN, {
    vence: vence.length > 0 ? [...vence] : null,
  }) as Route
}
