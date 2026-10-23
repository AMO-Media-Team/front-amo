import "server-only"

/**
 * Lecturas de «Mis campañas» (MED-011, MED-012). Todo con el cliente del
 * USUARIO: el medio no lee `asignaciones` ni `asignacion_montos` en la tabla
 * base, así que sus asignaciones llegan por `mis_asignaciones_medio` (definer,
 * filtra por `mi_medio_id()` y oculta tarifa, bruto y comisión si la
 * configuración no los deja ver); publicaciones, métricas, descargas y
 * creativos se leen con su RLS. Un error de lectura se lanza y lo recoge el
 * límite de error de la sección; las próximas acciones, las disputas de la
 * asignación y la configuración son de apoyo: si fallan, la pantalla sigue
 * con lo que dice el estado.
 */
import { cache } from "react"

import { disputasDeAsignacion } from "@/features/disputas/queries"
import type { DisputaDetalle } from "@/features/disputas/tipos"
import { medioPropio } from "@/features/mi-medio/queries"
import { clienteSolicitud, fallar } from "@/features/operacion/queries/comun"
import type { Database, Json } from "@/types/database.types"

import { correoDeConfiguracion } from "./contacto"
import {
  interpretarAccion,
  PLAZO_CARGA_HORAS_POR_DEFECTO,
} from "./siguiente-accion"
import { LIMITE_TABLERO } from "./tablero"
import type {
  AccionMedio,
  ArchivoContenido,
  AsignacionMedio,
  CondicionesOferta,
  ContenidoAsignacion,
  Corte,
  DescargaContenido,
  DisputaDeAsignacion,
  EjecucionAsignacion,
  FilaAccionMedio,
  MetricaMedio,
  PublicacionMedio,
  VersionContenido,
} from "./tipos"

type FilaAsignacion =
  Database["public"]["Functions"]["mis_asignaciones_medio"]["Returns"][number]

/** Lo más que devuelve `proximas_acciones_medio`. */
const LIMITE_ACCIONES = 100

const CLAVE_PLAZO_CARGA = "metricas.plazo_carga_horas"
const CLAVE_CORREO_SOPORTE = "soporte.correo"

/** Vencidas por reclamar cuyas disputas se leen de una vez (con holgura). */
const LIMITE_RECLAMABLES = 100

/** Las SRF generan columnas «no nulas» que sí llegan nulas: se normaliza aquí. */
function texto(valor: string | null | undefined): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null
}

function cifra(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null
  const numero = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function comoAsignacion(fila: FilaAsignacion): AsignacionMedio {
  return {
    id: fila.id,
    ofertaId: fila.oferta_id,
    estado: fila.estado,
    estadoPrevioDisputa: fila.estado_previo_disputa ?? null,
    causaCancelacion: fila.causa_cancelacion ?? null,
    motivo: texto(fila.motivo),
    plataforma: fila.plataforma,
    publicaciones: cifra(fila.publicaciones) ?? 1,
    ofertaTitulo: fila.oferta_titulo,
    marca: texto(fila.marca),
    anuncianteNombre: texto(fila.anunciante_nombre),
    formatoId: fila.formato_id,
    formatoNombre: fila.formato_nombre,
    ventanaInicio: fila.ventana_inicio,
    ventanaFin: fila.ventana_fin,
    fechaLimiteAceptacion: fila.fecha_limite_aceptacion,
    cortesRequeridos: (fila.cortes_requeridos ?? []) as Corte[],
    permanenciaMinimaDias: cifra(fila.permanencia_minima_dias) ?? 0,
    handle: texto(fila.handle),
    franjaClave: texto(fila.franja_clave),
    seguidoresAlAceptar: cifra(fila.seguidores_al_aceptar),
    creadaAt: fila.created_at,
    aceptadaAt: texto(fila.aceptada_at),
    contenidoDescargadoAt: texto(fila.contenido_descargado_at),
    publicadaAt: texto(fila.publicada_at),
    evidenciaValidadaAt: texto(fila.evidencia_validada_at),
    metricasCargadasAt: texto(fila.metricas_cargadas_at),
    verificadaAt: texto(fila.verificada_at),
    liquidadaAt: texto(fila.liquidada_at),
    pagadaAt: texto(fila.pagada_at),
    rechazadaAt: texto(fila.rechazada_at),
    vencidaAt: texto(fila.vencida_at),
    enDisputaAt: texto(fila.en_disputa_at),
    canceladaAt: texto(fila.cancelada_at),
    metricasAtrasadasAt: texto(fila.metricas_atrasadas_at),
    fechaLimitePublicacion: fila.fecha_limite_publicacion,
    reclamoHasta: texto(fila.reclamo_hasta),
    creativoDescargadoId: texto(fila.creativo_descargado_id),
    pago: {
      montoMedio: cifra(fila.monto_medio),
      multiplicadorCalidad: cifra(fila.multiplicador_calidad_aplicado),
      tarifaBase: cifra(fila.tarifa_base_aplicada),
      multiplicadorGeografico: cifra(fila.multiplicador_geografico_aplicado),
      multiplicadorExclusividad: cifra(
        fila.multiplicador_exclusividad_aplicado
      ),
      montoBruto: cifra(fila.monto_bruto),
      porcentajeComision: cifra(fila.porcentaje_comision),
      montoComision: cifra(fila.monto_comision),
      montoRetenciones: cifra(fila.monto_retenciones),
      montoNeto: cifra(fila.monto_neto),
    },
  }
}

export interface AsignacionesDelMedio {
  asignaciones: AsignacionMedio[]
  /** `false` si hay más de las que caben en el tablero (las más antiguas). */
  completas: boolean
}

function resumenDisputa(disputa: DisputaDetalle): DisputaDeAsignacion {
  return {
    id: disputa.id,
    estado: disputa.estado,
    parte: disputa.parte,
    estadoOrigen: disputa.estadoOrigen,
    estadoResultante: disputa.estadoResultante,
    creadaAt: disputa.creadaAt,
    resueltaAt: disputa.resueltaAt,
  }
}

/** Una vencida que todavía se puede reclamar (el plazo sigue abierto). */
function esReclamable(asignacion: AsignacionMedio, ahora: number): boolean {
  return (
    asignacion.estado === "VENCIDA_SIN_PUBLICAR" &&
    asignacion.reclamoHasta !== null &&
    Date.parse(asignacion.reclamoHasta) >= ahora
  )
}

/**
 * La disputa más reciente de cada vencida que aún se podría reclamar: una
 * vencida se reclama una sola vez y el tablero no debe ofrecer otro reclamo.
 * Dato de apoyo: si la lectura falla, el tablero sigue (la página de la
 * disputa vuelve a comprobarlo todo).
 */
async function disputasDeReclamables(
  asignaciones: readonly AsignacionMedio[]
): Promise<ReadonlyMap<string, DisputaDeAsignacion>> {
  const ahora = Date.now()
  const ids = asignaciones
    .filter((asignacion) => esReclamable(asignacion, ahora))
    .map((asignacion) => asignacion.id)
    .slice(0, LIMITE_RECLAMABLES)
  if (ids.length === 0) return new Map()
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("disputas")
    .select(
      "id, asignacion_id, estado, parte, estado_asignacion_origen, estado_asignacion_resultante, created_at, fecha_resolucion"
    )
    .in("asignacion_id", ids)
    .order("created_at", { ascending: false })
  if (error) {
    console.error(
      `[mis-campanas] disputas de las vencidas no disponibles (${error.code ?? "sin código"})`
    )
    return new Map()
  }
  const porAsignacion = new Map<string, DisputaDeAsignacion>()
  for (const fila of data) {
    if (porAsignacion.has(fila.asignacion_id)) continue
    porAsignacion.set(fila.asignacion_id, {
      id: fila.id,
      estado: fila.estado,
      parte: fila.parte,
      estadoOrigen: fila.estado_asignacion_origen,
      estadoResultante: fila.estado_asignacion_resultante,
      creadaAt: fila.created_at,
      resueltaAt: fila.fecha_resolucion,
    })
  }
  return porAsignacion
}

/**
 * Las asignaciones aceptadas del medio, de la más reciente a la más antigua.
 * Las vencidas que aún se pueden reclamar traen su disputa (`null` si no la
 * tienen): así el tablero sabe si ya se reclamaron.
 */
export const misAsignaciones = cache(
  async (): Promise<AsignacionesDelMedio> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("mis_asignaciones_medio", {
      p_limite: LIMITE_TABLERO,
    })
    if (error) fallar("consultar tus campañas", error)
    const asignaciones = data.map(comoAsignacion)
    const disputas = await disputasDeReclamables(asignaciones)
    const ahora = Date.now()
    return {
      asignaciones: asignaciones.map((asignacion) =>
        esReclamable(asignacion, ahora)
          ? { ...asignacion, disputa: disputas.get(asignacion.id) ?? null }
          : asignacion
      ),
      completas: data.length < LIMITE_TABLERO,
    }
  }
)

/**
 * La disputa más reciente de la asignación (`disputasDeAsignacion`, la misma
 * consulta memorizada que usa su página). Dato de apoyo: si falla, `undefined`
 * y la ficha decide por el estado.
 */
async function ultimaDisputa(
  asignacionId: string
): Promise<DisputaDeAsignacion | null | undefined> {
  try {
    const [ultima] = await disputasDeAsignacion(asignacionId)
    return ultima ? resumenDisputa(ultima) : null
  } catch {
    console.error("[mis-campanas] disputa de la asignación no disponible")
    return undefined
  }
}

/** Una asignación del medio con su disputa más reciente; `null` si no es suya o no existe. */
export const miAsignacion = cache(
  async (asignacionId: string): Promise<AsignacionMedio | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("mis_asignaciones_medio", {
      p_id: asignacionId,
      p_limite: 1,
    })
    if (error) fallar("consultar la campaña", error)
    const fila = data.at(0)
    if (!fila) return null
    return {
      ...comoAsignacion(fila),
      disputa: await ultimaDisputa(asignacionId),
    }
  }
)

/**
 * ¿El medio está suspendido? (D73: conserva lo que tiene en curso mientras el
 * equipo AMO decide.) Dato de apoyo: si no se puede leer, `false`.
 */
export async function medioSuspendido(
  medioId: string | null
): Promise<boolean> {
  if (!medioId) return false
  try {
    return (await medioPropio(medioId))?.estado === "SUSPENDIDO"
  } catch {
    console.error("[mis-campanas] estado del medio no disponible")
    return false
  }
}

/**
 * Correo de soporte del equipo AMO (`soporte.correo`, pública). `null` si no
 * tiene valor: entonces no se le pide al medio que escriba a ninguna parte.
 */
export const correoSoporte = cache(async (): Promise<string | null> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", CLAVE_CORREO_SOPORTE)
    .maybeSingle()
  return error ? null : correoDeConfiguracion(data?.valor)
})

/**
 * Horas para cargar un corte desde que se cumple (`metricas.plazo_carga_horas`,
 * configuración pública). Si no se puede leer, el valor sembrado.
 */
export const plazoCargaHoras = cache(async (): Promise<number> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", CLAVE_PLAZO_CARGA)
    .maybeSingle()
  const valor = error ? null : cifra(comoCifraJson(data?.valor))
  return valor !== null && valor > 0 ? valor : PLAZO_CARGA_HORAS_POR_DEFECTO
})

function comoCifraJson(valor: Json | undefined): number | string | null {
  return typeof valor === "number" || typeof valor === "string" ? valor : null
}

/**
 * Filas de `proximas_acciones_medio`. Es un dato de apoyo: si el rol no
 * tiene el inicio del medio o la consulta falla, `[]` y cada tarjeta
 * muestra lo que pide su estado.
 */
export const proximasAccionesMedio = cache(
  async (): Promise<FilaAccionMedio[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("proximas_acciones_medio", {
      p_limite: LIMITE_ACCIONES,
    })
    if (error) {
      console.error(
        `[mis-campanas] próximas acciones no disponibles (${error.code ?? "sin código"})`
      )
      return []
    }
    return data.map((fila) => ({
      asignacionId: fila.asignacion_id,
      ofertaTitulo: fila.oferta_titulo,
      accion: fila.accion,
      venceAt: texto(fila.vence_at),
      numero: cifra(fila.numero),
      corte: fila.corte ?? null,
      metricaId: texto(fila.metrica_id),
    }))
  }
)

/**
 * Próximas acciones interpretadas (ruta, etiqueta, desde cuándo) para las
 * asignaciones dadas. Una oferta con varias publicaciones nombra a cuál va
 * cada acción.
 */
export async function accionesDeAsignaciones(
  asignaciones: readonly Pick<AsignacionMedio, "id" | "publicaciones">[]
): Promise<AccionMedio[]> {
  const [filas, plazo] = await Promise.all([
    proximasAccionesMedio(),
    plazoCargaHoras(),
  ])
  const publicaciones = new Map(
    asignaciones.map((asignacion) => [asignacion.id, asignacion.publicaciones])
  )
  return filas.flatMap((fila) => {
    const cantidad = publicaciones.get(fila.asignacionId)
    if (cantidad === undefined) return []
    const accion = interpretarAccion(fila, {
      plazoCargaHoras: plazo,
      variasPublicaciones: cantidad > 1,
    })
    return accion ? [accion] : []
  })
}

// ── Ejecución: publicaciones, métricas y descargas ───────────────────────────

/** Lo que el medio cargó y descargó en la asignación (con su RLS). */
export const ejecucionDeAsignacion = cache(
  async (asignacionId: string): Promise<EjecucionAsignacion> => {
    const supabase = await clienteSolicitud()
    const [publicaciones, metricas, descargas] = await Promise.all([
      supabase
        .from("publicaciones")
        .select(
          "id, numero, url_post, fecha_publicacion, permanencia_hasta, estado_validacion, observaciones, validada_at, created_at, updated_at"
        )
        .eq("asignacion_id", asignacionId)
        .order("numero"),
      supabase
        .from("metricas")
        .select(
          "id, publicacion_id, corte, fecha_corte, periodo_desde, periodo_hasta, estado_validacion, observaciones, validada_at, created_at, updated_at"
        )
        .eq("asignacion_id", asignacionId)
        .order("created_at"),
      leerDescargas(asignacionId),
    ])
    if (publicaciones.error) {
      fallar("consultar tus publicaciones", publicaciones.error)
    }
    if (metricas.error) fallar("consultar tus métricas", metricas.error)
    return {
      publicaciones: publicaciones.data.map((fila): PublicacionMedio => ({
        id: fila.id,
        numero: fila.numero,
        urlPost: fila.url_post,
        fechaPublicacion: fila.fecha_publicacion,
        permanenciaHasta: fila.permanencia_hasta,
        estado: fila.estado_validacion,
        observaciones: texto(fila.observaciones),
        validadaAt: fila.validada_at,
        creadaAt: fila.created_at,
        actualizadaAt: fila.updated_at,
      })),
      metricas: metricas.data.map((fila): MetricaMedio => ({
        id: fila.id,
        publicacionId: fila.publicacion_id,
        corte: fila.corte,
        fechaCorte: fila.fecha_corte,
        periodoDesde: fila.periodo_desde,
        periodoHasta: fila.periodo_hasta,
        estado: fila.estado_validacion,
        observaciones: texto(fila.observaciones),
        validadaAt: fila.validada_at,
        creadaAt: fila.created_at,
        actualizadaAt: fila.updated_at,
      })),
      descargas,
    }
  }
)

/**
 * Descargas registradas, de la primera a la última. La versión sale del
 * creativo, que el medio deja de leer cuando la asignación ya no está en pie
 * (entonces `null`).
 */
const leerDescargas = cache(
  async (asignacionId: string): Promise<DescargaContenido[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("descargas_contenido")
      .select("descargado_at, creativo_id, creativo:creativos ( version )")
      .eq("asignacion_id", asignacionId)
      .order("descargado_at")
    if (error) fallar("consultar tus descargas", error)
    return data.map((fila) => ({
      at: fila.descargado_at,
      creativoId: fila.creativo_id,
      version: fila.creativo?.version ?? null,
    }))
  }
)

// ── Contenido (MED-012) ──────────────────────────────────────────────────────

/**
 * Instrucciones, restricciones y exclusividad de la oferta
 * (`ofertas_para_medio`: el medio no lee `ofertas` en la tabla base; también
 * responde a quien ya tiene la asignación). Es un dato de apoyo: si falla,
 * `null` y la pantalla lo dice sin caerse.
 */
export const condicionesDeOferta = cache(
  async (ofertaId: string): Promise<CondicionesOferta | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("ofertas_para_medio", {
      p_oferta_id: ofertaId,
    })
    const detalle = error ? undefined : data.at(0)
    if (error) {
      console.error(
        `[mis-campanas] condiciones de la oferta no disponibles (${error.code ?? "sin código"})`
      )
    }
    return detalle
      ? {
          instrucciones: texto(detalle.instrucciones),
          restricciones: texto(detalle.restricciones),
          exclusividadDias: cifra(detalle.exclusividad_dias),
        }
      : null
  }
)

const SELECCION_CREATIVO = `
  id, version, tipo, vigente, activado_at, copy_sugerido, hashtags, menciones, enlace_destino,
  archivos:creativo_archivos ( id, mime, tamano_bytes, ancho, alto, duracion_segundos, orden )
`

/**
 * Lo que muestra «Contenido»: las condiciones de la oferta, la versión
 * vigente, la que el medio descargó y sus descargas. Nunca lleva la ruta de
 * los archivos en Storage: el navegador pide cada uno por su id.
 */
export const contenidoDeAsignacion = cache(
  async (
    asignacionId: string,
    ofertaId: string,
    creativoDescargadoId: string | null
  ): Promise<ContenidoAsignacion> => {
    const supabase = await clienteSolicitud()
    const [condiciones, creativos, descargas] = await Promise.all([
      condicionesDeOferta(ofertaId),
      supabase
        .from("creativos")
        .select(SELECCION_CREATIVO)
        .eq("oferta_id", ofertaId)
        .not("activado_at", "is", null)
        .order("version", { ascending: false }),
      leerDescargas(asignacionId),
    ])
    if (creativos.error) fallar("consultar el contenido", creativos.error)
    const versiones = creativos.data.map((fila): VersionContenido => ({
      id: fila.id,
      version: fila.version,
      tipo: fila.tipo,
      activadoAt: fila.activado_at,
      copySugerido: texto(fila.copy_sugerido),
      hashtags: fila.hashtags ?? [],
      menciones: fila.menciones ?? [],
      enlaceDestino: texto(fila.enlace_destino),
      archivos: fila.archivos
        .map((archivo): ArchivoContenido => ({
          id: archivo.id,
          mime: archivo.mime,
          tamanoBytes: archivo.tamano_bytes,
          ancho: archivo.ancho,
          alto: archivo.alto,
          duracionSegundos: cifra(archivo.duracion_segundos),
          orden: archivo.orden,
        }))
        .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id)),
    }))
    const vigente = creativos.data.find((fila) => fila.vigente)
    return {
      condiciones,
      vigente: versiones.find((version) => version.id === vigente?.id) ?? null,
      descargada:
        versiones.find((version) => version.id === creativoDescargadoId) ??
        null,
      descargas,
    }
  }
)
