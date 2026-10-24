import "server-only"

/**
 * Consultas de las disputas (ADM-011, ADM-012), con el cliente del USUARIO
 * (JWT + RLS): el equipo con `disputas.ver` lee todas; el medio y el
 * anunciante, las de sus asignaciones y sin notas internas. Un error de
 * lectura se lanza y lo recoge el límite de error de la sección.
 *
 * `disputasDeAsignacion` y `mensajesDeDisputa` son contrato: las usan también
 * las páginas de disputa del medio y del anunciante (paquete DX).
 */
import { cache } from "react"

import {
  formatearHandle,
  normalizarBusqueda,
  patronContiene,
  patronLiteral,
} from "@/features/operacion/formato"
import {
  catalogos,
  type ClienteServidor,
  clienteSolicitud,
  fallar,
  leerPagina,
  SIN_COINCIDENCIAS,
} from "@/features/operacion/queries/comun"
import type { Json } from "@/types/database.types"

import { describirAdjunto } from "./adjuntos"
import {
  type CampoOrdenDisputas,
  ESTADOS_DE_GRUPO,
  type EstadoTablaDisputas,
  estadosDeGrupos,
  GRUPOS_DISPUTA,
} from "./bandeja"
import { PLAZO_RECARGA_POR_DEFECTO } from "./presentacion"
import type {
  AsignacionDisputa,
  CausaCancelacion,
  Corte,
  DisputaDetalle,
  DisputaFila,
  DisputaInterna,
  EstadoAsignacion,
  EstadoDisputa,
  MensajeDisputa,
  MotivoDisputa,
  PaginaDisputas,
  ParteDisputa,
  Plataforma,
  ResumenBandeja,
} from "./tipos"

// ── Disputas y mensajes (todas las perspectivas) ─────────────────────────────

const SELECCION_DETALLE =
  "id, asignacion_id, estado, motivo, parte, descripcion, estado_asignacion_origen, resolucion, estado_asignacion_resultante, created_at, updated_at, fecha_resolucion"

interface FilaDetalleBd {
  id: string
  asignacion_id: string
  estado: EstadoDisputa
  motivo: MotivoDisputa
  parte: ParteDisputa
  descripcion: string
  estado_asignacion_origen: EstadoAsignacion
  resolucion: string | null
  estado_asignacion_resultante: EstadoAsignacion | null
  created_at: string
  updated_at: string
  fecha_resolucion: string | null
}

function aDetalle(fila: FilaDetalleBd): DisputaDetalle {
  return {
    id: fila.id,
    asignacionId: fila.asignacion_id,
    estado: fila.estado,
    motivo: fila.motivo,
    parte: fila.parte,
    descripcion: fila.descripcion,
    estadoOrigen: fila.estado_asignacion_origen,
    resolucion: fila.resolucion,
    estadoResultante: fila.estado_asignacion_resultante,
    creadaAt: fila.created_at,
    actualizadaAt: fila.updated_at,
    resueltaAt: fila.fecha_resolucion,
  }
}

/**
 * Disputas de una asignación, la más reciente primero (la abierta, si la
 * hay, encabeza la lista: solo puede haber una). Vacío si no hay o si quien
 * consulta no ve la asignación.
 */
export const disputasDeAsignacion = cache(
  async (asignacionId: string): Promise<DisputaDetalle[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("disputas")
      .select(SELECCION_DETALLE)
      .eq("asignacion_id", asignacionId)
      .order("created_at", { ascending: false })
      .order("id")
    if (error) fallar("leer las disputas de la asignación", error)
    return data.map(aDetalle)
  }
)

interface FilaMensajeBd {
  id: number
  autor_parte: ParteDisputa | null
  autor_nombre: string | null
  autor_persona: string | null
  es_mio: boolean | null
  mensaje: string
  adjunto_path: string | null
  interno: boolean
  created_at: string
}

function aMensaje(fila: FilaMensajeBd): MensajeDisputa {
  return {
    id: fila.id,
    // Filas anteriores a `autor_parte`: la RPC ya las nombra «Equipo AMO».
    autorParte: fila.autor_parte ?? "ADMIN",
    autorNombre: fila.autor_nombre ?? "Equipo AMO",
    autorPersona: fila.autor_persona,
    esMio: fila.es_mio === true,
    mensaje: fila.mensaje,
    adjunto: describirAdjunto(fila.adjunto_path, fila.created_at),
    interno: fila.interno,
    creadoAt: fila.created_at,
  }
}

/**
 * Hilo de la disputa en orden (`mensajes_disputa`): las partes no reciben las
 * notas internas y el nombre de la persona solo llega con `usuarios.ver`. La
 * ruta de cada adjunto se queda en el servidor.
 */
export const mensajesDeDisputa = cache(
  async (disputaId: string): Promise<MensajeDisputa[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("mensajes_disputa", {
      p_disputa_id: disputaId,
    })
    if (error) fallar("leer los mensajes de la disputa", error)
    return (data as FilaMensajeBd[]).map(aMensaje)
  }
)

// ── Configuración ────────────────────────────────────────────────────────────

function comoEntero(valor: Json | undefined, respaldo: number): number {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" && Number.isInteger(numero) && numero > 0
    ? numero
    : respaldo
}

/** `disputas.plazo_recarga_horas` (pública): plazo para la evidencia tras reabrir. */
export const plazoRecargaHoras = cache(async (): Promise<number> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", "disputas.plazo_recarga_horas")
    .maybeSingle()
  if (error) fallar("leer la configuración de disputas", error)
  return comoEntero(data?.valor, PLAZO_RECARGA_POR_DEFECTO)
})

// ── Bandeja ──────────────────────────────────────────────────────────────────

const RELACIONES_BANDEJA = `
    id, plataforma, medio_id, campana_id, oferta_id,
    medio:medios ( nombre ),
    oferta:ofertas ( titulo ),
    campana:campanas ( nombre, marca ),
    anunciante:anunciantes ( nombre_comercial, razon_social )`

const BASE_BANDEJA =
  "id, estado, motivo, parte, estado_asignacion_origen, estado_asignacion_resultante, created_at, fecha_resolucion, asignacion_id, mensajes:disputa_mensajes ( count )"

/** Alias de la asignación embebida (también para filtrar por ella). */
const ALIAS_ASIGNACION = "asignacion"

/**
 * Con búsqueda, la asignación se une con `!inner` para filtrar las disputas
 * por sus medios, campañas u ofertas; sin ella, una disputa cuya asignación
 * el rol no ve sigue en la bandeja (sin esos datos).
 */
function seleccionBandeja(conBusqueda: boolean): string {
  const union = conBusqueda ? "asignaciones!inner" : "asignaciones"
  return `${BASE_BANDEJA}, ${ALIAS_ASIGNACION}:${union} (${RELACIONES_BANDEJA} )`
}

interface FilaBandejaBd {
  id: string
  estado: EstadoDisputa
  motivo: MotivoDisputa
  parte: ParteDisputa
  estado_asignacion_origen: EstadoAsignacion
  estado_asignacion_resultante: EstadoAsignacion | null
  created_at: string
  fecha_resolucion: string | null
  asignacion_id: string
  mensajes: { count: number }[] | null
  asignacion: {
    id: string
    plataforma: Plataforma
    medio: { nombre: string } | null
    oferta: { titulo: string } | null
    campana: { nombre: string; marca: string | null } | null
    anunciante: {
      nombre_comercial: string | null
      razon_social: string | null
    } | null
  } | null
}

/** Máximo de medios, campañas u ofertas que la búsqueda traduce a ids. */
const LIMITE_COINCIDENCIAS = 100

interface Coincidencias {
  medios: string[]
  campanas: string[]
  ofertas: string[]
}

/** La búsqueda se resuelve contra nombres de medios, campañas, marcas y ofertas. */
async function resolverBusqueda(
  supabase: ClienteServidor,
  texto: string
): Promise<Coincidencias | null> {
  const patron = patronContiene(normalizarBusqueda(texto))
  const literal = patronLiteral(texto)
  if (!patron || !literal) return null
  const [medios, campanas, ofertas] = await Promise.all([
    supabase
      .from("medios")
      .select("id")
      .ilike("nombre_normalizado", patron)
      .limit(LIMITE_COINCIDENCIAS),
    supabase
      .from("campanas")
      .select("id")
      .or(`nombre.ilike.${literal},marca.ilike.${literal}`)
      .limit(LIMITE_COINCIDENCIAS),
    supabase
      .from("ofertas")
      .select("id")
      .ilike("titulo", literal)
      .limit(LIMITE_COINCIDENCIAS),
  ])
  if (medios.error) fallar("buscar medios", medios.error)
  if (campanas.error) fallar("buscar campañas", campanas.error)
  if (ofertas.error) fallar("buscar ofertas", ofertas.error)
  return {
    medios: medios.data.map((fila) => fila.id),
    campanas: campanas.data.map((fila) => fila.id),
    ofertas: ofertas.data.map((fila) => fila.id),
  }
}

function lista(ids: readonly string[]): string {
  return (ids.length > 0 ? ids : SIN_COINCIDENCIAS).join(",")
}

function consultaBandeja(
  supabase: ClienteServidor,
  estado: EstadoTablaDisputas,
  coincidencias: Coincidencias | null,
  opciones: {
    head?: boolean
    estados?: readonly EstadoDisputa[]
    seleccion?: string
  } = {}
) {
  let consulta = supabase
    .from("disputas")
    .select(opciones.seleccion ?? seleccionBandeja(coincidencias !== null), {
      count: "exact",
      head: opciones.head ?? false,
    })
  const estados = opciones.estados ?? estadosDeGrupos(estado.estado)
  if (estados.length > 0) consulta = consulta.in("estado", [...estados])
  if (estado.motivo.length > 0) consulta = consulta.in("motivo", estado.motivo)
  if (estado.parte.length > 0) consulta = consulta.in("parte", estado.parte)
  if (coincidencias) {
    consulta = consulta.or(
      `medio_id.in.(${lista(coincidencias.medios)}),campana_id.in.(${lista(coincidencias.campanas)}),oferta_id.in.(${lista(coincidencias.ofertas)})`,
      { referencedTable: ALIAS_ASIGNACION }
    )
  }
  return consulta
}

const COLUMNA_ORDEN: Readonly<Record<CampoOrdenDisputas, string>> = {
  estado: "estado",
  abierta: "created_at",
  resuelta: "fecha_resolucion",
}

function aFila(fila: FilaBandejaBd): DisputaFila {
  const asignacion = fila.asignacion
  return {
    id: fila.id,
    estado: fila.estado,
    motivo: fila.motivo,
    parte: fila.parte,
    estadoOrigen: fila.estado_asignacion_origen,
    estadoResultante: fila.estado_asignacion_resultante,
    creadaAt: fila.created_at,
    resueltaAt: fila.fecha_resolucion,
    mensajes: fila.mensajes?.[0]?.count ?? 0,
    asignacionId: fila.asignacion_id,
    medio: asignacion?.medio?.nombre ?? null,
    oferta: asignacion?.oferta?.titulo ?? null,
    campana: asignacion?.campana?.nombre ?? null,
    marca: asignacion?.campana?.marca ?? null,
    anunciante:
      asignacion?.anunciante?.nombre_comercial ??
      asignacion?.anunciante?.razon_social ??
      null,
    plataforma: asignacion?.plataforma ?? null,
  }
}

/**
 * Una página de la bandeja con los filtros de la URL. Por defecto, abiertas,
 * en revisión y cerradas, en ese orden y, dentro de cada estado, la abierta
 * hace más tiempo primero.
 */
export async function listarDisputas(
  estado: EstadoTablaDisputas
): Promise<PaginaDisputas> {
  const supabase = await clienteSolicitud()
  const coincidencias = await resolverBusqueda(supabase, estado.q)
  const { campo, descendente } = estado.orden

  const pagina = await leerPagina(
    "listar las disputas",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      let consulta = consultaBandeja(supabase, estado, coincidencias).order(
        COLUMNA_ORDEN[campo],
        { ascending: !descendente, nullsFirst: false }
      )
      // Entre las de un mismo estado (o fecha de cierre), la más antigua arriba.
      if (campo !== "abierta") {
        consulta = consulta.order("created_at", { ascending: true })
      }
      return consulta
        .order("id")
        .range(desde, hasta)
        .overrideTypes<FilaBandejaBd[], { merge: false }>()
    }
  )
  return { total: pagina.total, filas: pagina.filas.map(aFila) }
}

/** Cuántas hay en cada grupo con los demás filtros de la vista (búsqueda, motivo, parte). */
export async function resumenBandeja(
  estado: EstadoTablaDisputas
): Promise<ResumenBandeja> {
  const supabase = await clienteSolicitud()
  const coincidencias = await resolverBusqueda(supabase, estado.q)
  const seleccion = coincidencias
    ? `id, ${ALIAS_ASIGNACION}:asignaciones!inner ( id )`
    : "id"
  const conteos = await Promise.all(
    GRUPOS_DISPUTA.map(async (grupo) => {
      const { count, error } = await consultaBandeja(
        supabase,
        estado,
        coincidencias,
        { head: true, estados: ESTADOS_DE_GRUPO[grupo], seleccion }
      )
      if (error) fallar("contar las disputas", error)
      return [grupo, count ?? 0] as const
    })
  )
  return Object.fromEntries(conteos) as Record<
    (typeof GRUPOS_DISPUTA)[number],
    number
  >
}

// ── Ficha interna ────────────────────────────────────────────────────────────

const SELECCION_FICHA = `
  id, asignacion_id, estado, motivo, parte, descripcion, estado_asignacion_origen, resolucion,
  estado_asignacion_resultante, created_at, updated_at, fecha_resolucion, abierta_por, resuelta_por,
  asignacion:asignaciones (
    id, estado, estado_previo_disputa, plataforma, publicaciones, monto_bruto, aceptada_at,
    fecha_limite_publicacion, vencida_at, causa_cancelacion, medio_id, campana_id, anunciante_id, oferta_id,
    medio:medios ( nombre ),
    cuenta:cuentas_sociales ( handle, url ),
    oferta:ofertas ( titulo, formato_id, estado, cortes_requeridos ),
    campana:campanas ( nombre, marca, estado ),
    anunciante:anunciantes ( nombre_comercial, razon_social )
  )
` as const

interface FilaAsignacionFichaBd {
  id: string
  estado: EstadoAsignacion
  estado_previo_disputa: EstadoAsignacion | null
  plataforma: Plataforma
  publicaciones: number
  monto_bruto: number | null
  aceptada_at: string | null
  fecha_limite_publicacion: string | null
  vencida_at: string | null
  causa_cancelacion: CausaCancelacion | null
  medio_id: string
  campana_id: string
  anunciante_id: string
  oferta_id: string
  medio: { nombre: string } | null
  cuenta: { handle: string; url: string } | null
  oferta: {
    titulo: string
    formato_id: string
    estado: string
    cortes_requeridos: Corte[]
  } | null
  campana: { nombre: string; marca: string | null; estado: string } | null
  anunciante: {
    nombre_comercial: string | null
    razon_social: string | null
  } | null
}

type FilaFichaBd = FilaDetalleBd & {
  abierta_por: string
  resuelta_por: string | null
  asignacion: FilaAsignacionFichaBd | null
}

/** Estados en que la oferta ya no admite reabrir una vencida (hint `oferta_cerrada`). */
const OFERTA_CERRADA = ["CERRADA", "CANCELADA"]

async function leerEjecucion(supabase: ClienteServidor, asignacionId: string) {
  const [publicaciones, metricas] = await Promise.all([
    supabase
      .from("publicaciones")
      .select(
        "id, numero, url_post, estado_validacion, permanencia_hasta, permanencia_verificada_at, retirada_detectada_at"
      )
      .eq("asignacion_id", asignacionId)
      .order("numero"),
    // Sin las columnas de alertas: no se leen por la API (D67).
    supabase
      .from("metricas")
      .select("id, publicacion_id, corte, estado_validacion")
      .eq("asignacion_id", asignacionId)
      .order("id"),
  ])
  if (publicaciones.error) fallar("leer las publicaciones", publicaciones.error)
  if (metricas.error) fallar("leer las métricas", metricas.error)
  return { publicaciones: publicaciones.data, metricas: metricas.data }
}

async function nombresDePersonas(
  supabase: ClienteServidor,
  ids: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map()
  // RLS: solo quien tiene `usuarios.ver` (o la propia persona) lee perfiles.
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre")
    .in("id", [...new Set(ids)])
  if (error) fallar("leer los nombres del equipo", error)
  return new Map(
    data.flatMap((fila) => (fila.nombre ? [[fila.id, fila.nombre]] : []))
  )
}

async function asignacionDeFicha(
  supabase: ClienteServidor,
  fila: FilaAsignacionFichaBd
): Promise<AsignacionDisputa> {
  const [{ publicaciones, metricas }, { formatos }] = await Promise.all([
    leerEjecucion(supabase, fila.id),
    catalogos(),
  ])
  const ofertaCerrada =
    OFERTA_CERRADA.includes(fila.oferta?.estado ?? "") ||
    (fila.campana !== null && fila.campana.estado !== "ACTIVA")
  return {
    id: fila.id,
    estado: fila.estado,
    estadoPrevioDisputa: fila.estado_previo_disputa,
    plataforma: fila.plataforma,
    formato: fila.oferta
      ? (formatos.get(fila.oferta.formato_id)?.nombre ?? null)
      : null,
    publicacionesEsperadas: fila.publicaciones,
    montoBruto: fila.monto_bruto,
    aceptadaAt: fila.aceptada_at,
    fechaLimitePublicacion: fila.fecha_limite_publicacion,
    vencidaAt: fila.vencida_at,
    causaCancelacion: fila.causa_cancelacion,
    medio: { id: fila.medio_id, nombre: fila.medio?.nombre ?? null },
    cuenta: fila.cuenta
      ? { handle: formatearHandle(fila.cuenta.handle), url: fila.cuenta.url }
      : null,
    oferta: {
      id: fila.oferta_id,
      titulo: fila.oferta?.titulo ?? null,
      cerrada: ofertaCerrada,
    },
    campana: {
      id: fila.campana_id,
      nombre: fila.campana?.nombre ?? null,
      marca: fila.campana?.marca ?? null,
    },
    anunciante: {
      id: fila.anunciante_id,
      nombre:
        fila.anunciante?.nombre_comercial ??
        fila.anunciante?.razon_social ??
        null,
    },
    cortesRequeridos: fila.oferta?.cortes_requeridos ?? [],
    publicaciones: publicaciones.map((publicacion) => ({
      id: publicacion.id,
      numero: publicacion.numero,
      url: publicacion.url_post,
      estado: publicacion.estado_validacion,
      permanenciaHasta: publicacion.permanencia_hasta,
      permanenciaVerificadaAt: publicacion.permanencia_verificada_at,
      retiradaDetectadaAt: publicacion.retirada_detectada_at,
    })),
    metricas: metricas.map((metrica) => ({
      publicacionId: metrica.publicacion_id,
      corte: metrica.corte,
      estado: metrica.estado_validacion,
    })),
  }
}

/**
 * Todo lo que muestra la ficha interna de una disputa: la disputa, la
 * asignación resumida (con lo necesario para explicar cada resolución), el
 * hilo con las notas internas y quién la abrió y la resolvió (si el rol ve
 * perfiles). `null` si no existe o no es visible.
 */
export const obtenerDisputaInterna = cache(
  async (id: string): Promise<DisputaInterna | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("disputas")
      .select(SELECCION_FICHA)
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<FilaFichaBd, { merge: false }>()
    if (error) fallar("leer la disputa", error)
    if (!data) return null

    const [asignacion, mensajes, personas, plazo] = await Promise.all([
      data.asignacion
        ? asignacionDeFicha(supabase, data.asignacion)
        : Promise.resolve(null),
      mensajesDeDisputa(id),
      nombresDePersonas(
        supabase,
        [data.abierta_por, data.resuelta_por].filter(
          (persona): persona is string => persona !== null
        )
      ),
      plazoRecargaHoras(),
    ])
    return {
      ...aDetalle(data),
      asignacion,
      abiertaPor: personas.get(data.abierta_por) ?? null,
      resueltaPor: data.resuelta_por
        ? (personas.get(data.resuelta_por) ?? null)
        : null,
      mensajes,
      plazoRecargaHoras: plazo,
    }
  }
)
