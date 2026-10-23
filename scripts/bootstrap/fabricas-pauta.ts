/**
 * Fábricas de la pauta del medio para las pruebas E2E (el plan está en
 * `pauta-e2e.ts`): aceptar una oferta, descargar el contenido, publicar la
 * evidencia, cargar métricas y lo que el equipo AMO hace con ellas, todo como
 * lo haría la app:
 *
 * - Lo del medio, con la sesión real de su persona: las `*_srv` (reservar,
 *   rechazar, desistir, descargar, evidencia) con su actor y su sesión, y las
 *   métricas con su cliente (RLS de su rol), como las acciones de la app.
 * - Las capturas son objetos reales en `evidencias/asignacion/{id}/…` (la BD
 *   exige que existan y sean imágenes).
 * - Lo del equipo AMO (aprobar o rechazar evidencias y métricas, verificar,
 *   cancelar) lo hace un operador temporal por `transicionar_srv`.
 *
 * Nada de SQL directo; la limpieza borra con la API de servicio, en orden de
 * dependencias, y libera antes por la máquina de estados los cupos de ofertas
 * que no son de las pruebas. Solo fuera de producción.
 */
import { randomUUID } from "node:crypto"

import { argumentosRpc } from "../../src/lib/supabase/rpc"
import type { Database, Json } from "../../src/types/database.types"
import {
  type ActorConSesion,
  conClienteDeUsuario,
  errorDeApi,
  transicionarComo,
} from "./acciones-actor"
import { ANUNCIANTE_NUEVO_E2E_ID } from "./anunciantes-e2e"
import { imagenPrueba } from "./archivos-e2e"
import { listarArchivos, rutasStorage } from "./aprovisionar-medios"
import { borrarCampanasPorId } from "./fabricas-negocio"
import { conOperadorTemporal } from "./operador-temporal"
import { ANUNCIANTE_E2E_ID } from "./organizacion"
import {
  type AsignacionALimpiar,
  consumeCupo,
  type ContenidoEntregado,
  type CorteMetrica,
  type EtapaPauta,
  fechaCorteE2E,
  fechaPublicacionE2E,
  horasParaCortes,
  identificadorPost,
  leerContenidoEntregado,
  llegaA,
  periodoPersonalizadoE2E,
  planCampanasPauta,
  type PlanLimpiezaPauta,
  planLimpiezaPauta,
  PREFIJO_PAUTA,
  urlPostE2E,
  type ValoresMetrica,
  valoresMetricaE2E,
} from "./pauta-e2e"
import { exigirFueraDeProduccion } from "./produccion"
import { clienteComoSuperadmin } from "./provision-e2e"
import {
  type ClienteSupabase,
  crearClienteServicio,
  type EntornoBootstrap,
  ErrorBootstrap,
} from "./supabase"

type Enums = Database["public"]["Enums"]
type EstadoAsignacion = Enums["asignacion_estado"]
type EstadoValidacion = Enums["validacion_estado"]
type InsertMetrica = Database["public"]["Tables"]["metricas"]["Insert"]
/** Las columnas de `metricas` que el medio puede insertar (permiso por columna). */
type FilaMetricaDelMedio = Omit<
  InsertMetrica,
  "asignacion_id" | "anunciante_id" | "medio_id" | "plataforma"
>

const CONTEXTO = "Las fábricas de pauta E2E"
/** Las empresas de las pruebas: sus campañas «Pauta E2E…» son de la pauta del medio. */
const ANUNCIANTES_E2E = [ANUNCIANTE_E2E_ID, ANUNCIANTE_NUEVO_E2E_ID] as const
const MOTIVO_RESTABLECER = "Restablecimiento de la pauta de pruebas E2E"
/** Captura del panel de estadísticas: vertical, como una del celular. */
const CAPTURA = { ancho: 720, alto: 1280 } as const
const TROZO = 100

/** El medio y la persona que actúa por él (su cuenta E2E). */
export interface MedioPauta {
  id: string
  credenciales: { email: string; password: string }
}

function fallo(
  accion: string,
  error: { message: string; details?: string | null; hint?: string | null }
): never {
  throw errorDeApi(accion, error)
}

function trozos<T>(lista: readonly T[]): T[][] {
  return Array.from({ length: Math.ceil(lista.length / TROZO) }, (_, i) =>
    lista.slice(i * TROZO, (i + 1) * TROZO)
  )
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

/** La sesión del medio abierta una vez para varios pasos. */
interface SesionMedio {
  medioId: string
  actor: ActorConSesion
  /** Con la sesión del medio (RLS de su rol): métricas. */
  cliente: ClienteSupabase
  /** Servicio a nombre del medio: las `*_srv` (revalidan actor y sesión) y las lecturas. */
  servicio: ClienteSupabase
}

/** Ingresa como el medio, ejecuta `accion` y cierra esa sesión. */
async function conSesionMedio<T>(
  entorno: EntornoBootstrap,
  medio: MedioPauta,
  accion: (sesion: SesionMedio) => Promise<T>
): Promise<T> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  return conClienteDeUsuario(entorno, medio.credenciales, (cliente, actor) =>
    accion({
      medioId: medio.id,
      actor,
      cliente,
      servicio: crearClienteServicio(entorno, actor.usuarioId),
    })
  )
}

interface SesionOperador {
  servicio: ClienteSupabase
  operador: ActorConSesion
}

/** Ejecuta `accion` con un operador temporal del equipo AMO (se borra al terminar). */
async function conOperador<T>(
  entorno: EntornoBootstrap,
  accion: (sesion: SesionOperador) => Promise<T>
): Promise<T> {
  const superadmin = await clienteComoSuperadmin(entorno)
  return conOperadorTemporal(entorno, superadmin, (operador) =>
    accion({
      servicio: crearClienteServicio(entorno, operador.usuarioId),
      operador,
    })
  )
}

// ── Capturas ─────────────────────────────────────────────────────────────────

/**
 * Sube una captura PNG real a `evidencias/asignacion/{id}/{tipo}/{uuid}.png`
 * (ruta construida como en la app). Devuelve la ruta.
 */
async function subirCaptura(
  servicio: ClienteSupabase,
  asignacionId: string,
  tipo: "publicacion" | "metrica"
): Promise<string> {
  const rutas = rutasStorage()
  const archivo = imagenPrueba({ ...CAPTURA, nombre: `captura-${tipo}.png` })
  const { bucket, ruta } = rutas.nuevaRuta(
    rutas.carpetaEvidencia(asignacionId, tipo),
    archivo.mimeType
  )
  const { error } = await servicio.storage
    .from(bucket)
    .upload(ruta, archivo.buffer, {
      contentType: archivo.mimeType,
      upsert: false,
    })
  if (error) fallo(`No se pudo subir la captura ${ruta}`, error)
  return ruta
}

/** Si el registro falla, la captura no queda huérfana. */
async function conCaptura<T>(
  servicio: ClienteSupabase,
  ruta: string,
  registrar: () => Promise<T>
): Promise<T> {
  try {
    return await registrar()
  } catch (falla) {
    await servicio.storage.from("evidencias").remove([ruta])
    throw falla
  }
}

// ── Aceptar, rechazar y desistir ─────────────────────────────────────────────

export interface OpcionesAceptar {
  ofertaId: string
  /** Cuenta con la que acepta (por omisión, la verificada de la plataforma con más seguidores). */
  cuentaSocialId?: string
  /** Clave de idempotencia (por omisión, una nueva por intento, como la interfaz). */
  claveIdempotencia?: string
}

export interface AceptacionCreada {
  asignacionId: string
  cuentaSocialId: string
  claveIdempotencia: string
  /** Lo que paga el anunciante (la interfaz del medio no lo muestra si la comisión no es visible). */
  montoBruto: number
  /** Lo que recibe el medio. */
  montoMedio: number
  franjaClave: string
  cuposRestantesFranja: number
}

async function cuentaParaOferta(
  servicio: ClienteSupabase,
  medioId: string,
  ofertaId: string
): Promise<string> {
  const { data: oferta, error } = await servicio
    .from("ofertas")
    .select("plataforma")
    .eq("id", ofertaId)
    .maybeSingle()
  if (error) fallo("No se pudo leer la oferta", error)
  if (!oferta) throw new ErrorBootstrap(`La oferta ${ofertaId} no existe.`)
  const { data: cuentas, error: errorCuentas } = await servicio
    .from("cuentas_sociales")
    .select("id")
    .eq("medio_id", medioId)
    .eq("plataforma", oferta.plataforma)
    .eq("verificada", true)
    .is("deleted_at", null)
    .order("seguidores_verificados", { ascending: false })
    .limit(1)
  if (errorCuentas) fallo("No se pudieron leer las cuentas", errorCuentas)
  const cuenta = cuentas[0]
  if (!cuenta) {
    throw new ErrorBootstrap(
      `El medio no tiene una cuenta verificada de ${oferta.plataforma} para aceptar la oferta.`
    )
  }
  return cuenta.id
}

async function aceptarCon(
  sesion: SesionMedio,
  opciones: OpcionesAceptar
): Promise<AceptacionCreada> {
  const cuentaSocialId =
    opciones.cuentaSocialId ??
    (await cuentaParaOferta(sesion.servicio, sesion.medioId, opciones.ofertaId))
  const claveIdempotencia = opciones.claveIdempotencia ?? randomUUID()
  const { data, error } = await sesion.servicio.rpc("reservar_cupo_srv", {
    p_oferta_id: opciones.ofertaId,
    p_medio_id: sesion.medioId,
    p_cuenta_social_id: cuentaSocialId,
    p_actor_id: sesion.actor.usuarioId,
    p_session_id: sesion.actor.sesionId,
    p_clave_idempotencia: claveIdempotencia,
  })
  if (error) fallo(`No se pudo aceptar la oferta ${opciones.ofertaId}`, error)
  const fila = data[0]
  if (!fila) throw new ErrorBootstrap("La reserva no devolvió la asignación.")
  return {
    asignacionId: fila.asignacion_id,
    cuentaSocialId,
    claveIdempotencia,
    montoBruto: Number(fila.monto_bruto),
    montoMedio: Number(fila.monto_medio),
    franjaClave: fila.franja_clave,
    cuposRestantesFranja: fila.cupos_restantes_franja,
  }
}

/**
 * El medio acepta la oferta con su sesión (`reservar_cupo_srv`): reserva el
 * cupo de su franja y congela el precio. Los errores de la BD llegan con su
 * código (`AMO_SIN_CUPO`, `AMO_YA_ACEPTADA`…) en el mensaje.
 */
export async function aceptarOferta(
  entorno: EntornoBootstrap,
  medio: MedioPauta,
  opciones: OpcionesAceptar
): Promise<AceptacionCreada> {
  return conSesionMedio(entorno, medio, (sesion) =>
    aceptarCon(sesion, opciones)
  )
}

/** «No me interesa» (`rechazar_oferta_srv`): la oferta sale de su listado. Devuelve la fila del rechazo. */
export async function rechazarOferta(
  entorno: EntornoBootstrap,
  medio: MedioPauta,
  { ofertaId, motivo }: { ofertaId: string; motivo?: string }
): Promise<string> {
  return conSesionMedio(entorno, medio, async ({ servicio, actor }) => {
    const { data, error } = await servicio.rpc("rechazar_oferta_srv", {
      p_oferta_id: ofertaId,
      p_actor_id: actor.usuarioId,
      p_session_id: actor.sesionId,
      ...(motivo ? { p_motivo: motivo } : {}),
    })
    if (error) fallo(`No se pudo rechazar la oferta ${ofertaId}`, error)
    return data
  })
}

/** El medio desiste de una asignación aceptada (`desistir_asignacion_srv`, motivo obligatorio). */
export async function desistirAsignacion(
  entorno: EntornoBootstrap,
  medio: MedioPauta,
  { asignacionId, motivo }: { asignacionId: string; motivo: string }
): Promise<void> {
  await conSesionMedio(entorno, medio, (sesion) =>
    desistirCon(sesion, asignacionId, motivo)
  )
}

async function desistirCon(
  { servicio, actor }: SesionMedio,
  asignacionId: string,
  motivo: string
): Promise<void> {
  const { error } = await servicio.rpc("desistir_asignacion_srv", {
    p_asignacion_id: asignacionId,
    p_actor_id: actor.usuarioId,
    p_session_id: actor.sesionId,
    p_motivo: motivo,
  })
  if (error) fallo(`No se pudo desistir de ${asignacionId}`, error)
}

// ── Contenido, evidencia y métricas ──────────────────────────────────────────

async function entregarCon(
  { servicio, actor }: SesionMedio,
  asignacionId: string
): Promise<ContenidoEntregado> {
  const { data, error } = await servicio.rpc("registrar_descarga_srv", {
    p_asignacion_id: asignacionId,
    p_actor_id: actor.usuarioId,
    p_session_id: actor.sesionId,
  })
  if (error)
    fallo(`No se pudo descargar el contenido de ${asignacionId}`, error)
  return leerContenidoEntregado(data)
}

/**
 * El medio descarga el contenido (`registrar_descarga_srv`): la asignación
 * pasa a CONTENIDO_ENTREGADO la primera vez y queda registrada la versión
 * descargada. Devuelve el creativo vigente.
 */
export async function entregarContenido(
  entorno: EntornoBootstrap,
  medio: MedioPauta,
  { asignacionId }: { asignacionId: string }
): Promise<ContenidoEntregado> {
  return conSesionMedio(entorno, medio, (sesion) =>
    entregarCon(sesion, asignacionId)
  )
}

export interface OpcionesEvidencia {
  asignacionId: string
  /** Publicación (1 por omisión). */
  numero?: number
  /**
   * Hace cuántas horas se publicó (0 por omisión). Para cargar un corte, al
   * menos sus horas (H24 → 25): la ventana de la oferta debe haber abierto
   * antes (`ventanaDesdeHoy: { diasAtras }`).
   */
  haceHoras?: number
  /** URL del post (por omisión, una única con la forma de la plataforma y el formato). */
  url?: string
}

export interface EvidenciaPublicada {
  publicacionId: string
  numero: number
  url: string
  fechaPublicacion: Date
  capturaPath: string
}

async function publicarCon(
  sesion: SesionMedio,
  opciones: OpcionesEvidencia
): Promise<EvidenciaPublicada> {
  const { asignacionId, numero = 1, haceHoras = 0 } = opciones
  const { data: asignacion, error } = await sesion.servicio
    .from("asignaciones")
    .select(
      "plataforma, oferta:ofertas ( ventana_inicio, ventana_fin, formato:formatos ( clave ) ), cuenta:cuentas_sociales ( handle )"
    )
    .eq("id", asignacionId)
    .single()
  if (error) fallo(`No se pudo leer la asignación ${asignacionId}`, error)
  const { oferta, cuenta } = asignacion
  const fechaPublicacion = fechaPublicacionE2E({
    ahora: new Date(),
    haceHoras,
    ventana: {
      inicio: new Date(oferta.ventana_inicio),
      fin: new Date(oferta.ventana_fin),
    },
  })
  const url =
    opciones.url ??
    urlPostE2E({
      plataforma: asignacion.plataforma,
      formato: oferta.formato.clave,
      handle: cuenta?.handle ?? "medio.e2e",
      id: identificadorPost(),
    })
  const capturaPath = await subirCaptura(
    sesion.servicio,
    asignacionId,
    "publicacion"
  )
  const publicacionId = await conCaptura(
    sesion.servicio,
    capturaPath,
    async () => {
      const { data, error: errorEvidencia } = await sesion.servicio.rpc(
        "registrar_evidencia_srv",
        argumentosRpc<"registrar_evidencia_srv">({
          p_asignacion_id: asignacionId,
          p_numero: numero,
          p_url: url,
          p_fecha_publicacion: fechaPublicacion.toISOString(),
          p_captura_path: capturaPath,
          p_miniatura_path: null,
          p_etiqueta_confirmada: true,
          p_actor_id: sesion.actor.usuarioId,
          p_session_id: sesion.actor.sesionId,
        })
      )
      if (errorEvidencia) {
        fallo(
          `No se pudo registrar la evidencia ${numero} de ${asignacionId}`,
          errorEvidencia
        )
      }
      return data
    }
  )
  return { publicacionId, numero, url, fechaPublicacion, capturaPath }
}

/**
 * El medio carga la evidencia de una publicación (`registrar_evidencia_srv`):
 * URL del post, fecha dentro de la ventana, captura real subida y la etiqueta
 * de publicidad confirmada. Con todas las publicaciones, la asignación pasa a
 * PUBLICADA. También corrige una evidencia rechazada.
 */
export async function publicarEvidencia(
  entorno: EntornoBootstrap,
  medio: MedioPauta,
  opciones: OpcionesEvidencia
): Promise<EvidenciaPublicada> {
  return conSesionMedio(entorno, medio, (sesion) =>
    publicarCon(sesion, opciones)
  )
}

export interface OpcionesMetrica {
  asignacionId: string
  /** Publicación (1 por omisión). */
  numero?: number
  corte: CorteMetrica
  /** Valores a probar (el resto, coherentes con la plataforma y el corte). */
  valores?: Partial<ValoresMetrica>
  /** Fecha del corte (por omisión, ahora; debe haberse cumplido el corte). */
  fechaCorte?: Date
  /** Solo PERSONALIZADO (por omisión, del día de la publicación a la fecha del corte). */
  periodo?: { desde: Date; hasta: Date }
}

export interface MetricaCargada {
  metricaId: string
  publicacionId: string
  corte: CorteMetrica
  fechaCorte: Date
  valores: ValoresMetrica
  capturaPath: string
}

async function cargarCon(
  sesion: SesionMedio,
  opciones: OpcionesMetrica
): Promise<MetricaCargada> {
  const { asignacionId, numero = 1, corte } = opciones
  const { data: publicacion, error } = await sesion.servicio
    .from("publicaciones")
    .select("id, fecha_publicacion, plataforma")
    .eq("asignacion_id", asignacionId)
    .eq("numero", numero)
    .maybeSingle()
  if (error) fallo("No se pudo leer la publicación", error)
  if (!publicacion) {
    throw new ErrorBootstrap(
      `La publicación ${numero} de ${asignacionId} no tiene evidencia: publícala primero.`
    )
  }
  const fechaPublicacion = new Date(publicacion.fecha_publicacion)
  const fechaCorte = fechaCorteE2E({
    ahora: new Date(),
    fechaPublicacion,
    corte,
    fechaCorte: opciones.fechaCorte,
  })
  const periodo =
    corte === "PERSONALIZADO"
      ? (opciones.periodo ??
        periodoPersonalizadoE2E(fechaPublicacion, fechaCorte))
      : null
  const valores = valoresMetricaE2E(
    publicacion.plataforma,
    corte,
    opciones.valores
  )
  const capturaPath = await subirCaptura(
    sesion.servicio,
    asignacionId,
    "metrica"
  )
  const metricaId = await conCaptura(sesion.servicio, capturaPath, async () => {
    const fila: FilaMetricaDelMedio = {
      ...valores,
      publicacion_id: publicacion.id,
      corte,
      fecha_corte: fechaCorte.toISOString(),
      periodo_desde: periodo?.desde.toISOString() ?? null,
      periodo_hasta: periodo?.hasta.toISOString() ?? null,
      captura_path: capturaPath,
    }
    const { data, error: errorMetrica } = await sesion.cliente
      .from("metricas")
      // La BD deriva asignación, empresa, medio y plataforma de la publicación
      // (el medio no tiene permiso para escribirlas); el tipo generado las pide.
      .insert(fila as InsertMetrica)
      .select("id")
      .single()
    if (errorMetrica) {
      fallo(
        `No se pudo cargar el corte ${corte} de ${asignacionId}`,
        errorMetrica
      )
    }
    return data.id
  })
  return {
    metricaId,
    publicacionId: publicacion.id,
    corte,
    fechaCorte,
    valores,
    capturaPath,
  }
}

/**
 * El medio carga un corte de métricas con su sesión (insert con RLS, como la
 * app): valores coherentes con la plataforma, captura real subida y la fecha
 * del corte ya cumplida. Con todos los cortes de una asignación con la
 * evidencia validada, pasa a METRICAS_CARGADAS.
 */
export async function cargarMetrica(
  entorno: EntornoBootstrap,
  medio: MedioPauta,
  opciones: OpcionesMetrica
): Promise<MetricaCargada> {
  return conSesionMedio(entorno, medio, (sesion) => cargarCon(sesion, opciones))
}

// ── Lo que hace el equipo AMO ────────────────────────────────────────────────

async function aprobarEvidenciasCon(
  { servicio, operador }: SesionOperador,
  asignacionId: string
): Promise<void> {
  const { data, error } = await servicio
    .from("asignaciones")
    .select(
      "estado, publicaciones, filas:publicaciones ( id, estado_validacion )"
    )
    .eq("id", asignacionId)
    .single()
  if (error) fallo(`No se pudo leer la asignación ${asignacionId}`, error)
  const pendientes = data.filas.filter(
    (fila) => fila.estado_validacion === "PENDIENTE"
  )
  for (const publicacion of pendientes) {
    await transicionarComo(
      servicio,
      operador,
      { entidad: "publicaciones", id: publicacion.id, hacia: "APROBADA" },
      { datos: { etiqueta_verificada: true } }
    )
  }
  const aprobadas = data.filas.filter(
    (fila) =>
      fila.estado_validacion === "APROBADA" ||
      fila.estado_validacion === "PENDIENTE"
  ).length
  if (data.estado === "PUBLICADA" && aprobadas >= (data.publicaciones ?? 1)) {
    await transicionarComo(servicio, operador, {
      entidad: "asignaciones",
      id: asignacionId,
      hacia: "EVIDENCIA_VALIDADA",
    })
  }
}

/**
 * El equipo AMO aprueba las evidencias pendientes (etiqueta de publicidad
 * verificada) y, con todas aprobadas, valida la asignación
 * (EVIDENCIA_VALIDADA; si ya tiene todos los cortes, METRICAS_CARGADAS).
 */
export async function validarEvidencia(
  entorno: EntornoBootstrap,
  { asignacionId }: { asignacionId: string }
): Promise<void> {
  await conOperador(entorno, (sesion) =>
    aprobarEvidenciasCon(sesion, asignacionId)
  )
}

/**
 * El equipo AMO rechaza la evidencia de una publicación con sus observaciones;
 * si la asignación ya estaba PUBLICADA vuelve a CONTENIDO_ENTREGADO para que
 * el medio la corrija (próxima acción CORREGIR_EVIDENCIA).
 */
export async function rechazarEvidencia(
  entorno: EntornoBootstrap,
  {
    asignacionId,
    numero = 1,
    observaciones,
  }: { asignacionId: string; numero?: number; observaciones: string }
): Promise<void> {
  await conOperador(entorno, async ({ servicio, operador }) => {
    const [publicacion, asignacion] = await Promise.all([
      servicio
        .from("publicaciones")
        .select("id")
        .eq("asignacion_id", asignacionId)
        .eq("numero", numero)
        .single(),
      servicio
        .from("asignaciones")
        .select("estado")
        .eq("id", asignacionId)
        .single(),
    ])
    if (publicacion.error)
      fallo("No se pudo leer la publicación", publicacion.error)
    if (asignacion.error)
      fallo("No se pudo leer la asignación", asignacion.error)
    await transicionarComo(
      servicio,
      operador,
      { entidad: "publicaciones", id: publicacion.data.id, hacia: "RECHAZADA" },
      { motivo: observaciones, datos: { observaciones } }
    )
    if (asignacion.data.estado === "PUBLICADA") {
      await transicionarComo(
        servicio,
        operador,
        {
          entidad: "asignaciones",
          id: asignacionId,
          hacia: "CONTENIDO_ENTREGADO",
        },
        { motivo: observaciones }
      )
    }
  })
}

async function metricasPendientes(
  servicio: ClienteSupabase,
  filtro: { metricaId: string } | { asignacionId: string }
): Promise<string[]> {
  let consulta = servicio
    .from("metricas")
    .select("id")
    .eq("estado_validacion", "PENDIENTE" satisfies EstadoValidacion)
  consulta =
    "metricaId" in filtro
      ? consulta.eq("id", filtro.metricaId)
      : consulta.eq("asignacion_id", filtro.asignacionId)
  const { data, error } = await consulta
  if (error) fallo("No se pudieron leer las métricas", error)
  return data.map((fila) => fila.id)
}

async function aprobarMetricasCon(
  { servicio, operador }: SesionOperador,
  filtro: { metricaId: string } | { asignacionId: string }
): Promise<number> {
  const ids = await metricasPendientes(servicio, filtro)
  for (const id of ids) {
    await transicionarComo(servicio, operador, {
      entidad: "metricas",
      id,
      hacia: "APROBADA",
    })
  }
  return ids.length
}

/**
 * El equipo AMO aprueba una métrica (o todas las pendientes de una
 * asignación). Exige la evidencia de su publicación aprobada. Devuelve
 * cuántas aprobó.
 */
export async function aprobarMetrica(
  entorno: EntornoBootstrap,
  filtro: { metricaId: string } | { asignacionId: string }
): Promise<number> {
  return conOperador(entorno, (sesion) => aprobarMetricasCon(sesion, filtro))
}

/** El equipo AMO rechaza una métrica con sus observaciones: el medio la corrige (CORREGIR_METRICAS). */
export async function rechazarMetrica(
  entorno: EntornoBootstrap,
  { metricaId, observaciones }: { metricaId: string; observaciones: string }
): Promise<void> {
  await conOperador(entorno, ({ servicio, operador }) =>
    transicionarComo(
      servicio,
      operador,
      { entidad: "metricas", id: metricaId, hacia: "RECHAZADA" },
      { motivo: observaciones, datos: { observaciones } }
    )
  )
}

async function verificarCon(
  { servicio, operador }: SesionOperador,
  asignacionId: string
): Promise<void> {
  await transicionarComo(
    servicio,
    operador,
    { entidad: "asignaciones", id: asignacionId, hacia: "VERIFICADA" },
    {
      motivo: "Permanencia verificada por las pruebas E2E",
      datos: { permanencia_verificada: true },
    }
  )
}

/**
 * El equipo AMO verifica la asignación (METRICAS_CARGADAS → VERIFICADA, la
 * puerta a la liquidación): exige todas las métricas aprobadas; la
 * permanencia se da por verificada con motivo.
 */
export async function verificarAsignacion(
  entorno: EntornoBootstrap,
  { asignacionId }: { asignacionId: string }
): Promise<void> {
  await conOperador(entorno, (sesion) => verificarCon(sesion, asignacionId))
}

// ── Una asignación en el estado que pida la prueba ───────────────────────────

export interface AsignacionPreparada {
  asignacionId: string
  aceptacion: AceptacionCreada
  contenido: ContenidoEntregado | null
  publicaciones: EvidenciaPublicada[]
  metricas: MetricaCargada[]
}

/**
 * Acepta la oferta y avanza la asignación hasta `hasta` por el camino real:
 * descarga, evidencia de cada publicación (con fecha pasada si hay que cargar
 * cortes), cortes que pide la oferta, validación del equipo AMO y
 * verificación. Para METRICAS_CARGADAS o VERIFICADA la ventana de la oferta
 * debe haber abierto hace los días que piden sus cortes
 * (`diasAtrasParaCortes`). Una sola sesión del medio y, si hace falta, un
 * solo operador temporal.
 */
export async function prepararAsignacion(
  entorno: EntornoBootstrap,
  medio: MedioPauta,
  opciones: OpcionesAceptar & { hasta: EtapaPauta }
): Promise<AsignacionPreparada> {
  const { hasta } = opciones
  const conMetricas = llegaA(hasta, "METRICAS_CARGADAS")
  const avance = await conSesionMedio(entorno, medio, async (sesion) => {
    const aceptacion = await aceptarCon(sesion, opciones)
    const { asignacionId } = aceptacion
    const contenido = llegaA(hasta, "CONTENIDO_ENTREGADO")
      ? await entregarCon(sesion, asignacionId)
      : null
    const publicaciones: EvidenciaPublicada[] = []
    const metricas: MetricaCargada[] = []
    if (llegaA(hasta, "PUBLICADA")) {
      const { data: oferta, error } = await sesion.servicio
        .from("ofertas")
        .select("publicaciones_por_medio, cortes_requeridos")
        .eq("id", opciones.ofertaId)
        .single()
      if (error) fallo("No se pudo leer la oferta", error)
      const haceHoras = conMetricas
        ? horasParaCortes(oferta.cortes_requeridos)
        : 0
      for (let numero = 1; numero <= oferta.publicaciones_por_medio; numero++) {
        publicaciones.push(
          await publicarCon(sesion, { asignacionId, numero, haceHoras })
        )
      }
      // Los cortes se cargan antes de validar la evidencia: al validarla, la
      // asignación pasa sola a METRICAS_CARGADAS.
      if (conMetricas) {
        for (const publicacion of publicaciones) {
          for (const corte of oferta.cortes_requeridos) {
            metricas.push(
              await cargarCon(sesion, {
                asignacionId,
                numero: publicacion.numero,
                corte,
              })
            )
          }
        }
      }
    }
    return { asignacionId, aceptacion, contenido, publicaciones, metricas }
  })
  if (llegaA(hasta, "EVIDENCIA_VALIDADA")) {
    await conOperador(entorno, async (sesion) => {
      await aprobarEvidenciasCon(sesion, avance.asignacionId)
      if (llegaA(hasta, "VERIFICADA")) {
        await aprobarMetricasCon(sesion, { asignacionId: avance.asignacionId })
        await verificarCon(sesion, avance.asignacionId)
      }
    })
  }
  return avance
}

// ── Limpieza ─────────────────────────────────────────────────────────────────

async function idsDonde(
  servicio: ClienteSupabase,
  tabla: "asignaciones" | "disputas",
  columna: string,
  valores: readonly string[]
): Promise<string[]> {
  const ids: string[] = []
  for (const trozo of trozos(valores)) {
    const { data, error } = await servicio
      .from(tabla)
      .select("id")
      .in(columna, trozo)
    if (error) fallo(`No se pudo leer ${tabla}`, error)
    ids.push(...data.map((fila) => fila.id))
  }
  return ids
}

/** Asignaciones con descargas registradas (la BD no deja borrarlas). */
async function conDescargas(
  servicio: ClienteSupabase,
  asignacionIds: readonly string[]
): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const trozo of trozos(asignacionIds)) {
    const { data, error } = await servicio
      .from("descargas_contenido")
      .select("asignacion_id")
      .in("asignacion_id", trozo)
    if (error) fallo("No se pudieron leer las descargas", error)
    for (const fila of data) ids.add(fila.asignacion_id)
  }
  return ids
}

async function borrarArchivosDe(
  servicio: ClienteSupabase,
  carpetas: readonly string[]
): Promise<void> {
  for (const carpeta of carpetas) {
    const rutas = await listarArchivos(servicio, "evidencias", carpeta)
    for (const trozo of trozos(rutas)) {
      const { error } = await servicio.storage.from("evidencias").remove(trozo)
      if (error) {
        fallo(`No se pudieron borrar los archivos de ${carpeta}`, error)
      }
    }
  }
}

type TablaLimpiable =
  "disputas" | "metricas" | "publicaciones" | "asignaciones" | "notificaciones"

/**
 * Borra asignaciones SIN descargas con lo que cuelga de ellas (capturas,
 * disputas, métricas, publicaciones, montos, avisos), en orden de
 * dependencias. No toca contadores: quien llama libera antes los cupos o borra
 * la campaña entera.
 */
export async function borrarAsignaciones(
  servicio: ClienteSupabase,
  ids: readonly string[]
): Promise<number> {
  if (ids.length === 0) return 0
  // Antes de borrar nada: a medias quedaría una asignación sin sus publicaciones.
  const descargadas = await conDescargas(servicio, ids)
  if (descargadas.size > 0) {
    throw new ErrorBootstrap(
      `${descargadas.size} asignación(es) tienen descargas: la BD no deja borrarlas (cancélalas).`
    )
  }
  const disputas = await idsDonde(servicio, "disputas", "asignacion_id", ids)
  await borrarArchivosDe(servicio, [
    ...ids.map((id) => `asignacion/${id}`),
    ...disputas.map((id) => `disputa/${id}`),
  ])
  const pasos: {
    tabla: TablaLimpiable
    columna: string
    valores: readonly string[]
  }[] = [
    { tabla: "disputas", columna: "id", valores: disputas },
    { tabla: "metricas", columna: "asignacion_id", valores: ids },
    { tabla: "publicaciones", columna: "asignacion_id", valores: ids },
    { tabla: "asignaciones", columna: "id", valores: ids },
    {
      tabla: "notificaciones",
      columna: "entidad_id",
      valores: [...ids, ...disputas],
    },
  ]
  for (const { tabla, columna, valores } of pasos) {
    for (const trozo of trozos(valores)) {
      const { error } = await servicio.from(tabla).delete().in(columna, trozo)
      if (error) fallo(`No se pudo limpiar ${tabla}`, error)
    }
  }
  return ids.length
}

/** Cancela asignaciones (el equipo AMO, causa administrativa): libera su cupo. */
async function cancelarCon(
  { servicio, operador }: SesionOperador,
  ids: readonly string[]
): Promise<void> {
  for (const id of ids) {
    await transicionarComo(
      servicio,
      operador,
      { entidad: "asignaciones", id, hacia: "CANCELADA" },
      {
        motivo: MOTIVO_RESTABLECER,
        datos: { causa: "ADMINISTRATIVA" } satisfies Record<string, Json>,
      }
    )
  }
}

export interface PautaBorrada {
  /** Campañas borradas enteras. */
  campanas: number
  /** Campañas con descargas: canceladas y archivadas (la BD no deja borrarlas). */
  archivadas: number
  /** Asignaciones borradas. */
  asignaciones: number
  /** Asignaciones que solo quedaron canceladas (con descargas) o que no se tocaron. */
  conservadas: { id: string; motivo: string }[]
}

/**
 * Limpia las campañas de la empresa que empiezan por `prefijo` (sin las ya
 * archivadas): las que no tienen descargas se borran enteras (asignaciones de
 * cualquier medio, ofertas, creativos, archivos y avisos); las que tienen
 * descargas, que la BD no deja borrar, quedan con sus asignaciones canceladas
 * (cupos liberados), canceladas y archivadas, para que no vuelvan a aparecer
 * en el marketplace ni en las listas. `servicio` sale de `clienteComoSuperadmin`.
 */
export async function borrarPauta(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  { anuncianteId, prefijo }: { anuncianteId: string; prefijo: string }
): Promise<PautaBorrada> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const { data: campanas, error } = await servicio
    .from("campanas")
    .select("id, estado, asignaciones ( id, estado, estado_previo_disputa )")
    .eq("anunciante_id", anuncianteId)
    .like("nombre", `${prefijo}%`)
    .is("deleted_at", null)
  if (error) fallo("No se pudieron leer las campañas", error)
  const descargadas = await conDescargas(
    servicio,
    campanas.flatMap((campana) => campana.asignaciones.map((a) => a.id))
  )
  const plan = planCampanasPauta(
    campanas.map((campana) => ({
      id: campana.id,
      estado: campana.estado,
      asignaciones: campana.asignaciones.map((asignacion) => ({
        id: asignacion.id,
        estado: asignacion.estado,
        estadoPrevioDisputa: asignacion.estado_previo_disputa,
        conDescarga: descargadas.has(asignacion.id),
      })),
    }))
  )
  if (plan.retener.length > 0) {
    await conOperador(entorno, async (sesion) => {
      await cancelarCon(sesion, plan.cancelar)
      for (const campanaId of plan.cancelarCampanas) {
        await transicionarComo(
          sesion.servicio,
          sesion.operador,
          { entidad: "campanas", id: campanaId, hacia: "CANCELADA" },
          { motivo: MOTIVO_RESTABLECER }
        )
      }
      for (const campanaId of plan.retener) {
        const { error: errorArchivar } = await sesion.servicio.rpc(
          "archivar_campana_srv",
          {
            p_campana_id: campanaId,
            p_actor_id: sesion.operador.usuarioId,
            p_session_id: sesion.operador.sesionId,
          }
        )
        if (errorArchivar) {
          fallo(`No se pudo archivar la campaña ${campanaId}`, errorArchivar)
        }
      }
    })
  }
  const enteras = campanas.filter((campana) => plan.borrar.includes(campana.id))
  const asignacionesEnteras = enteras.flatMap((campana) =>
    campana.asignaciones.map((asignacion) => asignacion.id)
  )
  const asignaciones = await borrarAsignaciones(servicio, [
    ...asignacionesEnteras,
    ...plan.borrarAsignaciones,
  ])
  const borradas = await borrarCampanasPorId(servicio, plan.borrar)
  const conservadas = [
    ...plan.conservar,
    ...plan.cancelar
      .filter((id) => descargadas.has(id))
      .map((id) => ({
        id,
        motivo: "tiene descargas: queda cancelada (la BD no deja borrarla)",
      })),
  ]
  return {
    campanas: borradas,
    archivadas: plan.retener.length,
    asignaciones,
    conservadas,
  }
}

export interface PautaRestablecida {
  plan: PlanLimpiezaPauta
  campanas: number
  archivadas: number
  asignaciones: number
  /** Asignaciones que siguen ahí (de otro spec, con descargas o liquidadas) y por qué. */
  conservadas: { id: string; motivo: string }[]
}

/**
 * Deja al medio sin la pauta de pruebas anteriores: limpia las campañas
 * «Pauta E2E…» de las empresas E2E (`borrarPauta`), libera sus asignaciones en
 * campañas ajenas (desiste si puede; si no, el equipo AMO cancela) y las
 * borra, y borra sus «No me interesa» y sus vistas. Lo que tiene descargas no
 * se puede borrar (`descargas_contenido` es de solo inserción): queda
 * cancelado, sin cupo, en una campaña cancelada y archivada. Las asignaciones
 * de otras campañas E2E (de un spec del anunciante que corre en paralelo) no
 * se tocan. `servicio` sale de `clienteComoSuperadmin`.
 */
export async function restablecerPautaMedio(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  medio: MedioPauta
): Promise<PautaRestablecida> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const { data, error } = await servicio
    .from("asignaciones")
    .select(
      "id, estado, estado_previo_disputa, contenido_descargado_at, campana_id, anunciante_id, campana:campanas ( nombre, deleted_at ), oferta:ofertas ( fecha_limite_aceptacion )"
    )
    .eq("medio_id", medio.id)
  if (error) fallo("No se pudieron leer las asignaciones del medio", error)
  // Las de campañas ya archivadas por un restablecimiento anterior no tienen nada que hacer.
  const vigentes = data.filter(
    (fila) =>
      fila.campana.deleted_at === null ||
      consumeCupo(fila.estado, fila.estado_previo_disputa)
  )
  const descargadas = await conDescargas(
    servicio,
    vigentes.map((fila) => fila.id)
  )
  const plan = planLimpiezaPauta(
    vigentes.map((fila): AsignacionALimpiar => ({
      id: fila.id,
      estado: fila.estado,
      estadoPrevioDisputa: fila.estado_previo_disputa,
      contenidoDescargadoAt: fila.contenido_descargado_at,
      conDescarga: descargadas.has(fila.id),
      campanaId: fila.campana_id,
      campanaNombre: fila.campana.nombre,
      anuncianteId: fila.anunciante_id,
      fechaLimiteAceptacion: fila.oferta.fecha_limite_aceptacion,
    })),
    { anunciantesE2E: ANUNCIANTES_E2E, ahora: new Date() }
  )

  const desistir = plan.liberar.filter((l) => l.via === "DESISTIR")
  const cancelar = plan.liberar.filter((l) => l.via === "CANCELAR")
  if (desistir.length > 0) {
    await conSesionMedio(entorno, medio, async (sesion) => {
      for (const { id } of desistir) {
        await desistirCon(sesion, id, MOTIVO_RESTABLECER)
      }
    })
  }
  if (cancelar.length > 0) {
    await conOperador(entorno, (sesion) =>
      cancelarCon(
        sesion,
        cancelar.map((l) => l.id)
      )
    )
  }
  let asignaciones = await borrarAsignaciones(servicio, plan.borrar)
  let campanas = 0
  let archivadas = 0
  const conservadas = [...plan.conservar]
  for (const anuncianteId of ANUNCIANTES_E2E) {
    const pauta = await borrarPauta(entorno, servicio, {
      anuncianteId,
      prefijo: PREFIJO_PAUTA,
    })
    campanas += pauta.campanas
    archivadas += pauta.archivadas
    asignaciones += pauta.asignaciones
    conservadas.push(
      ...pauta.conservadas.filter((c) =>
        vigentes.some((fila) => fila.id === c.id)
      )
    )
  }
  const { error: errorVistas } = await servicio
    .from("oferta_vistas")
    .delete()
    .eq("medio_id", medio.id)
  if (errorVistas) fallo("No se pudieron borrar las vistas", errorVistas)
  return { plan, campanas, archivadas, asignaciones, conservadas }
}

// ── Lectores de estado ───────────────────────────────────────────────────────

export interface PublicacionDePrueba {
  id: string
  numero: number
  estado: EstadoValidacion
  url: string
  fechaPublicacion: string
  observaciones: string | null
  etiquetaVerificada: boolean
  capturaPath: string | null
}

export interface MetricaDePrueba {
  id: string
  numero: number
  corte: CorteMetrica
  estado: EstadoValidacion
  fechaCorte: string
  observaciones: string | null
}

export interface AsignacionDePrueba {
  id: string
  ofertaId: string
  campanaId: string
  estado: EstadoAsignacion
  motivo: string | null
  aceptadaAt: string | null
  contenidoDescargadoAt: string | null
  /** Versión del creativo que descargó por última vez (`null` si no ha descargado). */
  versionDescargada: number | null
  publicadaAt: string | null
  evidenciaValidadaAt: string | null
  metricasCargadasAt: string | null
  verificadaAt: string | null
  rechazadaAt: string | null
  canceladaAt: string | null
  franjaClave: string | null
  multiplicadorCalidad: number | null
  montoBruto: number | null
  montoMedio: number | null
  publicaciones: PublicacionDePrueba[]
  metricas: MetricaDePrueba[]
}

/** Estado actual de una asignación con sus publicaciones y cortes (para comprobar el efecto de una acción). */
export async function leerAsignacion(
  servicio: ClienteSupabase,
  asignacionId: string
): Promise<AsignacionDePrueba> {
  const { data, error } = await servicio
    .from("asignaciones")
    .select(
      `id, oferta_id, campana_id, estado, motivo, aceptada_at, contenido_descargado_at, publicada_at,
       evidencia_validada_at, metricas_cargadas_at, verificada_at, rechazada_at, cancelada_at, franja_clave,
       multiplicador_calidad_aplicado, monto_bruto,
       creativo:creativos!asignaciones_creativo_descargado_id_fkey ( version ),
       montos:asignacion_montos ( monto_medio ),
       publicaciones ( id, numero, estado_validacion, url_post, fecha_publicacion, observaciones,
                       etiqueta_verificada, captura_path ),
       metricas ( id, corte, estado_validacion, fecha_corte, observaciones, publicacion_id )`
    )
    .eq("id", asignacionId)
    .single()
  if (error) fallo(`No se pudo leer la asignación ${asignacionId}`, error)
  const numeroDe = new Map(
    data.publicaciones.map((publicacion) => [
      publicacion.id,
      publicacion.numero,
    ])
  )
  return {
    id: data.id,
    ofertaId: data.oferta_id,
    campanaId: data.campana_id,
    estado: data.estado,
    motivo: data.motivo,
    aceptadaAt: data.aceptada_at,
    contenidoDescargadoAt: data.contenido_descargado_at,
    versionDescargada: data.creativo?.version ?? null,
    publicadaAt: data.publicada_at,
    evidenciaValidadaAt: data.evidencia_validada_at,
    metricasCargadasAt: data.metricas_cargadas_at,
    verificadaAt: data.verificada_at,
    rechazadaAt: data.rechazada_at,
    canceladaAt: data.cancelada_at,
    franjaClave: data.franja_clave,
    multiplicadorCalidad:
      data.multiplicador_calidad_aplicado === null
        ? null
        : Number(data.multiplicador_calidad_aplicado),
    montoBruto: data.monto_bruto === null ? null : Number(data.monto_bruto),
    montoMedio:
      data.montos?.monto_medio === null ||
      data.montos?.monto_medio === undefined
        ? null
        : Number(data.montos.monto_medio),
    publicaciones: data.publicaciones
      .map((publicacion) => ({
        id: publicacion.id,
        numero: publicacion.numero,
        estado: publicacion.estado_validacion,
        url: publicacion.url_post,
        fechaPublicacion: publicacion.fecha_publicacion,
        observaciones: publicacion.observaciones,
        etiquetaVerificada: publicacion.etiqueta_verificada,
        capturaPath: publicacion.captura_path,
      }))
      .sort((a, b) => a.numero - b.numero),
    metricas: data.metricas
      .map((metrica) => ({
        id: metrica.id,
        numero: numeroDe.get(metrica.publicacion_id) ?? 0,
        corte: metrica.corte,
        estado: metrica.estado_validacion,
        fechaCorte: metrica.fecha_corte,
        observaciones: metrica.observaciones,
      }))
      .sort(
        (a, b) =>
          a.numero - b.numero || a.fechaCorte.localeCompare(b.fechaCorte)
      ),
  }
}

export interface CuposDeOferta {
  estado: Enums["oferta_estado"]
  cuposTotales: number
  cuposOcupados: number
  presupuestoComprometido: number
}

/** Estado, cupos y presupuesto comprometido de una oferta (aceptar y desistir los mueven). */
export async function leerCuposOferta(
  servicio: ClienteSupabase,
  ofertaId: string
): Promise<CuposDeOferta> {
  const { data, error } = await servicio
    .from("ofertas")
    .select("estado, cupos_totales, cupos_ocupados, presupuesto_comprometido")
    .eq("id", ofertaId)
    .single()
  if (error) fallo(`No se pudo leer la oferta ${ofertaId}`, error)
  return {
    estado: data.estado,
    cuposTotales: data.cupos_totales,
    cuposOcupados: data.cupos_ocupados,
    presupuestoComprometido: Number(data.presupuesto_comprometido),
  }
}

export interface AsignacionDeMedio {
  id: string
  ofertaId: string
  ofertaTitulo: string
  estado: EstadoAsignacion
  aceptadaAt: string | null
}

/** Asignaciones del medio (también los «No me interesa», con `aceptadaAt` nulo), de la más reciente a la más antigua. */
export async function asignacionesDeMedio(
  servicio: ClienteSupabase,
  medioId: string
): Promise<AsignacionDeMedio[]> {
  const { data, error } = await servicio
    .from("asignaciones")
    .select("id, oferta_id, estado, aceptada_at, oferta:ofertas ( titulo )")
    .eq("medio_id", medioId)
    .order("created_at", { ascending: false })
  if (error) fallo("No se pudieron leer las asignaciones del medio", error)
  return data.map((fila) => ({
    id: fila.id,
    ofertaId: fila.oferta_id,
    ofertaTitulo: fila.oferta.titulo,
    estado: fila.estado,
    aceptadaAt: fila.aceptada_at,
  }))
}

export interface AvisoDePrueba {
  tipo: string
  titulo: string
  mensaje: string
  entidadId: string | null
  url: string | null
  leida: boolean
  createdAt: string
}

/** Avisos de las personas del medio (por tipo y entidad), del más reciente al más antiguo. */
export async function avisosDeMedio(
  servicio: ClienteSupabase,
  medioId: string,
  { tipo, entidadId }: { tipo?: string; entidadId?: string } = {}
): Promise<AvisoDePrueba[]> {
  const { data: personas, error } = await servicio
    .from("perfiles")
    .select("id")
    .eq("medio_id", medioId)
  if (error) fallo("No se pudieron leer las personas del medio", error)
  if (personas.length === 0) return []
  let consulta = servicio
    .from("notificaciones")
    .select("tipo, titulo, mensaje, entidad_id, url, leida, created_at")
    .in(
      "usuario_id",
      personas.map((persona) => persona.id)
    )
    .order("created_at", { ascending: false })
  if (tipo) consulta = consulta.eq("tipo", tipo)
  if (entidadId) consulta = consulta.eq("entidad_id", entidadId)
  const { data, error: errorAvisos } = await consulta
  if (errorAvisos) fallo("No se pudieron leer los avisos", errorAvisos)
  return data.map((aviso) => ({
    tipo: aviso.tipo,
    titulo: aviso.titulo,
    mensaje: aviso.mensaje,
    entidadId: aviso.entidad_id,
    url: aviso.url,
    leida: aviso.leida,
    createdAt: aviso.created_at,
  }))
}
