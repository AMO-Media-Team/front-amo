/**
 * Textos de «Ganancias» en voz del medio (módulo puro): el estado de cada
 * liquidación como lo vive quien cobra, la regla de pago, la fecha estimada,
 * el documento que respalda el pago (documento soporte o su factura), las
 * retenciones y los nombres de los archivos que descarga.
 */
import type { Route } from "next"

import {
  NOMBRES_CONCEPTO,
  NOMBRES_RETENCION,
} from "@/features/configuracion/presentacion"
import type { PresentacionEstado } from "@/features/operacion/estados"
import {
  formatearFechaCompacta,
  formatearRangoCompacto,
  instanteDeDia,
} from "@/features/operacion/formato"
import { formatearNumero } from "@/lib/format"

import { rutaLiquidacionMedio } from "./rutas"
import type {
  ArchivoLiquidacion,
  CondicionTributaria,
  EstadoLiquidacion,
  LiquidacionMedio,
  RetencionAgrupada,
} from "./tipos"

// ── Fechas de calendario ─────────────────────────────────────────────────────

/** "10 oct 2026" de una columna `date` (sin correrla al día anterior por UTC). */
export function fechaDia(dia: string | null): string {
  return dia ? formatearFechaCompacta(instanteDeDia(dia)) : "—"
}

/** Periodo de la liquidación: "1 – 15 oct 2026" o "16 sept – 15 oct 2026". */
export function textoPeriodo(inicio: string, fin: string): string {
  return formatearRangoCompacto(instanteDeDia(inicio), instanteDeDia(fin))
}

// ── Estado de una liquidación ────────────────────────────────────────────────

/** Estados que aún esperan el pago (y admiten la factura del medio). */
const ESTADOS_POR_PAGAR: readonly EstadoLiquidacion[] = ["BORRADOR", "APROBADA"]

export function porPagar(estado: EstadoLiquidacion): boolean {
  return ESTADOS_POR_PAGAR.includes(estado)
}

type EntradaEstado = Pick<
  LiquidacionMedio,
  "estado" | "enviadaBancoAt" | "fechaPago"
>

/**
 * El estado en voz del medio: «En revisión» (falta aprobarla), «Aprobada · por
 * pagar», «En proceso de pago» (ya va en un archivo de pagos al banco) y
 * «Pagada el 10 oct 2026».
 */
export function estadoParaMedio(
  liquidacion: EntradaEstado
): PresentacionEstado {
  switch (liquidacion.estado) {
    case "BORRADOR":
      return {
        etiqueta: "En revisión",
        tono: "aviso",
        descripcion:
          "El equipo AMO está revisando esta liquidación antes de aprobarla.",
      }
    case "APROBADA":
      return liquidacion.enviadaBancoAt
        ? {
            etiqueta: "En proceso de pago",
            tono: "info",
            descripcion: `Enviamos la orden de pago al banco el ${formatearFechaCompacta(liquidacion.enviadaBancoAt)}.`,
          }
        : {
            etiqueta: "Aprobada · por pagar",
            tono: "info",
            descripcion: "La aprobamos y está lista para pagarse.",
          }
    case "PAGADA":
      return {
        etiqueta: liquidacion.fechaPago
          ? `Pagada el ${fechaDia(liquidacion.fechaPago)}`
          : "Pagada",
        tono: "exito",
        descripcion: "Ya te pagamos: puedes descargar el soporte del pago.",
      }
    case "ANULADA":
      return {
        etiqueta: "Anulada",
        tono: "neutro",
        descripcion:
          "Se anuló: sus publicaciones vuelven a la próxima liquidación.",
      }
  }
}

export interface FechaEstimada {
  /** "Pago previsto hasta el 23 oct 2026". */
  texto: string
  /** Ya pasó la fecha prevista y no se ha pagado. */
  atrasada: boolean
}

/**
 * Hasta cuándo se espera el pago (cierre del periodo + días de pago), solo
 * mientras no se ha pagado. `hoy` es el día de Bogotá ('YYYY-MM-DD').
 */
export function fechaEstimada(
  liquidacion: Pick<LiquidacionMedio, "estado" | "fechaPagoEstimada">,
  hoy: string
): FechaEstimada | null {
  const fecha = liquidacion.fechaPagoEstimada
  if (!fecha || !porPagar(liquidacion.estado)) return null
  const atrasada = fecha < hoy
  return {
    texto: atrasada
      ? `Pago previsto hasta el ${fechaDia(fecha)}: va con retraso`
      : `Pago previsto hasta el ${fechaDia(fecha)}`,
    atrasada,
  }
}

// ── Regla de pago ────────────────────────────────────────────────────────────

const CADA: Readonly<Record<string, string>> = {
  SEMANAL: "cada semana",
  QUINCENAL: "cada quincena",
  MENSUAL: "cada mes",
}

/** «Liquidamos cada quincena y pagamos en hasta 8 días.» */
export function textoRegla(
  periodicidad: string | null,
  diasPago: number | null
): string {
  const cada =
    (periodicidad && CADA[periodicidad]) ?? "al cierre de cada periodo"
  if (diasPago === null || !(diasPago > 0)) return `Liquidamos ${cada}.`
  const dias = diasPago === 1 ? "1 día" : `${formatearNumero(diasPago)} días`
  return `Liquidamos ${cada} y pagamos en hasta ${dias}.`
}

// ── Documento que respalda el pago ───────────────────────────────────────────

/** El medio que factura carga su factura mientras la liquidación no se paga (D83). */
export function puedeCargarFactura(
  liquidacion: Pick<LiquidacionMedio, "requiereDocumentoSoporte" | "estado">
): boolean {
  return !liquidacion.requiereDocumentoSoporte && porPagar(liquidacion.estado)
}

export type DocumentoParaMedio =
  | {
      tipo: "documento"
      numero: string
      fecha: string | null
      cuds: string | null
      descargable: boolean
    }
  | { tipo: "documento-en-preparacion" }
  | { tipo: "factura"; numero: string; descargable: boolean }
  | { tipo: "factura-pendiente" }
  | { tipo: "factura-sin-registrar" }

/**
 * Qué respalda el pago: el documento soporte que emite AMO (si el medio no
 * factura) o la factura del medio. Mientras falte la factura y aún se pueda
 * cargar: «Carga tu factura».
 */
export function documentoParaMedio(
  liquidacion: Pick<
    LiquidacionMedio,
    "requiereDocumentoSoporte" | "estado" | "documento" | "factura"
  >
): DocumentoParaMedio {
  if (liquidacion.requiereDocumentoSoporte) {
    const documento = liquidacion.documento
    return documento?.estado === "EMITIDO" && documento.numero
      ? {
          tipo: "documento",
          numero: documento.numero,
          fecha: documento.fecha,
          cuds: documento.cuds,
          descargable: documento.conArchivo,
        }
      : { tipo: "documento-en-preparacion" }
  }
  if (liquidacion.factura.numero) {
    return {
      tipo: "factura",
      numero: liquidacion.factura.numero,
      descargable: liquidacion.factura.conArchivo,
    }
  }
  return puedeCargarFactura(liquidacion)
    ? { tipo: "factura-pendiente" }
    : { tipo: "factura-sin-registrar" }
}

export const PENDIENTE_DIAN = "Pendiente de transmisión a la DIAN"

/** El CUDS o, mientras no se transmite, «Pendiente de transmisión a la DIAN». */
export function textoCuds(cuds: string | null): string {
  return cuds?.trim() || PENDIENTE_DIAN
}

/** Ancla de la sección «Tu factura» en el detalle. */
export const ID_SECCION_FACTURA = "factura"

/** «Carga tu factura» lleva directo al formulario del detalle. */
export function rutaCargarFactura(liquidacionId: string): Route {
  return `${rutaLiquidacionMedio(liquidacionId)}#${ID_SECCION_FACTURA}` as Route
}

// ── Retenciones ──────────────────────────────────────────────────────────────

export function nombreRetencion(tipo: string): string {
  return (NOMBRES_RETENCION as Readonly<Record<string, string>>)[tipo] ?? tipo
}

/** ReteICA se expresa por mil (9,66 ‰); las demás, en porcentaje (4 %). */
export function formatearTarifa(tipo: string, tarifa: number): string {
  return tipo === "RETEICA"
    ? `${formatearNumero(tarifa * 1000, 2)} ‰`
    : `${formatearNumero(tarifa * 100, 2)} %`
}

/** "Servicios · 4 %" o "Medellín · 9,66 ‰": concepto o municipio, y tarifa. */
export function detalleRetencion(
  retencion: Pick<
    RetencionAgrupada,
    "tipo" | "concepto" | "tarifa" | "municipio" | "municipioCodigo"
  >
): string {
  const concepto = retencion.concepto
    ? (NOMBRES_CONCEPTO[retencion.concepto] ?? retencion.concepto)
    : null
  const lugar =
    retencion.tipo === "RETEICA"
      ? (retencion.municipio ?? retencion.municipioCodigo)
      : concepto
  return [lugar, formatearTarifa(retencion.tipo, retencion.tarifa)]
    .filter(Boolean)
    .join(" · ")
}

// ── Archivos ─────────────────────────────────────────────────────────────────

export const ETIQUETAS_ARCHIVO: Readonly<Record<ArchivoLiquidacion, string>> = {
  soporte_pago: "Soporte de pago",
  documento_soporte: "Documento soporte",
  factura: "Tu factura",
}

function extension(ruta: string): string {
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1)
  const punto = nombre.lastIndexOf(".")
  const ext = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : ""
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "pdf"
}

/**
 * Nombre con que se guarda el archivo: "Soporte de pago 2026-10-01 a
 * 2026-10-15.pdf", "Documento soporte DS-12.pdf", "Factura FE-1234.pdf".
 */
export function nombreArchivoLiquidacion(
  archivo: ArchivoLiquidacion,
  liquidacion: Pick<
    LiquidacionMedio,
    "periodoInicio" | "periodoFin" | "documento" | "factura"
  >,
  ruta: string
): string {
  const periodo = `${liquidacion.periodoInicio} a ${liquidacion.periodoFin}`
  const nombre =
    archivo === "soporte_pago"
      ? `Soporte de pago ${periodo}`
      : archivo === "documento_soporte"
        ? `Documento soporte ${liquidacion.documento?.numero ?? periodo}`
        : `Factura ${liquidacion.factura.numero ?? periodo}`
  return `${nombre}.${extension(ruta)}`
}

/** Lo que el medio puede descargar de esta liquidación, en orden. */
export function archivosDescargables(
  liquidacion: Pick<
    LiquidacionMedio,
    | "estado"
    | "conSoportePago"
    | "requiereDocumentoSoporte"
    | "documento"
    | "factura"
  >
): ArchivoLiquidacion[] {
  const archivos: ArchivoLiquidacion[] = []
  if (liquidacion.estado === "PAGADA" && liquidacion.conSoportePago) {
    archivos.push("soporte_pago")
  }
  const documento = documentoParaMedio(liquidacion)
  if (documento.tipo === "documento" && documento.descargable) {
    archivos.push("documento_soporte")
  }
  if (documento.tipo === "factura" && documento.descargable) {
    archivos.push("factura")
  }
  return archivos
}

// ── Condición tributaria ─────────────────────────────────────────────────────

export interface LineaCondicion {
  clave: keyof CondicionTributaria
  titulo: string
  detalle: string
  activa: boolean
}

/** Lo que decide sus retenciones y si factura, en su voz. */
export function lineasCondicion(
  condicion: CondicionTributaria
): LineaCondicion[] {
  return [
    {
      clave: "esDeclarante",
      titulo: condicion.esDeclarante ? "Declaras renta" : "No declaras renta",
      detalle:
        "Define la tarifa de retención en la fuente que se descuenta de tus pagos.",
      activa: condicion.esDeclarante,
    },
    {
      clave: "obligadoFacturar",
      titulo: condicion.obligadoFacturar
        ? "Facturas tus servicios"
        : "No estás obligado a facturar",
      detalle: condicion.obligadoFacturar
        ? "Carga tu factura en cada liquidación para que podamos pagarte."
        : "AMO emite un documento soporte por cada pago; no tienes que facturar.",
      activa: condicion.obligadoFacturar,
    },
    {
      clave: "responsableIva",
      titulo: condicion.responsableIva
        ? "Eres responsable de IVA"
        : "No eres responsable de IVA",
      detalle: condicion.responsableIva
        ? "Cobras IVA por tus servicios."
        : "No cobras IVA por tus servicios.",
      activa: condicion.responsableIva,
    },
  ]
}

/** "1 publicación" o "3 publicaciones". */
export function contarPublicaciones(cantidad: number): string {
  return cantidad === 1
    ? "1 publicación"
    : `${formatearNumero(cantidad)} publicaciones`
}
