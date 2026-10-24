/**
 * De las filas de la BD a lo que pinta la interfaz (módulo puro, sin
 * Supabase): el documento soporte vigente, las filas de las tablas y las
 * líneas de la ficha. Las rutas de Storage no salen de aquí: solo si existe
 * el archivo.
 */
import type { Plataforma } from "@/features/operacion/estados"

import { agruparRetenciones, leerRetenciones } from "./presentacion"
import type {
  DocumentoResumen,
  EstadoDocumentoSoporte,
  EstadoLiquidacion,
  FilaLiquidacion,
  FilaPendiente,
  LineaLiquidacion,
  RetencionLiquidacion,
} from "./tipos"

export interface DocumentoBd {
  id: string
  estado: EstadoDocumentoSoporte
  numero: string | null
  cuds: string | null
  nota_ajuste_numero: string | null
  created_at: string
}

/**
 * El documento vigente (no anulado) de la liquidación o, si todos se
 * anularon, el más reciente (el que explica por qué no hay uno vigente).
 */
export function documentoVigente(
  documentos: readonly DocumentoBd[] | null | undefined
): DocumentoResumen | null {
  if (!documentos || documentos.length === 0) return null
  const recientes = [...documentos].sort(
    (a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) ||
      b.id.localeCompare(a.id)
  )
  const elegido =
    recientes.find((documento) => documento.estado !== "ANULADO") ??
    recientes[0]
  return {
    id: elegido.id,
    estado: elegido.estado,
    numero: elegido.numero,
    conCuds: elegido.cuds !== null,
    conNotaAjuste: elegido.nota_ajuste_numero !== null,
  }
}

export interface LiquidacionBd {
  id: string
  estado: EstadoLiquidacion
  medio_id: string
  periodo_inicio: string
  periodo_fin: string
  cantidad_asignaciones: number
  monto_medio: number
  monto_retenciones: number
  monto_neto: number
  requiere_documento_soporte: boolean
  alerta_seg_social: boolean
  creada_por: string | null
  created_at: string
  aprobada_at: string | null
  anulada_at: string | null
  fecha_pago: string | null
  numero_factura_medio: string | null
  dispersion_id: string | null
  es_demo: boolean
  medio: { nombre: string } | null
  dispersion: { id: string; created_at: string } | null
  documentos: DocumentoBd[] | null
}

export function filaLiquidacion(
  fila: LiquidacionBd,
  actorId: string
): FilaLiquidacion {
  return {
    id: fila.id,
    estado: fila.estado,
    medioId: fila.medio_id,
    medio: fila.medio?.nombre ?? null,
    periodoInicio: fila.periodo_inicio,
    periodoFin: fila.periodo_fin,
    asignaciones: fila.cantidad_asignaciones,
    montoMedio: fila.monto_medio,
    montoRetenciones: fila.monto_retenciones,
    montoNeto: fila.monto_neto,
    requiereDocumentoSoporte: fila.requiere_documento_soporte,
    alertaSegSocial: fila.alerta_seg_social,
    generadaPorMi: fila.creada_por === actorId,
    creadaAt: fila.created_at,
    aprobadaAt: fila.aprobada_at,
    anuladaAt: fila.anulada_at,
    fechaPago: fila.fecha_pago,
    documento: documentoVigente(fila.documentos),
    numeroFacturaMedio: fila.numero_factura_medio,
    // Sin permiso para leer las dispersiones, se sabe que la hay pero no su fecha.
    dispersion: fila.dispersion_id
      ? { id: fila.dispersion_id, fecha: fila.dispersion?.created_at ?? null }
      : null,
    esDemo: fila.es_demo,
  }
}

export interface PendienteBd {
  medio_id: string
  medio: string
  asignaciones: number
  monto_medio: number
  primera_verificada: string
  ultima_verificada: string
  ultima_liquidacion_fin: string | null
  requiere_documento_soporte: boolean
  datos_pago_listos: boolean
  seg_social_pendiente: boolean
}

export function filaPendiente(
  fila: PendienteBd,
  municipio: string | null
): FilaPendiente {
  return {
    medioId: fila.medio_id,
    medio: fila.medio,
    municipio,
    asignaciones: fila.asignaciones,
    montoMedio: fila.monto_medio,
    primeraVerificada: fila.primera_verificada,
    ultimaVerificada: fila.ultima_verificada,
    ultimaLiquidacionFin: fila.ultima_liquidacion_fin,
    requiereDocumentoSoporte: fila.requiere_documento_soporte,
    datosPagoListos: fila.datos_pago_listos,
    segSocialPendiente: fila.seg_social_pendiente,
  }
}

export interface LineaBd {
  id: string
  plataforma: Plataforma
  verificada_at: string | null
  monto_bruto: number | null
  oferta: { titulo: string } | null
  campana: { nombre: string; marca: string | null } | null
  montos: {
    monto_bruto: number
    monto_comision: number
    monto_medio: number | null
    monto_retenciones: number | null
    monto_neto: number | null
    retenciones_aplicadas: unknown
  } | null
}

export function lineaLiquidacion(fila: LineaBd): LineaLiquidacion {
  const montos = fila.montos
  const bruto = montos?.monto_bruto ?? fila.monto_bruto ?? 0
  const comision = montos?.monto_comision ?? 0
  const medio = montos?.monto_medio ?? bruto - comision
  const retenciones = montos?.monto_retenciones ?? 0
  return {
    asignacionId: fila.id,
    oferta: fila.oferta?.titulo ?? null,
    campana: fila.campana?.nombre ?? null,
    marca: fila.campana?.marca ?? null,
    plataforma: fila.plataforma,
    verificadaAt: fila.verificada_at,
    montoBruto: bruto,
    montoComision: comision,
    montoMedio: medio,
    montoRetenciones: retenciones,
    montoNeto: montos?.monto_neto ?? medio - retenciones,
  }
}

/** Retenciones de la liquidación a partir de sus líneas, con el municipio ya resuelto. */
export function retencionesDeLineas(
  lineas: readonly LineaBd[],
  nombreMunicipio: (codigo: string | null) => string | null
): RetencionLiquidacion[] {
  return agruparRetenciones(
    lineas.map((linea) => leerRetenciones(linea.montos?.retenciones_aplicadas))
  ).map((retencion) => ({
    ...retencion,
    municipio: nombreMunicipio(retencion.municipioCodigo),
  }))
}
