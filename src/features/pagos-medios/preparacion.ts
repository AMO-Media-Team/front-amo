/**
 * Qué falta para pagar cada liquidación aprobada (módulo puro): la situación
 * de cada fila, el análisis de una selección antes de generar el archivo de
 * pagos y la búsqueda, los filtros, el orden y la página de «Por pagar», que
 * se resuelven en el servidor sobre la lista completa (la RPC no filtra ni
 * ordena y nunca son miles).
 */
import { normalizarBusqueda } from "@/features/operacion/formato"
import type { Tono } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"

import type {
  LiquidacionPorPagar,
  MetodoPago,
  PedidoArchivo,
  ResumenPorPagar,
} from "./tipos"

/** Lo que admite `datos_dispersion_srv` en un archivo. */
export const MAXIMO_POR_ARCHIVO = 500

export const ESTADOS_PREPARACION = [
  "lista",
  "sin_documento",
  "sin_datos_pago",
  "en_archivo",
] as const

export type EstadoPreparacion = (typeof ESTADOS_PREPARACION)[number]

export const PREPARACION: Readonly<
  Record<
    EstadoPreparacion,
    { etiqueta: string; descripcion: string; tono: Tono }
  >
> = {
  lista: {
    etiqueta: "Lista para el archivo",
    descripcion:
      "Tiene el documento y los datos de pago, y aún no está en un archivo de pagos.",
    tono: "exito",
  },
  sin_documento: {
    etiqueta: "Falta documento soporte o factura",
    descripcion:
      "Emite el documento soporte o registra la factura del medio desde la liquidación.",
    tono: "aviso",
  },
  sin_datos_pago: {
    etiqueta: "Datos de pago incompletos",
    descripcion:
      "El medio debe completar sus datos de pago y su certificación debe estar aprobada.",
    tono: "aviso",
  },
  en_archivo: {
    etiqueta: "Ya en un archivo de pagos",
    descripcion:
      "Se envió al banco en un archivo anterior: registra su pago cuando se confirme.",
    tono: "info",
  },
}

/** Rótulos cortos de las tarjetas de «Por pagar» (la etiqueta completa va de ayuda). */
export const ROTULOS_PREPARACION: Readonly<Record<EstadoPreparacion, string>> =
  {
    lista: "Listas",
    sin_documento: "Sin documento",
    sin_datos_pago: "Datos incompletos",
    en_archivo: "En un archivo",
  }

/**
 * Nombre accesible de la tarjeta que filtra por situación: empieza por lo que
 * se ve (rótulo y cifra) y sigue con la etiqueta completa (WCAG 2.5.3: quien
 * dice «pulsar Sin documento» la activa). «Sin documento: 2. Falta documento
 * soporte o factura».
 */
export function nombreTarjetaPreparacion(
  estado: EstadoPreparacion,
  cantidad: number
): string {
  return `${ROTULOS_PREPARACION[estado]}: ${formatearNumero(cantidad)}. ${PREPARACION[estado].etiqueta}`
}

/** ¿Puede ir en un archivo de pagos? (documento y datos de pago listos). */
export function esIncluible(fila: LiquidacionPorPagar): boolean {
  return fila.documentoListo && fila.datosPagoListos
}

/** Lista para un archivo nuevo: incluible y aún sin archivo. */
export function estaLista(fila: LiquidacionPorPagar): boolean {
  return esIncluible(fila) && fila.dispersionId === null
}

/** Situaciones de una fila (puede faltarle el documento y también los datos de pago). */
export function estadosPreparacion(
  fila: LiquidacionPorPagar
): EstadoPreparacion[] {
  const estados: EstadoPreparacion[] = []
  if (estaLista(fila)) estados.push("lista")
  if (!fila.documentoListo) estados.push("sin_documento")
  if (!fila.datosPagoListos) estados.push("sin_datos_pago")
  if (fila.dispersionId !== null) estados.push("en_archivo")
  return estados
}

/** Suma en centavos para no arrastrar errores de coma flotante. */
export function sumarNeto(filas: readonly { montoNeto: number }[]): number {
  return (
    filas.reduce((suma, fila) => suma + Math.round(fila.montoNeto * 100), 0) /
    100
  )
}

export function resumirPorPagar(
  filas: readonly LiquidacionPorPagar[]
): ResumenPorPagar {
  const listas = filas.filter(estaLista)
  return {
    total: filas.length,
    listas: listas.length,
    montoListas: sumarNeto(listas),
    archivoListas: pedidoDeSeleccion(listas),
    sinDocumento: filas.filter((fila) => !fila.documentoListo).length,
    sinDatosPago: filas.filter((fila) => !fila.datosPagoListos).length,
    enArchivo: filas.filter((fila) => fila.dispersionId !== null).length,
  }
}

// ── Lo que se pide al generar un archivo ─────────────────────────────────────

/**
 * De una selección de la tabla (o de todas las listas): deja por fuera, con
 * su porqué, lo que aún no se puede pagar; marca las que ya están en otro
 * archivo y recorta a lo que admite un archivo.
 */
export function pedidoDeSeleccion(
  filas: readonly LiquidacionPorPagar[]
): PedidoArchivo {
  const incluibles = filas.filter(esIncluible)
  const incluidas = incluibles.slice(0, MAXIMO_POR_ARCHIVO)
  return {
    ids: incluidas.map((fila) => fila.id),
    total: sumarNeto(incluidas),
    medios: new Set(incluidas.map((fila) => fila.medioId)).size,
    excluidas: filas
      .filter((fila) => !esIncluible(fila))
      .map((fila) => ({
        id: fila.id,
        medio: fila.medio,
        motivo: fila.documentoListo ? "sin_datos_pago" : "sin_documento",
      })),
    yaEnArchivo: incluidas
      .filter((fila) => fila.dispersionId !== null)
      .map((fila) => ({
        id: fila.id,
        medio: fila.medio,
        dispersadaAt: fila.dispersadaAt,
      })),
    recortado: incluibles.length > MAXIMO_POR_ARCHIVO,
  }
}

// ── Búsqueda, filtros, orden y página ────────────────────────────────────────

export const CAMPOS_ORDEN_POR_PAGAR = [
  "aprobada",
  "neto",
  "medio",
  "periodo",
] as const

export type CampoOrdenPorPagar = (typeof CAMPOS_ORDEN_POR_PAGAR)[number]

export interface FiltrosPorPagar {
  q: string
  preparacion: readonly EstadoPreparacion[]
  metodo: readonly MetodoPago[]
}

/**
 * Búsqueda por medio (sin tildes ni mayúsculas, palabras en orden) y filtros
 * facetados: una fila pasa si tiene alguna de las situaciones elegidas y uno
 * de los métodos elegidos (sin método registrado no pasa un filtro de método).
 */
export function filtrarPorPagar(
  filas: readonly LiquidacionPorPagar[],
  { q, preparacion, metodo }: FiltrosPorPagar
): LiquidacionPorPagar[] {
  const palabras = normalizarBusqueda(q).split(" ").filter(Boolean)
  return filas.filter((fila) => {
    if (palabras.length > 0 && !contienePalabras(fila.medio, palabras)) {
      return false
    }
    if (
      preparacion.length > 0 &&
      !estadosPreparacion(fila).some((estado) => preparacion.includes(estado))
    ) {
      return false
    }
    return (
      metodo.length === 0 ||
      (fila.metodoPago !== null && metodo.includes(fila.metodoPago))
    )
  })
}

function contienePalabras(texto: string, palabras: readonly string[]): boolean {
  const normalizado = normalizarBusqueda(texto)
  let desde = 0
  for (const palabra of palabras) {
    const posicion = normalizado.indexOf(palabra, desde)
    if (posicion < 0) return false
    desde = posicion + palabra.length
  }
  return true
}

const comparadorTexto = new Intl.Collator("es-CO", { sensitivity: "base" })

function valorOrden(
  fila: LiquidacionPorPagar,
  campo: CampoOrdenPorPagar
): string | number {
  switch (campo) {
    case "aprobada":
      return fila.aprobadaAt ?? ""
    case "neto":
      return fila.montoNeto
    case "medio":
      return fila.medio
    case "periodo":
      return `${fila.periodoFin}|${fila.periodoInicio}`
  }
}

/** Orden estable: ante empate, la aprobada antes y después el id. */
export function ordenarPorPagar(
  filas: readonly LiquidacionPorPagar[],
  orden: { campo: CampoOrdenPorPagar; descendente: boolean }
): LiquidacionPorPagar[] {
  const signo = orden.descendente ? -1 : 1
  return [...filas].sort((a, b) => {
    const va = valorOrden(a, orden.campo)
    const vb = valorOrden(b, orden.campo)
    const comparacion =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : comparadorTexto.compare(String(va), String(vb))
    if (comparacion !== 0) return signo * comparacion
    return (
      (a.aprobadaAt ?? "").localeCompare(b.aprobadaAt ?? "") ||
      a.id.localeCompare(b.id)
    )
  })
}

/** Una página 1-based; si ya no existe (p. ej. tras filtrar), la última que sí. */
export function paginar<T>(
  filas: readonly T[],
  pagina: number,
  tamano: number
): { filas: T[]; pagina: number } {
  const ultima = Math.max(1, Math.ceil(filas.length / tamano))
  const real = Math.min(Math.max(1, pagina), ultima)
  const desde = (real - 1) * tamano
  return { filas: filas.slice(desde, desde + tamano), pagina: real }
}
