/**
 * Las dos salidas del documento soporte a partir de su modelo (módulo puro):
 *
 * - los datos del PDF (`construirDocumentoSoportePdf` de `@/lib/export/documento-soporte-pdf`), con los
 *   nombres y documentos de identidad ya en texto;
 * - el archivo genérico para el proveedor tecnológico (`formato: "AMO-DS-1"`, JSON): documento,
 *   resolución, vendedor, adquiriente, ítems, retenciones y totales, con los valores sin formato. Es el
 *   contrato mientras no haya integración con el proveedor: cada campo tiene nombre estable y las fechas
 *   van en `AAAA-MM-DD` (día de Bogotá).
 */
import {
  NOMBRES_CONCEPTO,
  NOMBRES_RETENCION,
} from "@/features/configuracion/presentacion"
import {
  SIGLAS_DOCUMENTO,
  type TipoDocumentoIdentidad,
} from "@/features/mi-medio/datos-pago"
import { PLATAFORMAS } from "@/features/operacion/estados"
import { formatearNit } from "@/features/operacion/formato"
import type { DatosDocumentoSoportePdf } from "@/lib/export/documento-soporte-pdf"
import { serializarFecha } from "@/lib/fechas"
import { formatearNumero } from "@/lib/format"

import type {
  ModeloDocumentoSoporte,
  RetencionModelo,
  TipoRetencion,
} from "./datos"

// ── Textos ───────────────────────────────────────────────────────────────────

/** 0,06 → «6 %»; la ReteICA se expresa por mil, como en los acuerdos municipales: 0,00966 → «9,66 por mil». */
export function formatearTarifa(tipo: TipoRetencion, tarifa: number): string {
  return tipo === "RETEICA"
    ? `${formatearNumero(tarifa * 1000, 3)} por mil`
    : `${formatearNumero(tarifa * 100, 2)} %`
}

function nombreConcepto(concepto: string): string {
  return (
    NOMBRES_CONCEPTO[concepto] ??
    concepto.charAt(0) + concepto.slice(1).toLowerCase()
  )
}

/** «Retención en la fuente · Servicios», «ReteICA · Santa Marta, Magdalena». */
export function nombreRetencion(retencion: RetencionModelo): string {
  const base = NOMBRES_RETENCION[retencion.tipo]
  const detalle =
    retencion.tipo === "RETEICA"
      ? retencion.municipio.nombre
      : retencion.concepto
        ? nombreConcepto(retencion.concepto)
        : null
  return detalle ? `${base} · ${detalle}` : base
}

function agruparMiles(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

/** «CC 1.023.456.789»; un pasaporte o un número con letras va tal cual. */
export function documentoIdentidad(
  tipo: TipoDocumentoIdentidad | null,
  numero: string | null
): string | null {
  if (!numero) return null
  const cifras =
    tipo !== "PASAPORTE" && /^\d+$/.test(numero) ? agruparMiles(numero) : numero
  return tipo ? `${SIGLAS_DOCUMENTO[tipo]} ${cifras}` : cifras
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export function datosPdfDocumentoSoporte(
  modelo: ModeloDocumentoSoporte,
  generadoAt: Date
): DatosDocumentoSoportePdf {
  const { documento, liquidacion, vendedor, adquiriente } = modelo
  const nit = formatearNit(adquiriente.nit, adquiriente.dv)
  return {
    numero: documento.numero,
    fechaEmision: documento.fechaEmision,
    periodo: { inicio: liquidacion.periodoInicio, fin: liquidacion.periodoFin },
    resolucion: modelo.resolucion,
    vendedor: {
      nombre: vendedor.titular,
      documento: documentoIdentidad(
        vendedor.tipoDocumento,
        vendedor.numeroDocumento
      ),
      direccion: vendedor.direccion,
      municipio: vendedor.municipio.nombre,
    },
    adquiriente: {
      nombre: adquiriente.razonSocial,
      documento: nit,
      direccion: adquiriente.direccion,
      municipio: adquiriente.municipio.nombre,
    },
    lineas: modelo.lineas.map((linea) => ({
      publicacion: linea.oferta,
      marca: linea.marca ?? "—",
      plataformaFormato: `${PLATAFORMAS[linea.plataforma]} · ${linea.formato}`,
      fecha: linea.publicadaAt,
      valor: linea.valor,
    })),
    valorTotal: documento.valorTotal,
    retenciones: modelo.retenciones.map((retencion) => ({
      nombre: nombreRetencion(retencion),
      tarifa: formatearTarifa(retencion.tipo, retencion.tarifa),
      base: retencion.base,
      valor: retencion.valor,
    })),
    totalRetenciones: liquidacion.montoRetenciones,
    netoAPagar: liquidacion.montoNeto,
    cuds: documento.cuds,
    generadoAt,
  }
}

// ── Archivo para el proveedor tecnológico ────────────────────────────────────

export const FORMATO_ARCHIVO_PROVEEDOR = "AMO-DS-1"
export const MIME_ARCHIVO_PROVEEDOR = "application/json"

export interface UbicacionArchivo {
  municipio_codigo: string | null
  municipio: string | null
  pais: "CO"
}

export interface ArchivoProveedorDs {
  formato: typeof FORMATO_ARCHIVO_PROVEEDOR
  generado_at: string
  documento: {
    tipo: "DOCUMENTO_SOPORTE"
    id: string
    prefijo: string
    consecutivo: number
    numero: string
    fecha_emision: string
    moneda: "COP"
    cuds: string | null
  }
  resolucion: {
    numero: string
    fecha: string
    prefijo: string
    rango_desde: number
    rango_hasta: number
    vigente_desde: string
    vigente_hasta: string | null
  } | null
  vendedor: {
    nombre: string | null
    tipo_documento: TipoDocumentoIdentidad | null
    numero_documento: string | null
    direccion: string | null
  } & UbicacionArchivo
  adquiriente: {
    razon_social: string | null
    nit: string | null
    dv: string | null
    direccion: string | null
  } & UbicacionArchivo
  periodo: { inicio: string; fin: string }
  items: {
    linea: number
    asignacion_id: string
    descripcion: string
    marca: string | null
    plataforma: string
    formato: string
    fecha: string | null
    cantidad: 1
    valor_unitario: number
    valor_total: number
  }[]
  retenciones: {
    tipo: TipoRetencion
    concepto: string | null
    tarifa: number
    base: number
    valor: number
    municipio_codigo: string | null
  }[]
  totales: {
    valor_bruto: number
    total_retenciones: number
    neto_a_pagar: number
  }
}

function diaBogota(instante: string | null): string | null {
  if (!instante) return null
  const fecha = new Date(instante)
  return Number.isNaN(fecha.getTime()) ? null : serializarFecha(fecha)
}

export function archivoProveedorDocumentoSoporte(
  modelo: ModeloDocumentoSoporte,
  generadoAt: Date
): ArchivoProveedorDs {
  const { documento, resolucion, liquidacion, vendedor, adquiriente } = modelo
  return {
    formato: FORMATO_ARCHIVO_PROVEEDOR,
    generado_at: generadoAt.toISOString(),
    documento: {
      tipo: "DOCUMENTO_SOPORTE",
      id: documento.id,
      prefijo: documento.prefijo,
      consecutivo: documento.consecutivo,
      numero: documento.numero,
      fecha_emision: documento.fechaEmision,
      moneda: "COP",
      cuds: documento.cuds,
    },
    resolucion: resolucion
      ? {
          numero: resolucion.numero,
          fecha: resolucion.fecha,
          prefijo: resolucion.prefijo,
          rango_desde: resolucion.rangoDesde,
          rango_hasta: resolucion.rangoHasta,
          vigente_desde: resolucion.vigenteDesde,
          vigente_hasta: resolucion.vigenteHasta,
        }
      : null,
    vendedor: {
      nombre: vendedor.titular,
      tipo_documento: vendedor.tipoDocumento,
      numero_documento: vendedor.numeroDocumento,
      direccion: vendedor.direccion,
      municipio_codigo: vendedor.municipio.codigo,
      municipio: vendedor.municipio.nombre,
      pais: "CO",
    },
    adquiriente: {
      razon_social: adquiriente.razonSocial,
      nit: adquiriente.nit,
      dv: adquiriente.dv,
      direccion: adquiriente.direccion,
      municipio_codigo: adquiriente.municipio.codigo,
      municipio: adquiriente.municipio.nombre,
      pais: "CO",
    },
    periodo: { inicio: liquidacion.periodoInicio, fin: liquidacion.periodoFin },
    items: modelo.lineas.map((linea, indice) => ({
      linea: indice + 1,
      asignacion_id: linea.asignacionId,
      descripcion: linea.oferta,
      marca: linea.marca,
      plataforma: PLATAFORMAS[linea.plataforma],
      formato: linea.formato,
      fecha: diaBogota(linea.publicadaAt),
      cantidad: 1,
      valor_unitario: linea.valor,
      valor_total: linea.valor,
    })),
    retenciones: modelo.retenciones.map((retencion) => ({
      tipo: retencion.tipo,
      concepto: retencion.concepto,
      tarifa: retencion.tarifa,
      base: retencion.base,
      valor: retencion.valor,
      municipio_codigo: retencion.municipio.codigo,
    })),
    totales: {
      valor_bruto: documento.valorTotal,
      total_retenciones: liquidacion.montoRetenciones,
      neto_a_pagar: liquidacion.montoNeto,
    },
  }
}

/** JSON legible (dos espacios) con salto de línea final. */
export function serializarArchivoProveedor(
  archivo: ArchivoProveedorDs
): string {
  return `${JSON.stringify(archivo, null, 2)}\n`
}
