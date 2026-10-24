import "server-only"

import { cache } from "react"

import {
  clienteSolicitud,
  enLotes,
  fallar,
  leerPagina,
  leerTodo,
} from "@/features/operacion/queries/comun"
import { patronLiteral } from "@/features/operacion/formato"
import type { PaginaFilas } from "@/features/operacion/tipos"
import { type RangoFechas, serializarFecha } from "@/lib/fechas"

import { condicionEstados, resumenPorPagar } from "./calculos"
import type { CampoOrdenFacturas, EstadoTablaFacturas } from "./estado-tabla"
import { esquemaDe, estadoVisible, plazoFactura } from "./presentacion"
import type {
  CampanaFactura,
  ConceptoFactura,
  FacturaDetalle,
  FacturaFila,
  MedioPago,
  NotaCreditoFactura,
  OpcionCampana,
  PagoFactura,
  ResumenFacturas,
} from "./tipos"

/**
 * Consultas de las facturas del anunciante (ANU-013). Todo con el cliente de
 * la SESIÓN: la RLS solo deja ver las facturas EXPEDIDAS de la propia empresa
 * (`facturas.ver_propias`), sus pagos y notas crédito, y las asignaciones de
 * sus campañas (`asignaciones.ver_propias`). El filtro explícito por
 * anunciante solo hace legible la intención. Un error de lectura se lanza y
 * lo recoge el límite de error de la sección.
 */

/** `numeric` llega como número (o texto en cifras muy grandes). */
function n(valor: number | string | null | undefined): number {
  const numero = typeof valor === "string" ? Number(valor) : (valor ?? 0)
  return Number.isFinite(numero) ? numero : 0
}

function campanaDe(
  campanaId: string | null,
  campana: { id: string; nombre: string } | null
): CampanaFactura | null {
  if (!campanaId) return null
  return { id: campanaId, nombre: campana?.nombre ?? null }
}

const ESTADOS_CON_SALDO = ["EMITIDA", "PAGADA_PARCIAL", "VENCIDA"] as const

// ── Resumen ──────────────────────────────────────────────────────────────────

/** «Por pagar», «Vencido» y «Próximo vencimiento» de toda la empresa (sin los filtros). */
export const resumenFacturasAnunciante = cache(
  async (anuncianteId: string, hoy: string): Promise<ResumenFacturas> => {
    const supabase = await clienteSolicitud()
    const filas = await leerTodo("resumir tus facturas", (desde, hasta) =>
      supabase
        .from("facturas")
        .select("id, numero, estado, fecha_vencimiento, saldo")
        .eq("anunciante_id", anuncianteId)
        .in("estado", [...ESTADOS_CON_SALDO])
        .order("id")
        .range(desde, hasta)
    )
    return resumenPorPagar(
      filas.flatMap((fila) =>
        fila.numero
          ? [
              {
                id: fila.id,
                numero: fila.numero,
                estado: fila.estado,
                fechaVencimiento: fila.fecha_vencimiento,
                saldo: n(fila.saldo),
              },
            ]
          : []
      ),
      hoy
    )
  }
)

// ── Listado ──────────────────────────────────────────────────────────────────

const SELECCION_LISTADO = `
  id, numero, estado, fecha_emision, fecha_vencimiento, total, saldo, cufe,
  archivo_path, campana_id, es_demo,
  campana:campanas ( id, nombre )
`

const COLUMNAS_ORDEN: Readonly<Record<CampoOrdenFacturas, string>> = {
  emision: "fecha_emision",
  vencimiento: "fecha_vencimiento",
  total: "total",
  saldo: "saldo",
}

type ClienteSesion = Awaited<ReturnType<typeof clienteSolicitud>>

/**
 * Facturas que cubren alguna asignación de esas campañas (las consolidadas
 * cubren varias). Sin `asignaciones.ver_propias` la RLS no devuelve filas y
 * solo cuentan las facturas hechas por campaña.
 */
async function facturasConAsignacionesDe(
  supabase: ClienteSesion,
  campanas: readonly string[]
): Promise<string[]> {
  const filas = await leerTodo(
    "buscar las facturas de la campaña",
    (desde, hasta) =>
      supabase
        .from("asignaciones")
        .select("id, factura_id")
        .in("campana_id", [...campanas])
        .not("factura_id", "is", null)
        .order("id")
        .range(desde, hasta)
  )
  return [
    ...new Set(
      filas.flatMap((fila) => (fila.factura_id ? [fila.factura_id] : []))
    ),
  ]
}

export interface ConsultaFacturas {
  estado: EstadoTablaFacturas
  /** Periodo de EMISIÓN (ANU-013 c1); `null` = todo el historial. */
  periodo: RangoFechas | null
  /** Hoy en Bogotá ('YYYY-MM-DD'): decide qué está vencido. */
  hoy: string
}

/** Una página del listado con los filtros de la URL. */
export async function listarFacturasAnunciante(
  anuncianteId: string,
  { estado, periodo, hoy }: ConsultaFacturas
): Promise<PaginaFilas<FacturaFila>> {
  const supabase = await clienteSolicitud()
  const patron = patronLiteral(estado.q)
  const estados = condicionEstados(estado.estado, hoy)
  const facturasDeCampana =
    estado.campana.length > 0
      ? await facturasConAsignacionesDe(supabase, estado.campana)
      : []

  const pagina = await leerPagina(
    "listar tus facturas",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      let consulta = supabase
        .from("facturas")
        .select(SELECCION_LISTADO, { count: "exact" })
        .eq("anunciante_id", anuncianteId)
        .not("consecutivo", "is", null)
      if (periodo) {
        consulta = consulta
          .gte("fecha_emision", serializarFecha(periodo.desde))
          .lte("fecha_emision", serializarFecha(periodo.hasta))
      }
      if (estados) consulta = consulta.or(estados)
      if (estado.campana.length > 0) {
        const condiciones = [`campana_id.in.(${estado.campana.join(",")})`]
        if (facturasDeCampana.length > 0) {
          condiciones.push(`id.in.(${facturasDeCampana.join(",")})`)
        }
        consulta = consulta.or(condiciones.join(","))
      }
      if (patron) {
        consulta = consulta.or(`numero.ilike.${patron},cufe.ilike.${patron}`)
      }
      return consulta
        .order(COLUMNAS_ORDEN[estado.orden.campo], {
          ascending: !estado.orden.descendente,
          nullsFirst: false,
        })
        .order("id", { ascending: !estado.orden.descendente })
        .range(desde, hasta)
    }
  )

  return {
    total: pagina.total,
    filas: pagina.filas.flatMap((fila): FacturaFila[] => {
      if (!fila.numero || !fila.fecha_emision || fila.estado === "BORRADOR") {
        return []
      }
      const situacion = {
        estado: fila.estado,
        fechaVencimiento: fila.fecha_vencimiento,
        saldo: n(fila.saldo),
      }
      return [
        {
          id: fila.id,
          numero: fila.numero,
          estado: estadoVisible(situacion, hoy),
          fechaEmision: fila.fecha_emision,
          fechaVencimiento: fila.fecha_vencimiento,
          plazo: plazoFactura(situacion, hoy),
          total: n(fila.total),
          saldo: situacion.saldo,
          cufe: fila.cufe,
          tienePdf: Boolean(fila.archivo_path),
          campana: campanaDe(fila.campana_id, fila.campana),
          esDemo: fila.es_demo,
        },
      ]
    }),
  }
}

/**
 * Campañas para el filtro: las que tienen asignaciones facturadas (también
 * en consolidadas) y las de facturas por campaña. Más recientes primero.
 */
export const opcionesCampanaFacturas = cache(
  async (anuncianteId: string): Promise<OpcionCampana[]> => {
    const supabase = await clienteSolicitud()
    const [conAsignaciones, porCampana] = await Promise.all([
      supabase
        .from("campanas")
        .select("id, nombre, created_at, asignaciones!inner ( id )")
        .eq("anunciante_id", anuncianteId)
        .not("asignaciones.factura_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1, { referencedTable: "asignaciones" })
        .limit(200),
      supabase
        .from("facturas")
        .select("campana:campanas ( id, nombre, created_at )")
        .eq("anunciante_id", anuncianteId)
        .not("campana_id", "is", null)
        .limit(500),
    ])
    if (conAsignaciones.error) {
      fallar("listar las campañas facturadas", conAsignaciones.error)
    }
    if (porCampana.error)
      fallar("listar las campañas facturadas", porCampana.error)

    const campanas = new Map<string, { nombre: string; creada: string }>()
    for (const fila of conAsignaciones.data) {
      campanas.set(fila.id, { nombre: fila.nombre, creada: fila.created_at })
    }
    for (const { campana } of porCampana.data) {
      if (campana) {
        campanas.set(campana.id, {
          nombre: campana.nombre,
          creada: campana.created_at,
        })
      }
    }
    return [...campanas.entries()]
      .sort(([, a], [, b]) => b.creada.localeCompare(a.creada))
      .map(([id, { nombre }]) => ({ id, nombre }))
  }
)

// ── Ficha ────────────────────────────────────────────────────────────────────

const SELECCION_DETALLE = `
  id, numero, estado, fecha_emision, fecha_vencimiento, periodo_desde,
  periodo_hasta, esquema, porcentaje_iva, subtotal, iva, valor_terceros, total,
  pagado, valor_notas_credito, saldo, cufe, archivo_path, pagada_at,
  anulada_at, es_demo, campana_id,
  campana:campanas ( id, nombre )
`

/** Una factura expedida de la empresa; `null` si no existe o no es suya. */
export const obtenerFacturaAnunciante = cache(
  async (
    anuncianteId: string,
    facturaId: string,
    hoy: string
  ): Promise<FacturaDetalle | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("facturas")
      .select(SELECCION_DETALLE)
      .eq("id", facturaId)
      .eq("anunciante_id", anuncianteId)
      .maybeSingle()
    if (error) fallar("leer la factura", error)
    if (!data?.numero || !data.fecha_emision || data.estado === "BORRADOR") {
      return null
    }
    const situacion = {
      estado: data.estado,
      fechaVencimiento: data.fecha_vencimiento,
      saldo: n(data.saldo),
    }
    return {
      id: data.id,
      numero: data.numero,
      estado: estadoVisible(situacion, hoy),
      fechaEmision: data.fecha_emision,
      fechaVencimiento: data.fecha_vencimiento,
      plazo: plazoFactura(situacion, hoy),
      periodoDesde: data.periodo_desde,
      periodoHasta: data.periodo_hasta,
      esquema: esquemaDe(data.esquema),
      porcentajeIva:
        data.porcentaje_iva === null ? null : n(data.porcentaje_iva),
      subtotal: n(data.subtotal),
      iva: n(data.iva),
      valorTerceros: n(data.valor_terceros),
      total: n(data.total),
      pagado: n(data.pagado),
      valorNotasCredito: n(data.valor_notas_credito),
      saldo: situacion.saldo,
      cufe: data.cufe,
      tienePdf: Boolean(data.archivo_path),
      campana: campanaDe(data.campana_id, data.campana),
      pagadaAt: data.pagada_at,
      anuladaAt: data.anulada_at,
      esDemo: data.es_demo,
    }
  }
)

const MEDIOS_PAGO: readonly MedioPago[] = [
  "TRANSFERENCIA",
  "PSE",
  "CONSIGNACION",
  "CHEQUE",
  "OTRO",
]

function medioPagoDe(valor: string): MedioPago {
  return (MEDIOS_PAGO as readonly string[]).includes(valor)
    ? (valor as MedioPago)
    : "OTRO"
}

/** Pagos registrados, del más reciente al más antiguo. */
export const pagosDeFactura = cache(
  async (facturaId: string): Promise<PagoFactura[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("pagos_anunciante")
      .select(
        "id, fecha_pago, monto, valor_retenciones, medio_pago, referencia, soporte_path"
      )
      .eq("factura_id", facturaId)
      .order("fecha_pago", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)
    if (error) fallar("leer los pagos de la factura", error)
    return data.map((pago) => ({
      id: pago.id,
      fecha: pago.fecha_pago,
      monto: n(pago.monto),
      retenciones: n(pago.valor_retenciones),
      medioPago: medioPagoDe(pago.medio_pago),
      referencia: pago.referencia,
      tieneSoporte: Boolean(pago.soporte_path),
    }))
  }
)

/** Notas crédito de la factura, en el orden en que se emitieron. */
export const notasCreditoDeFactura = cache(
  async (facturaId: string): Promise<NotaCreditoFactura[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("notas_credito")
      .select("id, numero, fecha_emision, valor, motivo, anula_factura")
      .eq("factura_id", facturaId)
      .order("fecha_emision")
      .order("created_at")
      .limit(500)
    if (error) fallar("leer las notas crédito de la factura", error)
    return data.map((nota) => ({
      id: nota.id,
      numero: nota.numero,
      fechaEmision: nota.fecha_emision,
      valor: n(nota.valor),
      motivo: nota.motivo,
      anulaFactura: nota.anula_factura,
    }))
  }
)

/** Nombres públicos de los medios (`medios_publico`: solo los que trabajaron con la empresa). */
async function nombresDeMedios(
  supabase: ClienteSesion,
  ids: readonly string[]
): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  for (const lote of enLotes([...new Set(ids)])) {
    const { data, error } = await supabase.rpc("medios_publico", {
      p_ids: lote,
    })
    if (error) fallar("leer los medios de la factura", error)
    for (const medio of data) nombres.set(medio.id, medio.nombre)
  }
  return nombres
}

/**
 * Asignaciones que la factura cubre hoy (una nota crédito parcial libera las
 * que indica), con su campaña, medio, plataforma, formato y valor.
 */
export const conceptosDeFactura = cache(
  async (facturaId: string): Promise<ConceptoFactura[]> => {
    const supabase = await clienteSolicitud()
    const filas = await leerTodo(
      "leer los conceptos de la factura",
      (desde, hasta) =>
        supabase
          .from("asignaciones")
          .select(
            `id, estado, plataforma, monto_bruto, verificada_at, medio_id, campana_id,
             campana:campanas ( nombre ),
             oferta:ofertas ( titulo, formato:formatos ( nombre ) )`
          )
          .eq("factura_id", facturaId)
          .order("id")
          .range(desde, hasta)
    )
    const medios = await nombresDeMedios(
      supabase,
      filas.map((fila) => fila.medio_id)
    )
    return filas.map((fila) => ({
      id: fila.id,
      campanaId: fila.campana_id,
      campana: fila.campana?.nombre ?? null,
      medioId: fila.medio_id,
      medio: medios.get(fila.medio_id) ?? null,
      plataforma: fila.plataforma,
      formato: fila.oferta?.formato?.nombre ?? null,
      oferta: fila.oferta?.titulo ?? null,
      verificadaAt: fila.verificada_at,
      valor: n(fila.monto_bruto),
      estado: fila.estado,
    }))
  }
)
