"use server"

/**
 * Server Actions de la ejecución del medio: evidencia de publicación
 * (MED-013, INT-002) y métricas por corte (MED-014, INT-001, INT-005).
 *
 * 1. DAL (`requerirPermiso("asignaciones.ejecutar")`) antes que nada.
 * 2. zod: el MISMO esquema que el formulario, con las reglas de la oferta
 *    leídas de la BD con la sesión (ventana, plataforma, formato, cortes ya
 *    cargados, tolerancia).
 * 3. Escrituras: la evidencia por `registrar_evidencia_srv` con el actor y su
 *    sesión (`contextoDelActor`); las métricas con el cliente del USUARIO
 *    (RLS de `metricas` + triggers de coherencia, captura y bitácora).
 * 4. Las capturas se suben directo a Storage (`prepararCapturaEjecucion` firma
 *    la ruta que construye el servidor) y se verifican antes de guardar la
 *    fila (`archivoPerteneceA` + `confirmarObjeto`). Guardar es idempotente:
 *    un reintento tras perder la respuesta actualiza la misma fila.
 */
import "server-only"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import type {
  ArchivoSubido,
  SubidaPreparada,
  UrlFirmada,
} from "@/lib/archivos/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { validarUrlPost } from "@/lib/redes/url-post"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { firmarDescarga, MENSAJES_DESCARGA } from "@/lib/storage/descargas"
import {
  archivoPerteneceA,
  carpetaEvidencia,
  nuevaRuta,
} from "@/lib/storage/rutas"
import { confirmarObjeto, prepararSubidaFirmada } from "@/lib/storage/subidas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { TablesInsert, TablesUpdate } from "@/types/database.types"

import { filaDeValores } from "./campos-metricas"
import { interpretarErrorEjecucion, MENSAJES_EJECUCION } from "./errores"
import { admiteEnvio, situacionEvidencia } from "./evidencia"
import { admiteGuardar, cortesComparables, situacionMetricas } from "./metricas"
import {
  contextoEvidencia,
  contextoMetricas,
  estadoActualAsignacion,
} from "./queries"
import {
  conReglasEvidencia,
  conReglasMetricas,
  datosMetricas,
  type EntradaConfirmarCaptura,
  type EntradaFirmarMetrica,
  type EntradaFirmarPublicacion,
  type EntradaGuardarMetricas,
  type EntradaPrepararCaptura,
  type EntradaRegistrarEvidencia,
  esquemaConfirmarCaptura,
  esquemaFirmarMetrica,
  esquemaFirmarPublicacion,
  esquemaGuardarMetricas,
  esquemaPrepararCaptura,
  esquemaRegistrarEvidencia,
  fechaPublicacionDe,
  type ReglasEvidencia,
  type TipoCaptura,
} from "./schemas"
import type {
  ContextoMetricas,
  EvidenciaRegistrada,
  MetricaEjecucion,
  MetricaGuardada,
} from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

const PERMISO = "asignaciones.ejecutar"

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[ejecucion] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorEjecucion(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

function falloCaptura(mensaje: string): ResultadoFallo {
  return fallo(mensaje, { captura: [mensaje] })
}

/**
 * La captura es un archivo nuestro de la carpeta de esa asignación (con su
 * miniatura) y el objeto existe con el peso y el tipo declarados.
 */
async function comprobarCaptura(
  supabase: ClienteUsuario,
  asignacionId: string,
  tipo: TipoCaptura,
  captura: ArchivoSubido
): Promise<ResultadoFallo | null> {
  if (!archivoPerteneceA(captura, carpetaEvidencia(asignacionId, tipo))) {
    return falloCaptura(MENSAJES_EJECUCION.capturaAjena)
  }
  const objeto = await confirmarObjeto({
    cliente: supabase,
    bucket: captura.bucket,
    ruta: captura.ruta,
    esperado: { tamano: captura.tamano, tipo: captura.tipo },
  })
  return objeto.ok ? null : falloCaptura(objeto.error)
}

// ── Capturas ─────────────────────────────────────────────────────────────────

/**
 * Firma la subida directa de una captura a
 * `evidencias/asignacion/{id}/{publicacion|metrica}/{uuid}.webp` (y su
 * miniatura). Con la sesión: la política INSERT de Storage exige que la
 * asignación sea del medio y esté en ejecución.
 */
export async function prepararCapturaEjecucion(
  entrada: EntradaPrepararCaptura
): Promise<ResultadoAccion<SubidaPreparada>> {
  const usuario = await requerirPermiso(PERMISO)
  if (!usuario.medioId) return fallo(MENSAJES_EJECUCION.sinMedio)
  const validacion = esquemaPrepararCaptura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { asignacionId, tipo, descripcion } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const destino = nuevaRuta(
      carpetaEvidencia(asignacionId, tipo),
      descripcion.tipo
    )
    return await prepararSubidaFirmada({
      cliente: supabase,
      ...destino,
      miniatura: descripcion.conMiniatura,
    })
  } catch (error) {
    return falloInesperado("prepararCapturaEjecucion", error)
  }
}

/**
 * Confirma que la captura quedó en su carpeta (idempotente por ruta). No
 * guarda nada: la evidencia o el corte la guardan al enviar el formulario.
 */
export async function confirmarCapturaEjecucion(
  entrada: EntradaConfirmarCaptura
): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISO)
  if (!usuario.medioId) return fallo(MENSAJES_EJECUCION.sinMedio)
  const validacion = esquemaConfirmarCaptura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { asignacionId, tipo, captura } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const problema = await comprobarCaptura(
      supabase,
      asignacionId,
      tipo,
      captura
    )
    return problema ?? exito()
  } catch (error) {
    return falloInesperado("confirmarCapturaEjecucion", error)
  }
}

/** URL de corta duración de la captura (o su miniatura) de una publicación. */
export async function firmarCapturaPublicacion(
  entrada: EntradaFirmarPublicacion
): Promise<ResultadoAccion<UrlFirmada>> {
  const usuario = await requerirPermiso(PERMISO)
  if (!usuario.medioId) return fallo(MENSAJES_EJECUCION.sinMedio)
  const validacion = esquemaFirmarPublicacion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("publicaciones")
      .select("captura_path, miniatura_path")
      .eq("id", validacion.data.publicacionId)
      .eq("medio_id", usuario.medioId)
      .maybeSingle()
    if (error) return falloBd("leer captura de publicación", error)
    const ruta = validacion.data.miniatura
      ? (data?.miniatura_path ?? data?.captura_path)
      : data?.captura_path
    if (!ruta) return fallo(MENSAJES_DESCARGA.noEncontrado)
    return await firmarDescarga({
      bucket: "evidencias",
      ruta,
      firmante: { como: "usuario", cliente: supabase },
    })
  } catch (error) {
    return falloInesperado("firmarCapturaPublicacion", error)
  }
}

/** URL de corta duración de la captura (o su miniatura) de un corte. */
export async function firmarCapturaMetrica(
  entrada: EntradaFirmarMetrica
): Promise<ResultadoAccion<UrlFirmada>> {
  const usuario = await requerirPermiso(PERMISO)
  if (!usuario.medioId) return fallo(MENSAJES_EJECUCION.sinMedio)
  const validacion = esquemaFirmarMetrica.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("metricas")
      .select("captura_path, miniatura_path")
      .eq("id", validacion.data.metricaId)
      .eq("medio_id", usuario.medioId)
      .maybeSingle()
    if (error) return falloBd("leer captura de métrica", error)
    const ruta = validacion.data.miniatura
      ? (data?.miniatura_path ?? data?.captura_path)
      : data?.captura_path
    if (!ruta) return fallo(MENSAJES_DESCARGA.noEncontrado)
    return await firmarDescarga({
      bucket: "evidencias",
      ruta,
      firmante: { como: "usuario", cliente: supabase },
    })
  } catch (error) {
    return falloInesperado("firmarCapturaMetrica", error)
  }
}

// ── Evidencia de publicación (MED-013) ───────────────────────────────────────

interface RutasCaptura {
  captura: string
  miniatura: string | null
}

/** La captura nueva (verificada) o, al corregir sin cambiarla, la anterior. */
async function capturaDeEvidencia(
  supabase: ClienteUsuario,
  asignacionId: string,
  nueva: ArchivoSubido | null,
  publicacionId: string | null
): Promise<RutasCaptura | ResultadoFallo> {
  if (nueva) {
    const problema = await comprobarCaptura(
      supabase,
      asignacionId,
      "publicacion",
      nueva
    )
    return problema ?? { captura: nueva.ruta, miniatura: nueva.rutaMiniatura }
  }
  if (!publicacionId) return falloCaptura(MENSAJES_EJECUCION.capturaRequerida)
  const { data, error } = await supabase
    .from("publicaciones")
    .select("captura_path, miniatura_path")
    .eq("id", publicacionId)
    .maybeSingle()
  if (error) return falloBd("leer captura anterior", error)
  return data
    ? { captura: data.captura_path, miniatura: data.miniatura_path }
    : falloCaptura(MENSAJES_EJECUCION.capturaRequerida)
}

/**
 * Registra (o corrige) la evidencia de la publicación N: enlace del post,
 * fecha y hora, captura y la etiqueta de publicidad confirmada. Con la última
 * publicación que faltaba, la asignación pasa a PUBLICADA.
 */
export async function registrarEvidencia(
  entrada: EntradaRegistrarEvidencia
): Promise<ResultadoAccion<EvidenciaRegistrada>> {
  const usuario = await requerirPermiso(PERMISO)
  if (!usuario.medioId) return fallo(MENSAJES_EJECUCION.sinMedio)
  const base = esquemaRegistrarEvidencia.safeParse(entrada)
  if (!base.success) return desdeErrorZod(base.error)
  const { asignacionId, numero } = base.data

  try {
    const contexto = await contextoEvidencia(asignacionId, String(numero))
    if (!contexto || contexto.numero !== numero) {
      return fallo(MENSAJES_EJECUCION.noEncontrada)
    }
    const ahora = new Date()
    const { asignacion, publicacion } = contexto
    if (!admiteEnvio(situacionEvidencia(asignacion, publicacion, ahora))) {
      return fallo(MENSAJES_EJECUCION.evidenciaCerrada)
    }
    // Con la cuenta y la descarga leídas de la BD: un enlace de otra cuenta o
    // una publicación anterior a la descarga no llegan a la RPC.
    const reglas: ReglasEvidencia = {
      plataforma: asignacion.plataforma,
      formato: asignacion.formatoClave,
      cuenta: asignacion.handle,
      ventanaInicio: asignacion.ventanaInicio,
      ventanaFin: asignacion.ventanaFin,
      contenidoDescargadoAt: asignacion.contenidoDescargadoAt,
      ahora,
    }
    const validacion = conReglasEvidencia(
      esquemaRegistrarEvidencia,
      reglas
    ).safeParse(entrada)
    if (!validacion.success) return desdeErrorZod(validacion.error)
    const datos = validacion.data
    const enlace = validarUrlPost(
      reglas.plataforma,
      datos.url,
      reglas.formato,
      reglas.cuenta
    )
    const fechaPublicacion = fechaPublicacionDe(datos)
    if (!enlace.ok || !fechaPublicacion) {
      return fallo(MENSAJE_INESPERADO)
    }

    const supabase = await crearClienteServidor()
    const rutas = await capturaDeEvidencia(
      supabase,
      asignacionId,
      datos.captura,
      publicacion?.id ?? null
    )
    if ("ok" in rutas) return rutas

    const actor = await contextoDelActor(usuario)
    const { data, error } = await actor.admin.rpc(
      "registrar_evidencia_srv",
      argumentosRpc<"registrar_evidencia_srv">({
        p_asignacion_id: asignacionId,
        p_numero: numero,
        p_url: enlace.url,
        p_fecha_publicacion: fechaPublicacion,
        p_captura_path: rutas.captura,
        p_miniatura_path: rutas.miniatura,
        p_etiqueta_confirmada: datos.etiquetaConfirmada,
        p_actor_id: actor.actorId,
        p_session_id: actor.sessionId,
      })
    )
    if (error) return falloBd("registrar evidencia", error)
    return exito({
      publicacionId: data,
      estadoAsignacion: await estadoActualAsignacion(asignacionId),
    })
  } catch (error) {
    return falloInesperado("registrarEvidencia", error)
  }
}

// ── Métricas por corte (MED-014) ─────────────────────────────────────────────

/**
 * El personalizado de ese mismo periodo, si ya existe (reintento de una carga
 * cuya respuesta se perdió, o un periodo repetido).
 */
function personalizadoDelPeriodo(
  contexto: ContextoMetricas,
  desde: string | null,
  hasta: string | null
): MetricaEjecucion | null {
  if (!desde || !hasta) return null
  const igual = (a: string | null, b: string) =>
    a !== null && new Date(a).getTime() === new Date(b).getTime()
  return (
    contexto.otros.find(
      (otra) =>
        otra.corte === "PERSONALIZADO" &&
        igual(otra.periodoDesde, desde) &&
        igual(otra.periodoHasta, hasta)
    ) ?? null
  )
}

/** ¿El personalizado de ese periodo ya guarda ESTA captura (la acción se repitió)? */
async function esReintento(
  supabase: ClienteUsuario,
  metricaId: string,
  captura: ArchivoSubido | null
): Promise<boolean> {
  if (!captura) return false
  const { data, error } = await supabase
    .from("metricas")
    .select("captura_path, estado_validacion")
    .eq("id", metricaId)
    .maybeSingle()
  if (error) return false
  return (
    data?.captura_path === captura.ruta && data.estado_validacion !== "APROBADA"
  )
}

/**
 * Guarda un corte de métricas (nuevo o corrección de uno PENDIENTE o
 * RECHAZADO) con su captura. La BD vuelve a exigir el corte de la oferta, la
 * fecha, la coherencia con los demás cortes y la captura en Storage; con el
 * último corte requerido (y la evidencia validada) la asignación pasa a
 * METRICAS_CARGADAS.
 */
export async function guardarMetricas(
  entrada: EntradaGuardarMetricas
): Promise<ResultadoAccion<MetricaGuardada>> {
  const usuario = await requerirPermiso(PERMISO)
  if (!usuario.medioId) return fallo(MENSAJES_EJECUCION.sinMedio)
  const base = esquemaGuardarMetricas.safeParse(entrada)
  if (!base.success) return desdeErrorZod(base.error)
  const { asignacionId, numero, corte, metricaId } = base.data

  try {
    const contexto = await contextoMetricas(
      asignacionId,
      String(numero),
      corte,
      metricaId
    )
    if (!contexto || contexto.numero !== numero) {
      return fallo(MENSAJES_EJECUCION.noEncontrada)
    }
    const { asignacion, publicacion } = contexto
    if (!publicacion) return fallo(MENSAJES_EJECUCION.sinEvidencia)
    if (metricaId && !contexto.metrica) {
      return fallo(MENSAJES_EJECUCION.noEncontrada)
    }
    const ahora = new Date()
    const situacion = situacionMetricas(
      asignacion,
      publicacion,
      corte,
      contexto.metrica,
      ahora
    )
    if (situacion.tipo === "corte-no-pedido") {
      return fallo(MENSAJES_EJECUCION.corteNoPedido)
    }
    if (!admiteGuardar(situacion)) {
      return fallo(MENSAJES_EJECUCION.metricaCerrada)
    }

    const reglas = {
      plataforma: asignacion.plataforma,
      formato: asignacion.formatoClave,
      corte,
      fechaPublicacion: publicacion.fechaPublicacion,
      otros: cortesComparables(contexto.otros),
      tolerancia: contexto.toleranciaCortes,
      ahora,
    }
    const validacion = conReglasMetricas(
      esquemaGuardarMetricas,
      reglas
    ).safeParse(entrada)
    if (!validacion.success) return desdeErrorZod(validacion.error)
    const datos = datosMetricas(validacion.data, reglas)
    if (!datos) return fallo(MENSAJE_INESPERADO)

    const supabase = await crearClienteServidor()
    const captura = validacion.data.captura
    if (captura) {
      const problema = await comprobarCaptura(
        supabase,
        asignacionId,
        "metrica",
        captura
      )
      if (problema) return problema
    }

    const existente =
      contexto.metrica ??
      personalizadoDelPeriodo(contexto, datos.periodoDesde, datos.periodoHasta)
    if (!existente && !captura) {
      return falloCaptura(MENSAJES_EJECUCION.capturaRequerida)
    }
    if (
      existente &&
      !contexto.metrica &&
      !(await esReintento(supabase, existente.id, captura))
    ) {
      const mensaje = MENSAJES_EJECUCION.intervaloRepetido
      return fallo(mensaje, { periodoDesde: [mensaje] })
    }

    const cambios: TablesUpdate<"metricas"> = {
      fecha_corte: datos.fechaCorte,
      periodo_desde: datos.periodoDesde,
      periodo_hasta: datos.periodoHasta,
      ...filaDeValores(asignacion.plataforma, datos.valores, reglas.formato),
      ...(captura
        ? { captura_path: captura.ruta, miniatura_path: captura.rutaMiniatura }
        : {}),
    }

    let id: string
    if (existente) {
      const { data, error } = await supabase
        .from("metricas")
        .update(cambios)
        .eq("id", existente.id)
        .select("id, estado_validacion")
        .maybeSingle()
      if (error) return falloBd("corregir métricas", error)
      // La RLS ya no deja cambiarla (la revisaron o la asignación avanzó).
      if (!data) return fallo(MENSAJES_EJECUCION.metricaCerrada)
      // Una rechazada vuelve a revisión solo si algo cambió
      // (`fn_metricas_guardar_edicion`): reenviarla igual no es una corrección.
      if (
        existente.estado === "RECHAZADA" &&
        data.estado_validacion === "RECHAZADA"
      ) {
        return fallo(MENSAJES_EJECUCION.correccionSinCambios)
      }
      id = data.id
    } else {
      // `asignacion_id`, `medio_id`, `anunciante_id` y `plataforma` los deriva
      // de la publicación un trigger: el GRANT de INSERT no los incluye.
      const nueva = {
        ...cambios,
        publicacion_id: publicacion.id,
        corte,
      } as TablesInsert<"metricas">
      const { data, error } = await supabase
        .from("metricas")
        .insert(nueva)
        .select("id")
        .single()
      if (error) return falloBd("cargar métricas", error)
      id = data.id
    }
    return exito({
      metricaId: id,
      estadoAsignacion: await estadoActualAsignacion(asignacionId),
    })
  } catch (error) {
    return falloInesperado("guardarMetricas", error)
  }
}
