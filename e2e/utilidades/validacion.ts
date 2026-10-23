/**
 * Fábricas E2E de la fase 4 (`scripts/bootstrap/fabricas-validacion.ts`):
 * asignaciones listas para cada cola del equipo AMO, disputas con su hilo y
 * su resolución, cancelación con causa, suspensión del medio dedicado y una
 * vencida que el medio puede reclamar. Todo por el camino real (sesiones de
 * las personas, `*_srv` con actor y sesión, capturas y adjuntos reales en
 * Storage) y nunca en producción.
 *
 * Reglas para que los specs no se pisen:
 *
 * - Cada fábrica crea su propia campaña «Validación E2E <sufijo>» del
 *   «Anunciante E2E» con una oferta dirigida al medio: ubica lo tuyo por el
 *   título de la oferta o el id de la asignación, nunca por su posición en una
 *   cola (también hay datos demo).
 * - Los specs del proyecto `validacion` (`validacion-*`, `disputas-*`) llaman
 *   a `restablecerValidacionE2E()` en su `beforeAll` (y conviene también en el
 *   `afterAll`): limpia esas campañas (las disputas abiertas y los reclamos
 *   pendientes se cierran; lo que la BD no deja borrar queda cancelado y
 *   archivado) y reactiva al «Medio Suspensión E2E». El restablecimiento de la
 *   pauta del medio no toca estas campañas, ni este el de aquella.
 * - Un spec de otro proyecto (corren en paralelo) NO llama a
 *   `restablecerValidacionE2E()`: crea con el prefijo de su limpieza. En
 *   `pauta-medio-*`, `prefijo: PREFIJO_PAUTA` y `restablecerPautaMedioE2E()` en
 *   el `beforeAll`; en `anunciante-*`, `prefijo: PREFIJO_PAUTA_ANUNCIANTE` y
 *   `borrarPautaE2E({ prefijo: PREFIJO_PAUTA_ANUNCIANTE })` en el `afterAll`
 *   (`pauta.ts`). Ambas limpiezas cierran también las disputas y los reclamos.
 * - Por omisión todo es del «Medio E2E». Las pruebas que suspenden usan el
 *   medio dedicado: `medio: MEDIO_SUSPENSION` en la fábrica y
 *   `suspenderMedioE2E()` / `reactivarMedioE2E()`.
 * - El equipo AMO entra con `ingresarComoOperaciones(page)` (OPERACIONES, con
 *   TOTP; sin corrección de métricas ni constancia manual de permanencia). Para
 *   lo que solo puede un ADMIN usa la sesión `interno`.
 * - `vencerAsignacionE2E` solo funciona contra la base local.
 *
 * Tiempos: cada fábrica tarda unos segundos (crea campaña y oferta, acepta,
 * publica y valida con operadores temporales); súbele el tiempo a la prueba
 * que encadene varias (`test.setTimeout(120_000)`).
 */
import {
  aprobarEvidenciasCon,
  conOperador,
  type EvidenciaPublicada,
  type MedioPauta,
  type MetricaCargada,
} from "../../scripts/bootstrap/fabricas-pauta"
import {
  abrirDisputa,
  type AdjuntoDisputa,
  type AsignacionDeValidacion,
  type AsignacionVencida,
  cambiarSuspensionMedio,
  cancelarAsignacion,
  type CancelacionHecha,
  type DisputaResuelta,
  mensajeDisputa,
  type MensajeDisputaCreado,
  type OpcionesOfertaValidacion,
  type PartesValidacion,
  prepararAsignacionValidacion,
  prepararEvidenciaPendiente,
  prepararListaParaVerificar,
  prepararMetricaPendiente,
  resolverDisputa,
  restablecerValidacion,
  tomarDisputa,
  type ValidacionRestablecida,
  vencerAsignacion,
} from "../../scripts/bootstrap/fabricas-validacion"
import type { EtapaPauta } from "../../scripts/bootstrap/pauta-e2e"
import {
  clienteComoSuperadmin,
  cuentaE2E,
  emailDe,
  variableTotpDe,
} from "../../scripts/bootstrap/provision-e2e"
import { crearClienteServicio } from "../../scripts/bootstrap/supabase"
import {
  type AlertaDeMetrica,
  type CausaCancelacion,
  type ComoParte,
  type EstadoAsignacion,
  type EstadoDisputa,
  leerAlerta,
  MOTIVO_RESOLUCION,
  type MotivoDisputa,
  type ParteDisputa,
  PREFIJO_VALIDACION,
  RESULTADOS_DISPUTA,
  type ResultadoDisputa,
} from "../../scripts/bootstrap/validacion-e2e"
import { usuarioAnunciante } from "./anunciantes"
import { entorno } from "./cuentas"
import {
  credencialesMedio,
  MEDIO_SUSPENSION,
  MEDIO_VERIFICADO,
  type MedioDePrueba,
} from "./medios"
import { codigoNuevo, type CookiesSesion } from "./mfa"
import { esperarStreaming, expect, type Page } from "./prueba"

export type {
  AdjuntoDisputa,
  AlertaDeMetrica,
  AsignacionVencida,
  CancelacionHecha,
  CausaCancelacion,
  ComoParte,
  DisputaResuelta,
  EstadoAsignacion,
  EstadoDisputa,
  EvidenciaPublicada,
  MensajeDisputaCreado,
  MetricaCargada,
  MotivoDisputa,
  ResultadoDisputa,
  ValidacionRestablecida,
}
export { MOTIVO_RESOLUCION, PREFIJO_VALIDACION, RESULTADOS_DISPUTA }

// ── El equipo AMO (OPERACIONES) ──────────────────────────────────────────────

const CUENTA_OPERACIONES = cuentaE2E("OPERACIONES")

/** Nombre de la persona de OPERACIONES (como lo muestran el saludo y la bitácora). */
export const NOMBRE_OPERACIONES = CUENTA_OPERACIONES.nombre

export interface CredencialesOperaciones {
  email: string
  password: string
  /** Clave base32 del TOTP (`E2E_OPERACIONES_TOTP_SECRET`). */
  secreto: string
}

export function credencialesOperaciones(): CredencialesOperaciones {
  const variableTotp = variableTotpDe(CUENTA_OPERACIONES)
  const password = process.env[CUENTA_OPERACIONES.variablePassword]
  const secreto = process.env[variableTotp]
  if (!password || !secreto) {
    throw new Error(
      `Faltan ${CUENTA_OPERACIONES.variablePassword} y ${variableTotp}: ejecuta \`pnpm bootstrap:e2e\`.`
    )
  }
  return { email: emailDe(CUENTA_OPERACIONES), password, secreto }
}

/**
 * Sesión de OPERACIONES de este proceso de pruebas. Cada ingreso con TOTP
 * exige un código de un periodo nuevo (hasta 30 s) y cierra las demás
 * sesiones de la cuenta: se reutiliza mientras siga viva.
 */
let sesionOperaciones: CookiesSesion | null = null

function rutaDe(destino: string): string {
  return new URL(destino, "http://amo.local").pathname
}

/**
 * Entra como OPERACIONES (contraseña y TOTP) y espera llegar a `destino`
 * (Inicio por omisión). Reutiliza la sesión de una prueba anterior del mismo
 * proceso si sigue viva (si el servidor la cerró por inactividad, vuelve a
 * ingresar). Va en el `beforeEach` o al empezar cada prueba.
 */
export async function ingresarComoOperaciones(
  page: Page,
  { destino = "/inicio" }: { destino?: string } = {}
): Promise<void> {
  const ruta = rutaDe(destino)
  if (sesionOperaciones) {
    await page.context().addCookies(sesionOperaciones)
    await page.goto(destino)
    if (new URL(page.url()).pathname === ruta) {
      sesionOperaciones = await page.context().cookies()
      return
    }
    sesionOperaciones = null
    await page.context().clearCookies()
  }
  const { email, password, secreto } = credencialesOperaciones()
  await page.goto(
    destino === "/inicio"
      ? "/ingresar"
      : `/ingresar?${new URLSearchParams({ next: destino })}`
  )
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByLabel("Contraseña", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Ingresar" }).click()
  await expect(page).toHaveURL(/\/mfa\/verificar/)
  // Al completar los 6 dígitos el formulario se envía solo.
  await page
    .getByLabel("Código de verificación")
    .fill(await codigoNuevo(secreto))
  await expect(page).toHaveURL((url) => url.pathname === ruta)
  await esperarStreaming(page)
  sesionOperaciones = await page.context().cookies()
}

// ── Las partes ───────────────────────────────────────────────────────────────

function medioPauta(medio: MedioDePrueba): MedioPauta {
  return { id: medio.id, credenciales: credencialesMedio(medio.cuenta) }
}

/** Los medios verificados cuyas credenciales están en `.env.local`. */
function mediosConCredenciales(): MedioPauta[] {
  return [MEDIO_VERIFICADO, MEDIO_SUSPENSION].flatMap((medio) => {
    try {
      return [medioPauta(medio)]
    } catch {
      return []
    }
  })
}

async function partes(): Promise<PartesValidacion> {
  return {
    empresa: await usuarioAnunciante("ANUNCIANTE"),
    medios: mediosConCredenciales(),
  }
}

// ── Asignaciones para las colas ──────────────────────────────────────────────

export interface OpcionesAsignacionValidacionE2E extends OpcionesOfertaValidacion {
  /** El «Medio E2E» por omisión; `MEDIO_SUSPENSION` para las pruebas de suspensión. */
  medio?: MedioDePrueba
}

export interface AsignacionValidacionE2E {
  asignacionId: string
  oferta: { id: string; titulo: string }
  campana: { id: string; nombre: string }
  medio: MedioDePrueba
  /** Evidencias publicadas (`publicacionId`, número, URL del post, captura). */
  publicaciones: EvidenciaPublicada[]
  /** Cortes cargados por el medio. */
  metricas: MetricaCargada[]
}

function deValidacion(
  asignacion: AsignacionDeValidacion,
  medio: MedioDePrueba
): AsignacionValidacionE2E {
  return {
    asignacionId: asignacion.asignacionId,
    oferta: { id: asignacion.ofertaId, titulo: asignacion.ofertaTitulo },
    campana: { id: asignacion.campanaId, nombre: asignacion.campanaNombre },
    medio,
    publicaciones: asignacion.publicaciones,
    metricas: asignacion.metricas,
  }
}

/** Ficha interna de la asignación (Operación › Asignaciones). */
export function rutaFichaAsignacion(asignacionId: string): string {
  return `/operacion/asignaciones/${asignacionId}`
}

/**
 * Asignación del medio en el estado pedido por el camino real, en una oferta
 * «Validación E2E» nueva (solo el corte H24 por omisión): p. ej.
 * `CONTENIDO_ENTREGADO` para vencerla, `VERIFICADA` para disputarla.
 */
export async function asignacionValidacionE2E(
  opciones: OpcionesAsignacionValidacionE2E & { hasta: EtapaPauta }
): Promise<AsignacionValidacionE2E> {
  const medio = opciones.medio ?? MEDIO_VERIFICADO
  const asignacion = await prepararAsignacionValidacion(
    entorno,
    await partes(),
    medioPauta(medio),
    opciones
  )
  return deValidacion(asignacion, medio)
}

/**
 * Cola de evidencias (ADM-007): asignación PUBLICADA con la evidencia
 * PENDIENTE (post, captura real, etiqueta declarada). `publicaciones[0]`
 * trae la URL del post y la ruta de la captura.
 */
export async function asignacionConEvidenciaPendienteE2E(
  opciones: OpcionesAsignacionValidacionE2E = {}
): Promise<AsignacionValidacionE2E> {
  const medio = opciones.medio ?? MEDIO_VERIFICADO
  const asignacion = await prepararEvidenciaPendiente(
    entorno,
    await partes(),
    medioPauta(medio),
    opciones
  )
  return deValidacion(asignacion, medio)
}

export interface MetricaPendienteE2E extends AsignacionValidacionE2E {
  metricaId: string
  /** La alerta que registró la BD (múltiplo, desviación y límite de alcance). */
  alerta: AlertaDeMetrica
}

/**
 * Cola de métricas (ADM-008): el corte H24 PENDIENTE con la evidencia ya
 * aprobada (la asignación queda METRICAS_CARGADAS). Con `conAlerta`, el
 * alcance supera el múltiplo de seguidores al aceptar (INT-004: 2 × en
 * Instagram; 40.000 seguidores → alcance de 100.000) y la cola la pone arriba.
 * Con `evidenciaAprobada: false` la asignación queda PUBLICADA (la métrica no
 * se puede aprobar hasta validar la evidencia).
 */
export async function asignacionConMetricaPendienteE2E(
  opciones: OpcionesAsignacionValidacionE2E & {
    conAlerta?: boolean
    evidenciaAprobada?: boolean
  } = {}
): Promise<MetricaPendienteE2E> {
  const medio = opciones.medio ?? MEDIO_VERIFICADO
  const asignacion = await prepararMetricaPendiente(
    entorno,
    await partes(),
    medioPauta(medio),
    opciones
  )
  return {
    ...deValidacion(asignacion, medio),
    metricaId: asignacion.metricaId,
    alerta: asignacion.alerta,
  }
}

export interface ListaParaVerificarE2E extends AsignacionValidacionE2E {
  /** Fin de la permanencia mínima de la publicación. */
  permanenciaHasta: Date
  /** `false`: bloqueada por permanencia («Permanencia pendiente hasta {fecha}»). */
  lista: boolean
}

/**
 * Cola de verificación (ADM-009): METRICAS_CARGADAS con la evidencia y el
 * corte aprobados. Con la permanencia por omisión (1 día; publicada hace
 * 25 h) queda lista; con `permanenciaDias` mayor (p. ej. 30) queda bloqueada
 * por permanencia hasta `permanenciaHasta`.
 */
export async function asignacionListaParaVerificarE2E(
  opciones: OpcionesAsignacionValidacionE2E = {}
): Promise<ListaParaVerificarE2E> {
  const medio = opciones.medio ?? MEDIO_VERIFICADO
  const asignacion = await prepararListaParaVerificar(
    entorno,
    await partes(),
    medioPauta(medio),
    opciones
  )
  return {
    ...deValidacion(asignacion, medio),
    permanenciaHasta: asignacion.permanenciaHasta,
    lista: asignacion.lista,
  }
}

/**
 * Aprueba las evidencias pendientes de la asignación como el equipo AMO
 * (`validar_evidencia_srv`): con la última, la asignación queda
 * EVIDENCIA_VALIDADA (o METRICAS_CARGADAS si ya tiene sus cortes).
 */
export async function aprobarEvidenciaValidacionE2E({
  asignacionId,
}: {
  asignacionId: string
}): Promise<void> {
  await conOperador(entorno, (sesion) =>
    aprobarEvidenciasCon(sesion, asignacionId)
  )
}

// ── Disputas ─────────────────────────────────────────────────────────────────

/**
 * Abre una disputa como la parte (`abrir_disputa_srv` con su sesión): el
 * medio de la asignación, la empresa («Anunciante E2E») o el equipo AMO. La
 * asignación pasa a EN_DISPUTA. Desde PUBLICADA, EVIDENCIA_VALIDADA,
 * METRICAS_CARGADAS o VERIFICADA; una vencida solo la reclama el medio, con
 * `OTRO` o `INCUMPLIMIENTO`. Devuelve el id de la disputa.
 */
export async function abrirDisputaE2E(opciones: {
  asignacionId: string
  como: ParteDisputa
  motivo: MotivoDisputa
  descripcion: string
}): Promise<string> {
  return abrirDisputa(entorno, await partes(), opciones)
}

/**
 * Escribe en el hilo como la parte, con su sesión (RLS) y, si se pide, un
 * adjunto real (`"imagen"` o `"pdf"`) subido a `evidencias/disputa/{id}/…`.
 * `interno` (solo `como: "ADMIN"`) deja una nota que solo ve el equipo AMO.
 */
export async function mensajeDisputaE2E(opciones: {
  disputaId: string
  como: ParteDisputa
  mensaje: string
  interno?: boolean
  adjunto?: AdjuntoDisputa
}): Promise<MensajeDisputaCreado> {
  return mensajeDisputa(entorno, await partes(), opciones)
}

/** «Tomar en revisión»: la disputa pasa de ABIERTA a EN_REVISION. */
export async function tomarDisputaE2E(opciones: {
  disputaId: string
}): Promise<void> {
  await tomarDisputa(entorno, opciones)
}

/**
 * El equipo AMO resuelve la disputa (ADM-012):
 *
 * - `RESTAURAR`: la asignación vuelve a su estado previo.
 * - `VERIFICAR`: con estado previo METRICAS_CARGADAS, queda VERIFICADA
 *   (`permanenciaVerificada` deja la constancia manual si aún no se cumple).
 * - `REABRIR`: una vencida reclamada vuelve a CONTENIDO_ENTREGADO con un plazo
 *   nuevo para la evidencia (`fechaLimitePublicacion`).
 * - `CANCELAR`: la asignación queda CANCELADA con `causa` (ADMINISTRATIVA por omisión).
 * - `DESCARTAR`: la disputa se descarta y la asignación vuelve a su estado previo.
 *
 * El motivo por omisión es el de `MOTIVO_RESOLUCION[resultado]`.
 */
export async function resolverDisputaE2E(opciones: {
  disputaId: string
  resultado: ResultadoDisputa
  causa?: CausaCancelacion
  motivo?: string
  permanenciaVerificada?: boolean
}): Promise<DisputaResuelta> {
  return resolverDisputa(entorno, opciones)
}

export interface DisputaDePrueba {
  id: string
  asignacionId: string
  estado: EstadoDisputa
  parte: ParteDisputa
  motivo: MotivoDisputa
  descripcion: string
  resolucion: string | null
  estadoAsignacionOrigen: EstadoAsignacion
  estadoAsignacionResultante: EstadoAsignacion | null
  /** Mensajes del hilo (también las notas internas). */
  mensajes: {
    parte: ParteDisputa | null
    mensaje: string
    interno: boolean
    adjuntoPath: string | null
  }[]
}

/** Estado actual de la disputa y su hilo (para comprobar el efecto de una acción). */
export async function leerDisputaE2E(
  disputaId: string
): Promise<DisputaDePrueba> {
  const { data, error } = await crearClienteServicio(entorno)
    .from("disputas")
    .select(
      `id, asignacion_id, estado, parte, motivo, descripcion, resolucion, estado_asignacion_origen,
       estado_asignacion_resultante,
       mensajes:disputa_mensajes ( id, autor_parte, mensaje, interno, adjunto_path )`
    )
    .eq("id", disputaId)
    .single()
  if (error) {
    throw new Error(`No se pudo leer la disputa ${disputaId}: ${error.message}`)
  }
  return {
    id: data.id,
    asignacionId: data.asignacion_id,
    estado: data.estado,
    parte: data.parte,
    motivo: data.motivo,
    descripcion: data.descripcion,
    resolucion: data.resolucion,
    estadoAsignacionOrigen: data.estado_asignacion_origen,
    estadoAsignacionResultante: data.estado_asignacion_resultante,
    mensajes: [...data.mensajes]
      .sort((a, b) => a.id - b.id)
      .map((mensaje) => ({
        parte: mensaje.autor_parte,
        mensaje: mensaje.mensaje,
        interno: mensaje.interno,
        adjuntoPath: mensaje.adjunto_path,
      })),
  }
}

// ── Vencer, cancelar y suspender ─────────────────────────────────────────────

/**
 * La asignación (ACEPTADA o CONTENIDO_ENTREGADO) pasa a VENCIDA_SIN_PUBLICAR
 * como lo haría el cron al vencer el plazo para publicar, con su aviso: el
 * medio puede reclamarla hasta `reclamoHasta`. Solo contra la base local
 * (escribe el plazo por la conexión directa de Postgres); en otro entorno
 * lanza sin tocar nada.
 */
export async function vencerAsignacionE2E(opciones: {
  asignacionId: string
}): Promise<AsignacionVencida> {
  return vencerAsignacion(entorno, opciones)
}

/**
 * El equipo AMO cancela la asignación con su causa (`cancelar_asignacion_srv`,
 * ADM-010); con `suspenderMedio` (solo FRAUDE o INCUMPLIMIENTO_MEDIO) suspende
 * además al medio en la misma transacción.
 */
export async function cancelarAsignacionE2E(opciones: {
  asignacionId: string
  causa: CausaCancelacion
  motivo?: string
  suspenderMedio?: boolean
}): Promise<CancelacionHecha> {
  return cancelarAsignacion(entorno, opciones)
}

/**
 * Suspende al «Medio Suspensión E2E» por la máquina de estados (motivo
 * obligatorio): deja de ver ofertas y conserva lo que tiene en curso. Si ya
 * estaba suspendido no hace nada. Devuelve si cambió.
 */
export async function suspenderMedioE2E({
  motivo = "Suspendido por las pruebas E2E del equipo AMO.",
}: { motivo?: string } = {}): Promise<boolean> {
  return cambiarSuspensionMedio(entorno, {
    medioId: MEDIO_SUSPENSION.id,
    hacia: "SUSPENDIDO",
    motivo,
  })
}

/** Reactiva al «Medio Suspensión E2E» (SUSPENDIDO → VERIFICADO). Devuelve si cambió. */
export async function reactivarMedioE2E({
  motivo = "Reactivado por las pruebas E2E del equipo AMO.",
}: { motivo?: string } = {}): Promise<boolean> {
  return cambiarSuspensionMedio(entorno, {
    medioId: MEDIO_SUSPENSION.id,
    hacia: "VERIFICADO",
    motivo,
  })
}

// ── Limpieza y lectores ──────────────────────────────────────────────────────

/**
 * Deja la base sin las pruebas de validación anteriores: limpia las campañas
 * «Validación E2E…» (cierra sus disputas abiertas y sus reclamos pendientes;
 * lo que la BD no deja borrar queda cancelado y archivado) y reactiva al
 * «Medio Suspensión E2E» si quedó suspendido. Va en el `beforeAll` (y en el
 * `afterAll`) de cada spec que use estas fábricas.
 */
export async function restablecerValidacionE2E(): Promise<ValidacionRestablecida> {
  const servicio = await clienteComoSuperadmin(entorno)
  return restablecerValidacion(entorno, servicio, {
    medios: mediosConCredenciales(),
    medioSuspension: MEDIO_SUSPENSION.id,
  })
}

/** Alerta registrada en la métrica (el servicio lee las columnas que la sesión no ve). */
export async function leerAlertaMetricaE2E(
  metricaId: string
): Promise<AlertaDeMetrica> {
  const { data, error } = await crearClienteServicio(entorno)
    .from("metricas")
    .select("alerta_multiplo, alerta_desviacion, detalle_alertas")
    .eq("id", metricaId)
    .single()
  if (error) {
    throw new Error(`No se pudo leer la métrica ${metricaId}: ${error.message}`)
  }
  return leerAlerta(data)
}
