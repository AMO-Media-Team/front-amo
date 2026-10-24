import "server-only"

/**
 * Lecturas de la ejecución del medio, siempre con su sesión (la RLS y
 * `mis_asignaciones_medio` solo dejan ver lo suyo): la asignación con su
 * oferta, las publicaciones registradas, los cortes de métricas, la versión
 * del contenido y los parámetros públicos (tolerancia entre cortes y plazo de
 * carga). Las rutas de las capturas nunca salen de aquí: se firman por id.
 */
import { cache } from "react"

import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import { valoresDeFila } from "./campos-metricas"
import { leerTolerancia } from "./coherencia"
import { PLAZO_CARGA_HORAS_POR_DEFECTO } from "./cortes"
import { elegirNumero } from "./evidencia"
import { metricaDelCorte, notaDeRechazo } from "./metricas"
import type {
  AsignacionEjecucion,
  ContenidoEjecucion,
  ContextoEvidencia,
  ContextoMetricas,
  Corte,
  EstadoAsignacion,
  MetricaEjecucion,
  PublicacionEjecucion,
} from "./tipos"

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

const CLAVE_TOLERANCIA = "metricas.tolerancia_cortes"
const CLAVE_PLAZO_CARGA = "metricas.plazo_carga_horas"

interface AsignacionLeida {
  asignacion: AsignacionEjecucion
  ofertaId: string
}

async function leerAsignacion(
  supabase: ClienteUsuario,
  asignacionId: string
): Promise<AsignacionLeida | null> {
  const { data, error } = await supabase.rpc(
    "mis_asignaciones_medio",
    argumentosRpc<"mis_asignaciones_medio">({
      p_id: asignacionId,
      p_limite: 1,
      p_estados: null,
      p_antes_id: null,
    })
  )
  if (error) fallar("leer la campaña", error)
  const fila = data[0]
  if (!fila) return null
  const { data: formato, error: errorFormato } = await supabase
    .from("formatos")
    .select("clave")
    .eq("id", fila.formato_id)
    .maybeSingle()
  if (errorFormato) fallar("leer el formato de la oferta", errorFormato)
  return {
    ofertaId: fila.oferta_id,
    asignacion: {
      id: fila.id,
      estado: fila.estado,
      estadoPrevioDisputa: fila.estado_previo_disputa,
      plataforma: fila.plataforma,
      formatoClave: formato?.clave ?? null,
      formatoNombre: fila.formato_nombre,
      ofertaTitulo: fila.oferta_titulo,
      marca: fila.marca,
      handle: fila.handle,
      publicaciones: fila.publicaciones,
      ventanaInicio: fila.ventana_inicio,
      ventanaFin: fila.ventana_fin,
      contenidoDescargadoAt: fila.contenido_descargado_at,
      fechaLimitePublicacion: fila.fecha_limite_publicacion,
      cortesRequeridos: fila.cortes_requeridos ?? [],
      permanenciaMinimaDias: fila.permanencia_minima_dias,
      reclamoHasta: fila.reclamo_hasta,
    },
  }
}

async function leerPublicaciones(
  supabase: ClienteUsuario,
  asignacionId: string
): Promise<PublicacionEjecucion[]> {
  const { data, error } = await supabase
    .from("publicaciones")
    .select(
      "id, numero, url_post, fecha_publicacion, estado_validacion, observaciones, miniatura_path, updated_at"
    )
    .eq("asignacion_id", asignacionId)
    .order("numero")
  if (error) fallar("leer las publicaciones", error)
  return data.map((fila) => ({
    id: fila.id,
    numero: fila.numero,
    urlPost: fila.url_post,
    fechaPublicacion: fila.fecha_publicacion,
    estado: fila.estado_validacion,
    observaciones: fila.observaciones,
    conMiniatura: fila.miniatura_path !== null,
    actualizadaAt: fila.updated_at,
  }))
}

/**
 * Versión vigente del contenido y la más nueva que el medio descargó (la BD
 * exige, al registrar la evidencia, haber descargado la vigente al publicar).
 */
async function leerContenido(
  supabase: ClienteUsuario,
  asignacionId: string,
  ofertaId: string
): Promise<ContenidoEjecucion> {
  const [versiones, descargas] = await Promise.all([
    supabase
      .from("creativos")
      .select("id, version, vigente, activado_at")
      .eq("oferta_id", ofertaId)
      .not("activado_at", "is", null),
    supabase
      .from("descargas_contenido")
      .select("creativo_id")
      .eq("asignacion_id", asignacionId),
  ])
  if (versiones.error)
    fallar("leer las versiones del contenido", versiones.error)
  if (descargas.error) fallar("leer las descargas", descargas.error)
  const porId = new Map(versiones.data.map((fila) => [fila.id, fila.version]))
  const descargadas = descargas.data
    .map((fila) => porId.get(fila.creativo_id))
    .filter((version): version is number => version !== undefined)
  const vigente = versiones.data.find(
    (fila) => fila.vigente && fila.activado_at
  )
  return {
    vigente:
      vigente?.activado_at != null
        ? { version: vigente.version, activadoAt: vigente.activado_at }
        : null,
    versionDescargada: descargadas.length > 0 ? Math.max(...descargadas) : null,
  }
}

async function leerMetricas(
  supabase: ClienteUsuario,
  publicacionId: string
): Promise<MetricaEjecucion[]> {
  const { data, error } = await supabase
    .from("metricas")
    .select(
      "id, corte, fecha_corte, periodo_desde, periodo_hasta, alcance, impresiones, reproducciones, espectadores_unicos, me_gusta, comentarios, compartidos, guardados, clics_enlace, visitas_perfil, tiempo_promedio_visualizacion_s, porcentaje_reproduccion_completa, estado_validacion, observaciones, miniatura_path"
    )
    .eq("publicacion_id", publicacionId)
    .order("created_at")
  if (error) fallar("leer las métricas", error)
  return data.map((fila) => ({
    id: fila.id,
    corte: fila.corte,
    fechaCorte: fila.fecha_corte,
    periodoDesde: fila.periodo_desde,
    periodoHasta: fila.periodo_hasta,
    valores: valoresDeFila(fila),
    estado: fila.estado_validacion,
    observaciones: notaDeRechazo(fila.estado_validacion, fila.observaciones),
    conMiniatura: fila.miniatura_path !== null,
  }))
}

interface ParametrosMetricas {
  toleranciaCortes: number
  plazoCargaHoras: number
}

/** Parámetros públicos de las métricas; si no se pueden leer, los sembrados. */
const parametrosMetricas = cache(async (): Promise<ParametrosMetricas> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", [CLAVE_TOLERANCIA, CLAVE_PLAZO_CARGA])
  const valores = new Map(error ? [] : data.map((f) => [f.clave, f.valor]))
  const plazo = Number(valores.get(CLAVE_PLAZO_CARGA))
  return {
    toleranciaCortes: leerTolerancia(valores.get(CLAVE_TOLERANCIA)),
    plazoCargaHoras:
      Number.isInteger(plazo) && plazo > 0
        ? plazo
        : PLAZO_CARGA_HORAS_POR_DEFECTO,
  }
})

/**
 * Lo que pinta la evidencia de la publicación pedida (o de la primera que
 * falta). `null` si la asignación no es del medio.
 */
export const contextoEvidencia = cache(
  async (
    asignacionId: string,
    numeroPedido: string | string[] | undefined
  ): Promise<ContextoEvidencia | null> => {
    const supabase = await crearClienteServidor()
    const leida = await leerAsignacion(supabase, asignacionId)
    if (!leida) return null
    const [publicaciones, contenido] = await Promise.all([
      leerPublicaciones(supabase, asignacionId),
      leerContenido(supabase, asignacionId, leida.ofertaId),
    ])
    const numero = elegirNumero(
      numeroPedido,
      leida.asignacion.publicaciones,
      publicaciones
    )
    return {
      asignacion: leida.asignacion,
      numero,
      publicacion: publicaciones.find((p) => p.numero === numero) ?? null,
      publicaciones,
      contenido,
    }
  }
)

/**
 * Lo que pinta un corte de métricas de la publicación pedida: el corte que se
 * corrige (si existe) y los demás, para la coherencia. `null` si la
 * asignación no es del medio.
 */
export const contextoMetricas = cache(
  async (
    asignacionId: string,
    numeroPedido: string | string[] | undefined,
    corte: Corte,
    metricaId: string | null
  ): Promise<ContextoMetricas | null> => {
    const supabase = await crearClienteServidor()
    const leida = await leerAsignacion(supabase, asignacionId)
    if (!leida) return null
    const [publicaciones, parametros] = await Promise.all([
      leerPublicaciones(supabase, asignacionId),
      parametrosMetricas(),
    ])
    const numero = elegirNumero(
      numeroPedido,
      leida.asignacion.publicaciones,
      []
    )
    const publicacion = publicaciones.find((p) => p.numero === numero) ?? null
    const metricas = publicacion
      ? await leerMetricas(supabase, publicacion.id)
      : []
    const metrica = metricaDelCorte(metricas, corte, metricaId)
    return {
      asignacion: leida.asignacion,
      numero,
      publicacion,
      publicaciones,
      corte,
      metrica,
      otros: metricas.filter((otra) => otra.id !== metrica?.id),
      ...parametros,
    }
  }
)

/** Estado de la asignación ahora mismo (después de guardar; sin caché). */
export async function estadoActualAsignacion(
  asignacionId: string
): Promise<EstadoAsignacion | null> {
  const supabase = await crearClienteServidor()
  const leida = await leerAsignacion(supabase, asignacionId)
  return leida?.asignacion.estado ?? null
}
