/**
 * Cartera a una fecha de corte (módulo puro, LIQ-008 y ADM-004): filas de
 * `reporte_cartera` con los tramos de edad de la operación
 * (`TRAMOS_CARTERA`), sus totales y las facturas vencidas con el saldo que
 * tenían ese día. Misma regla que `reporte_cartera`: total menos las notas
 * crédito y los pagos (con las retenciones del anunciante) hasta el corte.
 */
import {
  TRAMOS_CARTERA,
  type TramoCartera,
} from "@/features/operacion/calculos"

import { diasEntre, enCentavos } from "./presentacion"
import type { FacturaVencida, FilaCartera } from "./tipos"

/** Una fila de `reporte_cartera` tal como llega de la RPC. */
export interface FilaReporteCartera {
  anunciante_id: string
  anunciante: string | null
  facturado: number | string | null
  pagado: number | string | null
  saldo: number | string | null
  saldo_0_30: number | string | null
  saldo_31_60: number | string | null
  saldo_61_90: number | string | null
  saldo_90_mas: number | string | null
  facturas_vencidas: number | string | null
}

function numero(valor: number | string | null | undefined): number {
  const n = typeof valor === "string" ? Number(valor) : (valor ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function filaCartera(fila: FilaReporteCartera): FilaCartera {
  return {
    anuncianteId: fila.anunciante_id,
    anunciante: fila.anunciante ?? "Anunciante sin nombre",
    facturado: numero(fila.facturado),
    pagado: numero(fila.pagado),
    saldo: numero(fila.saldo),
    porTramo: {
      "0_30": numero(fila.saldo_0_30),
      "31_60": numero(fila.saldo_31_60),
      "61_90": numero(fila.saldo_61_90),
      "90_mas": numero(fila.saldo_90_mas),
    },
    facturasVencidas: numero(fila.facturas_vencidas),
  }
}

export interface TotalesCartera {
  anunciantes: number
  facturado: number
  pagado: number
  saldo: number
  porTramo: Readonly<Record<TramoCartera, number>>
  /** Saldo de más de 30 días desde el vencimiento. */
  masDe30: number
  facturasVencidas: number
}

function sumar(valores: readonly number[]): number {
  return valores.reduce((suma, valor) => suma + enCentavos(valor), 0) / 100
}

export function totalesCartera(filas: readonly FilaCartera[]): TotalesCartera {
  const porTramo = Object.fromEntries(
    TRAMOS_CARTERA.map((tramo) => [
      tramo,
      sumar(filas.map((fila) => fila.porTramo[tramo])),
    ])
  ) as Record<TramoCartera, number>
  return {
    anunciantes: filas.length,
    facturado: sumar(filas.map((fila) => fila.facturado)),
    pagado: sumar(filas.map((fila) => fila.pagado)),
    saldo: sumar(filas.map((fila) => fila.saldo)),
    porTramo,
    masDe30: sumar([porTramo["31_60"], porTramo["61_90"], porTramo["90_mas"]]),
    facturasVencidas: filas.reduce(
      (suma, fila) => suma + fila.facturasVencidas,
      0
    ),
  }
}

/** Proporción de cada tramo sobre el saldo (0–1), para la barra de antigüedad. */
export function proporcionesTramos(
  totales: Pick<TotalesCartera, "saldo" | "porTramo">
): Record<TramoCartera, number> {
  return Object.fromEntries(
    TRAMOS_CARTERA.map((tramo) => [
      tramo,
      totales.saldo > 0 ? totales.porTramo[tramo] / totales.saldo : 0,
    ])
  ) as Record<TramoCartera, number>
}

/** Factura expedida con sus pagos y notas crédito, para calcular su saldo a una fecha. */
export interface FacturaAlCorte {
  id: string
  numero: string | null
  anuncianteId: string
  anunciante: string | null
  total: number
  fechaEmision: string
  fechaVencimiento: string | null
  pagos: readonly { fecha: string; monto: number; retenciones: number }[]
  notas: readonly { fecha: string; valor: number }[]
}

/** Saldo que tenía la factura al final del día de corte (nunca negativo). */
export function saldoAlCorte(factura: FacturaAlCorte, corte: string): number {
  if (factura.fechaEmision > corte) return 0
  const notas = factura.notas
    .filter((nota) => nota.fecha <= corte)
    .reduce((suma, nota) => suma + enCentavos(nota.valor), 0)
  const pagos = factura.pagos
    .filter((pago) => pago.fecha <= corte)
    .reduce(
      (suma, pago) =>
        suma + enCentavos(pago.monto) + enCentavos(pago.retenciones),
      0
    )
  return Math.max(0, enCentavos(factura.total) - notas - pagos) / 100
}

/**
 * Las vencidas a la fecha de corte (saldo pendiente y vencimiento anterior al
 * corte), de la más atrasada a la menos; a igual mora, la de mayor saldo.
 */
export function vencidasAlCorte(
  facturas: readonly FacturaAlCorte[],
  corte: string
): FacturaVencida[] {
  return facturas
    .flatMap((factura): FacturaVencida[] => {
      const vence = factura.fechaVencimiento
      if (!vence || vence >= corte) return []
      const saldo = saldoAlCorte(factura, corte)
      if (saldo <= 0) return []
      return [
        {
          id: factura.id,
          numero: factura.numero,
          anuncianteId: factura.anuncianteId,
          anunciante: factura.anunciante,
          fechaVencimiento: vence,
          diasMora: diasEntre(vence, corte),
          saldo,
        },
      ]
    })
    .sort((a, b) => b.diasMora - a.diasMora || b.saldo - a.saldo)
}
