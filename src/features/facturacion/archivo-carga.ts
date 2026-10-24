/**
 * Archivo de carga de un borrador de factura (módulo puro, LIQ-008): lo que el
 * software de facturación de AMO necesita para expedir la factura electrónica
 * —adquirente, ítems y totales— en JSON (`formato: "AMO-FV-1"`) y en CSV
 * genérico, hasta tener el formato propio del proveedor. La dirección del
 * adquirente llega revelada por la acción (queda en la bitácora) y solo vive
 * dentro del archivo.
 */
import { aCsv } from "@/components/data-table/exportar"
import { PLATAFORMAS } from "@/features/operacion/estados"

import { alcanceFactura, diaDeInstante, enCentavos } from "./presentacion"
import type { EsquemaFacturacion, LineaFactura } from "./tipos"

export const FORMATO_ARCHIVO_CARGA = "AMO-FV-1"

export interface AdquirenteCarga {
  razonSocial: string
  nombreComercial: string
  nit: string | null
  digitoVerificacion: string | null
  identificacionExtranjera: string | null
  paisIso2: string
  municipioCodigo: string | null
  municipio: string | null
  departamento: string | null
  /** `null` si quien lo genera no puede ver datos sensibles. */
  direccion: string | null
  correoFacturacion: string | null
  regimen: string | null
  datosFacturacion: Record<string, unknown>
}

export interface FacturaCarga {
  id: string
  esquema: EsquemaFacturacion
  /** Fracción (0,19). */
  porcentajeIva: number | null
  periodoDesde: string | null
  periodoHasta: string | null
  campana: string | null
  subtotal: number
  iva: number
  valorTerceros: number
  total: number
}

export interface DatosArchivoCarga {
  factura: FacturaCarga
  adquirente: AdquirenteCarga
  lineas: readonly LineaFactura[]
  /** Instante ISO en que se generó. */
  generadoAt: string
}

export interface ItemCarga {
  numero: number
  asignacionId: string
  descripcion: string
  campana: string | null
  medio: string | null
  plataforma: string
  fechaVerificacion: string | null
  /** Lo que grava el IVA: el bruto (compra y reventa) o la comisión (mandato). */
  baseIva: number
  iva: number
  /** Valor del medio en mandato (no grava IVA); 0 en compra y reventa. */
  ingresoTerceros: number
  valor: number
}

/**
 * Reparte `total` (en pesos con centavos) en proporción a `pesos`, de modo
 * que las partes sumen exactamente el total: cada parte se redondea hacia
 * abajo en centavos y los centavos que sobran van a las de mayor residuo.
 */
export function repartirEnCentavos(
  pesos: readonly number[],
  total: number
): number[] {
  const objetivo = enCentavos(total)
  const base = pesos.map((peso) => Math.max(0, enCentavos(peso)))
  const suma = base.reduce((acumulado, valor) => acumulado + valor, 0)
  if (pesos.length === 0) return []
  if (suma === 0) {
    return pesos.map((_, indice) => (indice === 0 ? objetivo / 100 : 0))
  }
  const exactas = base.map((valor) => (valor * objetivo) / suma)
  const partes = exactas.map(Math.floor)
  let sobrante = objetivo - partes.reduce((a, b) => a + b, 0)
  const porResiduo = exactas
    .map((exacta, indice) => ({ indice, residuo: exacta - Math.floor(exacta) }))
    .sort((a, b) => b.residuo - a.residuo || a.indice - b.indice)
  for (const { indice } of porResiduo) {
    if (sobrante <= 0) break
    partes[indice] += 1
    sobrante -= 1
  }
  return partes.map((centavos) => centavos / 100)
}

function nombrePlataforma(plataforma: string): string {
  return (
    (PLATAFORMAS as Readonly<Record<string, string>>)[plataforma] ?? plataforma
  )
}

function descripcionItem(linea: LineaFactura, esquema: EsquemaFacturacion) {
  const donde = [linea.medio, nombrePlataforma(linea.plataforma)]
    .filter(Boolean)
    .join(" · ")
  const que =
    esquema === "MANDATO" ? "Intermediación de pauta digital" : "Pauta digital"
  return [que, donde, linea.oferta].filter(Boolean).join(" — ")
}

/**
 * Ítems de la factura, uno por asignación, con el IVA repartido para que la
 * suma coincida con el del borrador. `cuadra` dice si las bases y el ingreso
 * para terceros suman lo del borrador (si no, conviene generarlo de nuevo).
 */
export function itemsDeCarga(datos: DatosArchivoCarga): {
  items: ItemCarga[]
  cuadra: boolean
} {
  const { factura, lineas } = datos
  const mandato = factura.esquema === "MANDATO"
  const bases = lineas.map((linea) =>
    mandato ? (linea.montoComision ?? 0) : linea.montoBruto
  )
  const terceros = lineas.map((linea) =>
    mandato ? (linea.montoMedio ?? 0) : 0
  )
  const ivas = repartirEnCentavos(bases, factura.iva)
  const items = lineas.map((linea, indice) => ({
    numero: indice + 1,
    asignacionId: linea.asignacionId,
    descripcion: descripcionItem(linea, factura.esquema),
    campana: linea.campana,
    medio: linea.medio,
    plataforma: nombrePlataforma(linea.plataforma),
    fechaVerificacion: linea.verificadaAt
      ? diaDeInstante(linea.verificadaAt)
      : null,
    baseIva: bases[indice],
    iva: ivas[indice] ?? 0,
    ingresoTerceros: terceros[indice],
    valor:
      (enCentavos(bases[indice]) +
        enCentavos(ivas[indice] ?? 0) +
        enCentavos(terceros[indice])) /
      100,
  }))
  const sumar = (valores: readonly number[]) =>
    valores.reduce((suma, valor) => suma + enCentavos(valor), 0)
  const cuadra =
    lineas.length > 0 &&
    sumar(bases) === enCentavos(factura.subtotal) &&
    sumar(terceros) === enCentavos(factura.valorTerceros) &&
    enCentavos(factura.subtotal) +
      enCentavos(factura.iva) +
      enCentavos(factura.valorTerceros) ===
      enCentavos(factura.total)
  return { items, cuadra }
}

function tipoIdentificacion(adquirente: AdquirenteCarga): "NIT" | "EXTRANJERA" {
  return adquirente.paisIso2 === "CO" && adquirente.nit ? "NIT" : "EXTRANJERA"
}

/** El archivo JSON para el software de facturación (`AMO-FV-1`). */
export function archivoCargaJson(datos: DatosArchivoCarga): string {
  const { factura, adquirente } = datos
  const { items, cuadra } = itemsDeCarga(datos)
  const contenido = {
    formato: FORMATO_ARCHIVO_CARGA,
    generado: datos.generadoAt,
    factura: {
      id: factura.id,
      tipo: "FACTURA_VENTA",
      moneda: "COP",
      esquema: factura.esquema,
      porcentaje_iva: factura.porcentajeIva,
      alcance: alcanceFactura(factura.campana),
      periodo: { desde: factura.periodoDesde, hasta: factura.periodoHasta },
    },
    adquirente: {
      tipo_identificacion: tipoIdentificacion(adquirente),
      nit: adquirente.nit,
      dv: adquirente.digitoVerificacion,
      identificacion_extranjera: adquirente.identificacionExtranjera,
      razon_social: adquirente.razonSocial,
      nombre_comercial: adquirente.nombreComercial,
      pais: adquirente.paisIso2,
      municipio_codigo: adquirente.municipioCodigo,
      municipio: adquirente.municipio,
      departamento: adquirente.departamento,
      direccion: adquirente.direccion,
      correo_facturacion: adquirente.correoFacturacion,
      regimen: adquirente.regimen,
      datos_facturacion: adquirente.datosFacturacion,
    },
    items: items.map((item) => ({
      numero: item.numero,
      asignacion_id: item.asignacionId,
      descripcion: item.descripcion,
      campana: item.campana,
      medio: item.medio,
      plataforma: item.plataforma,
      fecha_verificacion: item.fechaVerificacion,
      base_iva: item.baseIva,
      porcentaje_iva: factura.porcentajeIva,
      iva: item.iva,
      ingreso_terceros: item.ingresoTerceros,
      valor: item.valor,
    })),
    totales: {
      subtotal: factura.subtotal,
      iva: factura.iva,
      ingreso_terceros: factura.valorTerceros,
      total: factura.total,
    },
    cuadra,
  }
  return `${JSON.stringify(contenido, null, 2)}\n`
}

const COLUMNAS_CSV = [
  "Tipo de identificación",
  "Identificación",
  "DV",
  "Razón social",
  "Dirección",
  "Municipio (DANE)",
  "Correo de facturación",
  "Ítem",
  "Descripción",
  "Campaña",
  "Medio",
  "Plataforma",
  "Fecha de verificación",
  "Base IVA",
  "% IVA",
  "IVA",
  "Ingreso para terceros",
  "Valor",
] as const

/** El mismo contenido en CSV (`;`, UTF-8 con BOM): una fila por ítem. */
export function archivoCargaCsv(datos: DatosArchivoCarga): string {
  const { factura, adquirente } = datos
  const { items } = itemsDeCarga(datos)
  const nit = tipoIdentificacion(adquirente) === "NIT"
  return aCsv({
    titulo: "Archivo de carga",
    columnas: COLUMNAS_CSV.map((titulo) => ({ titulo })),
    filas: items.map((item) => [
      tipoIdentificacion(adquirente),
      nit ? adquirente.nit : adquirente.identificacionExtranjera,
      nit ? adquirente.digitoVerificacion : null,
      adquirente.razonSocial,
      adquirente.direccion,
      adquirente.municipioCodigo,
      adquirente.correoFacturacion,
      item.numero,
      item.descripcion,
      item.campana,
      item.medio,
      item.plataforma,
      item.fechaVerificacion,
      item.baseIva,
      factura.porcentajeIva,
      item.iva,
      item.ingresoTerceros,
      item.valor,
    ]),
  })
}

/** «borrador-factura-tienda-la-14-9c3e1a7b» (sin tildes ni espacios; el final del id). */
export function nombreArchivoCarga(datos: DatosArchivoCarga): string {
  const anunciante = datos.adquirente.nombreComercial
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return ["borrador-factura", anunciante, datos.factura.id.slice(-8)]
    .filter(Boolean)
    .join("-")
}
