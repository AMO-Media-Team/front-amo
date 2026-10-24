/**
 * Archivo de pagos para el banco (LIQ-005), módulo puro: un CSV genérico con
 * una fila por liquidación. Lo arma SOLO el servidor con los datos ya
 * descifrados (`descifrado.ts`) y nunca viaja al navegador salvo como el
 * archivo que se descarga por URL firmada.
 *
 * Columnas: tipo y número de documento, titular, método, banco o billetera,
 * tipo y número de cuenta, valor en pesos sin decimales, referencia
 * `LIQ-{AAAAMMDD}-{12 últimos hex del id}` (la fecha es la del archivo, en
 * Bogotá: la misma liquidación incluida otra vez lleva otra fecha) y medio.
 * Los valores van en códigos estables (CC, BANCARIO, AHORROS) para que el
 * portal del banco o una plantilla los mapee sin ambigüedad.
 */
import {
  aCsv,
  type ColumnaExportable,
  type ValorExportable,
} from "@/components/data-table/exportar"
import type {
  CuentaPago,
  TipoDocumentoIdentidad,
} from "@/features/mi-medio/datos-pago"

/** Lo que el servidor sabe de cada pago tras descifrar (solo en memoria). */
export interface PagoDescifrado {
  liquidacionId: string
  medio: string
  tipoDocumento: TipoDocumentoIdentidad
  /** Normalizado (solo dígitos y letras). */
  numeroDocumento: string
  titular: string
  cuenta: CuentaPago
  montoNeto: number
}

export const COLUMNAS_ARCHIVO_PAGOS: readonly ColumnaExportable[] = [
  { titulo: "Tipo de documento" },
  { titulo: "Número de documento" },
  { titulo: "Titular" },
  { titulo: "Método" },
  { titulo: "Banco o billetera" },
  { titulo: "Tipo de cuenta" },
  { titulo: "Número de cuenta" },
  { titulo: "Valor", formato: "numero" },
  { titulo: "Referencia" },
  { titulo: "Medio" },
]

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** `2026-10-23` → `20261023`; lanza si la fecha no tiene ese formato. */
function compactarFecha(fecha: string): string {
  const partes = FECHA.exec(fecha)
  if (!partes) throw new Error("La fecha del archivo no es AAAA-MM-DD.")
  return `${partes[1]}${partes[2]}${partes[3]}`
}

const UUID =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

/**
 * Parte aleatoria de un uuid v7 (sus 12 últimos hex, `rand_b`): los primeros
 * son el instante en ms y se repiten en todas las liquidaciones de un mismo
 * corte, así que no distinguen una de otra.
 */
export function sufijoLiquidacion(liquidacionId: string): string {
  if (!UUID.test(liquidacionId))
    throw new Error("Identificador de liquidación inválido.")
  return liquidacionId.replaceAll("-", "").slice(-12).toLowerCase()
}

/** `LIQ-20261023-611fb53e04e4`: identifica la liquidación en el extracto del banco. */
export function referenciaPago(liquidacionId: string, fecha: string): string {
  return `LIQ-${compactarFecha(fecha)}-${sufijoLiquidacion(liquidacionId)}`
}

/** Pesos sin decimales (los bancos no dispersan centavos). */
export function valorEnPesos(monto: number): number {
  if (!Number.isFinite(monto) || monto < 0) {
    throw new Error("El valor del pago no es válido.")
  }
  return Math.round(monto)
}

function filaArchivo(pago: PagoDescifrado, fecha: string): ValorExportable[] {
  const { cuenta } = pago
  return [
    pago.tipoDocumento,
    pago.numeroDocumento,
    pago.titular,
    cuenta.metodo,
    cuenta.metodo === "BANCARIO" ? cuenta.banco : cuenta.proveedor,
    cuenta.metodo === "BANCARIO" ? cuenta.tipoCuenta : "",
    cuenta.numero,
    valorEnPesos(pago.montoNeto),
    referenciaPago(pago.liquidacionId, fecha),
    pago.medio,
  ]
}

/** CSV del banco (BOM, `;` y CRLF, como las exportaciones de la app). */
export function construirArchivoPagos(
  pagos: readonly PagoDescifrado[],
  fecha: string
): string {
  return aCsv({
    titulo: "Archivo de pagos",
    columnas: COLUMNAS_ARCHIVO_PAGOS,
    filas: pagos.map((pago) => filaArchivo(pago, fecha)),
  })
}

/** Nombre con que se descarga: `archivo-pagos-2026-10-23.csv`. */
export function nombreArchivoPagos(fecha: string): string {
  compactarFecha(fecha)
  return `archivo-pagos-${fecha}.csv`
}
