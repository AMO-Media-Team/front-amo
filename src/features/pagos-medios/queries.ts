import "server-only"

/**
 * Lecturas de los pagos a medios con el cliente del USUARIO (JWT + RLS): la
 * BD decide qué ve cada rol. `liquidaciones_por_pagar` no trae datos
 * reservados (Finanzas no lee `medios_privado`); los datos bancarios solo se
 * revelan al generar el archivo. Un error de lectura se lanza y lo recoge el
 * límite de error de la sección.
 */
import { cache } from "react"

import {
  normalizarBusqueda,
  patronContiene,
} from "@/features/operacion/formato"
import {
  type ClienteServidor,
  clienteSolicitud,
  fallar,
  leerPagina,
} from "@/features/operacion/queries/comun"
import { serializarFecha } from "@/lib/fechas"

import {
  filtrarPorPagar,
  ordenarPorPagar,
  paginar,
  resumirPorPagar,
} from "./preparacion"
import type {
  DetalleDispersion,
  DispersionFila,
  EstadoLiquidacion,
  LiquidacionDeDispersion,
  LiquidacionPorPagar,
  MetodoPago,
  PaginaDispersiones,
  PaginaPorPagar,
} from "./tipos"
import type {
  CampoOrdenDispersiones,
  EstadoTablaDispersiones,
  EstadoTablaPorPagar,
} from "./vistas"

// ── Por pagar ────────────────────────────────────────────────────────────────

/** Lo que la RPC entrega por llamada (`liquidaciones_por_pagar` lo acota a 500). */
const TRAMO_POR_PAGAR = 500
/** Tope de seguridad: nunca hay tantas aprobadas sin pagar a la vez. */
const MAXIMO_POR_PAGAR = 2000

/** Las SRF declaran todo no nulo; estas columnas llegan nulas sin archivo o sin método. */
interface FilaPorPagarBd {
  id: string
  medio_id: string
  medio: string
  periodo_inicio: string
  periodo_fin: string
  cantidad_asignaciones: number
  monto_neto: number
  created_at: string
  aprobada_at: string | null
  requiere_documento_soporte: boolean
  documento_listo: boolean
  datos_pago_listos: boolean
  metodo_pago: MetodoPago | null
  dispersion_id: string | null
  dispersada_at: string | null
  total: number
}

function aPorPagar(fila: FilaPorPagarBd): LiquidacionPorPagar {
  return {
    id: fila.id,
    medioId: fila.medio_id,
    medio: fila.medio,
    periodoInicio: fila.periodo_inicio,
    periodoFin: fila.periodo_fin,
    cantidadAsignaciones: fila.cantidad_asignaciones,
    montoNeto: Number(fila.monto_neto),
    creadaAt: fila.created_at,
    aprobadaAt: fila.aprobada_at,
    requiereDocumentoSoporte: fila.requiere_documento_soporte,
    documentoListo: fila.documento_listo,
    datosPagoListos: fila.datos_pago_listos,
    metodoPago: fila.metodo_pago,
    dispersionId: fila.dispersion_id,
    dispersadaAt: fila.dispersada_at,
  }
}

/** Todas las aprobadas (en tramos de 500), una vez por solicitud. */
export const liquidacionesPorPagar = cache(
  async (): Promise<LiquidacionPorPagar[]> => {
    const supabase = await clienteSolicitud()
    const filas: LiquidacionPorPagar[] = []
    for (let desde = 0; desde < MAXIMO_POR_PAGAR; desde += TRAMO_POR_PAGAR) {
      const { data, error } = await supabase.rpc("liquidaciones_por_pagar", {
        p_limite: TRAMO_POR_PAGAR,
        p_desplazamiento: desde,
      })
      if (error) fallar("leer las liquidaciones por pagar", error)
      const tramo = (data ?? []) as FilaPorPagarBd[]
      filas.push(...tramo.map(aPorPagar))
      const total = Number(tramo[0]?.total ?? 0)
      if (tramo.length < TRAMO_POR_PAGAR || filas.length >= total) break
    }
    return filas
  }
)

/** La página de «Por pagar» con la búsqueda, los filtros y el orden de la URL. */
export async function paginaPorPagar(
  estado: EstadoTablaPorPagar
): Promise<PaginaPorPagar> {
  const todas = await liquidacionesPorPagar()
  const filtradas = ordenarPorPagar(
    filtrarPorPagar(todas, estado),
    estado.orden
  )
  return {
    filas: paginar(filtradas, estado.pagina, estado.tamano).filas,
    total: filtradas.length,
    resumen: resumirPorPagar(todas),
  }
}

// ── Archivos de pagos (dispersiones) ─────────────────────────────────────────

/**
 * Nombres de quienes generaron los archivos (`nombres_equipo`: solo personas
 * del equipo AMO, para quien ve liquidaciones o facturas; FINANZAS no lee
 * `perfiles`). Si no llega, la interfaz dice «Otra persona del equipo».
 */
async function nombresEquipo(
  supabase: ClienteServidor,
  ids: readonly (string | null)[]
): Promise<ReadonlyMap<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => id !== null))]
  if (unicos.length === 0) return new Map()
  const { data, error } = await supabase.rpc("nombres_equipo", {
    p_ids: unicos.slice(0, 200),
  })
  if (error) return new Map()
  return new Map(
    data.flatMap((fila) => (fila.nombre ? [[fila.id, fila.nombre]] : []))
  )
}

const COLUMNAS_DISPERSION =
  "id, created_at, cantidad_liquidaciones, monto_total, generada_por, es_demo"

interface FilaDispersionBd {
  id: string
  created_at: string
  cantidad_liquidaciones: number
  monto_total: number
  generada_por: string | null
  es_demo: boolean
}

function aDispersion(
  fila: FilaDispersionBd,
  nombres: ReadonlyMap<string, string>
): DispersionFila {
  return {
    id: fila.id,
    creadaAt: fila.created_at,
    cantidad: fila.cantidad_liquidaciones,
    montoTotal: Number(fila.monto_total),
    generadaPor: fila.generada_por
      ? (nombres.get(fila.generada_por) ?? null)
      : null,
    esDemo: fila.es_demo,
  }
}

const COLUMNA_ORDEN_DISPERSION: Readonly<
  Record<CampoOrdenDispersiones, keyof FilaDispersionBd>
> = {
  fecha: "created_at",
  total: "monto_total",
  cantidad: "cantidad_liquidaciones",
}

/**
 * Historial de archivos de pagos (`dispersiones`, RLS:
 * `liquidaciones.registrar_pago`). La búsqueda es por el medio de alguna de
 * sus liquidaciones (las que hoy apuntan al archivo).
 */
export async function paginaDispersiones(
  estado: EstadoTablaDispersiones
): Promise<PaginaDispersiones> {
  const supabase = await clienteSolicitud()
  const patron = patronContiene(normalizarBusqueda(estado.q))
  const columna = COLUMNA_ORDEN_DISPERSION[estado.orden.campo]
  const { filas, total } = await leerPagina<FilaDispersionBd>(
    "leer los archivos de pagos",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      const consulta = patron
        ? supabase
            .from("dispersiones")
            .select(
              `${COLUMNAS_DISPERSION}, liquidaciones!inner(medio:medios!inner(nombre_normalizado))`,
              { count: "exact" }
            )
            .ilike("liquidaciones.medio.nombre_normalizado", patron)
        : supabase
            .from("dispersiones")
            .select(COLUMNAS_DISPERSION, { count: "exact" })
      return consulta
        .order(columna, { ascending: !estado.orden.descendente })
        .order("id", { ascending: !estado.orden.descendente })
        .range(desde, hasta)
        .overrideTypes<FilaDispersionBd[], { merge: false }>()
    }
  )
  const nombres = await nombresEquipo(
    supabase,
    filas.map((fila) => fila.generada_por)
  )
  return { filas: filas.map((fila) => aDispersion(fila, nombres)), total }
}

/** Cuántas aprobadas hay por pagar y cuántos archivos se han generado. */
export const contadoresPagos = cache(
  async (): Promise<{ porPagar: number; dispersiones: number }> => {
    const supabase = await clienteSolicitud()
    const [porPagar, dispersiones] = await Promise.all([
      liquidacionesPorPagar(),
      supabase
        .from("dispersiones")
        .select("id", { count: "exact", head: true }),
    ])
    if (dispersiones.error)
      fallar("contar los archivos de pagos", dispersiones.error)
    return { porPagar: porPagar.length, dispersiones: dispersiones.count ?? 0 }
  }
)

// ── Ficha de un archivo ──────────────────────────────────────────────────────

interface FilaLiquidacionDispersionBd {
  id: string
  periodo_inicio: string
  periodo_fin: string
  monto_neto: number
  estado: EstadoLiquidacion
  fecha_pago: string | null
  referencia_pago: string | null
  created_at: string
  requiere_documento_soporte: boolean
  numero_factura_medio: string | null
  factura_medio_path: string | null
  medio: { nombre: string } | null
  documentos: { estado: string }[]
}

function aLiquidacionDeDispersion(
  fila: FilaLiquidacionDispersionBd
): LiquidacionDeDispersion {
  const documentoListo = fila.requiere_documento_soporte
    ? fila.documentos.some((documento) => documento.estado === "EMITIDO")
    : fila.numero_factura_medio !== null && fila.factura_medio_path !== null
  return {
    id: fila.id,
    medio: fila.medio?.nombre ?? "Medio no visible",
    periodoInicio: fila.periodo_inicio,
    periodoFin: fila.periodo_fin,
    montoNeto: Number(fila.monto_neto),
    estado: fila.estado,
    fechaPago: fila.fecha_pago,
    referenciaPago: fila.referencia_pago,
    documentoListo,
    fechaMinimaPago: serializarFecha(new Date(fila.created_at)),
  }
}

/**
 * Un archivo de pagos y las liquidaciones que hoy apuntan a él (`null` si no
 * existe o no es visible). Las liquidaciones se leen con `liquidaciones.ver`
 * (RLS): sin ese permiso la lista llega vacía.
 */
export const detalleDispersion = cache(
  async (id: string): Promise<DetalleDispersion | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("dispersiones")
      .select(COLUMNAS_DISPERSION)
      .eq("id", id)
      .maybeSingle()
    if (error) fallar("leer el archivo de pagos", error)
    if (!data) return null

    const liquidaciones = await supabase
      .from("liquidaciones")
      .select(
        "id, periodo_inicio, periodo_fin, monto_neto, estado, fecha_pago, referencia_pago, created_at, requiere_documento_soporte, numero_factura_medio, factura_medio_path, medio:medios(nombre), documentos:documentos_soporte(estado)"
      )
      .eq("dispersion_id", id)
      .order("id")
      .limit(1000)
      .overrideTypes<FilaLiquidacionDispersionBd[], { merge: false }>()
    if (liquidaciones.error) {
      fallar("leer las liquidaciones del archivo", liquidaciones.error)
    }
    const nombres = await nombresEquipo(supabase, [data.generada_por])
    return {
      dispersion: aDispersion(data, nombres),
      liquidaciones: (liquidaciones.data ?? []).map(aLiquidacionDeDispersion),
    }
  }
)
