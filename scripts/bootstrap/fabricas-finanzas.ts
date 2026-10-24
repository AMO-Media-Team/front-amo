/**
 * Fábricas de la fase 5 para las pruebas E2E (el plan está en
 * `finanzas-e2e.ts`): campaña «Finanzas E2E» con una oferta para los dos
 * medios de Finanzas, asignaciones verificadas, liquidaciones en cada etapa
 * (borrador, aprobada, con documento soporte o factura, pagada), facturas al
 * anunciante (borrador o expedida), resoluciones de prueba y la limpieza.
 * Todo por el camino real:
 *
 * - Campaña y oferta de la empresa con las fábricas de negocio; la asignación
 *   la acepta, publica y mide el medio con su sesión y la valida y verifica un
 *   operador temporal (`prepararAsignacion`).
 * - La liquidación la genera el ADMIN E2E (`generar_liquidacion_srv`) y la
 *   aprueba Finanzas (`transicionar`): quien genera no aprueba (D17). El
 *   documento soporte, el pago, el archivo de pagos y las facturas los hace
 *   Finanzas con sus `*_srv`; la factura del medio que factura la carga el
 *   medio con su sesión. Los archivos son objetos reales en Storage, subidos
 *   con la sesión de quien los carga (la política decide) o, los que genera el
 *   servidor (archivo de pagos), con el cliente de servicio.
 * - ADMIN E2E y Finanzas entran con contraseña y TOTP (aal2). La sesión se
 *   reutiliza en el proceso mientras siga viva (cada ingreso gasta un periodo
 *   TOTP de 30 s): `cerrarSesionesInternas` las cierra.
 *
 * La única excepción es `restablecerFinanzas`: borra por la conexión directa de
 * Postgres de la base LOCAL (o develop), en modo carga y purga, lo que la API
 * no deja borrar (liquidaciones, documentos, dispersiones, pagos y notas de
 * solo inserción). Nada de esto corre en producción.
 */
import { randomUUID } from "node:crypto"

import postgres from "postgres"

import {
  contextoCifrado,
  leerCuentaPago,
} from "../../src/features/mi-medio/datos-pago"
import { serializarFecha } from "../../src/lib/fechas"
import { argumentosRpc } from "../../src/lib/supabase/rpc"
import type { Database } from "../../src/types/database.types"
import { planResoluciones } from "../produccion/configuracion-pruebas-plan"
import { sslDe, URL_DB_LOCAL, urlDb } from "../db/entorno-db"
import {
  type ActorConSesion,
  conClienteDeUsuario,
  errorDeApi,
  transicionarComo,
} from "./acciones-actor"
import { ANUNCIANTE_NUEVO_E2E_ID } from "./anunciantes-e2e"
import { pdfDeMuestra } from "./archivos-prueba"
import { cifradorDelEntorno, rutasStorage } from "./aprovisionar-medios"
import {
  crearCampana,
  crearOferta,
  type SegmentacionOferta,
  type UsuarioAnunciante,
} from "./fabricas-negocio"
import { type MedioPauta, prepararAsignacion } from "./fabricas-pauta"
import {
  baseRestablecible,
  codigoDianE2E,
  csvDispersionE2E,
  type EstadoFactura,
  type EstadoLiquidacion,
  type EtapaFactura,
  type EtapaLiquidacion,
  type FilaDispersionE2E,
  type FinanzasRestablecidas,
  leerPeriodicidad,
  llegaLiquidacion,
  type MedioFinanzas,
  MEDIOS_FINANZAS,
  numeroFacturaMedioE2E,
  type PeriodoLiquidacion,
  periodoParaLiquidar,
  PREFIJO_FINANZAS,
  referenciaDispersionE2E,
  referenciaPagoE2E,
  siguienteConsecutivo,
} from "./finanzas-e2e"
import { codigoTotpNuevo } from "./mfa"
import { sufijoUnico } from "./negocio-e2e"
import { ANUNCIANTE_E2E_ID } from "./organizacion"
import { diasAtrasParaCortes, horasParaCortes } from "./pauta-e2e"
import { exigirFueraDeProduccion } from "./produccion"
import {
  clienteComoSuperadmin,
  cuentaE2E,
  variableTotpDe,
} from "./provision-e2e"
import {
  buscarUsuarioPorEmail,
  type ClienteSupabase,
  crearClienteServicio,
  crearClienteUsuario,
  type EntornoBootstrap,
  ErrorBootstrap,
} from "./supabase"

type Tablas = Database["public"]["Tables"]

const CONTEXTO = "Las fábricas de Finanzas E2E"
/** Las empresas de las pruebas: sus campañas «Finanzas E2E…» son de estas fábricas. */
const ANUNCIANTES_E2E = [ANUNCIANTE_E2E_ID, ANUNCIANTE_NUEVO_E2E_ID] as const
/** Las ofertas de Finanzas piden solo el corte de 24 h: la asignación se verifica en una sola corrida. */
const CORTES = ["H24"] as const
const DIAS_ATRAS = diasAtrasParaCortes(CORTES)
/** Una sesión interna reutilizada no pasa de esto (la inactividad máxima del equipo AMO es 30 min). */
const VIDA_SESION_MS = 15 * 60_000
const TROZO = 100

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

const hoyEnBogota = () => serializarFecha(new Date())

// ── Las partes ───────────────────────────────────────────────────────────────

/** Cuenta del equipo AMO con verificación en dos pasos. */
export interface CredencialesInternas {
  email: string
  password: string
  /** Clave base32 del TOTP. */
  secreto: string
}

/**
 * Quiénes actúan en las fábricas: la empresa (campañas y ofertas), los dos
 * medios de Finanzas, el ADMIN E2E (genera las liquidaciones) y Finanzas
 * (aprueba, emite, paga y factura).
 */
export interface PartesFinanzas {
  empresa: UsuarioAnunciante
  medios: Readonly<Record<MedioFinanzas, MedioPauta>>
  administracion: CredencialesInternas
  finanzas: CredencialesInternas
}

function variableExigida(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) {
    throw new ErrorBootstrap(`Falta ${nombre}: ejecuta \`pnpm bootstrap:e2e\`.`)
  }
  return valor
}

function credencialesDe(clave: string): { email: string; password: string } {
  const cuenta = cuentaE2E(clave)
  return {
    email: process.env[cuenta.variableEmail] ?? cuenta.emailPorDefecto,
    password: variableExigida(cuenta.variablePassword),
  }
}

/** Credenciales con TOTP de una cuenta interna E2E (`E2E_<clave>_*`). */
export function credencialesInternasDe(
  clave: "ADMIN" | "FINANZAS"
): CredencialesInternas {
  return {
    ...credencialesDe(clave),
    secreto: variableExigida(variableTotpDe(cuentaE2E(clave))),
  }
}

/** Las partes con las credenciales de `.env.local` (las crea `pnpm bootstrap:e2e`). */
export async function partesFinanzasDelEntorno(
  entorno: EntornoBootstrap
): Promise<PartesFinanzas> {
  const empresa = credencialesDe("ANUNCIANTE")
  const perfil = await buscarUsuarioPorEmail(
    crearClienteServicio(entorno),
    empresa.email
  )
  if (!perfil) {
    throw new ErrorBootstrap(
      `No existe la cuenta ${empresa.email}: ejecuta \`pnpm bootstrap:e2e\`.`
    )
  }
  return {
    empresa: { id: perfil.id, ...empresa },
    medios: {
      MEDIO_FINANZAS: {
        id: MEDIOS_FINANZAS.MEDIO_FINANZAS.id,
        credenciales: credencialesDe("MEDIO_FINANZAS"),
      },
      MEDIO_FACTURA: {
        id: MEDIOS_FINANZAS.MEDIO_FACTURA.id,
        credenciales: credencialesDe("MEDIO_FACTURA"),
      },
    },
    administracion: credencialesInternasDe("ADMIN"),
    finanzas: credencialesInternasDe("FINANZAS"),
  }
}

// ── Sesiones del equipo AMO (aal2) ───────────────────────────────────────────

export interface SesionInterna {
  actor: ActorConSesion
  /** Con la sesión de la persona y contexto confiable (Storage con su RLS). */
  cliente: ClienteSupabase
  /** Servicio a nombre de la persona: las `*_srv` (revalidan actor y sesión). */
  servicio: ClienteSupabase
}

interface SesionGuardada {
  sesion: SesionInterna
  abiertaEn: number
}

const SESIONES = new Map<string, SesionGuardada>()

async function abrirSesionInterna(
  entorno: EntornoBootstrap,
  { email, password, secreto }: CredencialesInternas
): Promise<SesionInterna> {
  const cliente = crearClienteUsuario(entorno)
  const ingreso = await cliente.auth.signInWithPassword({ email, password })
  if (ingreso.error) {
    throw new ErrorBootstrap(
      `${email} no pudo ingresar: ${ingreso.error.message}`
    )
  }
  const { data: factores, error } = await cliente.auth.mfa.listFactors()
  const factor = factores?.totp.find((f) => f.status === "verified")
  if (error || !factor) {
    await cliente.auth.signOut({ scope: "local" })
    throw new ErrorBootstrap(
      `${email} no tiene un TOTP verificado: ejecuta \`pnpm bootstrap:e2e\`.`
    )
  }
  const verificacion = await cliente.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: await codigoTotpNuevo(secreto),
  })
  if (verificacion.error) {
    await cliente.auth.signOut({ scope: "local" })
    throw new ErrorBootstrap(
      `${email} no pasó la verificación en dos pasos: ${verificacion.error.message}`
    )
  }
  const { data, error: errorClaims } = await cliente.auth.getClaims()
  if (errorClaims || !data) {
    throw new ErrorBootstrap(`No se pudo leer la sesión de ${email}.`)
  }
  return {
    actor: { usuarioId: data.claims.sub, sesionId: data.claims.session_id },
    cliente,
    servicio: crearClienteServicio(entorno, data.claims.sub),
  }
}

/** ¿Auth sigue reconociendo la sesión (no se cerró ni se revocó)? */
async function sigueViva(sesion: SesionInterna): Promise<boolean> {
  const { data, error } = await sesion.cliente.auth.getUser()
  return !error && data.user.id === sesion.actor.usuarioId
}

/**
 * Ejecuta `accion` con la sesión aal2 de la persona del equipo AMO. La abre
 * con contraseña y TOTP la primera vez y la reutiliza en el proceso mientras
 * siga viva y no pase de 15 minutos.
 */
export async function conSesionInterna<T>(
  entorno: EntornoBootstrap,
  credenciales: CredencialesInternas,
  accion: (sesion: SesionInterna) => Promise<T>
): Promise<T> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const clave = `${entorno.url}|${credenciales.email}`
  const guardada = SESIONES.get(clave)
  const vigente =
    guardada !== undefined &&
    Date.now() - guardada.abiertaEn < VIDA_SESION_MS &&
    (await sigueViva(guardada.sesion))
  if (guardada && !vigente) {
    SESIONES.delete(clave)
    await guardada.sesion.cliente.auth.signOut({ scope: "local" })
  }
  const sesion = vigente
    ? guardada.sesion
    : await abrirSesionInterna(entorno, credenciales)
  if (!vigente) SESIONES.set(clave, { sesion, abiertaEn: Date.now() })
  return accion(sesion)
}

/** Cierra las sesiones internas que las fábricas abrieron en este proceso. Devuelve cuántas. */
export async function cerrarSesionesInternas(): Promise<number> {
  const guardadas = [...SESIONES.values()]
  SESIONES.clear()
  await Promise.all(
    guardadas.map(({ sesion }) =>
      sesion.cliente.auth.signOut({ scope: "local" }).catch(() => undefined)
    )
  )
  return guardadas.length
}

// ── Archivos ─────────────────────────────────────────────────────────────────

type Ubicacion = ReturnType<ReturnType<typeof rutasStorage>["carpetaSoporte"]>

/** Sube un archivo a `{carpeta}/{uuid}.{ext}` con el cliente dado y devuelve la ruta. */
async function subir(
  cliente: ClienteSupabase,
  ubicacion: Ubicacion,
  contenido: Buffer,
  mime: string
): Promise<string> {
  const { bucket, ruta } = rutasStorage().nuevaRuta(ubicacion, mime)
  const { error } = await cliente.storage
    .from(bucket)
    .upload(ruta, contenido, { contentType: mime, upsert: false })
  if (error) fallo(`No se pudo subir ${ruta}`, error)
  return ruta
}

function pdfE2E(titulo: string, lineas: readonly string[] = []): Buffer {
  return pdfDeMuestra([
    `AMO · ${titulo}`,
    ...lineas,
    "Documento de muestra de las pruebas E2E: sin validez fiscal.",
  ])
}

// ── Lecturas ─────────────────────────────────────────────────────────────────

async function valorConfiguracion(
  servicio: ClienteSupabase,
  clave: string
): Promise<unknown> {
  const { data, error } = await servicio
    .from("configuracion")
    .select("valor")
    .eq("clave", clave)
    .single()
  if (error) fallo(`No se pudo leer ${clave}`, error)
  return data.valor
}

interface CampanaLeida {
  id: string
  nombre: string
  anuncianteId: string
}

async function leerCampanaFinanzas(
  servicio: ClienteSupabase,
  campanaId: string
): Promise<CampanaLeida> {
  const { data, error } = await servicio
    .from("campanas")
    .select("id, nombre, anunciante_id, estado, deleted_at")
    .eq("id", campanaId)
    .maybeSingle()
  if (error) fallo("No se pudo leer la campaña", error)
  if (!data || data.deleted_at) {
    throw new ErrorBootstrap(`La campaña ${campanaId} no existe.`)
  }
  if (!data.nombre.startsWith(PREFIJO_FINANZAS)) {
    throw new ErrorBootstrap(
      `La campaña «${data.nombre}» no es de las fábricas de Finanzas: usa campanaFinanzasE2E().`
    )
  }
  return { id: data.id, nombre: data.nombre, anuncianteId: data.anunciante_id }
}

/** Municipios y categorías de los dos medios: la oferta les llega a ambos. */
async function segmentacionFinanzas(
  servicio: ClienteSupabase
): Promise<SegmentacionOferta> {
  const ids = Object.values(MEDIOS_FINANZAS).map((medio) => medio.id)
  const [medios, categorias] = await Promise.all([
    servicio.from("medios").select("id, municipio_codigo").in("id", ids),
    servicio
      .from("medio_categorias")
      .select("categoria_id")
      .in("medio_id", ids),
  ])
  if (medios.error) fallo("No se pudieron leer los medios", medios.error)
  if (categorias.error)
    fallo("No se pudieron leer las categorías", categorias.error)
  if (medios.data.length !== ids.length) {
    throw new ErrorBootstrap(
      "Faltan los medios de Finanzas: ejecuta `pnpm bootstrap:e2e`."
    )
  }
  return {
    municipios: [...new Set(medios.data.map((fila) => fila.municipio_codigo))],
    categorias: [...new Set(categorias.data.map((fila) => fila.categoria_id))],
  }
}

// ── Campaña y asignaciones ───────────────────────────────────────────────────

export interface CampanaFinanzas {
  id: string
  nombre: string
  /** La oferta PUBLICADA para los dos medios (2 cupos en F1, solo el corte de 24 h). */
  ofertaId: string
  ofertaTitulo: string
}

async function crearOfertaFinanzas(
  entorno: EntornoBootstrap,
  empresa: UsuarioAnunciante,
  campanaId: string
): Promise<{ id: string; titulo: string }> {
  const oferta = await crearOferta(entorno, empresa, {
    campanaId,
    estado: "PUBLICADA",
    ventanaDesdeHoy: { diasAtras: DIAS_ATRAS },
    segmentacion: await segmentacionFinanzas(crearClienteServicio(entorno)),
    cortes: [...CORTES],
    permanenciaMinimaDias: 1,
    cupos: 2,
  })
  return { id: oferta.id, titulo: oferta.titulo }
}

/**
 * Campaña ACTIVA «Finanzas E2E <sufijo>» del Anunciante E2E (empezó hace dos
 * días) con una oferta PUBLICADA dirigida a los dos medios de Finanzas.
 */
export async function crearCampanaFinanzas(
  entorno: EntornoBootstrap,
  partes: PartesFinanzas
): Promise<CampanaFinanzas> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const campana = await crearCampana(entorno, partes.empresa, {
    anuncianteId: ANUNCIANTE_E2E_ID,
    nombre: `${PREFIJO_FINANZAS} ${sufijoUnico()}`,
    diasAtras: DIAS_ATRAS,
  })
  const oferta = await crearOfertaFinanzas(entorno, partes.empresa, campana.id)
  return {
    id: campana.id,
    nombre: campana.nombre,
    ofertaId: oferta.id,
    ofertaTitulo: oferta.titulo,
  }
}

/**
 * Una oferta PUBLICADA de la campaña que el medio aún no tomó, con cupo, la
 * ventana abierta desde hace más de 25 h (para publicar con fecha pasada) y
 * la aceptación abierta.
 */
async function ofertaDisponible(
  servicio: ClienteSupabase,
  campanaId: string,
  medioId: string
): Promise<{ id: string; titulo: string } | null> {
  const { data, error } = await servicio
    .from("ofertas")
    .select(
      "id, titulo, ventana_inicio, fecha_limite_aceptacion, oferta_cupos ( cupos_totales, cupos_ocupados ), asignaciones ( medio_id )"
    )
    .eq("campana_id", campanaId)
    .eq("estado", "PUBLICADA")
    .is("deleted_at", null)
    .order("created_at")
  if (error) fallo("No se pudieron leer las ofertas de la campaña", error)
  const ahora = Date.now()
  const publicableDesde = ahora - horasParaCortes(CORTES) * 3_600_000
  const oferta = data.find(
    (fila) =>
      !fila.asignaciones.some(
        (asignacion) => asignacion.medio_id === medioId
      ) &&
      fila.oferta_cupos.some(
        (cupo) => cupo.cupos_ocupados < cupo.cupos_totales
      ) &&
      Date.parse(fila.ventana_inicio) <= publicableDesde &&
      Date.parse(fila.fecha_limite_aceptacion) > ahora + 60_000
  )
  return oferta ? { id: oferta.id, titulo: oferta.titulo } : null
}

export interface AsignacionVerificadaFinanzas {
  asignacionId: string
  medio: MedioFinanzas
  medioId: string
  campanaId: string
  ofertaId: string
  ofertaTitulo: string
  /** Lo que paga el anunciante (precio congelado al aceptar). */
  montoBruto: number
  /** Lo que recibe el medio antes de retenciones. */
  montoMedio: number
}

/**
 * Asignación VERIFICADA del medio en la campaña «Finanzas E2E» por el camino
 * real (aceptar → descargar → publicar → corte de 24 h → validar →
 * verificar). Usa una oferta de la campaña que el medio no haya tomado; si no
 * hay, crea otra para los dos medios.
 */
export async function prepararAsignacionVerificadaFinanzas(
  entorno: EntornoBootstrap,
  partes: PartesFinanzas,
  { medio, campanaId }: { medio: MedioFinanzas; campanaId: string }
): Promise<AsignacionVerificadaFinanzas> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const servicio = crearClienteServicio(entorno)
  await leerCampanaFinanzas(servicio, campanaId)
  const datos = MEDIOS_FINANZAS[medio]
  const oferta =
    (await ofertaDisponible(servicio, campanaId, datos.id)) ??
    (await crearOfertaFinanzas(entorno, partes.empresa, campanaId))
  const preparada = await prepararAsignacion(entorno, partes.medios[medio], {
    ofertaId: oferta.id,
    hasta: "VERIFICADA",
  })
  return {
    asignacionId: preparada.asignacionId,
    medio,
    medioId: datos.id,
    campanaId,
    ofertaId: oferta.id,
    ofertaTitulo: oferta.titulo,
    montoBruto: preparada.aceptacion.montoBruto,
    montoMedio: preparada.aceptacion.montoMedio,
  }
}

// ── Liquidaciones ────────────────────────────────────────────────────────────

export interface OpcionesLiquidacionFinanzas {
  medio: MedioFinanzas
  hasta: EtapaLiquidacion
  /**
   * Campaña «Finanzas E2E» donde verificar una asignación si el medio no tiene
   * ninguna por liquidar (por omisión, una campaña nueva).
   */
  campanaId?: string
  /** Medio que no factura, con `hasta` EMITIDA o PAGADA: registra además el CUDS (transmitido). */
  conCuds?: boolean
  /** Con `hasta` EMITIDA o PAGADA: la incluye en un archivo de pagos («En proceso de pago»). */
  dispersada?: boolean
}

export interface LiquidacionFinanzas {
  liquidacionId: string
  medio: MedioFinanzas
  medioId: string
  estado: EstadoLiquidacion
  periodo: PeriodoLiquidacion
  asignacionIds: string[]
  montoMedio: number
  montoRetenciones: number
  montoNeto: number
  requiereDocumentoSoporte: boolean
  alertaSegSocial: boolean
  documentoSoporte: {
    id: string
    estado: Database["public"]["Enums"]["documento_soporte_estado"]
    numero: string | null
    cuds: string | null
    archivoPath: string | null
  } | null
  facturaMedio: { numero: string; archivoPath: string } | null
  pago: { fecha: string; referencia: string | null; soportePath: string } | null
  dispersionId: string | null
}

async function pendientesDeLiquidar(
  servicio: ClienteSupabase,
  medioId: string
): Promise<number> {
  const { count, error } = await servicio
    .from("asignaciones")
    .select("id", { count: "exact", head: true })
    .eq("medio_id", medioId)
    .eq("estado", "VERIFICADA")
    .is("liquidacion_id", null)
  if (error) fallo("No se pudieron contar las asignaciones por liquidar", error)
  return count ?? 0
}

async function ultimaFinVigente(
  servicio: ClienteSupabase,
  medioId: string
): Promise<string | null> {
  const { data, error } = await servicio
    .from("liquidaciones")
    .select("periodo_fin")
    .eq("medio_id", medioId)
    .neq("estado", "ANULADA")
    .order("periodo_fin", { ascending: false })
    .limit(1)
  if (error) fallo("No se pudieron leer las liquidaciones del medio", error)
  return data[0]?.periodo_fin ?? null
}

/** La resolución activa y vigente del tipo, o error claro (llama a `asegurarResolucionesPrueba`). */
async function resolucionVigente(
  servicio: ClienteSupabase,
  tipo: Tablas["resoluciones_dian"]["Row"]["tipo"]
): Promise<Tablas["resoluciones_dian"]["Row"]> {
  const hoy = hoyEnBogota()
  const { data, error } = await servicio
    .from("resoluciones_dian")
    .select("*")
    .eq("tipo", tipo)
    .eq("activa", true)
    .lte("vigente_desde", hoy)
    .maybeSingle()
  if (error) fallo("No se pudo leer la resolución DIAN", error)
  if (!data || (data.vigente_hasta !== null && data.vigente_hasta < hoy)) {
    throw new ErrorBootstrap(
      `No hay una resolución de ${tipo} activa y vigente: llama a resolucionesPruebaE2E().`
    )
  }
  return data
}

async function consecutivoLibre(
  servicio: ClienteSupabase,
  resolucion: Tablas["resoluciones_dian"]["Row"],
  tabla: "documentos_soporte" | "facturas"
): Promise<number> {
  const { data, error } = await servicio
    .from(tabla)
    .select("consecutivo")
    .eq("resolucion_id", resolucion.id)
    .not("consecutivo", "is", null)
    .order("consecutivo", { ascending: false })
    .limit(1)
  if (error) fallo("No se pudieron leer los consecutivos usados", error)
  const siguiente = siguienteConsecutivo({
    consecutivoActual: resolucion.consecutivo_actual,
    usados: data.flatMap((fila) =>
      fila.consecutivo === null ? [] : [fila.consecutivo]
    ),
    rangoDesde: resolucion.rango_desde,
    rangoHasta: resolucion.rango_hasta,
  })
  if (siguiente === null) {
    throw new ErrorBootstrap(
      `La resolución ${resolucion.prefijo} ${resolucion.numero_resolucion} se agotó.`
    )
  }
  return siguiente
}

/**
 * Documento soporte de una liquidación aprobada, como lo haría Finanzas: con
 * la numeración de la plataforma, `emitir_documento_soporte_srv` y los
 * archivos (PDF y archivo para el proveedor, de muestra) adjuntos; con la del
 * proveedor, el PDF del proveedor y `registrar_documento_soporte_externo_srv`.
 */
async function emitirDocumentoSoporte(
  sesion: SesionInterna,
  liquidacionId: string,
  { conCuds }: { conCuds: boolean }
): Promise<void> {
  const { servicio, actor } = sesion
  const rutas = rutasStorage()
  const numeracion = await valorConfiguracion(
    servicio,
    "tributario.numeracion_documento_soporte"
  )
  if (numeracion === "PROVEEDOR") {
    const { data: documentoId, error } = await servicio.rpc(
      "preparar_documento_soporte_srv",
      {
        p_liquidacion_id: liquidacionId,
        p_actor_id: actor.usuarioId,
        p_session_id: actor.sesionId,
      }
    )
    if (error) fallo("No se pudo preparar el documento soporte", error)
    const resolucion = await resolucionVigente(servicio, "DOCUMENTO_SOPORTE")
    const consecutivo = await consecutivoLibre(
      servicio,
      resolucion,
      "documentos_soporte"
    )
    const pdf = await subir(
      sesion.cliente,
      rutas.carpetaSoporte("documento_soporte", documentoId),
      pdfE2E("Documento soporte del proveedor (pruebas E2E)", [
        `Número ${resolucion.prefijo}${consecutivo}`,
      ]),
      "application/pdf"
    )
    const { error: errorRegistro } = await servicio.rpc(
      "registrar_documento_soporte_externo_srv",
      {
        p_documento_id: documentoId,
        p_prefijo: resolucion.prefijo,
        p_consecutivo: consecutivo,
        p_fecha_emision: hoyEnBogota(),
        p_cuds: codigoDianE2E(),
        p_archivo_path: pdf,
        p_actor_id: actor.usuarioId,
        p_session_id: actor.sesionId,
      }
    )
    if (errorRegistro)
      fallo("No se pudo registrar el documento soporte", errorRegistro)
    return
  }
  const { data: documentoId, error } = await servicio.rpc(
    "emitir_documento_soporte_srv",
    {
      p_liquidacion_id: liquidacionId,
      p_actor_id: actor.usuarioId,
      p_session_id: actor.sesionId,
    }
  )
  if (error) fallo("No se pudo emitir el documento soporte", error)
  const carpeta = rutas.carpetaSoporte("documento_soporte", documentoId)
  const pdf = await subir(
    sesion.cliente,
    carpeta,
    pdfE2E("Documento soporte de muestra (pruebas E2E)", [
      "VERSIÓN DE PRUEBA — SIN VALIDEZ FISCAL",
    ]),
    "application/pdf"
  )
  const archivoProveedor = await subir(
    sesion.cliente,
    carpeta,
    Buffer.from(
      JSON.stringify({
        formato: "AMO-DS-1",
        prueba: true,
        documento: documentoId,
        liquidacion: liquidacionId,
      })
    ),
    "application/json"
  )
  const { error: errorArchivos } = await servicio.rpc(
    "adjuntar_archivos_documento_soporte_srv",
    {
      p_documento_id: documentoId,
      p_pdf_path: pdf,
      p_archivo_proveedor_path: archivoProveedor,
      p_actor_id: actor.usuarioId,
      p_session_id: actor.sesionId,
    }
  )
  if (errorArchivos)
    fallo("No se pudieron adjuntar los archivos del documento", errorArchivos)
  if (conCuds) {
    const { error: errorCuds } = await servicio.rpc("registrar_cuds_srv", {
      p_documento_id: documentoId,
      p_cuds: codigoDianE2E(),
      p_actor_id: actor.usuarioId,
      p_session_id: actor.sesionId,
    })
    if (errorCuds) fallo("No se pudo registrar el CUDS", errorCuds)
  }
}

/** El medio que factura carga su factura con su sesión (PDF a `liquidacion/{id}/factura/`). */
async function registrarFacturaMedio(
  entorno: EntornoBootstrap,
  medio: MedioPauta,
  liquidacionId: string
): Promise<void> {
  await conClienteDeUsuario(
    entorno,
    medio.credenciales,
    async (cliente, actor) => {
      const numero = numeroFacturaMedioE2E(sufijoUnico())
      const ruta = await subir(
        cliente,
        rutasStorage().carpetaSoporte("liquidacion", liquidacionId, "factura"),
        pdfE2E("Factura electrónica del medio (pruebas E2E)", [
          `Factura ${numero}`,
        ]),
        "application/pdf"
      )
      const { error } = await crearClienteServicio(
        entorno,
        actor.usuarioId
      ).rpc("registrar_factura_medio_srv", {
        p_liquidacion_id: liquidacionId,
        p_numero: numero,
        p_archivo_path: ruta,
        p_actor_id: actor.usuarioId,
        p_session_id: actor.sesionId,
      })
      if (error) fallo("No se pudo registrar la factura del medio", error)
    }
  )
}

function textoDescifrado(
  valor: string | null,
  medioId: string,
  columna: "numero_documento_cifrado" | "datos_pago_cifrados"
): string {
  if (!valor) {
    throw new ErrorBootstrap(
      "El medio no tiene sus datos de pago completos: ejecuta `pnpm bootstrap:e2e`."
    )
  }
  return cifradorDelEntorno().descifrar(
    valor,
    contextoCifrado(medioId, columna)
  )
}

/**
 * Archivo de pagos como el de la app, en dos pasos: `datos_dispersion_srv`
 * (revela los datos de pago cifrados y deja un REVELAR_DATO por medio), CSV
 * con los datos descifrados en el servidor (ficticios; no se imprimen) subido
 * con el cliente de servicio y `registrar_dispersion_srv`.
 */
async function dispersar(
  entorno: EntornoBootstrap,
  sesion: SesionInterna,
  liquidacionIds: readonly string[]
): Promise<string> {
  const { servicio, actor } = sesion
  const { data, error } = await servicio.rpc("datos_dispersion_srv", {
    p_liquidacion_ids: [...liquidacionIds],
    p_actor_id: actor.usuarioId,
    p_session_id: actor.sesionId,
  })
  if (error) fallo("No se pudieron revelar los datos de pago", error)
  const hoy = hoyEnBogota()
  const filas: FilaDispersionE2E[] = data.map((fila) => {
    const cuenta = leerCuentaPago(
      textoDescifrado(
        fila.datos_pago_cifrados,
        fila.medio_id,
        "datos_pago_cifrados"
      )
    )
    if (!cuenta) {
      throw new ErrorBootstrap(
        `La cuenta de pago de «${fila.medio}» no se puede leer.`
      )
    }
    return {
      tipoDocumento: fila.tipo_documento,
      numeroDocumento: textoDescifrado(
        fila.numero_documento_cifrado,
        fila.medio_id,
        "numero_documento_cifrado"
      ),
      titular: fila.titular_nombre,
      metodo: fila.metodo_pago,
      entidad: cuenta.metodo === "BANCARIO" ? cuenta.banco : cuenta.proveedor,
      tipoCuenta: cuenta.metodo === "BANCARIO" ? cuenta.tipoCuenta : "",
      numeroCuenta: cuenta.numero,
      valor: Number(fila.monto_neto),
      referencia: referenciaDispersionE2E(fila.liquidacion_id, hoy),
      medio: fila.medio,
    }
  })
  const dispersionId = randomUUID()
  const ruta = await subir(
    crearClienteServicio(entorno),
    rutasStorage().carpetaSoporte("dispersion", dispersionId),
    Buffer.from(csvDispersionE2E(filas), "utf8"),
    "text/csv"
  )
  const { error: errorRegistro } = await servicio.rpc(
    "registrar_dispersion_srv",
    {
      p_dispersion_id: dispersionId,
      p_liquidacion_ids: [...liquidacionIds],
      p_archivo_path: ruta,
      p_actor_id: actor.usuarioId,
      p_session_id: actor.sesionId,
    }
  )
  if (errorRegistro)
    fallo("No se pudo registrar el archivo de pagos", errorRegistro)
  return dispersionId
}

/** Finanzas registra el pago con su soporte (PDF a `liquidacion/{id}/pago/`) y la fecha de hoy. */
async function registrarPago(
  sesion: SesionInterna,
  liquidacionId: string
): Promise<void> {
  const referencia = referenciaPagoE2E(sufijoUnico())
  const ruta = await subir(
    sesion.cliente,
    rutasStorage().carpetaSoporte("liquidacion", liquidacionId, "pago"),
    pdfE2E("Comprobante de transferencia (pruebas E2E)", [
      `Referencia ${referencia}`,
    ]),
    "application/pdf"
  )
  const { error } = await sesion.servicio.rpc(
    "registrar_pago_liquidacion_srv",
    {
      p_liquidacion_id: liquidacionId,
      p_fecha: hoyEnBogota(),
      p_referencia: referencia,
      p_soporte_path: ruta,
      p_actor_id: sesion.actor.usuarioId,
      p_session_id: sesion.actor.sesionId,
    }
  )
  if (error) fallo("No se pudo registrar el pago", error)
}

/** La liquidación como quedó (con el cliente de servicio). */
export async function leerLiquidacionFinanzas(
  entorno: EntornoBootstrap,
  liquidacionId: string
): Promise<LiquidacionFinanzas> {
  const { data, error } = await crearClienteServicio(entorno)
    .from("liquidaciones")
    .select(
      `id, medio_id, estado, periodo_inicio, periodo_fin, monto_medio, monto_retenciones, monto_neto,
       requiere_documento_soporte, alerta_seg_social, numero_factura_medio, factura_medio_path, fecha_pago,
       referencia_pago, soporte_pago_path, dispersion_id,
       asignaciones ( id ),
       documentos_soporte ( id, estado, numero, cuds, archivo_path, created_at )`
    )
    .eq("id", liquidacionId)
    .single()
  if (error) fallo(`No se pudo leer la liquidación ${liquidacionId}`, error)
  const medio = Object.values(MEDIOS_FINANZAS).find(
    (candidato) => candidato.id === data.medio_id
  )
  if (!medio) {
    throw new ErrorBootstrap(
      `La liquidación ${liquidacionId} no es de un medio de Finanzas.`
    )
  }
  const documento =
    [...data.documentos_soporte]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .find((fila) => fila.estado !== "ANULADO") ?? null
  return {
    liquidacionId: data.id,
    medio: medio.cuenta,
    medioId: data.medio_id,
    estado: data.estado,
    periodo: { inicio: data.periodo_inicio, fin: data.periodo_fin },
    asignacionIds: data.asignaciones.map((fila) => fila.id).sort(),
    montoMedio: Number(data.monto_medio),
    montoRetenciones: Number(data.monto_retenciones),
    montoNeto: Number(data.monto_neto),
    requiereDocumentoSoporte: data.requiere_documento_soporte,
    alertaSegSocial: data.alerta_seg_social,
    documentoSoporte: documento
      ? {
          id: documento.id,
          estado: documento.estado,
          numero: documento.numero,
          cuds: documento.cuds,
          archivoPath: documento.archivo_path,
        }
      : null,
    facturaMedio:
      data.numero_factura_medio && data.factura_medio_path
        ? {
            numero: data.numero_factura_medio,
            archivoPath: data.factura_medio_path,
          }
        : null,
    pago:
      data.fecha_pago && data.soporte_pago_path
        ? {
            fecha: data.fecha_pago,
            referencia: data.referencia_pago,
            soportePath: data.soporte_pago_path,
          }
        : null,
    dispersionId: data.dispersion_id,
  }
}

/**
 * Liquidación del medio en la etapa pedida. Liquida TODO lo verificado sin
 * liquidar del medio (si no tiene nada, verifica antes una asignación en
 * `campanaId` o en una campaña nueva) con el periodo que termina hoy
 * (`periodoParaLiquidar`): una liquidación vigente por medio y por día. La
 * genera el ADMIN E2E y la sigue Finanzas (`hasta`).
 */
export async function prepararLiquidacionFinanzas(
  entorno: EntornoBootstrap,
  partes: PartesFinanzas,
  opciones: OpcionesLiquidacionFinanzas
): Promise<LiquidacionFinanzas> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const { medio, hasta } = opciones
  const datos = MEDIOS_FINANZAS[medio]
  const servicio = crearClienteServicio(entorno)
  // Antes de crear nada: con una liquidación vigente que ya cubre hoy no cabe otra.
  const periodo = periodoParaLiquidar({
    hoy: hoyEnBogota(),
    periodicidad: leerPeriodicidad(
      await valorConfiguracion(servicio, "liquidaciones.periodicidad")
    ),
    ultimaFin: await ultimaFinVigente(servicio, datos.id),
  })
  if (!periodo) {
    throw new ErrorBootstrap(
      `«${datos.nombre}» ya tiene una liquidación vigente que cubre hoy (la BD no admite traslapes): llama antes a restablecerFinanzasE2E() o usa el otro medio.`
    )
  }
  if ((await pendientesDeLiquidar(servicio, datos.id)) === 0) {
    const campanaId =
      opciones.campanaId ?? (await crearCampanaFinanzas(entorno, partes)).id
    await prepararAsignacionVerificadaFinanzas(entorno, partes, {
      medio,
      campanaId,
    })
  }
  const liquidacionId = await conSesionInterna(
    entorno,
    partes.administracion,
    async ({ servicio: comoAdmin, actor }) => {
      const { data, error } = await comoAdmin.rpc("generar_liquidacion_srv", {
        p_medio_id: datos.id,
        p_periodo_inicio: periodo.inicio,
        p_periodo_fin: periodo.fin,
        p_actor_id: actor.usuarioId,
        p_session_id: actor.sesionId,
      })
      if (error) fallo(`No se pudo liquidar a «${datos.nombre}»`, error)
      return data
    }
  )
  if (llegaLiquidacion(hasta, "APROBADA")) {
    await conSesionInterna(entorno, partes.finanzas, async (sesion) => {
      await transicionarComo(sesion.servicio, sesion.actor, {
        entidad: "liquidaciones",
        id: liquidacionId,
        hacia: "APROBADA",
      })
      if (llegaLiquidacion(hasta, "EMITIDA") && !datos.factura) {
        await emitirDocumentoSoporte(sesion, liquidacionId, {
          conCuds: opciones.conCuds ?? false,
        })
      }
    })
  }
  if (llegaLiquidacion(hasta, "EMITIDA") && datos.factura) {
    await registrarFacturaMedio(entorno, partes.medios[medio], liquidacionId)
  }
  if (llegaLiquidacion(hasta, "EMITIDA")) {
    await conSesionInterna(entorno, partes.finanzas, async (sesion) => {
      if (opciones.dispersada) {
        await dispersar(entorno, sesion, [liquidacionId])
      }
      if (llegaLiquidacion(hasta, "PAGADA")) {
        await registrarPago(sesion, liquidacionId)
      }
    })
  }
  return leerLiquidacionFinanzas(entorno, liquidacionId)
}

// ── Facturas al anunciante ───────────────────────────────────────────────────

export interface OpcionesFacturaFinanzas {
  campanaId: string
  hasta: EtapaFactura
  /** Medio con el que se verifica una asignación si la campaña no tiene nada por facturar. */
  medio?: MedioFinanzas
}

export interface FacturaFinanzas {
  facturaId: string
  campanaId: string
  anuncianteId: string
  estado: EstadoFactura
  esquema: string
  subtotal: number
  iva: number
  valorTerceros: number
  total: number
  saldo: number
  /** Con prefijo (p. ej. «DEMO162»); `null` en borrador. */
  numero: string | null
  cufe: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  archivoPath: string | null
  asignacionIds: string[]
}

async function pendientesDeFacturar(
  servicio: ClienteSupabase,
  campanaId: string
): Promise<number> {
  const { count, error } = await servicio
    .from("asignaciones")
    .select("id", { count: "exact", head: true })
    .eq("campana_id", campanaId)
    .in("estado", ["VERIFICADA", "LIQUIDADA", "PAGADA"])
    .is("factura_id", null)
  if (error) fallo("No se pudieron contar las asignaciones por facturar", error)
  return count ?? 0
}

/** La factura como quedó (con el cliente de servicio). */
export async function leerFacturaFinanzas(
  entorno: EntornoBootstrap,
  facturaId: string
): Promise<FacturaFinanzas> {
  const { data, error } = await crearClienteServicio(entorno)
    .from("facturas")
    .select(
      `id, campana_id, anunciante_id, estado, esquema, subtotal, iva, valor_terceros, total, saldo, numero, cufe,
       fecha_emision, fecha_vencimiento, archivo_path, asignaciones ( id )`
    )
    .eq("id", facturaId)
    .single()
  if (error) fallo(`No se pudo leer la factura ${facturaId}`, error)
  return {
    facturaId: data.id,
    campanaId: data.campana_id ?? "",
    anuncianteId: data.anunciante_id,
    estado: data.estado,
    esquema: data.esquema,
    subtotal: Number(data.subtotal),
    iva: Number(data.iva),
    valorTerceros: Number(data.valor_terceros),
    total: Number(data.total),
    saldo: Number(data.saldo),
    numero: data.numero,
    cufe: data.cufe,
    fechaEmision: data.fecha_emision,
    fechaVencimiento: data.fecha_vencimiento,
    archivoPath: data.archivo_path,
    asignacionIds: data.asignaciones.map((fila) => fila.id).sort(),
  }
}

/**
 * Factura de la campaña (no consolidada) por lo verificado sin facturar hasta
 * hoy: Finanzas genera el borrador (`generar_factura_srv`) y, con `EMITIDA`,
 * la registra como expedida en el software de AMO (número libre de la
 * resolución FACTURA_VENTA vigente, CUFE de 96 hex, PDF de muestra en
 * `factura/{id}/` y el total del borrador). Si la campaña no tiene nada por
 * facturar, antes verifica una asignación (`medio`, el Medio Finanzas E2E por
 * omisión).
 */
export async function prepararFacturaFinanzas(
  entorno: EntornoBootstrap,
  partes: PartesFinanzas,
  { campanaId, hasta, medio = "MEDIO_FINANZAS" }: OpcionesFacturaFinanzas
): Promise<FacturaFinanzas> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const servicio = crearClienteServicio(entorno)
  const campana = await leerCampanaFinanzas(servicio, campanaId)
  if ((await pendientesDeFacturar(servicio, campanaId)) === 0) {
    await prepararAsignacionVerificadaFinanzas(entorno, partes, {
      medio,
      campanaId,
    })
  }
  const hoy = hoyEnBogota()
  const facturaId = await conSesionInterna(
    entorno,
    partes.finanzas,
    async (sesion) => {
      const { servicio: comoFinanzas, actor } = sesion
      const { data: id, error } = await comoFinanzas.rpc(
        "generar_factura_srv",
        {
          p_anunciante_id: campana.anuncianteId,
          p_campana_id: campanaId,
          p_periodo_desde: hoy,
          p_periodo_hasta: hoy,
          p_actor_id: actor.usuarioId,
          p_session_id: actor.sesionId,
        }
      )
      if (error) fallo("No se pudo generar la factura", error)
      if (hasta === "EMITIDA") {
        const borrador = await leerFacturaFinanzas(entorno, id)
        const resolucion = await resolucionVigente(servicio, "FACTURA_VENTA")
        const consecutivo = await consecutivoLibre(
          servicio,
          resolucion,
          "facturas"
        )
        const pdf = await subir(
          sesion.cliente,
          rutasStorage().carpetaSoporte("factura", id),
          pdfE2E("Factura electrónica de venta (pruebas E2E)", [
            `Factura ${resolucion.prefijo}${consecutivo}`,
          ]),
          "application/pdf"
        )
        const { error: errorExpedida } = await comoFinanzas.rpc(
          "registrar_factura_expedida_srv",
          argumentosRpc<"registrar_factura_expedida_srv">({
            p_factura_id: id,
            p_prefijo: resolucion.prefijo,
            p_consecutivo: consecutivo,
            p_cufe: codigoDianE2E(),
            p_fecha_emision: hoy,
            p_fecha_vencimiento: null,
            p_total: borrador.total,
            p_archivo_path: pdf,
            p_actor_id: actor.usuarioId,
            p_session_id: actor.sesionId,
          })
        )
        if (errorExpedida)
          fallo("No se pudo registrar la factura expedida", errorExpedida)
      }
      return id
    }
  )
  return leerFacturaFinanzas(entorno, facturaId)
}

// ── Resoluciones de prueba ───────────────────────────────────────────────────

export interface ResolucionAsegurada {
  tipo: Tablas["resoluciones_dian"]["Row"]["tipo"]
  /** `vigente`: ya había una activa y vigente; `creada`/`activada`: la de prueba. */
  accion: "vigente" | "creada" | "activada"
  prefijo: string
}

/**
 * Garantiza una resolución activa y vigente de documento soporte y de factura:
 * si no la hay, crea (o activa) las «PRUEBA» (`PDS` y `PFE`, 1–5000, de los
 * planes de `pnpm prod:config-pruebas`) a nombre del superadministrador. Una
 * activa que ya venció no se toca: lanza para que se actualice.
 */
export async function asegurarResolucionesPrueba(
  entorno: EntornoBootstrap
): Promise<ResolucionAsegurada[]> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  const superadmin = await clienteComoSuperadmin(entorno)
  const { data, error } = await superadmin
    .from("resoluciones_dian")
    .select(
      "id, tipo, prefijo, numero_resolucion, activa, vigente_desde, vigente_hasta"
    )
  if (error) fallo("No se pudieron leer las resoluciones DIAN", error)
  const resultado: ResolucionAsegurada[] = []
  for (const paso of planResoluciones(data, hoyEnBogota())) {
    const { tipo, prefijo } = paso.resolucion
    switch (paso.tipo) {
      case "vigente":
        resultado.push({ tipo, accion: "vigente", prefijo: paso.prefijo })
        break
      case "activa-vencida":
        throw new ErrorBootstrap(
          `La resolución activa de ${tipo} (prefijo «${paso.prefijo}») no está vigente hoy: actualízala en Configuración › Tributario.`
        )
      case "activar": {
        const { error: errorActivar } = await superadmin
          .from("resoluciones_dian")
          .update({ activa: true })
          .eq("id", paso.id)
        if (errorActivar)
          fallo("No se pudo activar la resolución de prueba", errorActivar)
        resultado.push({ tipo, accion: "activada", prefijo })
        break
      }
      case "crear": {
        const { error: errorCrear } = await superadmin
          .from("resoluciones_dian")
          .insert({
            tipo,
            prefijo,
            numero_resolucion: paso.resolucion.numeroResolucion,
            fecha_resolucion: paso.fechaResolucion,
            rango_desde: paso.resolucion.rangoDesde,
            rango_hasta: paso.resolucion.rangoHasta,
            consecutivo_actual: paso.resolucion.rangoDesde - 1,
            vigente_desde: paso.vigenteDesde,
            vigente_hasta: paso.vigenteHasta,
            activa: true,
          })
        if (errorCrear)
          fallo("No se pudo crear la resolución de prueba", errorCrear)
        resultado.push({ tipo, accion: "creada", prefijo })
        break
      }
    }
  }
  return resultado
}

// ── Limpieza ─────────────────────────────────────────────────────────────────

interface ObjetoStorage {
  bucket_id: string
  name: string
}

interface Borrado {
  conteos: Omit<FinanzasRestablecidas, "archivos">
  objetos: ObjetoStorage[]
}

/**
 * La transacción de la limpieza, por la conexión directa de Postgres como
 * `postgres` en modo carga y purga (las tablas de solo inserción y los
 * documentos protegidos solo se borran así). Devuelve qué borró y los objetos
 * de Storage que colgaban de esas filas (se borran después con la API).
 */
async function borrarFilasFinanzas(
  url: string,
  ssl: "require" | false
): Promise<Borrado> {
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl,
    idle_timeout: 5,
    onnotice: () => {},
    connection: { application_name: "amo-fabricas-finanzas-e2e" },
  })
  const medios = Object.values(MEDIOS_FINANZAS).map((medio) => medio.id)
  try {
    return await sql.begin(async (tx) => {
      await tx`set local amo.modo_carga = 'on'`
      await tx`set local amo.purga = 'on'`
      await tx`set local lock_timeout = '5s'`
      await tx`set local statement_timeout = '60s'`
      await tx`create temp table fin_campanas on commit drop as
        select c.id from public.campanas c
         where c.anunciante_id = any(${sql.array([...ANUNCIANTES_E2E])}::uuid[])
           and c.nombre like ${`${PREFIJO_FINANZAS}%`}`
      await tx`create temp table fin_ofertas on commit drop as
        select o.id from public.ofertas o where o.campana_id in (select id from fin_campanas)`
      await tx`create temp table fin_asignaciones on commit drop as
        select a.id, a.campana_id from public.asignaciones a
         where a.medio_id = any(${sql.array(medios)}::uuid[]) or a.campana_id in (select id from fin_campanas)`
      // Borrar una asignación de otra campaña descuadraría los cupos de su oferta.
      const ajenas = await tx<{ id: string }[]>`
        select id from fin_asignaciones where campana_id not in (select id from fin_campanas) limit 5`
      if (ajenas.length > 0) {
        throw new ErrorBootstrap(
          `Los medios de Finanzas tienen asignaciones fuera de las campañas «${PREFIJO_FINANZAS}» (${ajenas.map((fila) => fila.id).join(", ")}): no son de estas fábricas y borrarlas descuadraría los cupos de su oferta. Cancélalas o bórralas con su campaña.`
        )
      }
      await tx`create temp table fin_disputas on commit drop as
        select d.id from public.disputas d where d.asignacion_id in (select id from fin_asignaciones)`
      await tx`create temp table fin_liquidaciones on commit drop as
        select l.id from public.liquidaciones l
         where l.medio_id = any(${sql.array(medios)}::uuid[])
            or l.id in (select a.liquidacion_id from public.asignaciones a
                         where a.id in (select id from fin_asignaciones))`
      await tx`create temp table fin_documentos on commit drop as
        select d.id from public.documentos_soporte d where d.liquidacion_id in (select id from fin_liquidaciones)`
      await tx`create temp table fin_dispersiones on commit drop as
        select distinct l.dispersion_id as id from public.liquidaciones l
         where l.id in (select id from fin_liquidaciones) and l.dispersion_id is not null`
      await tx`create temp table fin_facturas on commit drop as
        select f.id from public.facturas f
         where f.campana_id in (select id from fin_campanas)
            or f.id in (select a.factura_id from public.asignaciones a
                         where a.id in (select id from fin_asignaciones))`

      // Las resoluciones que numeraron lo que se borra: su consecutivo vuelve al último que sigue usado.
      await tx`create temp table fin_resoluciones on commit drop as
        select d.resolucion_id as id from public.documentos_soporte d
         where d.id in (select id from fin_documentos) and d.resolucion_id is not null
        union
        select f.resolucion_id from public.facturas f
         where f.id in (select id from fin_facturas) and f.resolucion_id is not null`

      const objetos = await tx<ObjetoStorage[]>`
        select o.bucket_id, o.name from storage.objects o
         where (o.bucket_id = 'soportes' and (
                  (split_part(o.name, '/', 1) = 'liquidacion'
                     and split_part(o.name, '/', 2) in (select id::text from fin_liquidaciones))
               or (split_part(o.name, '/', 1) = 'documento_soporte'
                     and split_part(o.name, '/', 2) in (select id::text from fin_documentos))
               or (split_part(o.name, '/', 1) = 'dispersion'
                     and split_part(o.name, '/', 2) in (select id::text from fin_dispersiones))
               or (split_part(o.name, '/', 1) in ('factura', 'pago')
                     and split_part(o.name, '/', 2) in (select id::text from fin_facturas))))
            or (o.bucket_id = 'evidencias' and (
                  (split_part(o.name, '/', 1) = 'asignacion'
                     and split_part(o.name, '/', 2) in (select id::text from fin_asignaciones))
               or (split_part(o.name, '/', 1) = 'disputa'
                     and split_part(o.name, '/', 2) in (select id::text from fin_disputas))))
            or (o.bucket_id = 'creativos' and split_part(o.name, '/', 1) = 'oferta'
                  and split_part(o.name, '/', 2) in (select id::text from fin_ofertas))`

      const notificaciones = await tx`
        delete from public.notificaciones n where n.entidad_id in (
          select id::text from fin_asignaciones union select id::text from fin_disputas
          union select id::text from fin_liquidaciones union select id::text from fin_documentos
          union select id::text from fin_dispersiones union select id::text from fin_facturas
          union select id::text from fin_ofertas union select id::text from fin_campanas)`
      // Una factura consolidada puede llevar asignaciones de otras campañas: quedan sin factura.
      await tx`update public.asignaciones a set factura_id = null
                where a.factura_id in (select id from fin_facturas)
                  and a.id not in (select id from fin_asignaciones)`
      // Las asignaciones antes que sus liquidaciones y facturas (FK): una
      // LIQUIDADA o PAGADA no puede quedar sin su liquidación (CHECK).
      await tx`delete from public.disputas d where d.id in (select id from fin_disputas)`
      await tx`delete from public.metricas m where m.asignacion_id in (select id from fin_asignaciones)`
      await tx`delete from public.publicaciones p where p.asignacion_id in (select id from fin_asignaciones)`
      const asignaciones = await tx`
        delete from public.asignaciones a where a.id in (select id from fin_asignaciones)`
      const notasCredito = await tx`
        delete from public.notas_credito n where n.factura_id in (select id from fin_facturas)`
      const pagos = await tx`
        delete from public.pagos_anunciante p where p.factura_id in (select id from fin_facturas)`
      const facturas = await tx`
        delete from public.facturas f where f.id in (select id from fin_facturas)`
      // Un archivo de pagos con liquidaciones de otros medios: esas vuelven a estar sin archivo.
      await tx`update public.liquidaciones l set dispersion_id = null
                where l.dispersion_id in (select id from fin_dispersiones)
                  and l.id not in (select id from fin_liquidaciones)`
      const documentos = await tx`
        delete from public.documentos_soporte d where d.id in (select id from fin_documentos)`
      const liquidaciones = await tx`
        delete from public.liquidaciones l where l.id in (select id from fin_liquidaciones)`
      const dispersiones = await tx`
        delete from public.dispersiones d where d.id in (select id from fin_dispersiones)`
      // Sin huecos en la numeración de la plataforma: el consecutivo vuelve al
      // último número que sigue registrado (nunca sube).
      await tx`update public.resoluciones_dian r set consecutivo_actual = x.ultimo
                 from (select r2.id,
                              greatest(r2.rango_desde - 1,
                                       coalesce((select max(d.consecutivo) from public.documentos_soporte d
                                                  where d.resolucion_id = r2.id), 0),
                                       coalesce((select max(f.consecutivo) from public.facturas f
                                                  where f.resolucion_id = r2.id), 0)) as ultimo
                         from public.resoluciones_dian r2
                        where r2.id in (select id from fin_resoluciones)) x
                where r.id = x.id and r.consecutivo_actual > x.ultimo`
      await tx`delete from public.creativo_archivos ca using public.creativos c
                where ca.creativo_id = c.id and c.oferta_id in (select id from fin_ofertas)`
      await tx`delete from public.creativos c where c.oferta_id in (select id from fin_ofertas)`
      await tx`delete from public.ofertas o where o.id in (select id from fin_ofertas)`
      await tx`delete from public.comisiones_excepcion ce where ce.campana_id in (select id from fin_campanas)`
      const campanas = await tx`
        delete from public.campanas c where c.id in (select id from fin_campanas)`
      return {
        conteos: {
          campanas: campanas.count,
          asignaciones: asignaciones.count,
          liquidaciones: liquidaciones.count,
          documentosSoporte: documentos.count,
          dispersiones: dispersiones.count,
          facturas: facturas.count,
          pagos: pagos.count,
          notasCredito: notasCredito.count,
          notificaciones: notificaciones.count,
        },
        objetos: [...objetos],
      }
    })
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function borrarObjetos(
  servicio: ClienteSupabase,
  objetos: readonly ObjetoStorage[]
): Promise<number> {
  const porBucket = new Map<string, string[]>()
  for (const { bucket_id, name } of objetos) {
    porBucket.set(bucket_id, [...(porBucket.get(bucket_id) ?? []), name])
  }
  let borrados = 0
  for (const [bucket, rutas] of porBucket) {
    for (const trozo of trozos(rutas)) {
      const { data, error } = await servicio.storage.from(bucket).remove(trozo)
      if (error) fallo(`No se pudieron borrar archivos de ${bucket}`, error)
      borrados += data.length
    }
  }
  return borrados
}

/**
 * Deja la base sin las pruebas de Finanzas anteriores, para que cada corrida
 * genere su corte sin traslapes: las campañas «Finanzas E2E» de las empresas
 * E2E (ofertas, creativos y sus facturas, pagos y notas crédito) y TODO lo de
 * los dos medios de Finanzas (asignaciones, liquidaciones, documentos soporte
 * y archivos de pagos), con sus avisos y sus archivos en Storage. Las
 * resoluciones que numeraron lo borrado vuelven a su último número usado (la
 * numeración de la plataforma queda sin huecos). Solo la base
 * local o develop (por la conexión directa: `.env.db.develop` para develop);
 * nunca producción. Cierra también las sesiones internas de las fábricas.
 */
export async function restablecerFinanzas(
  entorno: EntornoBootstrap
): Promise<FinanzasRestablecidas> {
  exigirFueraDeProduccion(entorno.url, CONTEXTO)
  let base
  try {
    base = baseRestablecible(entorno.url)
  } catch (error) {
    throw new ErrorBootstrap(
      error instanceof Error ? error.message : String(error)
    )
  }
  const url = base === "local" ? URL_DB_LOCAL : urlDb("develop")
  const { conteos, objetos } = await borrarFilasFinanzas(url, sslDe(base))
  const archivos = await borrarObjetos(crearClienteServicio(entorno), objetos)
  await cerrarSesionesInternas()
  return { ...conteos, archivos }
}
