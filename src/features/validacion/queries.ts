import "server-only"

/**
 * Consultas de la validación (ADM-007, ADM-008, ADM-009), con el cliente del
 * USUARIO (JWT + RLS): las colas son RPC que exigen `evidencias.validar` o
 * `metricas.validar` (y `cola_metricas` lee las alertas, que PostgREST ya no
 * entrega). Las rutas de Storage que traen las colas se quedan aquí: al
 * navegador solo viaja si hay captura que firmar. Un error de lectura se
 * lanza y lo recoge el límite de error de la sección.
 */
import { cache } from "react"

import { valoresDeFila } from "@/features/ejecucion/campos-metricas"
import { leerTolerancia } from "@/features/ejecucion/coherencia"
import { diasDelPeriodo } from "@/features/ejecucion/metricas"
import {
  clienteSolicitud,
  type ErrorConsulta,
  fallar,
} from "@/features/operacion/queries/comun"
import { leerAlerta } from "@/features/operacion/alertas"
import type { Database, Json } from "@/types/database.types"

import {
  type AccesoValidacion,
  desplazamientoDe,
  paginaAcotada,
  TAMANO_PAGINA_VALIDACION,
} from "./colas"
import type {
  AsignacionPorVerificar,
  BloqueoVerificacion,
  ContadoresValidacion,
  EvidenciaEnCola,
  MetricaEnCola,
  MetricaParaCorregir,
  PaginaValidacion,
} from "./tipos"

type Funciones = Database["public"]["Functions"]
type FilaColaEvidencias = Funciones["cola_evidencias"]["Returns"][number]
type FilaColaMetricas = Funciones["cola_metricas"]["Returns"][number]
type FilaColaVerificacion = Funciones["cola_verificacion"]["Returns"][number]

/** `evidencias.plazo_recarga_horas` sembrado: lo que rige si no se puede leer. */
export const PLAZO_RECARGA_HORAS_POR_DEFECTO = 24

const CLAVE_PLAZO_RECARGA = "evidencias.plazo_recarga_horas"
const CLAVE_TOLERANCIA = "metricas.tolerancia_cortes"

/**
 * Las RPC de las colas declaran sus columnas como no nulas (SRF), pero varias
 * llegan `null` (cuenta, marca, observaciones, miniatura…): se leen así.
 */
function texto(valor: string | null | undefined): string | null {
  return typeof valor === "string" && valor !== "" ? valor : null
}

function numero(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null
  const leido = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(leido) ? leido : null
}

type LecturaRpc<T> = PromiseLike<{
  data: T[] | null
  error: ErrorConsulta | null
}>

/**
 * Una página de una cola por RPC (`limit`/`offset` con `count(*) over ()`).
 * Si la pedida ya no existe (otro vació la cola), se cuenta y se pide la
 * última que sí existe.
 */
async function leerPaginaCola<T extends { total: number }>(
  operacion: string,
  pagina: number,
  consultar: (limite: number, desplazamiento: number) => LecturaRpc<T>
): Promise<{ filas: T[]; total: number; pagina: number }> {
  const { data, error } = await consultar(
    TAMANO_PAGINA_VALIDACION,
    desplazamientoDe(pagina)
  )
  if (error) fallar(operacion, error)
  const filas = data ?? []
  if (filas.length > 0 || pagina <= 1) {
    const total = numero(filas[0]?.total) ?? 0
    return { filas, total, pagina: paginaAcotada(pagina, total) }
  }
  const conteo = await consultar(1, 0)
  if (conteo.error) fallar(operacion, conteo.error)
  const total = numero(conteo.data?.[0]?.total) ?? 0
  if (total === 0) return { filas: [], total, pagina: 1 }
  const ultima = paginaAcotada(pagina, total)
  const final = await consultar(
    TAMANO_PAGINA_VALIDACION,
    desplazamientoDe(ultima)
  )
  if (final.error) fallar(operacion, final.error)
  const filasFinales = final.data ?? []
  return {
    filas: filasFinales,
    total: numero(filasFinales[0]?.total) ?? total,
    pagina: ultima,
  }
}

// ── Catálogos y configuración ────────────────────────────────────────────────

interface FormatoCatalogo {
  clave: string
  nombre: string
}

/** Formatos con su clave (`REEL`…): deciden qué cifras pide cada plataforma. */
const formatosPorId = cache(
  async (): Promise<ReadonlyMap<string, FormatoCatalogo>> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("formatos")
      .select("id, clave, nombre")
    if (error) fallar("leer los formatos", error)
    return new Map(
      data.map((formato) => [
        formato.id,
        { clave: formato.clave, nombre: formato.nombre },
      ])
    )
  }
)

async function valoresConfiguracion(
  claves: readonly string[]
): Promise<ReadonlyMap<string, Json>> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", [...claves])
  if (error) fallar("leer la configuración", error)
  return new Map(data.map((fila) => [fila.clave, fila.valor]))
}

/** Horas que tiene el medio para cargar otra evidencia tras un rechazo. */
export const plazoRecargaHoras = cache(async (): Promise<number> => {
  const valores = await valoresConfiguracion([CLAVE_PLAZO_RECARGA])
  const valor = numero(
    valores.get(CLAVE_PLAZO_RECARGA) as number | string | null
  )
  return valor !== null && valor > 0 ? valor : PLAZO_RECARGA_HORAS_POR_DEFECTO
})

// ── Contadores ───────────────────────────────────────────────────────────────

async function contarEvidencias(): Promise<number> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("cola_evidencias", {
    p_limite: 1,
    p_desplazamiento: 0,
  })
  if (error) fallar("contar las evidencias por validar", error)
  return numero(data[0]?.total) ?? 0
}

async function contarMetricas(soloAlertas: boolean): Promise<number> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("cola_metricas", {
    p_solo_alertas: soloAlertas,
    p_limite: 1,
    p_desplazamiento: 0,
  })
  if (error) fallar("contar las métricas por validar", error)
  return numero(data[0]?.total) ?? 0
}

async function contarPorVerificar(): Promise<{
  total: number
  listas: number
}> {
  const supabase = await clienteSolicitud()
  // `listas` y `total` cuentan toda la cola (ventana): basta una fila.
  const { data, error } = await supabase.rpc("cola_verificacion", {
    p_limite: 1,
    p_desplazamiento: 0,
  })
  if (error) fallar("contar las asignaciones por verificar", error)
  return {
    total: numero(data[0]?.total) ?? 0,
    listas: numero(data[0]?.listas) ?? 0,
  }
}

/** Pendientes de cada cola; `null` en las que la persona no atiende. */
export const contadoresValidacion = cache(
  async (acceso: AccesoValidacion): Promise<ContadoresValidacion> => {
    const [evidencias, metricas, conAlerta, verificar] = await Promise.all([
      acceso.evidencias ? contarEvidencias() : null,
      acceso.metricas ? contarMetricas(false) : null,
      acceso.metricas ? contarMetricas(true) : null,
      acceso.metricas ? contarPorVerificar() : null,
    ])
    return {
      evidencias,
      metricas,
      metricasConAlerta: conAlerta,
      verificar: verificar?.total ?? null,
      verificarListas: verificar?.listas ?? null,
    }
  }
)

// ── Cola de evidencias (ADM-007) ─────────────────────────────────────────────

function evidenciaDe(fila: FilaColaEvidencias): EvidenciaEnCola {
  return {
    publicacionId: fila.publicacion_id,
    asignacionId: fila.asignacion_id,
    numero: fila.numero,
    publicaciones: fila.publicaciones,
    plataforma: fila.plataforma,
    formato: texto(fila.formato_nombre),
    urlPost: fila.url_post,
    fechaPublicacion: fila.fecha_publicacion,
    conImagen: texto(fila.captura_path) !== null,
    enviadaAt: fila.enviada_at,
    observacionesPrevias: texto(fila.observaciones_previas),
    etiquetaDeclarada: fila.etiqueta_declarada !== false,
    medio: {
      id: fila.medio_id,
      nombre: fila.medio_nombre,
      handle: texto(fila.handle),
    },
    cuentaUrl: texto(fila.cuenta_url),
    oferta: {
      id: fila.oferta_id,
      titulo: fila.oferta_titulo,
      marca: texto(fila.marca),
    },
    ventanaInicio: fila.ventana_inicio,
    ventanaFin: fila.ventana_fin,
    permanenciaHasta: fila.permanencia_hasta,
    estadoAsignacion: fila.asignacion_estado,
  }
}

/** Evidencias por validar, la cargada (o corregida) hace más tiempo primero. */
export async function colaEvidencias(
  pagina: number
): Promise<PaginaValidacion<EvidenciaEnCola>> {
  const supabase = await clienteSolicitud()
  const resultado = await leerPaginaCola(
    "leer la cola de evidencias",
    pagina,
    (limite, desplazamiento) =>
      supabase.rpc("cola_evidencias", {
        p_limite: limite,
        p_desplazamiento: desplazamiento,
      })
  )
  return {
    total: resultado.total,
    pagina: resultado.pagina,
    filas: resultado.filas.map(evidenciaDe),
  }
}

// ── Cola de métricas (ADM-008) ───────────────────────────────────────────────

const SELECCION_CIFRAS = `
  id, periodo_desde, periodo_hasta, observaciones, alcance, impresiones, reproducciones,
  espectadores_unicos, me_gusta, comentarios, compartidos, guardados, clics_enlace,
  visitas_perfil, tiempo_promedio_visualizacion_s, porcentaje_reproduccion_completa
`

type FilaCifras = Database["public"]["Tables"]["metricas"]["Row"]
type CifrasMetrica = Pick<
  FilaCifras,
  | "id"
  | "periodo_desde"
  | "periodo_hasta"
  | "observaciones"
  | "alcance"
  | "impresiones"
  | "reproducciones"
  | "espectadores_unicos"
  | "me_gusta"
  | "comentarios"
  | "compartidos"
  | "guardados"
  | "clics_enlace"
  | "visitas_perfil"
  | "tiempo_promedio_visualizacion_s"
  | "porcentaje_reproduccion_completa"
>

/** Todas las cifras de las métricas de la página (la cola trae las normalizadas). */
async function cifrasDeMetricas(
  ids: readonly string[]
): Promise<ReadonlyMap<string, CifrasMetrica>> {
  if (ids.length === 0) return new Map()
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("metricas")
    .select(SELECCION_CIFRAS)
    .in("id", [...ids])
  if (error) fallar("leer las cifras de las métricas", error)
  return new Map(
    (data as unknown as CifrasMetrica[]).map((fila) => [fila.id, fila])
  )
}

function periodoDe(
  cifras: CifrasMetrica | undefined
): { desde: string; hasta: string } | null {
  return cifras?.periodo_desde && cifras.periodo_hasta
    ? diasDelPeriodo(cifras.periodo_desde, cifras.periodo_hasta)
    : null
}

function metricaDe(
  fila: FilaColaMetricas,
  cifras: CifrasMetrica | undefined
): MetricaEnCola {
  const valores = valoresDeFila(
    cifras ?? {
      alcance: fila.alcance,
      impresiones: fila.impresiones,
      reproducciones: fila.reproducciones,
      espectadores_unicos: fila.espectadores_unicos,
      clics_enlace: fila.clics_enlace,
    }
  )
  return {
    metricaId: fila.metrica_id,
    publicacionId: fila.publicacion_id,
    asignacionId: fila.asignacion_id,
    numero: fila.numero,
    corte: fila.corte,
    fechaCorte: fila.fecha_corte,
    periodo: periodoDe(cifras),
    plataforma: fila.plataforma,
    formatoClave: texto(fila.formato_clave),
    formato: texto(fila.formato_nombre),
    valores,
    interacciones: numero(fila.interacciones),
    conImagen: texto(fila.captura_path) !== null,
    alerta: leerAlerta(fila),
    evidenciaAprobada: fila.evidencia_aprobada === true,
    enviadaAt: fila.enviada_at,
    observaciones: texto(cifras?.observaciones),
    medio: {
      id: fila.medio_id,
      nombre: fila.medio_nombre,
      handle: texto(fila.handle),
    },
    seguidoresAlAceptar: numero(fila.seguidores_al_aceptar),
    ofertaId: fila.oferta_id,
    ofertaTitulo: fila.oferta_titulo,
    estadoAsignacion: fila.asignacion_estado,
  }
}

/**
 * Métricas por validar: primero las que tienen alerta (también la que la tuvo
 * antes de que el medio la corrigiera), después la cargada hace más tiempo.
 * Con `soloAlertas`, solo esas.
 */
export async function colaMetricas(
  pagina: number,
  soloAlertas: boolean
): Promise<PaginaValidacion<MetricaEnCola>> {
  const supabase = await clienteSolicitud()
  const resultado = await leerPaginaCola(
    "leer la cola de métricas",
    pagina,
    (limite, desplazamiento) =>
      supabase.rpc("cola_metricas", {
        p_solo_alertas: soloAlertas,
        p_limite: limite,
        p_desplazamiento: desplazamiento,
      })
  )
  const cifras = await cifrasDeMetricas(
    resultado.filas.map((fila) => fila.metrica_id)
  )
  return {
    total: resultado.total,
    pagina: resultado.pagina,
    filas: resultado.filas.map((fila) =>
      metricaDe(fila, cifras.get(fila.metrica_id))
    ),
  }
}

// ── Cola de verificación (ADM-009) ───────────────────────────────────────────

function bloqueoDe(valor: string | null): BloqueoVerificacion | null {
  return valor === "METRICAS" || valor === "PERMANENCIA" ? valor : null
}

function porVerificarDe(fila: FilaColaVerificacion): AsignacionPorVerificar {
  return {
    asignacionId: fila.asignacion_id,
    ofertaTitulo: fila.oferta_titulo,
    marca: texto(fila.marca),
    medio: {
      id: fila.medio_id,
      nombre: fila.medio_nombre,
      handle: texto(fila.handle),
    },
    plataforma: fila.plataforma,
    publicaciones: fila.publicaciones,
    metricasCargadasAt: texto(fila.metricas_cargadas_at),
    cortesRequeridos: numero(fila.cortes_requeridos) ?? 0,
    cortesAprobados: numero(fila.cortes_aprobados) ?? 0,
    metricasPendientes: numero(fila.metricas_pendientes) ?? 0,
    metricasConAlerta: numero(fila.metricas_con_alerta) ?? 0,
    permanenciaHasta: texto(fila.permanencia_hasta),
    lista: fila.lista === true,
    bloqueo: bloqueoDe(texto(fila.bloqueo)),
  }
}

/** Asignaciones con todas sus métricas cargadas: las listas primero. */
export async function colaVerificacion(
  pagina: number
): Promise<PaginaValidacion<AsignacionPorVerificar>> {
  const supabase = await clienteSolicitud()
  const resultado = await leerPaginaCola(
    "leer la cola de verificación",
    pagina,
    (limite, desplazamiento) =>
      supabase.rpc("cola_verificacion", {
        p_limite: limite,
        p_desplazamiento: desplazamiento,
      })
  )
  return {
    total: resultado.total,
    pagina: resultado.pagina,
    filas: resultado.filas.map(porVerificarDe),
  }
}

// ── Corrección de una métrica aprobada (ADM-008 c2) ──────────────────────────

const SELECCION_CORRECCION = `
  id, asignacion_id, publicacion_id, corte, plataforma, fecha_corte, periodo_desde,
  periodo_hasta, estado_validacion, alcance, impresiones, reproducciones, espectadores_unicos,
  me_gusta, comentarios, compartidos, guardados, clics_enlace, visitas_perfil,
  tiempo_promedio_visualizacion_s, porcentaje_reproduccion_completa,
  publicacion:publicaciones ( numero, fecha_publicacion ),
  asignacion:asignaciones ( oferta:ofertas ( formato_id ) )
`

/**
 * Lo que necesita la corrección de una métrica (o `null` si no existe o no es
 * visible): sus cifras, la publicación, el formato de la oferta, los demás
 * cortes para la coherencia y la tolerancia configurada. Sirve tanto para
 * abrir el formulario como para revalidarlo en la acción.
 */
export async function metricaParaCorregir(
  metricaId: string
): Promise<{ metrica: MetricaParaCorregir; aprobada: boolean } | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("metricas")
    .select(SELECCION_CORRECCION)
    .eq("id", metricaId)
    .maybeSingle()
  if (error) fallar("leer la métrica a corregir", error)
  if (!data || !data.publicacion) return null

  const [otros, formatos, configuracion] = await Promise.all([
    supabase
      .from("metricas")
      .select(
        "id, corte, estado_validacion, alcance_norm, impresiones_norm, interacciones"
      )
      .eq("publicacion_id", data.publicacion_id)
      .neq("id", data.id),
    formatosPorId(),
    valoresConfiguracion([CLAVE_TOLERANCIA]),
  ])
  if (otros.error) fallar("leer los demás cortes", otros.error)
  const formatoId = data.asignacion?.oferta?.formato_id ?? null
  const formato = formatoId ? formatos.get(formatoId) : undefined

  const metrica: MetricaParaCorregir = {
    metricaId: data.id,
    asignacionId: data.asignacion_id,
    publicacionId: data.publicacion_id,
    numero: data.publicacion.numero,
    corte: data.corte,
    plataforma: data.plataforma,
    formatoClave: formato?.clave ?? null,
    fechaCorte: data.fecha_corte,
    periodo:
      data.periodo_desde && data.periodo_hasta
        ? diasDelPeriodo(data.periodo_desde, data.periodo_hasta)
        : null,
    fechaPublicacion: data.publicacion.fecha_publicacion,
    valores: valoresDeFila(data),
    otros: otros.data.map((fila) => ({
      id: fila.id,
      corte: fila.corte,
      estado: fila.estado_validacion,
      alcance: numero(fila.alcance_norm),
      impresiones: numero(fila.impresiones_norm),
      interacciones: numero(fila.interacciones) ?? 0,
    })),
    tolerancia: leerTolerancia(configuracion.get(CLAVE_TOLERANCIA)),
  }
  return { metrica, aprobada: data.estado_validacion === "APROBADA" }
}

/**
 * Fin de la permanencia que falta cumplir en la asignación (la última de sus
 * publicaciones sin comprobar), para explicar `AMO_PERMANENCIA_PENDIENTE`.
 */
export async function permanenciaPendienteHasta(
  asignacionId: string
): Promise<string | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("publicaciones")
    .select("permanencia_hasta")
    .eq("asignacion_id", asignacionId)
    .is("permanencia_verificada_at", null)
    .order("permanencia_hasta", { ascending: false })
    .limit(1)
  if (error) fallar("leer la permanencia de las publicaciones", error)
  return data[0]?.permanencia_hasta ?? null
}

/** Estado actual de la asignación (o `null` si no existe o no es visible). */
export async function estadoAsignacion(
  asignacionId: string
): Promise<Database["public"]["Enums"]["asignacion_estado"] | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("asignaciones")
    .select("estado")
    .eq("id", asignacionId)
    .maybeSingle()
  if (error) fallar("leer el estado de la asignación", error)
  return data?.estado ?? null
}
