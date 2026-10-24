/**
 * Fábricas de la fase 4 para las pruebas E2E (el plan está en
 * `validacion-e2e.ts`): asignaciones listas para cada cola del equipo AMO
 * (evidencia pendiente, métrica pendiente con o sin alerta, lista para
 * verificar), disputas con sus mensajes y su resolución, cancelación con
 * causa, suspensión del medio dedicado, una vencida reclamable y la limpieza.
 * Todo por el camino real:
 *
 * - Campañas «Validación E2E…» y ofertas de la empresa con las fábricas de
 *   negocio, dirigidas al medio (`{ paraMedio }`) y con la ventana abierta
 *   cuando hay que cargar cortes.
 * - Lo del medio y lo de la empresa, con la sesión real de su persona: las
 *   `*_srv` con su actor y su sesión, y los mensajes de disputa con su cliente
 *   (RLS) y el adjunto subido a `evidencias/disputa/{id}/…` con esa sesión.
 * - Lo del equipo AMO, con un operador temporal: `validar_evidencia_srv`,
 *   `validar_metrica_srv`, `cancelar_asignacion_srv`, `abrir_disputa_srv` y
 *   `transicionar_srv` (disputas y medios).
 *
 * La única excepción es `vencerAsignacion`: lleva el plazo para publicar al
 * pasado y corre el cron (`private.vencer_asignaciones()`) por la conexión
 * directa de la base LOCAL; contra otra base falla con un mensaje claro.
 * Nada de esto corre en producción.
 */
import postgres from "postgres"

import { argumentosRpc } from "../../src/lib/supabase/rpc"
import type { Database, Json } from "../../src/types/database.types"
import { URL_DB_LOCAL } from "../db/entorno-db"
import {
  conClienteDeUsuario,
  conSesionDeUsuario,
  errorDeApi,
  transicionarComo,
} from "./acciones-actor"
import { ANUNCIANTE_NUEVO_E2E_ID } from "./anunciantes-e2e"
import { pdfDeMuestra } from "./archivos-prueba"
import { imagenPrueba } from "./archivos-e2e"
import { rutasStorage } from "./aprovisionar-medios"
import {
  crearCampana,
  crearOferta,
  type UsuarioAnunciante,
} from "./fabricas-negocio"
import {
  aceptarCon,
  aprobarEvidenciasCon,
  aprobarMetricasCon,
  borrarPauta,
  cargarCon,
  conOperador,
  conSesionMedio,
  entregarCon,
  type EvidenciaPublicada,
  type MedioPauta,
  type MetricaCargada,
  prepararAsignacion,
  publicarCon,
} from "./fabricas-pauta"
import { type FormatoE2E, sufijoUnico } from "./negocio-e2e"
import { ANUNCIANTE_E2E_ID } from "./organizacion"
import {
  type CorteMetrica,
  diasAtrasParaCortes,
  type EtapaPauta,
  horasParaCortes,
} from "./pauta-e2e"
import { exigirFueraDeProduccion } from "./produccion"
import {
  type ClienteSupabase,
  crearClienteServicio,
  type EntornoBootstrap,
  ErrorBootstrap,
} from "./supabase"
import {
  type AlertaDeMetrica,
  type CausaCancelacion,
  type ComoParte,
  esBaseLocal,
  type EstadoAsignacion,
  type EstadoDisputa,
  leerAlerta,
  MOTIVO_RESOLUCION,
  MOTIVO_RESTABLECER_VALIDACION,
  type MotivoDisputa,
  multiploDe,
  planResolucion,
  plazoVencido,
  PREFIJO_VALIDACION,
  reclamoHasta,
  type ResultadoDisputa,
  valoresConAlertaMultiplo,
} from "./validacion-e2e"

type Enums = Database["public"]["Enums"]
type EstadoMedio = Enums["medio_estado"]

const CONTEXTO = "Las fábricas de validación E2E"
/** Las empresas de las pruebas: sus campañas «Validación E2E…» son de estas fábricas. */
const ANUNCIANTES_E2E = [ANUNCIANTE_E2E_ID, ANUNCIANTE_NUEVO_E2E_ID] as const

function fallo(
  accion: string,
  error: { message: string; details?: string | null; hint?: string | null }
): never {
  throw errorDeApi(accion, error)
}

// ── Las partes ───────────────────────────────────────────────────────────────

/**
 * Quiénes actúan en las fábricas: la empresa (crea campañas y ofertas, y es la
 * parte ANUNCIANTE de una disputa) y los medios E2E de los que se conocen las
 * credenciales (el de la asignación es la parte MEDIO).
 */
export interface PartesValidacion {
  empresa: UsuarioAnunciante
  /** Empresa de las campañas (por omisión, «Anunciante E2E»). */
  anuncianteId?: string
  medios: readonly MedioPauta[]
}

function medioDe(partes: PartesValidacion, medioId: string): MedioPauta {
  const medio = partes.medios.find((candidato) => candidato.id === medioId)
  if (!medio) {
    throw new ErrorBootstrap(
      `La asignación es de un medio sin credenciales en las fábricas (${medioId}): usa el Medio E2E o el Medio Suspensión E2E.`
    )
  }
  return medio
}

// ── Campaña y oferta de la validación ────────────────────────────────────────

export interface OpcionesOfertaValidacion {
  /**
   * Prefijo del nombre de la campaña («Validación E2E» por omisión). Un spec
   * de otro proyecto que corre en paralelo usa el de su limpieza: «Pauta E2E»
   * (`PREFIJO_PAUTA`, la limpia `restablecerPautaMedio`) o «Seguimiento E2E»
   * (`PREFIJO_PAUTA_ANUNCIANTE`, la limpia `borrarPauta` con ese prefijo).
   */
  prefijo?: string
  /** Cortes que pide la oferta (por omisión solo H24: la asignación llega rápido a las colas). */
  cortes?: CorteMetrica[]
  /** Publicaciones por medio (1 por omisión). */
  publicaciones?: number
  /** Días de permanencia mínima (1 por omisión: la publicación de hace 25 h ya la cumple). */
  permanenciaDias?: number
  /** Cupos en la franja F1 (2 por omisión). */
  cupos?: number
  formato?: FormatoE2E
  titulo?: string
  /** La ventana abrió hace estos días (por omisión, los que piden sus cortes si hay que cargarlos). */
  diasAtras?: number
}

export interface OfertaDeValidacion {
  ofertaId: string
  ofertaTitulo: string
  campanaId: string
  campanaNombre: string
}

/**
 * Campaña ACTIVA «Validación E2E <sufijo>» (u otro `prefijo`) de la empresa y
 * una oferta PUBLICADA dirigida al medio (su municipio y sus categorías), con
 * la ventana abierta desde hace `diasAtras` días.
 */
export async function crearOfertaValidacion(
  entorno: EntornoBootstrap,
  partes: PartesValidacion,
  medio: MedioPauta,
  opciones: OpcionesOfertaValidacion & { diasAtras: number }
): Promise<OfertaDeValidacion> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const campana = await crearCampana(entorno, partes.empresa, {
    anuncianteId: partes.anuncianteId ?? ANUNCIANTE_E2E_ID,
    nombre: `${opciones.prefijo ?? PREFIJO_VALIDACION} ${sufijoUnico()}`,
    diasAtras: opciones.diasAtras,
  })
  const oferta = await crearOferta(entorno, partes.empresa, {
    campanaId: campana.id,
    estado: "PUBLICADA",
    formato: opciones.formato,
    ventanaDesdeHoy: { diasAtras: opciones.diasAtras },
    segmentacion: { paraMedio: medio.id },
    cortes: opciones.cortes ?? ["H24"],
    publicacionesPorMedio: opciones.publicaciones,
    permanenciaMinimaDias: opciones.permanenciaDias ?? 1,
    cupos: opciones.cupos,
    titulo: opciones.titulo,
  })
  return {
    ofertaId: oferta.id,
    ofertaTitulo: oferta.titulo,
    campanaId: campana.id,
    campanaNombre: campana.nombre,
  }
}

// ── Asignaciones para las colas ──────────────────────────────────────────────

export interface AsignacionDeValidacion extends OfertaDeValidacion {
  asignacionId: string
  medioId: string
  publicaciones: EvidenciaPublicada[]
  metricas: MetricaCargada[]
}

/**
 * Asignación del medio en `hasta` por el camino real (aceptar → descargar →
 * publicar → cortes → validar → verificar), en una oferta «Validación E2E»
 * nueva. Con cortes que cargar, la ventana abre hace los días que piden.
 */
export async function prepararAsignacionValidacion(
  entorno: EntornoBootstrap,
  partes: PartesValidacion,
  medio: MedioPauta,
  opciones: OpcionesOfertaValidacion & { hasta: EtapaPauta }
): Promise<AsignacionDeValidacion> {
  const cortes = opciones.cortes ?? ["H24"]
  const conMetricas =
    opciones.hasta === "METRICAS_CARGADAS" || opciones.hasta === "VERIFICADA"
  const oferta = await crearOfertaValidacion(entorno, partes, medio, {
    ...opciones,
    cortes,
    diasAtras:
      opciones.diasAtras ?? (conMetricas ? diasAtrasParaCortes(cortes) : 0),
  })
  const preparada = await prepararAsignacion(entorno, medio, {
    ofertaId: oferta.ofertaId,
    hasta: opciones.hasta,
  })
  return {
    ...oferta,
    asignacionId: preparada.asignacionId,
    medioId: medio.id,
    publicaciones: preparada.publicaciones,
    metricas: preparada.metricas,
  }
}

/**
 * Cola de evidencias (ADM-007): asignación PUBLICADA con su evidencia
 * PENDIENTE (captura real, etiqueta declarada, publicada hace un minuto).
 */
export async function prepararEvidenciaPendiente(
  entorno: EntornoBootstrap,
  partes: PartesValidacion,
  medio: MedioPauta,
  opciones: OpcionesOfertaValidacion = {}
): Promise<AsignacionDeValidacion> {
  return prepararAsignacionValidacion(entorno, partes, medio, {
    ...opciones,
    hasta: "PUBLICADA",
  })
}

export interface MetricaPendienteDeValidacion extends AsignacionDeValidacion {
  metricaId: string
  /** Lo que registró la BD (el servicio lee las columnas que la sesión no ve). */
  alerta: AlertaDeMetrica
}

async function leerAlertaMetrica(
  servicio: ClienteSupabase,
  metricaId: string
): Promise<AlertaDeMetrica> {
  const { data, error } = await servicio
    .from("metricas")
    .select("alerta_multiplo, alerta_desviacion, detalle_alertas")
    .eq("id", metricaId)
    .single()
  if (error) fallo(`No se pudo leer la alerta de ${metricaId}`, error)
  return leerAlerta(data)
}

async function multiploConfigurado(servicio: ClienteSupabase): Promise<Json> {
  const { data, error } = await servicio
    .from("configuracion")
    .select("valor")
    .eq("clave", "metricas.multiplo_alcance_seguidores")
    .single()
  if (error)
    fallo("No se pudo leer metricas.multiplo_alcance_seguidores", error)
  return data.valor
}

/**
 * Cola de métricas (ADM-008): el corte H24 cargado por el medio (captura
 * real) y PENDIENTE. Con `conAlerta`, su alcance supera el múltiplo de
 * seguidores al aceptar (INT-004: en Instagram, 2 ×). Por omisión la evidencia
 * ya está aprobada (la asignación queda METRICAS_CARGADAS y la métrica se
 * puede aprobar); con `evidenciaAprobada: false` queda PUBLICADA.
 */
export async function prepararMetricaPendiente(
  entorno: EntornoBootstrap,
  partes: PartesValidacion,
  medio: MedioPauta,
  opciones: OpcionesOfertaValidacion & {
    conAlerta?: boolean
    evidenciaAprobada?: boolean
  } = {}
): Promise<MetricaPendienteDeValidacion> {
  const corte: CorteMetrica = "H24"
  const oferta = await crearOfertaValidacion(entorno, partes, medio, {
    ...opciones,
    cortes: [corte],
    diasAtras: opciones.diasAtras ?? diasAtrasParaCortes([corte]),
  })
  const servicio = crearClienteServicio(entorno)
  const multiplos = opciones.conAlerta
    ? await multiploConfigurado(servicio)
    : null
  const avance = await conSesionMedio(entorno, medio, async (sesion) => {
    const aceptacion = await aceptarCon(sesion, { ofertaId: oferta.ofertaId })
    const { asignacionId } = aceptacion
    await entregarCon(sesion, asignacionId)
    const evidencia = await publicarCon(sesion, {
      asignacionId,
      haceHoras: horasParaCortes([corte]),
    })
    let valores
    if (multiplos !== null) {
      const { data, error } = await sesion.servicio
        .from("asignaciones")
        .select("plataforma, seguidores_al_aceptar")
        .eq("id", asignacionId)
        .single()
      if (error) fallo("No se pudo leer la asignación", error)
      if (!data.seguidores_al_aceptar) {
        throw new ErrorBootstrap(
          "La asignación no guardó los seguidores al aceptar: no se puede forzar la alerta."
        )
      }
      valores = valoresConAlertaMultiplo({
        plataforma: data.plataforma,
        corte,
        seguidores: data.seguidores_al_aceptar,
        multiplo: multiploDe(multiplos, data.plataforma),
      })
    }
    const metrica = await cargarCon(sesion, {
      asignacionId,
      corte,
      valores,
    })
    return { asignacionId, evidencia, metrica }
  })
  if (opciones.evidenciaAprobada ?? true) {
    await conOperador(entorno, (sesion) =>
      aprobarEvidenciasCon(sesion, avance.asignacionId)
    )
  }
  const alerta = await leerAlertaMetrica(servicio, avance.metrica.metricaId)
  if (opciones.conAlerta && !alerta.multiplo) {
    throw new ErrorBootstrap(
      "La métrica no quedó con la alerta por múltiplo: revisa metricas.multiplo_alcance_seguidores."
    )
  }
  return {
    ...oferta,
    asignacionId: avance.asignacionId,
    medioId: medio.id,
    publicaciones: [avance.evidencia],
    metricas: [avance.metrica],
    metricaId: avance.metrica.metricaId,
    alerta,
  }
}

export interface ListaParaVerificar extends AsignacionDeValidacion {
  /** Fin de la permanencia mínima de la publicación (la más tardía). */
  permanenciaHasta: Date
  /** `false` si la permanencia aún no se cumple (bloqueo PERMANENCIA en la cola). */
  lista: boolean
}

/**
 * Cola de verificación (ADM-009): METRICAS_CARGADAS con la evidencia y todos
 * los cortes aprobados. Con la permanencia por omisión (1 día) ya se cumplió
 * (la publicación es de hace 25 h) y queda lista; con `permanenciaDias`
 * mayor, aparece bloqueada «Permanencia pendiente hasta {fecha}».
 */
export async function prepararListaParaVerificar(
  entorno: EntornoBootstrap,
  partes: PartesValidacion,
  medio: MedioPauta,
  opciones: OpcionesOfertaValidacion = {}
): Promise<ListaParaVerificar> {
  const asignacion = await prepararAsignacionValidacion(
    entorno,
    partes,
    medio,
    { ...opciones, hasta: "METRICAS_CARGADAS" }
  )
  await conOperador(entorno, (sesion) =>
    aprobarMetricasCon(sesion, { asignacionId: asignacion.asignacionId })
  )
  const { data, error } = await crearClienteServicio(entorno)
    .from("publicaciones")
    .select("permanencia_hasta")
    .eq("asignacion_id", asignacion.asignacionId)
  if (error) fallo("No se pudo leer la permanencia", error)
  const hasta = Math.max(
    ...data.map((fila) => Date.parse(fila.permanencia_hasta ?? ""))
  )
  const permanenciaHasta = new Date(Number.isFinite(hasta) ? hasta : Date.now())
  return {
    ...asignacion,
    permanenciaHasta,
    lista: permanenciaHasta.getTime() <= Date.now(),
  }
}

// ── Disputas ─────────────────────────────────────────────────────────────────

interface FilaAsignacionDisputa {
  medio_id: string
  estado: EstadoAsignacion
  estado_previo_disputa: EstadoAsignacion | null
}

async function leerAsignacionDisputa(
  servicio: ClienteSupabase,
  asignacionId: string
): Promise<FilaAsignacionDisputa> {
  const { data, error } = await servicio
    .from("asignaciones")
    .select("medio_id, estado, estado_previo_disputa")
    .eq("id", asignacionId)
    .single()
  if (error) fallo(`No se pudo leer la asignación ${asignacionId}`, error)
  return data
}

async function asignacionDeDisputa(
  servicio: ClienteSupabase,
  disputaId: string
): Promise<{ asignacionId: string; estado: EstadoDisputa }> {
  const { data, error } = await servicio
    .from("disputas")
    .select("asignacion_id, estado")
    .eq("id", disputaId)
    .single()
  if (error) fallo(`No se pudo leer la disputa ${disputaId}`, error)
  return { asignacionId: data.asignacion_id, estado: data.estado }
}

export interface OpcionesAbrirDisputa {
  asignacionId: string
  como: ComoParte
  motivo: MotivoDisputa
  descripcion: string
}

/**
 * Abre la disputa (`abrir_disputa_srv`) como la parte: el medio de la
 * asignación, la empresa o el equipo AMO. La asignación pasa a EN_DISPUTA.
 * Una vencida solo la reclama el medio (Otro o Incumplimiento) dentro del
 * plazo. Devuelve el id de la disputa.
 */
export async function abrirDisputa(
  entorno: EntornoBootstrap,
  partes: PartesValidacion,
  { asignacionId, como, motivo, descripcion }: OpcionesAbrirDisputa
): Promise<string> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const llamar = async (
    servicio: ClienteSupabase,
    actor: { usuarioId: string; sesionId: string }
  ): Promise<string> => {
    const { data, error } = await servicio.rpc("abrir_disputa_srv", {
      p_asignacion_id: asignacionId,
      p_motivo: motivo,
      p_descripcion: descripcion,
      p_actor_id: actor.usuarioId,
      p_session_id: actor.sesionId,
    })
    if (error) fallo(`No se pudo abrir la disputa sobre ${asignacionId}`, error)
    return data
  }
  switch (como) {
    case "MEDIO": {
      const fila = await leerAsignacionDisputa(
        crearClienteServicio(entorno),
        asignacionId
      )
      return conSesionMedio(entorno, medioDe(partes, fila.medio_id), (sesion) =>
        llamar(sesion.servicio, sesion.actor)
      )
    }
    case "ANUNCIANTE":
      return conSesionDeUsuario(entorno, partes.empresa, (actor) =>
        llamar(crearClienteServicio(entorno, actor.usuarioId), actor)
      )
    case "ADMIN":
      return conOperador(entorno, ({ servicio, operador }) =>
        llamar(servicio, operador)
      )
  }
}

export type AdjuntoDisputa = "imagen" | "pdf"

export interface OpcionesMensajeDisputa {
  disputaId: string
  como: ComoParte
  mensaje: string
  /** Nota interna del equipo AMO («Solo la ve el equipo AMO»): solo `como: "ADMIN"`. */
  interno?: boolean
  /** Adjunto real subido con la sesión de quien escribe (jpeg/png o pdf de muestra). */
  adjunto?: AdjuntoDisputa
}

export interface MensajeDisputaCreado {
  mensajeId: number
  adjuntoPath: string | null
}

function archivoAdjunto(tipo: AdjuntoDisputa): {
  contenido: Buffer
  mime: string
} {
  if (tipo === "pdf") {
    return {
      contenido: pdfDeMuestra([
        "AMO · Soporte de una disputa (pruebas E2E)",
        "Generado por las fábricas de validación. No es un documento real.",
      ]),
      mime: "application/pdf",
    }
  }
  const imagen = imagenPrueba({ ancho: 720, alto: 1280, nombre: "soporte.png" })
  return { contenido: imagen.buffer, mime: imagen.mimeType }
}

async function escribirMensaje(
  cliente: ClienteSupabase,
  { disputaId, mensaje, interno = false, adjunto }: OpcionesMensajeDisputa
): Promise<MensajeDisputaCreado> {
  let adjuntoPath: string | null = null
  if (adjunto) {
    const rutas = rutasStorage()
    const { contenido, mime } = archivoAdjunto(adjunto)
    const destino = rutas.nuevaRuta(
      rutas.carpetaDisputa(disputaId, { interno }),
      mime
    )
    const { error } = await cliente.storage
      .from(destino.bucket)
      .upload(destino.ruta, contenido, { contentType: mime, upsert: false })
    if (error) fallo(`No se pudo subir el adjunto ${destino.ruta}`, error)
    adjuntoPath = destino.ruta
  }
  const { data, error } = await cliente
    .from("disputa_mensajes")
    // `autor_id` y `autor_parte` los sella la BD con la sesión.
    .insert({
      disputa_id: disputaId,
      mensaje,
      adjunto_path: adjuntoPath,
      interno,
    })
    .select("id")
    .single()
  if (error) {
    if (adjuntoPath)
      await cliente.storage.from("evidencias").remove([adjuntoPath])
    fallo(`No se pudo escribir en la disputa ${disputaId}`, error)
  }
  return { mensajeId: data.id, adjuntoPath }
}

/**
 * Un mensaje en el hilo de la disputa con la sesión de la parte (insert con
 * RLS, como la app): el medio, la empresa o el equipo AMO (este también puede
 * dejar notas internas). El aviso a las otras partes y a la cola lo genera la BD.
 */
export async function mensajeDisputa(
  entorno: EntornoBootstrap,
  partes: PartesValidacion,
  opciones: OpcionesMensajeDisputa
): Promise<MensajeDisputaCreado> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  if (opciones.interno && opciones.como !== "ADMIN") {
    throw new RangeError("Solo el equipo AMO deja notas internas.")
  }
  switch (opciones.como) {
    case "MEDIO": {
      const servicio = crearClienteServicio(entorno)
      const { asignacionId } = await asignacionDeDisputa(
        servicio,
        opciones.disputaId
      )
      const fila = await leerAsignacionDisputa(servicio, asignacionId)
      return conClienteDeUsuario(
        entorno,
        medioDe(partes, fila.medio_id).credenciales,
        (cliente) => escribirMensaje(cliente, opciones)
      )
    }
    case "ANUNCIANTE":
      return conClienteDeUsuario(entorno, partes.empresa, (cliente) =>
        escribirMensaje(cliente, opciones)
      )
    case "ADMIN":
      return conOperador(entorno, ({ cliente }) =>
        escribirMensaje(cliente, opciones)
      )
  }
}

/** «Tomar en revisión» (ABIERTA → EN_REVISION, sin motivo). */
export async function tomarDisputa(
  entorno: EntornoBootstrap,
  { disputaId }: { disputaId: string }
): Promise<void> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  await conOperador(entorno, ({ servicio, operador }) =>
    transicionarComo(servicio, operador, {
      entidad: "disputas",
      id: disputaId,
      hacia: "EN_REVISION",
    })
  )
}

export interface OpcionesResolverDisputa {
  disputaId: string
  resultado: ResultadoDisputa
  /** Causa si `resultado` es CANCELAR (ADMINISTRATIVA por omisión). */
  causa?: CausaCancelacion
  /** Motivo de la decisión (por omisión, uno por resultado: `MOTIVO_RESOLUCION`). */
  motivo?: string
  /** Al VERIFICAR con la permanencia aún pendiente: constancia manual. */
  permanenciaVerificada?: boolean
}

export interface DisputaResuelta {
  estadoDisputa: EstadoDisputa
  estadoAsignacion: EstadoAsignacion
  /** Plazo nuevo para la evidencia al REABRIR una vencida. */
  fechaLimitePublicacion: string | null
}

/**
 * El equipo AMO resuelve o descarta la disputa por la máquina de estados, con
 * el destino de la asignación que corresponde al resultado (`planResolucion`).
 */
export async function resolverDisputa(
  entorno: EntornoBootstrap,
  opciones: OpcionesResolverDisputa
): Promise<DisputaResuelta> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const servicio = crearClienteServicio(entorno)
  const { asignacionId } = await asignacionDeDisputa(
    servicio,
    opciones.disputaId
  )
  const fila = await leerAsignacionDisputa(servicio, asignacionId)
  if (fila.estado !== "EN_DISPUTA") {
    throw new ErrorBootstrap(
      `La asignación de la disputa está ${fila.estado}: la disputa ya se resolvió.`
    )
  }
  const resolucion = planResolucion({
    resultado: opciones.resultado,
    estadoPrevio: fila.estado_previo_disputa,
    causa: opciones.causa,
    permanenciaVerificada: opciones.permanenciaVerificada,
  })
  await conOperador(entorno, ({ servicio: comoOperador, operador }) =>
    transicionarComo(
      comoOperador,
      operador,
      { entidad: "disputas", id: opciones.disputaId, hacia: resolucion.hacia },
      {
        motivo: opciones.motivo ?? MOTIVO_RESOLUCION[opciones.resultado],
        datos: resolucion.datos,
      }
    )
  )
  const [disputa, asignacion] = await Promise.all([
    asignacionDeDisputa(servicio, opciones.disputaId),
    servicio
      .from("asignaciones")
      .select("estado, fecha_limite_publicacion")
      .eq("id", asignacionId)
      .single(),
  ])
  if (asignacion.error) fallo("No se pudo leer la asignación", asignacion.error)
  return {
    estadoDisputa: disputa.estado,
    estadoAsignacion: asignacion.data.estado,
    fechaLimitePublicacion: asignacion.data.fecha_limite_publicacion,
  }
}

// ── Cancelación y suspensión ─────────────────────────────────────────────────

export interface CancelacionHecha {
  estado: EstadoAsignacion
  medioSuspendido: boolean
}

/**
 * El equipo AMO cancela la asignación con su causa (`cancelar_asignacion_srv`,
 * ADM-010): libera cupo y presupuesto; con `suspenderMedio` (solo fraude o
 * incumplimiento del medio) suspende al medio en la misma transacción.
 */
export async function cancelarAsignacion(
  entorno: EntornoBootstrap,
  {
    asignacionId,
    causa,
    motivo = "Cancelada por las pruebas E2E del equipo AMO.",
    suspenderMedio = false,
  }: {
    asignacionId: string
    causa: CausaCancelacion
    motivo?: string
    suspenderMedio?: boolean
  }
): Promise<CancelacionHecha> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  return conOperador(entorno, async ({ servicio, operador }) => {
    const { data, error } = await servicio.rpc(
      "cancelar_asignacion_srv",
      argumentosRpc<"cancelar_asignacion_srv">({
        p_asignacion_id: asignacionId,
        p_causa: causa,
        p_motivo: motivo,
        p_suspender_medio: suspenderMedio,
        p_actor_id: operador.usuarioId,
        p_session_id: operador.sesionId,
      })
    )
    if (error) fallo(`No se pudo cancelar la asignación ${asignacionId}`, error)
    const resultado =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? data
        : {}
    return {
      estado: "CANCELADA",
      medioSuspendido: resultado.medio_suspendido === true,
    }
  })
}

async function estadoMedio(
  servicio: ClienteSupabase,
  medioId: string
): Promise<EstadoMedio> {
  const { data, error } = await servicio
    .from("medios")
    .select("estado")
    .eq("id", medioId)
    .single()
  if (error) fallo(`No se pudo leer el medio ${medioId}`, error)
  return data.estado
}

/**
 * Cambia el medio entre VERIFICADO y SUSPENDIDO por la máquina de estados
 * (`medios.suspender`, motivo obligatorio). Si ya está en `hacia` no hace
 * nada. Devuelve si cambió.
 */
export async function cambiarSuspensionMedio(
  entorno: EntornoBootstrap,
  {
    medioId,
    hacia,
    motivo,
  }: { medioId: string; hacia: "SUSPENDIDO" | "VERIFICADO"; motivo: string }
): Promise<boolean> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const actual = await estadoMedio(crearClienteServicio(entorno), medioId)
  if (actual === hacia) return false
  const esperado = hacia === "SUSPENDIDO" ? "VERIFICADO" : "SUSPENDIDO"
  if (actual !== esperado) {
    throw new ErrorBootstrap(
      `El medio está ${actual}: solo se suspende uno VERIFICADO y se reactiva uno SUSPENDIDO.`
    )
  }
  await conOperador(entorno, ({ servicio, operador }) =>
    transicionarComo(
      servicio,
      operador,
      { entidad: "medios", id: medioId, hacia },
      { motivo }
    )
  )
  return true
}

// ── Vencer una asignación (solo la base local) ───────────────────────────────

export interface AsignacionVencida {
  vencidaAt: string
  /** Hasta cuándo el medio puede reclamar (`disputas.plazo_vencida_horas`). */
  reclamoHasta: Date
}

/**
 * Lleva el plazo para publicar al pasado y corre el cron que vence las
 * asignaciones (`private.vencer_asignaciones()`), por la conexión directa de
 * la base LOCAL (la API no deja escribir ese plazo: solo lo cambia la
 * plataforma). La asignación (ACEPTADA o CONTENIDO_ENTREGADO) queda
 * VENCIDA_SIN_PUBLICAR con su aviso y el medio puede reclamarla. Contra otra
 * base lanza sin tocar nada.
 */
export async function vencerAsignacion(
  entorno: EntornoBootstrap,
  { asignacionId }: { asignacionId: string }
): Promise<AsignacionVencida> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  if (!esBaseLocal(entorno.url)) {
    throw new ErrorBootstrap(
      "vencerAsignacionE2E solo funciona contra la base local (`supabase start`): escribe el plazo por la conexión directa de Postgres. Apunta .env.local a la pila local."
    )
  }
  const sql = postgres(URL_DB_LOCAL, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    onnotice: () => {},
    connection: { application_name: "amo-fabricas-e2e" },
  })
  try {
    const filas = await sql<{ id: string }[]>`
      update public.asignaciones
         set fecha_limite_publicacion = ${plazoVencido(new Date())}
       where id = ${asignacionId} and estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO')
      returning id`
    if (filas.length === 0) {
      throw new ErrorBootstrap(
        `La asignación ${asignacionId} no existe o no está ACEPTADA ni CONTENIDO_ENTREGADO: no se puede vencer.`
      )
    }
    await sql`call private.vencer_asignaciones(20, false)`
  } finally {
    await sql.end({ timeout: 5 })
  }
  const servicio = crearClienteServicio(entorno)
  const [{ data, error }, plazo] = await Promise.all([
    servicio
      .from("asignaciones")
      .select("estado, vencida_at")
      .eq("id", asignacionId)
      .single(),
    servicio
      .from("configuracion")
      .select("valor")
      .eq("clave", "disputas.plazo_vencida_horas")
      .single(),
  ])
  if (error) fallo(`No se pudo leer la asignación ${asignacionId}`, error)
  if (plazo.error)
    fallo("No se pudo leer disputas.plazo_vencida_horas", plazo.error)
  const hasta = reclamoHasta(data.vencida_at, Number(plazo.data.valor))
  if (data.estado !== "VENCIDA_SIN_PUBLICAR" || !data.vencida_at || !hasta) {
    throw new ErrorBootstrap(
      `El cron no venció la asignación ${asignacionId} (quedó ${data.estado}): vuelve a intentarlo.`
    )
  }
  return { vencidaAt: data.vencida_at, reclamoHasta: hasta }
}

// ── Limpieza ─────────────────────────────────────────────────────────────────

export interface ValidacionRestablecida {
  campanasBorradas: number
  campanasArchivadas: number
  asignacionesBorradas: number
  disputasCerradas: number
  reclamosCerrados: number
  /** Asignaciones que siguen ahí (canceladas o liquidadas) y por qué. */
  conservadas: { id: string; motivo: string }[]
  /** El medio de suspensión estaba suspendido y se reactivó. */
  medioReactivado: boolean
}

/**
 * Deja la base sin las pruebas de validación anteriores: limpia las campañas
 * «Validación E2E…» de las empresas E2E (`borrarPauta`: borra lo que la BD
 * deja; lo que tiene descargas o mensajes de disputa queda con sus disputas
 * cerradas, cancelado y archivado, y las vencidas aún reclamables se cierran
 * con la sesión de su medio) y, con `medioSuspension`, lo reactiva si quedó
 * suspendido. `servicio` sale de `clienteComoSuperadmin`.
 */
export async function restablecerValidacion(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  {
    medios,
    medioSuspension,
  }: { medios: readonly MedioPauta[]; medioSuspension?: string }
): Promise<ValidacionRestablecida> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const total: ValidacionRestablecida = {
    campanasBorradas: 0,
    campanasArchivadas: 0,
    asignacionesBorradas: 0,
    disputasCerradas: 0,
    reclamosCerrados: 0,
    conservadas: [],
    medioReactivado: false,
  }
  for (const anuncianteId of ANUNCIANTES_E2E) {
    const borrada = await borrarPauta(entorno, servicio, {
      anuncianteId,
      prefijo: PREFIJO_VALIDACION,
      medios,
    })
    total.campanasBorradas += borrada.campanas
    total.campanasArchivadas += borrada.archivadas
    total.asignacionesBorradas += borrada.asignaciones
    total.disputasCerradas += borrada.disputasCerradas
    total.reclamosCerrados += borrada.reclamosCerrados
    total.conservadas.push(...borrada.conservadas)
  }
  // Otro estado que no sea SUSPENDIDO (p. ej. rechazado) lo repara `pnpm bootstrap:e2e`.
  if (
    medioSuspension &&
    (await estadoMedio(servicio, medioSuspension)) === "SUSPENDIDO"
  ) {
    total.medioReactivado = await cambiarSuspensionMedio(entorno, {
      medioId: medioSuspension,
      hacia: "VERIFICADO",
      motivo: MOTIVO_RESTABLECER_VALIDACION,
    })
  }
  return total
}
