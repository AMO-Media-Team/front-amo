/**
 * Cálculos de las facturas del anunciante (módulo puro): el resumen «Por
 * pagar» / «Vencido» / «Próximo vencimiento», los conceptos agrupados por
 * campaña y el filtro de estados para PostgREST. Todo con el `hoy` de Bogotá
 * ('YYYY-MM-DD') que entrega el servidor.
 */
import {
  estadoVisible,
  plazoFactura,
  tieneSaldoPendiente,
} from "./presentacion"
import type {
  ConceptoFactura,
  EstadoFactura,
  FacturaConSaldo,
  GrupoConceptos,
  ProximoVencimiento,
  ResumenFacturas,
} from "./tipos"

/**
 * Lo que la empresa debe: saldo total, lo vencido y la factura que vence
 * primero (de las que aún no vencen). Una factura sin saldo no cuenta.
 */
export function resumenPorPagar(
  facturas: readonly FacturaConSaldo[],
  hoy: string
): ResumenFacturas {
  const conSaldo = facturas.filter(
    (factura) => factura.saldo > 0 && tieneSaldoPendiente(factura.estado)
  )
  const vencidas = conSaldo.filter(
    (factura) => estadoVisible(factura, hoy) === "VENCIDA"
  )
  const porVencer = conSaldo
    .filter((factura) => estadoVisible(factura, hoy) !== "VENCIDA")
    .flatMap((factura) => {
      const plazo = plazoFactura(factura, hoy)
      return plazo && factura.fechaVencimiento
        ? [{ ...factura, fechaVencimiento: factura.fechaVencimiento, plazo }]
        : []
    })
    .sort(
      (a, b) =>
        a.fechaVencimiento.localeCompare(b.fechaVencimiento) ||
        b.saldo - a.saldo ||
        a.numero.localeCompare(b.numero)
    )

  const [primera] = porVencer
  const proximo: ProximoVencimiento | null = primera
    ? {
        id: primera.id,
        numero: primera.numero,
        fechaVencimiento: primera.fechaVencimiento,
        saldo: primera.saldo,
        plazo: primera.plazo,
        otrasElMismoDia:
          porVencer.filter(
            (factura) => factura.fechaVencimiento === primera.fechaVencimiento
          ).length - 1,
      }
    : null

  return {
    porPagar: sumar(conSaldo),
    facturasPorPagar: conSaldo.length,
    vencido: sumar(vencidas),
    facturasVencidas: vencidas.length,
    proximo,
  }
}

function sumar(facturas: readonly { saldo: number }[]): number {
  // Centavos enteros: la suma de `numeric(14,2)` no arrastra errores de coma flotante.
  return (
    facturas.reduce(
      (total, factura) => total + Math.round(factura.saldo * 100),
      0
    ) / 100
  )
}

/**
 * Conceptos por campaña (una consolidada cubre varias): el grupo de mayor
 * valor primero y, dentro, por fecha de verificación. Cada grupo con su total.
 */
export function agruparConceptos(
  conceptos: readonly ConceptoFactura[]
): GrupoConceptos[] {
  const grupos = new Map<string, GrupoConceptos>()
  for (const concepto of conceptos) {
    const grupo = grupos.get(concepto.campanaId) ?? {
      campanaId: concepto.campanaId,
      campana: concepto.campana,
      total: 0,
      conceptos: [],
    }
    grupo.conceptos.push(concepto)
    grupo.total += Math.round(concepto.valor * 100)
    grupos.set(concepto.campanaId, grupo)
  }
  return [...grupos.values()]
    .map((grupo) => ({
      ...grupo,
      total: grupo.total / 100,
      conceptos: [...grupo.conceptos].sort(
        (a, b) =>
          (a.verificadaAt ?? "").localeCompare(b.verificadaAt ?? "") ||
          a.id.localeCompare(b.id)
      ),
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        (a.campana ?? "").localeCompare(b.campana ?? "", "es-CO")
    )
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Condición de PostgREST (`.or(...)`) para filtrar por el estado que VE la
 * empresa (`estadoVisible`): «Vencida» incluye las que vencieron y la tarea
 * programada aún no marcó, y «Por pagar» / «Pago parcial» las excluyen.
 * `null` sin estados (no filtra). Los valores vienen de una lista cerrada y
 * `hoy` se valida: nada de la URL llega crudo al filtro.
 */
export function condicionEstados(
  estados: readonly EstadoFactura[],
  hoy: string
): string | null {
  if (!DIA_ISO.test(hoy)) throw new Error("`hoy` debe ser YYYY-MM-DD.")
  const sinVencer = `or(fecha_vencimiento.is.null,fecha_vencimiento.gte.${hoy})`
  const partes = [...new Set(estados)].flatMap((estado): string[] => {
    switch (estado) {
      case "EMITIDA":
      case "PAGADA_PARCIAL":
        return [`and(estado.eq.${estado},${sinVencer})`]
      case "VENCIDA":
        return [
          "estado.eq.VENCIDA",
          `and(estado.in.(EMITIDA,PAGADA_PARCIAL),fecha_vencimiento.lt.${hoy})`,
        ]
      case "PAGADA":
      case "ANULADA":
        return [`estado.eq.${estado}`]
      case "BORRADOR":
        return []
    }
  })
  return partes.length > 0 ? partes.join(",") : null
}
