import "server-only"

import { cache } from "react"

import { leerFacturacion } from "@/features/empresa/filas"
import {
  clienteSolicitud,
  fallar,
  leerPagina,
  leerTodo,
  SIN_COINCIDENCIAS,
} from "@/features/operacion/queries/comun"
import {
  normalizarBusqueda,
  patronContiene,
} from "@/features/operacion/formato"
import { argumentosRpc } from "@/lib/supabase/rpc"
import type { Json } from "@/types/database.types"

import { type FacturaAlCorte, filaCartera, vencidasAlCorte } from "./cartera"
import {
  COLUMNA_ORDEN,
  type EstadoTablaFacturas,
  periodoEmision,
} from "./listado"
import { enCentavos, esEsquema, sumarDias } from "./presentacion"
import type {
  EstadoFactura,
  FacturaFila,
  FacturaVencida,
  FichaFactura,
  FilaCartera,
  LineaFactura,
  NotaCreditoFactura,
  PagoFactura,
  PendienteFacturacion,
  ResolucionActiva,
  ResumenFacturas,
} from "./tipos"

/**
 * Lecturas de la facturación al anunciante (LIQ-008). Todo con el cliente del
 * USUARIO (JWT + RLS): el equipo con `facturas.ver` ve las facturas, sus
 * pagos y notas crédito; las líneas (asignaciones) exigen además
 * `asignaciones.ver`, y el anunciante, `anunciantes.ver` o
 * `facturas.gestionar`. Un error de lectura se lanza y lo recoge el límite de
 * error de la sección.
 */

const SALDO_PENDIENTE: readonly EstadoFactura[] = [
  "EMITIDA",
  "PAGADA_PARCIAL",
  "VENCIDA",
]

function numero(valor: number | null | undefined): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0
}

function objetoJson(valor: Json | null | undefined): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

// ── Listado ──────────────────────────────────────────────────────────────────

const COLUMNAS_FILA =
  "id, numero, estado, anunciante_id, campana_id, fecha_emision, fecha_vencimiento, periodo_desde, periodo_hasta, total, saldo, created_at, es_demo, anunciante:anunciantes ( nombre_comercial, razon_social ), campana:campanas ( nombre )"

/** Número de factura buscado («fe 12» → «FE12»): solo letras y números. */
function numeroBuscado(texto: string): string {
  return texto.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

/** Anunciantes cuyo nombre contiene la búsqueda (para el `or` del listado). */
async function anunciantesBuscados(texto: string): Promise<string[]> {
  const patron = patronContiene(normalizarBusqueda(texto))
  if (!patron) return []
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("anunciantes")
    .select("id")
    .ilike("nombre_normalizado", patron)
    .limit(200)
  if (error) fallar("buscar los anunciantes", error)
  return data.map((fila) => fila.id)
}

/**
 * Una página del listado con su total: estado, anunciante, periodo de emisión
 * (las borradores no tienen fecha de emisión: con periodo no aparecen) y
 * búsqueda por número o por anunciante.
 */
export async function listarFacturas(
  estado: EstadoTablaFacturas
): Promise<{ filas: FacturaFila[]; total: number }> {
  const supabase = await clienteSolicitud()
  const busqueda = estado.q.trim()
  const porNumero = numeroBuscado(busqueda)
  const porAnunciante = busqueda ? await anunciantesBuscados(busqueda) : []
  const periodo = periodoEmision(estado)
  const columna = COLUMNA_ORDEN[estado.orden.campo]
  const ascendente = !estado.orden.descendente

  const pagina = await leerPagina(
    "listar las facturas",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      let consulta = supabase
        .from("facturas")
        .select(COLUMNAS_FILA, { count: "exact" })
      if (estado.estado.length > 0) {
        consulta = consulta.in("estado", estado.estado)
      }
      if (estado.anunciante.length > 0) {
        consulta = consulta.in("anunciante_id", estado.anunciante)
      }
      if (periodo) {
        consulta = consulta
          .gte("fecha_emision", periodo.desde)
          .lte("fecha_emision", periodo.hasta)
      }
      if (busqueda) {
        const condiciones = [
          ...(porNumero ? [`numero.ilike.%${porNumero}%`] : []),
          ...(porAnunciante.length > 0
            ? [`anunciante_id.in.(${porAnunciante.join(",")})`]
            : []),
        ]
        consulta =
          condiciones.length > 0
            ? consulta.or(condiciones.join(","))
            : consulta.in("id", SIN_COINCIDENCIAS)
      }
      return consulta
        .order(columna, { ascending: ascendente, nullsFirst: false })
        .order("id", { ascending: ascendente })
        .range(desde, hasta)
    }
  )

  return {
    total: pagina.total,
    filas: pagina.filas.map((fila) => ({
      id: fila.id,
      numero: fila.numero,
      estado: fila.estado,
      anuncianteId: fila.anunciante_id,
      anunciante: fila.anunciante?.nombre_comercial ?? null,
      razonSocial: fila.anunciante?.razon_social ?? null,
      campanaId: fila.campana_id,
      campana: fila.campana_id ? (fila.campana?.nombre ?? "Campaña") : null,
      fechaEmision: fila.fecha_emision,
      fechaVencimiento: fila.fecha_vencimiento,
      periodoDesde: fila.periodo_desde,
      periodoHasta: fila.periodo_hasta,
      total: numero(fila.total),
      saldo: numero(fila.saldo),
      creadaAt: fila.created_at,
      esDemo: fila.es_demo,
    })),
  }
}

/** Anunciantes con alguna factura (opciones del filtro), por nombre. */
export const anunciantesConFacturas = cache(
  async (): Promise<{ id: string; nombre: string }[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("anunciantes")
      .select("id, nombre_comercial, facturas!inner ( id )")
      .limit(1, { referencedTable: "facturas" })
      .order("nombre_comercial")
      .limit(500)
    if (error) fallar("leer los anunciantes con facturas", error)
    return data.map((fila) => ({ id: fila.id, nombre: fila.nombre_comercial }))
  }
)

// ── Resumen ──────────────────────────────────────────────────────────────────

export async function pendientesFacturacion(
  hasta: string | null
): Promise<PendienteFacturacion[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc(
    "pendientes_facturacion",
    argumentosRpc<"pendientes_facturacion">({ p_hasta: hasta })
  )
  if (error) fallar("leer lo pendiente por facturar", error)
  return data.map((fila) => ({
    anuncianteId: fila.anunciante_id,
    anunciante: fila.anunciante ?? "Anunciante sin nombre",
    campanaId: fila.campana_id,
    campana: fila.campana ?? "Campaña sin nombre",
    asignaciones: numero(fila.asignaciones),
    montoBruto: numero(fila.monto_bruto),
    primeraVerificada: fila.primera_verificada,
    ultimaVerificada: fila.ultima_verificada,
  }))
}

/** Lo por facturar, los borradores y el saldo de las expedidas. */
export async function resumenFacturas(): Promise<ResumenFacturas> {
  const supabase = await clienteSolicitud()
  const [pendientes, borradores, conSaldo] = await Promise.all([
    pendientesFacturacion(null),
    supabase
      .from("facturas")
      .select("id", { count: "exact", head: true })
      .eq("estado", "BORRADOR"),
    leerTodo("leer el saldo de las facturas", (desde, hasta) =>
      supabase
        .from("facturas")
        .select("id, estado, saldo")
        .in("estado", SALDO_PENDIENTE)
        .order("id")
        .range(desde, hasta)
    ),
  ])
  if (borradores.error) fallar("contar los borradores", borradores.error)
  const centavos = (valores: readonly number[]) =>
    valores.reduce((suma, valor) => suma + enCentavos(valor), 0) / 100
  const vencidas = conSaldo.filter((fila) => fila.estado === "VENCIDA")
  return {
    porFacturar: centavos(pendientes.map((fila) => fila.montoBruto)),
    asignacionesPorFacturar: pendientes.reduce(
      (suma, fila) => suma + fila.asignaciones,
      0
    ),
    anunciantesPorFacturar: new Set(pendientes.map((fila) => fila.anuncianteId))
      .size,
    borradores: borradores.count ?? 0,
    saldoPorCobrar: centavos(conSaldo.map((fila) => numero(fila.saldo))),
    saldoVencido: centavos(vencidas.map((fila) => numero(fila.saldo))),
    facturasVencidas: vencidas.length,
  }
}

// ── Ficha ────────────────────────────────────────────────────────────────────

const COLUMNAS_FICHA =
  "id, numero, prefijo, consecutivo, estado, esquema, porcentaje_iva, periodo_desde, periodo_hasta, fecha_emision, fecha_vencimiento, subtotal, iva, valor_terceros, total, pagado, valor_notas_credito, saldo, cufe, archivo_path, emitida_at, pagada_at, vencida_at, anulada_at, created_at, es_demo, anunciante_id, campana_id, anunciante:anunciantes ( id, nombre_comercial, razon_social, nit, digito_verificacion, identificacion_extranjera, pais_iso2, municipio_codigo, datos_facturacion ), campana:campanas ( id, nombre ), resolucion:resoluciones_dian ( numero_resolucion, prefijo, rango_desde, rango_hasta )"

/** La factura con su anunciante, campaña y resolución; `null` si no existe o no se ve. */
export const obtenerFactura = cache(
  async (facturaId: string): Promise<FichaFactura | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("facturas")
      .select(COLUMNAS_FICHA)
      .eq("id", facturaId)
      .maybeSingle()
    if (error) fallar("leer la factura", error)
    if (!data) return null
    const anunciante = data.anunciante
    return {
      id: data.id,
      numero: data.numero,
      prefijo: data.prefijo,
      consecutivo: data.consecutivo,
      estado: data.estado,
      esquema: esEsquema(data.esquema) ? data.esquema : "COMPRA_REVENTA",
      porcentajeIva: data.porcentaje_iva,
      periodoDesde: data.periodo_desde,
      periodoHasta: data.periodo_hasta,
      fechaEmision: data.fecha_emision,
      fechaVencimiento: data.fecha_vencimiento,
      subtotal: numero(data.subtotal),
      iva: numero(data.iva),
      valorTerceros: numero(data.valor_terceros),
      total: numero(data.total),
      pagado: numero(data.pagado),
      valorNotasCredito: numero(data.valor_notas_credito),
      saldo: numero(data.saldo),
      cufe: data.cufe,
      tieneArchivo: Boolean(data.archivo_path),
      emitidaAt: data.emitida_at,
      pagadaAt: data.pagada_at,
      vencidaAt: data.vencida_at,
      anuladaAt: data.anulada_at,
      creadaAt: data.created_at,
      esDemo: data.es_demo,
      anuncianteId: data.anunciante_id,
      anunciante: anunciante
        ? {
            id: anunciante.id,
            nombreComercial: anunciante.nombre_comercial,
            razonSocial: anunciante.razon_social,
            nit: anunciante.nit,
            digitoVerificacion: anunciante.digito_verificacion,
            identificacionExtranjera: anunciante.identificacion_extranjera,
            paisIso2: anunciante.pais_iso2,
            municipioCodigo: anunciante.municipio_codigo,
            datosFacturacion: objetoJson(anunciante.datos_facturacion),
            facturacion: leerFacturacion(anunciante.datos_facturacion),
          }
        : null,
      campana: data.campana
        ? { id: data.campana.id, nombre: data.campana.nombre }
        : null,
      resolucion: data.resolucion
        ? {
            numero: data.resolucion.numero_resolucion,
            prefijo: data.resolucion.prefijo,
            rangoDesde: data.resolucion.rango_desde,
            rangoHasta: data.resolucion.rango_hasta,
          }
        : null,
    }
  }
)

/** Asignaciones de la factura (conceptos), de la primera verificada a la última. */
export const lineasFactura = cache(
  async (facturaId: string): Promise<LineaFactura[]> => {
    const supabase = await clienteSolicitud()
    const filas = await leerTodo(
      "leer los conceptos de la factura",
      (desde, hasta) =>
        supabase
          .from("asignaciones")
          .select(
            "id, estado, campana_id, medio_id, plataforma, monto_bruto, verificada_at, campana:campanas ( nombre ), medio:medios ( nombre ), oferta:ofertas ( titulo ), montos:asignacion_montos ( monto_comision, monto_medio )"
          )
          .eq("factura_id", facturaId)
          .order("verificada_at", { ascending: true, nullsFirst: false })
          .order("id")
          .range(desde, hasta)
    )
    return filas.map((fila) => ({
      asignacionId: fila.id,
      estado: fila.estado,
      campanaId: fila.campana_id,
      campana: fila.campana?.nombre ?? null,
      medioId: fila.medio_id,
      medio: fila.medio?.nombre ?? null,
      plataforma: fila.plataforma,
      oferta: fila.oferta?.titulo ?? null,
      montoBruto: numero(fila.monto_bruto),
      montoComision: fila.montos ? numero(fila.montos.monto_comision) : null,
      montoMedio: fila.montos ? numero(fila.montos.monto_medio) : null,
      verificadaAt: fila.verificada_at,
    }))
  }
)

export const pagosFactura = cache(
  async (facturaId: string): Promise<PagoFactura[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("pagos_anunciante")
      .select(
        "id, fecha_pago, monto, valor_retenciones, medio_pago, referencia, soporte_path, created_at"
      )
      .eq("factura_id", facturaId)
      .order("fecha_pago")
      .order("created_at")
      .limit(500)
    if (error) fallar("leer los pagos de la factura", error)
    return data.map((fila) => ({
      id: fila.id,
      fechaPago: fila.fecha_pago,
      monto: numero(fila.monto),
      retenciones: numero(fila.valor_retenciones),
      medioPago: fila.medio_pago,
      referencia: fila.referencia,
      tieneSoporte: Boolean(fila.soporte_path),
      registradoAt: fila.created_at,
    }))
  }
)

export const notasCreditoFactura = cache(
  async (facturaId: string): Promise<NotaCreditoFactura[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("notas_credito")
      .select(
        "id, numero, cude, fecha_emision, valor, anula_factura, motivo, created_at"
      )
      .eq("factura_id", facturaId)
      .order("fecha_emision")
      .order("created_at")
      .limit(200)
    if (error) fallar("leer las notas crédito de la factura", error)
    return data.map((fila) => ({
      id: fila.id,
      numero: fila.numero,
      cude: fila.cude,
      fechaEmision: fila.fecha_emision,
      valor: numero(fila.valor),
      anulaFactura: fila.anula_factura,
      motivo: fila.motivo,
      registradaAt: fila.created_at,
    }))
  }
)

/**
 * Resolución de facturación activa (sugiere prefijo y número). `null` si no
 * hay o si el rol no ve las resoluciones (`configuracion.ver`): el formulario
 * funciona igual, sin sugerencia.
 */
export async function resolucionFacturaActiva(): Promise<ResolucionActiva | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("resoluciones_dian")
    .select(
      "numero_resolucion, prefijo, rango_desde, rango_hasta, consecutivo_actual, vigente_desde, vigente_hasta"
    )
    .eq("tipo", "FACTURA_VENTA")
    .eq("activa", true)
    .maybeSingle()
  if (error || !data) return null
  return {
    numero: data.numero_resolucion,
    prefijo: data.prefijo,
    rangoDesde: data.rango_desde,
    rangoHasta: data.rango_hasta,
    consecutivoActual: data.consecutivo_actual,
    vigenteDesde: data.vigente_desde,
    vigenteHasta: data.vigente_hasta,
  }
}

/** `facturacion.dias_vencimiento`; `null` si no se puede leer (el formulario lo dice). */
export async function diasVencimientoFacturas(): Promise<number | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", "facturacion.dias_vencimiento")
    .maybeSingle()
  if (error || !data) return null
  const dias = Number(data.valor)
  return Number.isInteger(dias) && dias >= 0 ? dias : null
}

// ── Cartera ──────────────────────────────────────────────────────────────────

/** `reporte_cartera` a la fecha de corte (exige `reportes.finanzas`). */
export async function carteraAlCorte(corte: string): Promise<FilaCartera[]> {
  const supabase = await clienteSolicitud()
  const filas = await leerTodo("leer la cartera", (desde, hasta) =>
    supabase.rpc("reporte_cartera", { p_corte: corte }).range(desde, hasta)
  )
  return filas.map(filaCartera)
}

/**
 * Facturas con saldo vencido a la fecha de corte. Solo se leen las que aún
 * tienen saldo o se pagaron o anularon después del corte (las demás ya no
 * tenían saldo ese día); el saldo de cada una se recalcula con sus pagos y
 * notas crédito hasta el corte.
 */
export async function facturasVencidasAlCorte(
  corte: string
): Promise<FacturaVencida[]> {
  const supabase = await clienteSolicitud()
  const despues = `${sumarDias(corte, 1)}T00:00:00-05:00`
  const filas = await leerTodo("leer las facturas vencidas", (desde, hasta) =>
    supabase
      .from("facturas")
      .select(
        "id, numero, anunciante_id, total, fecha_emision, fecha_vencimiento, anunciante:anunciantes ( nombre_comercial ), pagos:pagos_anunciante ( fecha_pago, monto, valor_retenciones ), notas:notas_credito ( fecha_emision, valor )"
      )
      .neq("estado", "BORRADOR")
      .lte("fecha_emision", corte)
      .lt("fecha_vencimiento", corte)
      .or(`saldo.gt.0,pagada_at.gte."${despues}",anulada_at.gte."${despues}"`)
      .order("id")
      .range(desde, hasta)
  )
  const facturas: FacturaAlCorte[] = filas.flatMap((fila) =>
    fila.fecha_emision
      ? [
          {
            id: fila.id,
            numero: fila.numero,
            anuncianteId: fila.anunciante_id,
            anunciante: fila.anunciante?.nombre_comercial ?? null,
            total: numero(fila.total),
            fechaEmision: fila.fecha_emision,
            fechaVencimiento: fila.fecha_vencimiento,
            pagos: fila.pagos.map((pago) => ({
              fecha: pago.fecha_pago,
              monto: numero(pago.monto),
              retenciones: numero(pago.valor_retenciones),
            })),
            notas: fila.notas.map((nota) => ({
              fecha: nota.fecha_emision,
              valor: numero(nota.valor),
            })),
          },
        ]
      : []
  )
  return vencidasAlCorte(facturas, corte)
}
