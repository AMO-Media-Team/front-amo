/**
 * Ficha de un archivo de pagos (módulo puro): el avance de sus pagos y la
 * página de sus liquidaciones con la búsqueda, el filtro y el orden de la URL.
 */
import { normalizarBusqueda } from "@/features/operacion/formato"

import { paginar, sumarNeto } from "./preparacion"
import type {
  DetalleDispersion,
  EstadoLiquidacion,
  LiquidacionDeDispersion,
  PaginaLiquidacionesDispersion,
} from "./tipos"
import type {
  CampoOrdenLiquidacionesDispersion,
  EstadoTablaLiquidacionesDispersion,
} from "./vistas"

export interface AvanceDispersion {
  pagadas: number
  porPagar: number
  anuladas: number
  /** Las que se incluyeron después en otro archivo (ya no apuntan a este). */
  enOtroArchivo: number
  montoPagado: number
  montoPorPagar: number
}

export function avanceDispersion({
  dispersion,
  liquidaciones,
}: DetalleDispersion): AvanceDispersion {
  const pagadas = liquidaciones.filter((fila) => fila.estado === "PAGADA")
  const porPagar = liquidaciones.filter((fila) => fila.estado === "APROBADA")
  return {
    pagadas: pagadas.length,
    porPagar: porPagar.length,
    anuladas: liquidaciones.filter((fila) => fila.estado === "ANULADA").length,
    enOtroArchivo: Math.max(0, dispersion.cantidad - liquidaciones.length),
    montoPagado: sumarNeto(pagadas),
    montoPorPagar: sumarNeto(porPagar),
  }
}

const ORDEN_ESTADO: Readonly<Record<EstadoLiquidacion, number>> = {
  APROBADA: 0,
  PAGADA: 1,
  BORRADOR: 2,
  ANULADA: 3,
}

const comparadorTexto = new Intl.Collator("es-CO", { sensitivity: "base" })

function comparador(
  campo: CampoOrdenLiquidacionesDispersion
): (a: LiquidacionDeDispersion, b: LiquidacionDeDispersion) => number {
  switch (campo) {
    case "medio":
      return (a, b) => comparadorTexto.compare(a.medio, b.medio)
    case "neto":
      return (a, b) => a.montoNeto - b.montoNeto
    case "estado":
      return (a, b) =>
        ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
        comparadorTexto.compare(a.medio, b.medio)
  }
}

export function paginaLiquidacionesDispersion(
  liquidaciones: readonly LiquidacionDeDispersion[],
  estado: Pick<
    EstadoTablaLiquidacionesDispersion,
    "q" | "estado" | "orden" | "pagina" | "tamano"
  >
): PaginaLiquidacionesDispersion {
  const busqueda = normalizarBusqueda(estado.q)
  const estados: readonly string[] = estado.estado
  const filtradas = liquidaciones.filter(
    (fila) =>
      (busqueda === "" || normalizarBusqueda(fila.medio).includes(busqueda)) &&
      (estados.length === 0 || estados.includes(fila.estado))
  )
  const comparar = comparador(estado.orden.campo)
  const signo = estado.orden.descendente ? -1 : 1
  const ordenadas = [...filtradas].sort(
    (a, b) => signo * comparar(a, b) || a.id.localeCompare(b.id)
  )
  return {
    filas: paginar(ordenadas, estado.pagina, estado.tamano).filas,
    total: filtradas.length,
  }
}
