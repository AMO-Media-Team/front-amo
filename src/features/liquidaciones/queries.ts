import "server-only"

/**
 * Lecturas de las liquidaciones con la sesión de quien mira (JWT + RLS:
 * `liquidaciones.ver`). Los medios, las dispersiones y las asignaciones se
 * leen con su propia política: si el rol no las ve, llegan vacías y la
 * interfaz lo dice en lugar de fallar. Un error de lectura se lanza y lo
 * recoge el límite de error de la sección.
 */
import { cache } from "react"

import {
  normalizarBusqueda,
  patronContiene,
} from "@/features/operacion/formato"
import {
  clienteSolicitud,
  fallar,
  leerPagina,
  leerTodo,
  nombreMunicipio,
  SIN_COINCIDENCIAS,
} from "@/features/operacion/queries/comun"

import {
  documentoVigente,
  filaLiquidacion,
  filaPendiente,
  type LineaBd,
  lineaLiquidacion,
  type LiquidacionBd,
  retencionesDeLineas,
} from "./lectura"
import { esPeriodicidad, type Periodicidad, type PeriodoCorte } from "./periodo"
import type {
  FilaLiquidacion,
  FilaPendiente,
  LiquidacionFicha,
  PoliticaSegSocial,
} from "./tipos"
import {
  type CampoOrdenLiquidaciones,
  ESTADO_DE_VISTA,
  type EstadoTablaLiquidaciones,
  type Pagina,
  VISTAS_LIQUIDACIONES,
  type VistaLiquidaciones,
  type VistaPorEstado,
} from "./vistas"

/** Tope de medios que devuelve la búsqueda por nombre (filtro `in`). */
const LIMITE_COINCIDENCIAS = 200

// ── Por liquidar (LIQ-001) ───────────────────────────────────────────────────

/** Medios con verificadas sin liquidar, con su municipio legible. Una vez por solicitud. */
export const pendientesLiquidacion = cache(
  async (): Promise<FilaPendiente[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("pendientes_liquidacion", {})
    if (error) fallar("leer los medios por liquidar", error)
    return (data ?? []).map((fila) =>
      filaPendiente(
        {
          ...fila,
          ultima_liquidacion_fin: fila.ultima_liquidacion_fin ?? null,
        },
        nombreMunicipio(fila.municipio_codigo ?? null)
      )
    )
  }
)

export interface PeriodoSugerido extends PeriodoCorte {
  periodicidad: Periodicidad
}

/** El último periodo cerrado según `liquidaciones.periodicidad`. */
export const periodoSugerido = cache(async (): Promise<PeriodoSugerido> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("periodo_liquidacion_sugerido")
  if (error) fallar("leer el periodo sugerido", error)
  const fila = (Array.isArray(data) ? data[0] : data) as
    Record<string, unknown> | null | undefined
  const inicio = typeof fila?.inicio === "string" ? fila.inicio : null
  const fin = typeof fila?.fin === "string" ? fila.fin : null
  if (!inicio || !fin) {
    throw new Error("No se pudo leer el periodo sugerido (sin datos).")
  }
  return {
    inicio,
    fin,
    periodicidad: esPeriodicidad(fila?.periodicidad)
      ? fila.periodicidad
      : "QUINCENAL",
  }
})

// ── Contadores de las pestañas ───────────────────────────────────────────────

export const contadoresLiquidaciones = cache(
  async (): Promise<Record<VistaLiquidaciones, number>> => {
    const supabase = await clienteSolicitud()
    const vistas = VISTAS_LIQUIDACIONES.filter(
      (vista): vista is VistaPorEstado => vista !== "pendientes"
    )
    const [pendientes, ...conteos] = await Promise.all([
      pendientesLiquidacion(),
      ...vistas.map((vista) =>
        supabase
          .from("liquidaciones")
          .select("id", { count: "exact", head: true })
          .eq("estado", ESTADO_DE_VISTA[vista])
      ),
    ])
    const contadores: Record<VistaLiquidaciones, number> = {
      pendientes: pendientes.length,
      borrador: 0,
      aprobadas: 0,
      pagadas: 0,
      anuladas: 0,
    }
    conteos.forEach(({ count, error }, indice) => {
      if (error) fallar("contar las liquidaciones", error)
      contadores[vistas[indice]] = count ?? 0
    })
    return contadores
  }
)

// ── Vistas por estado ────────────────────────────────────────────────────────

const SELECCION_LISTA = `
  id, estado, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_medio, monto_retenciones,
  monto_neto, requiere_documento_soporte, alerta_seg_social, creada_por, created_at, aprobada_at, anulada_at,
  fecha_pago, numero_factura_medio, dispersion_id, es_demo,
  medio:medios ( nombre ),
  dispersion:dispersiones ( id, created_at ),
  documentos:documentos_soporte ( id, estado, numero, cuds, nota_ajuste_numero, created_at )
` as const

const COLUMNA_ORDEN: Readonly<Record<CampoOrdenLiquidaciones, string>> = {
  periodo: "periodo_fin",
  neto: "monto_neto",
  generada: "created_at",
  pago: "fecha_pago",
}

/** Ids de los medios cuyo nombre coincide con la búsqueda (`null` sin búsqueda). */
async function mediosBuscados(texto: string): Promise<string[] | null> {
  const patron = patronContiene(normalizarBusqueda(texto))
  if (!patron) return null
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("medios")
    .select("id")
    .ilike("nombre_normalizado", patron)
    .limit(LIMITE_COINCIDENCIAS)
  if (error) fallar("buscar medios", error)
  return data.map((fila) => fila.id)
}

export async function listarLiquidaciones(
  vista: VistaPorEstado,
  estado: EstadoTablaLiquidaciones,
  actorId: string
): Promise<Pagina<FilaLiquidacion>> {
  const supabase = await clienteSolicitud()
  const medios = await mediosBuscados(estado.q)
  const { campo, descendente } = estado.orden
  const { filas, total } = await leerPagina(
    "listar las liquidaciones",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      let consulta = supabase
        .from("liquidaciones")
        .select(SELECCION_LISTA, { count: "exact" })
        .eq("estado", ESTADO_DE_VISTA[vista])
      if (medios) {
        consulta = consulta.in(
          "medio_id",
          medios.length > 0 ? medios : SIN_COINCIDENCIAS
        )
      }
      if (estado.soporte.length === 1) {
        consulta = consulta.eq(
          "requiere_documento_soporte",
          estado.soporte[0] === "DOCUMENTO_SOPORTE"
        )
      }
      return consulta
        .order(COLUMNA_ORDEN[campo], {
          ascending: !descendente,
          nullsFirst: false,
        })
        .order("id", { ascending: !descendente })
        .range(desde, hasta)
    }
  )
  return {
    filas: filas.map((fila) => filaLiquidacion(fila as LiquidacionBd, actorId)),
    total,
  }
}

// ── Ficha ────────────────────────────────────────────────────────────────────

const SELECCION_FICHA = `
  id, estado, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto, monto_comision,
  monto_medio, monto_retenciones, monto_neto, requiere_documento_soporte, alerta_seg_social, creada_por,
  created_at, aprobada_at, anulada_at, pagada_at, fecha_pago, referencia_pago, soporte_pago_path,
  numero_factura_medio, factura_medio_path, dispersion_id, es_demo,
  medio:medios ( nombre, municipio_codigo ),
  dispersion:dispersiones ( id, created_at ),
  documentos:documentos_soporte ( id, estado, numero, cuds, nota_ajuste_numero, created_at )
` as const

const SELECCION_LINEAS = `
  id, plataforma, verificada_at, monto_bruto,
  oferta:ofertas ( titulo ),
  campana:campanas ( nombre, marca ),
  montos:asignacion_montos (
    monto_bruto, monto_comision, monto_medio, monto_retenciones, monto_neto, retenciones_aplicadas
  )
` as const

/** Ficha de una liquidación (`null` si no existe o el rol no la ve). Una vez por solicitud. */
export const obtenerLiquidacion = cache(async function obtenerLiquidacion(
  liquidacionId: string,
  actorId: string
): Promise<LiquidacionFicha | null> {
  const supabase = await clienteSolicitud()
  const [cabecera, lineas] = await Promise.all([
    supabase
      .from("liquidaciones")
      .select(SELECCION_FICHA)
      .eq("id", liquidacionId)
      .maybeSingle(),
    leerTodo("leer las asignaciones de la liquidación", (desde, hasta) =>
      supabase
        .from("asignaciones")
        .select(SELECCION_LINEAS)
        .eq("liquidacion_id", liquidacionId)
        .order("id")
        .range(desde, hasta)
    ),
  ])
  if (cabecera.error) fallar("leer la liquidación", cabecera.error)
  const fila = cabecera.data
  if (!fila) return null
  const lineasBd = lineas as LineaBd[]
  const medio = fila.medio as {
    nombre: string
    municipio_codigo: string
  } | null
  return {
    ...filaLiquidacion(
      {
        ...fila,
        medio: medio ? { nombre: medio.nombre } : null,
      } as LiquidacionBd,
      actorId
    ),
    municipio: nombreMunicipio(medio?.municipio_codigo ?? null),
    montoBruto: fila.monto_bruto,
    montoComision: fila.monto_comision,
    pagadaAt: fila.pagada_at,
    referenciaPago: fila.referencia_pago,
    tieneSoportePago: fila.soporte_pago_path !== null,
    tieneFacturaMedio: fila.factura_medio_path !== null,
    retenciones: retencionesDeLineas(lineasBd, nombreMunicipio),
    lineas: lineasBd.map(lineaLiquidacion),
  }
})

/** Estado y documento vigente: lo mínimo que una acción comprueba antes de decidir. */
export async function situacionLiquidacion(liquidacionId: string) {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("liquidaciones")
    .select(
      "id, estado, medio_id, documentos:documentos_soporte ( id, estado, numero, cuds, nota_ajuste_numero, created_at )"
    )
    .eq("id", liquidacionId)
    .maybeSingle()
  if (error) fallar("leer la liquidación", error)
  if (!data) return null
  return {
    estado: data.estado,
    medioId: data.medio_id,
    documento: documentoVigente(data.documentos),
  }
}

/** Ruta de un archivo de la liquidación, leída con la sesión (nunca del cliente). */
export async function rutaArchivoLiquidacion(
  liquidacionId: string,
  archivo: "soporte_pago" | "factura_medio"
): Promise<{ ruta: string | null; existe: boolean }> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("liquidaciones")
    .select("soporte_pago_path, factura_medio_path")
    .eq("id", liquidacionId)
    .maybeSingle()
  if (error) fallar("leer la liquidación", error)
  if (!data) return { ruta: null, existe: false }
  return {
    ruta:
      archivo === "soporte_pago"
        ? data.soporte_pago_path
        : data.factura_medio_path,
    existe: true,
  }
}

// ── Configuración ────────────────────────────────────────────────────────────

/** `tributario.politica_seg_social` (alertar si no se puede leer). */
export const politicaSegSocial = cache(async (): Promise<PoliticaSegSocial> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", "tributario.politica_seg_social")
    .maybeSingle()
  if (error) fallar("leer la política de seguridad social", error)
  return data?.valor === "BLOQUEAR" ? "BLOQUEAR" : "ALERTA"
})
