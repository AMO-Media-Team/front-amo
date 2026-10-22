"use server"

/**
 * Server Actions de «Mi medio › Cuentas sociales» (MED-005, MED-006).
 *
 * 1. DAL (`requerirPermiso("medios.editar_propio")`) antes que nada, y el medio
 *    de la sesión (nunca uno que mande el cliente).
 * 2. zod: el MISMO esquema que el formulario.
 * 3. Escrituras con el cliente del USUARIO (RLS propia + bitácora con actor):
 *    alta y edición de cuentas, verificación MANUAL y la captura de una
 *    verificación pendiente. Como SERVICIO (`contextoDelActor`, tras leer la
 *    fila con la sesión para probar que es del medio):
 *    - el código de la historia (CODIGO_HISTORIA solo la crea `service_role`:
 *      el servidor genera el código y guarda su huella y vencimiento);
 *    - descartar una solicitud que nunca recibió captura (para pedir otra o
 *      cambiar de método: la BD admite una pendiente por cuenta);
 *    - quitar una cuenta no verificada: la RLS de SELECT de `cuentas_sociales`
 *      oculta las filas con `deleted_at` y un UPDATE con filtro exige que la
 *      fila nueva siga visible, así que el medio no puede darla de baja con su
 *      sesión (reportado al líder con la política que lo resolvería).
 * 4. `refresh()` para que la página muestre el cambio en la misma respuesta.
 *
 * Las capturas se suben directo a Storage (`prepararCaptura` firma la ruta que
 * construye el servidor) y la acción que las envía comprueba que la ruta es de
 * esa cuenta (`archivoPerteneceA`) y que el objeto existe (`confirmarObjeto`);
 * es idempotente por ruta.
 */
import "server-only"

import { refresh } from "next/cache"

import { type ContextoActor, contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import type { ArchivoSubido, SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
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
  carpetaCapturaCuentaSocial,
  nuevaRuta,
} from "@/lib/storage/rutas"
import { confirmarObjeto, prepararSubidaFirmada } from "@/lib/storage/subidas"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { TablesInsert } from "@/types/database.types"

import { generarCodigo, huellaCodigo, vencimientoCodigo } from "./codigo"
import { interpretarErrorCuenta, MENSAJES_CUENTAS } from "./errores"
import { parametrosVerificacion } from "./queries"
import {
  type EntradaCapturaCodigo,
  type EntradaCuenta,
  type EntradaCuentaId,
  type EntradaEditarCuenta,
  type EntradaGenerarCodigo,
  type EntradaPrepararCaptura,
  type EntradaVerificacionId,
  type EntradaVerificacionManual,
  esquemaCapturaCodigo,
  esquemaCuentaId,
  esquemaEditarCuenta,
  esquemaGenerarCodigo,
  esquemaPrepararCaptura,
  esquemaRegistrarCuenta,
  esquemaVerificacionId,
  esquemaVerificacionManual,
} from "./schemas"
import type {
  CodigoGenerado,
  CuentaGuardada,
  MetodoVerificacion,
  VerificacionEnviada,
} from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

const PERMISO = "medios.editar_propio"

/**
 * La captura de un código debe quedar guardada antes de que venza: la BD
 * compara su `updated_at` con `codigo_expira_at` al aprobar. Este margen
 * absorbe la diferencia de reloj entre el servidor y la BD.
 */
const MARGEN_VENCIMIENTO_MS = 10_000

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[cuentas-medio] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorCuenta(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** Lo abierto ya no coincide con la BD: la página se vuelve a pintar con lo vigente. */
function conflicto(mensaje: string): ResultadoFallo {
  refresh()
  return fallo(mensaje)
}

function esFallo<T extends object>(
  resultado: T | ResultadoFallo
): resultado is ResultadoFallo {
  return "ok" in resultado && resultado.ok === false
}

/** El medio de la sesión: es el único sobre el que actúa la persona. */
function medioDe(usuario: UsuarioSesion): string | null {
  return usuario.medioId
}

interface CuentaLeida {
  id: string
  medio_id: string
  plataforma: EntradaCuenta["plataforma"]
  handle: string
  url: string
  tarifa_referencia: number | null
  verificada: boolean
  updated_at: string
}

/** Lee la cuenta con la sesión: si existe y la RLS la deja ver, es del medio. */
async function leerCuenta(
  supabase: ClienteUsuario,
  medioId: string,
  cuentaId: string
): Promise<CuentaLeida | ResultadoFallo> {
  const { data, error } = await supabase
    .from("cuentas_sociales")
    .select(
      "id, medio_id, plataforma, handle, url, tarifa_referencia, verificada, updated_at"
    )
    .eq("id", cuentaId)
    .eq("medio_id", medioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) return falloBd("leer cuenta", error)
  if (!data) return conflicto(MENSAJES_CUENTAS.cuentaInexistente)
  return data
}

interface PendienteLeida {
  id: string
  metodo: MetodoVerificacion
  captura_path: string | null
  codigo_expira_at: string | null
}

/** La verificación PENDIENTE de la cuenta (la BD admite una sola), si la hay. */
async function leerPendiente(
  supabase: ClienteUsuario,
  cuentaId: string
): Promise<PendienteLeida | null | ResultadoFallo> {
  const { data, error } = await supabase
    .from("verificaciones_cuenta")
    .select("id, metodo, captura_path, codigo_expira_at")
    .eq("cuenta_social_id", cuentaId)
    .eq("estado_validacion", "PENDIENTE")
    .maybeSingle()
  if (error) return falloBd("leer verificación pendiente", error)
  return data
}

function esFalloLectura(
  valor: PendienteLeida | null | ResultadoFallo
): valor is ResultadoFallo {
  return valor !== null && esFallo(valor)
}

/**
 * Borra una solicitud PENDIENTE que nunca recibió captura (un código que no
 * se publicó o venció). Solo el servicio puede borrar verificaciones; la
 * bitácora registra el borrado con el actor real.
 */
async function descartarSinCaptura(
  contexto: ContextoActor,
  pendiente: PendienteLeida
): Promise<ResultadoFallo | null> {
  const { data, error } = await contexto.admin
    .from("verificaciones_cuenta")
    .delete()
    .eq("id", pendiente.id)
    .eq("estado_validacion", "PENDIENTE")
    .is("captura_path", null)
    .select("id")
  if (error) return falloBd("descartar solicitud sin captura", error)
  if (data.length === 0) return conflicto(MENSAJES_CUENTAS.verificacionEnRevision)
  return null
}

/** ¿El código aún admite la captura (con el margen de reloj)? */
function codigoVigente(expiraAt: string | null, ahora: Date): boolean {
  return (
    expiraAt !== null &&
    new Date(expiraAt).getTime() - ahora.getTime() > MARGEN_VENCIMIENTO_MS
  )
}

/**
 * La ruta es una captura de esa cuenta (carpeta y nombre que firmó el
 * servidor) y el objeto existe con el peso y el tipo declarados.
 */
async function comprobarCaptura(
  supabase: ClienteUsuario,
  medioId: string,
  cuentaId: string,
  captura: ArchivoSubido
): Promise<ResultadoFallo | null> {
  if (!archivoPerteneceA(captura, carpetaCapturaCuentaSocial(medioId, cuentaId))) {
    return fallo(MENSAJES_CUENTAS.capturaAjena)
  }
  const objeto = await confirmarObjeto({
    cliente: supabase,
    bucket: captura.bucket,
    ruta: captura.ruta,
    esperado: { tamano: captura.tamano, tipo: captura.tipo },
  })
  return objeto.ok ? null : objeto
}

/** Verificación que ya guarda esa captura (la acción se repitió). */
async function verificacionConCaptura(
  supabase: ClienteUsuario,
  ruta: string
): Promise<{ id: string } | null | ResultadoFallo> {
  const { data, error } = await supabase
    .from("verificaciones_cuenta")
    .select("id")
    .eq("captura_path", ruta)
    .maybeSingle()
  if (error) return falloBd("buscar captura", error)
  return data
}

// ── Cuentas ──────────────────────────────────────────────────────────────────

/** Registra una cuenta social del medio (nace sin verificar). */
export async function registrarCuenta(
  entrada: EntradaCuenta
): Promise<ResultadoAccion<CuentaGuardada>> {
  const usuario = await requerirPermiso(PERMISO)
  const medioId = medioDe(usuario)
  if (!medioId) return fallo(MENSAJES_CUENTAS.sinMedio)
  const validacion = esquemaRegistrarCuenta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("cuentas_sociales")
      .insert({
        medio_id: medioId,
        plataforma: datos.plataforma,
        handle: datos.handle,
        url: datos.url,
        tarifa_referencia: datos.tarifaReferencia,
      })
      .select("id, updated_at")
      .single()
    if (error) return falloBd("registrar cuenta", error)
    refresh()
    return exito({ id: data.id, actualizadaAt: data.updated_at })
  } catch (error) {
    return falloInesperado("registrarCuenta", error)
  }
}

/**
 * Cambia el usuario o enlace (solo sin verificar y sin verificación en
 * revisión) y la tarifa de referencia, con bloqueo optimista por `updated_at`.
 */
export async function editarCuenta(
  entrada: EntradaEditarCuenta
): Promise<ResultadoAccion<CuentaGuardada>> {
  const usuario = await requerirPermiso(PERMISO)
  const medioId = medioDe(usuario)
  if (!medioId) return fallo(MENSAJES_CUENTAS.sinMedio)
  const validacion = esquemaEditarCuenta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { cuentaId, actualizadaAt, ...datos } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const cuenta = await leerCuenta(supabase, medioId, cuentaId)
    if (esFallo(cuenta)) return cuenta
    if (cuenta.updated_at !== actualizadaAt) {
      return conflicto(MENSAJES_CUENTAS.cuentaDesactualizada)
    }
    if (cuenta.plataforma !== datos.plataforma) {
      return fallo(MENSAJES_CUENTAS.plataformaDistinta)
    }

    const cambiaPerfil =
      cuenta.handle !== datos.handle || cuenta.url !== datos.url
    const cambiaTarifa = cuenta.tarifa_referencia !== datos.tarifaReferencia
    if (!cambiaPerfil && !cambiaTarifa) {
      return exito({ id: cuenta.id, actualizadaAt })
    }
    if (cambiaPerfil) {
      const bloqueo = await liberarPerfil(usuario, supabase, cuenta)
      if (bloqueo) return bloqueo
    }

    const { data, error } = await supabase
      .from("cuentas_sociales")
      .update({
        ...(cambiaPerfil ? { handle: datos.handle, url: datos.url } : {}),
        ...(cambiaTarifa ? { tarifa_referencia: datos.tarifaReferencia } : {}),
      })
      .eq("id", cuenta.id)
      .eq("updated_at", actualizadaAt)
      .select("updated_at")
    if (error) return falloBd("editar cuenta", error)
    if (data.length === 0) {
      return conflicto(MENSAJES_CUENTAS.cuentaDesactualizada)
    }
    refresh()
    return exito({ id: cuenta.id, actualizadaAt: data[0].updated_at })
  } catch (error) {
    return falloInesperado("editarCuenta", error)
  }
}

/**
 * El usuario de una cuenta solo cambia si no está verificada ni en revisión;
 * un código que no se usó se descarta (se pidió para el usuario anterior).
 */
async function liberarPerfil(
  usuario: UsuarioSesion,
  supabase: ClienteUsuario,
  cuenta: CuentaLeida
): Promise<ResultadoFallo | null> {
  const campo = (mensaje: string) => fallo(mensaje, { perfil: [mensaje] })
  if (cuenta.verificada) {
    return campo(MENSAJES_CUENTAS.perfilBloqueadoVerificada)
  }
  const pendiente = await leerPendiente(supabase, cuenta.id)
  if (esFalloLectura(pendiente)) return pendiente
  if (!pendiente) return null
  if (pendiente.captura_path) {
    return campo(MENSAJES_CUENTAS.perfilBloqueadoRevision)
  }
  return descartarSinCaptura(await contextoDelActor(usuario), pendiente)
}

/** Quita una cuenta que nunca se verificó y no está en revisión. */
export async function quitarCuenta(
  entrada: EntradaCuentaId
): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISO)
  const medioId = medioDe(usuario)
  if (!medioId) return fallo(MENSAJES_CUENTAS.sinMedio)
  const validacion = esquemaCuentaId.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const supabase = await crearClienteServidor()
    const cuenta = await leerCuenta(supabase, medioId, validacion.data.cuentaId)
    if (esFallo(cuenta)) return cuenta
    if (cuenta.verificada) return fallo(MENSAJES_CUENTAS.quitarVerificada)
    const pendiente = await leerPendiente(supabase, cuenta.id)
    if (esFalloLectura(pendiente)) return pendiente
    if (pendiente?.captura_path) {
      return fallo(MENSAJES_CUENTAS.quitarEnRevision)
    }

    const contexto = await contextoDelActor(usuario)
    if (pendiente) {
      const descarte = await descartarSinCaptura(contexto, pendiente)
      if (descarte) return descarte
    }
    // Ver el encabezado: la sesión no puede escribir `deleted_at` por la RLS.
    const { data, error } = await contexto.admin
      .from("cuentas_sociales")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", cuenta.id)
      .eq("medio_id", medioId)
      .eq("verificada", false)
      .is("deleted_at", null)
      .select("id")
    if (error) return falloBd("quitar cuenta", error)
    if (data.length === 0) {
      return conflicto(MENSAJES_CUENTAS.cuentaDesactualizada)
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("quitarCuenta", error)
  }
}

// ── Capturas ─────────────────────────────────────────────────────────────────

/**
 * Firma la subida directa de una captura a
 * `documentos/medio/{medio}/cuenta_social/{cuenta}/{uuid}.{ext}`. Con la
 * sesión: la política INSERT de Storage vuelve a exigir que la cuenta sea del
 * medio.
 */
export async function prepararCaptura(
  entrada: EntradaPrepararCaptura
): Promise<ResultadoAccion<SubidaPreparada>> {
  const usuario = await requerirPermiso(PERMISO)
  const medioId = medioDe(usuario)
  if (!medioId) return fallo(MENSAJES_CUENTAS.sinMedio)
  const validacion = esquemaPrepararCaptura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { cuentaId, descripcion } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const cuenta = await leerCuenta(supabase, medioId, cuentaId)
    if (esFallo(cuenta)) return cuenta
    const destino = nuevaRuta(
      carpetaCapturaCuentaSocial(medioId, cuenta.id),
      descripcion.tipo
    )
    return await prepararSubidaFirmada({ cliente: supabase, ...destino })
  } catch (error) {
    return falloInesperado("prepararCaptura", error)
  }
}

/** URL de corta duración para que el medio vea la captura que envió. */
export async function firmarCaptura(
  entrada: EntradaVerificacionId
): Promise<ResultadoAccion<UrlFirmada>> {
  const usuario = await requerirPermiso(PERMISO)
  const medioId = medioDe(usuario)
  if (!medioId) return fallo(MENSAJES_CUENTAS.sinMedio)
  const validacion = esquemaVerificacionId.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("verificaciones_cuenta")
      .select("captura_path")
      .eq("id", validacion.data.verificacionId)
      .eq("medio_id", medioId)
      .maybeSingle()
    if (error) return falloBd("leer captura", error)
    if (!data?.captura_path) return fallo(MENSAJES_DESCARGA.noEncontrado)
    return await firmarDescarga({
      bucket: "documentos",
      ruta: data.captura_path,
      firmante: { como: "usuario", cliente: supabase },
    })
  } catch (error) {
    return falloInesperado("firmarCaptura", error)
  }
}

// ── Verificación por captura del panel (MANUAL) ──────────────────────────────

/**
 * Envía (o corrige mientras sigue en revisión) la verificación MANUAL: los
 * seguidores que muestra el panel y la captura con la fecha visible. Si la
 * cuenta tenía un código sin usar, se descarta: el medio cambió de método.
 */
export async function enviarVerificacionManual(
  entrada: EntradaVerificacionManual
): Promise<ResultadoAccion<VerificacionEnviada>> {
  const usuario = await requerirPermiso(PERMISO)
  const medioId = medioDe(usuario)
  if (!medioId) return fallo(MENSAJES_CUENTAS.sinMedio)
  const validacion = esquemaVerificacionManual.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { cuentaId, seguidores, captura } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const cuenta = await leerCuenta(supabase, medioId, cuentaId)
    if (esFallo(cuenta)) return cuenta
    const repetida = await verificacionConCaptura(supabase, captura.ruta)
    if (repetida && esFallo(repetida)) return repetida
    if (repetida) return exito({ verificacionId: repetida.id })
    const invalida = await comprobarCaptura(supabase, medioId, cuenta.id, captura)
    if (invalida) return invalida

    const pendiente = await leerPendiente(supabase, cuenta.id)
    if (esFalloLectura(pendiente)) return pendiente
    if (pendiente?.metodo === "MANUAL") {
      return await corregirManual(supabase, pendiente.id, seguidores, captura)
    }
    if (pendiente?.captura_path || pendiente?.metodo === "API") {
      return fallo(MENSAJES_CUENTAS.verificacionEnRevision)
    }
    if (pendiente) {
      const descarte = await descartarSinCaptura(
        await contextoDelActor(usuario),
        pendiente
      )
      if (descarte) return descarte
    }

    // `medio_id` lo copia el trigger desde la cuenta; el rol `authenticated`
    // no tiene GRANT de INSERT sobre esa columna, así que no se envía.
    const fila = {
      cuenta_social_id: cuenta.id,
      metodo: "MANUAL",
      seguidores_reportados: seguidores,
      captura_path: captura.ruta,
    } as TablesInsert<"verificaciones_cuenta">
    const { data, error } = await supabase
      .from("verificaciones_cuenta")
      .insert(fila)
      .select("id")
      .single()
    if (error) return falloBd("enviar verificación manual", error)
    refresh()
    return exito({ verificacionId: data.id })
  } catch (error) {
    return falloInesperado("enviarVerificacionManual", error)
  }
}

/** Sustituye captura y seguidores de una MANUAL que sigue en revisión. */
async function corregirManual(
  supabase: ClienteUsuario,
  verificacionId: string,
  seguidores: number,
  captura: ArchivoSubido
): Promise<ResultadoAccion<VerificacionEnviada>> {
  const { data, error } = await supabase
    .from("verificaciones_cuenta")
    .update({ seguidores_reportados: seguidores, captura_path: captura.ruta })
    .eq("id", verificacionId)
    .eq("estado_validacion", "PENDIENTE")
    .select("id")
  if (error) return falloBd("corregir verificación manual", error)
  if (data.length === 0) {
    return conflicto(MENSAJES_CUENTAS.verificacionInexistente)
  }
  refresh()
  return exito({ verificacionId })
}

// ── Verificación por código en una historia (CODIGO_HISTORIA) ────────────────

/**
 * Genera el código de la historia y lo devuelve UNA vez. Si la cuenta tenía
 * un código sin captura, lo renueva en la misma solicitud (el anterior deja de
 * servir); una MANUAL sin captura se descarta. Con captura en revisión, no.
 */
export async function generarCodigoVerificacion(
  entrada: EntradaGenerarCodigo
): Promise<ResultadoAccion<CodigoGenerado>> {
  const usuario = await requerirPermiso(PERMISO)
  const medioId = medioDe(usuario)
  if (!medioId) return fallo(MENSAJES_CUENTAS.sinMedio)
  const validacion = esquemaGenerarCodigo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { cuentaId, seguidores } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const cuenta = await leerCuenta(supabase, medioId, cuentaId)
    if (esFallo(cuenta)) return cuenta
    const pendiente = await leerPendiente(supabase, cuenta.id)
    if (esFalloLectura(pendiente)) return pendiente
    if (pendiente?.captura_path || pendiente?.metodo === "API") {
      return fallo(MENSAJES_CUENTAS.verificacionEnRevision)
    }

    const contexto = await contextoDelActor(usuario)
    const { minutosCodigo } = await parametrosVerificacion()
    const codigo = generarCodigo()
    const valores = {
      seguidores_reportados: seguidores,
      codigo_hash: huellaCodigo(codigo),
      codigo_expira_at: vencimientoCodigo(
        new Date(),
        minutosCodigo
      ).toISOString(),
    }

    if (pendiente?.metodo === "CODIGO_HISTORIA") {
      const { data, error } = await contexto.admin
        .from("verificaciones_cuenta")
        .update(valores)
        .eq("id", pendiente.id)
        .eq("estado_validacion", "PENDIENTE")
        .is("captura_path", null)
        .select("id, codigo_expira_at")
      if (error) return falloBd("renovar código", error)
      if (data.length === 0) {
        return conflicto(MENSAJES_CUENTAS.verificacionEnRevision)
      }
      refresh()
      return exito({
        verificacionId: data[0].id,
        codigo,
        expiraAt: data[0].codigo_expira_at ?? valores.codigo_expira_at,
      })
    }

    if (pendiente) {
      const descarte = await descartarSinCaptura(contexto, pendiente)
      if (descarte) return descarte
    }
    const { data, error } = await contexto.admin
      .from("verificaciones_cuenta")
      .insert({
        ...valores,
        cuenta_social_id: cuenta.id,
        medio_id: cuenta.medio_id,
        metodo: "CODIGO_HISTORIA",
      })
      .select("id, codigo_expira_at")
      .single()
    if (error) return falloBd("generar código", error)
    refresh()
    return exito({
      verificacionId: data.id,
      codigo,
      expiraAt: data.codigo_expira_at ?? valores.codigo_expira_at,
    })
  } catch (error) {
    return falloInesperado("generarCodigoVerificacion", error)
  }
}

/**
 * Guarda la captura de la historia con el código. Solo antes de que venza (la
 * BD rechaza aprobar una captura cargada después) y se puede sustituir
 * mientras tanto.
 */
export async function enviarCapturaCodigo(
  entrada: EntradaCapturaCodigo
): Promise<ResultadoAccion<VerificacionEnviada>> {
  const usuario = await requerirPermiso(PERMISO)
  const medioId = medioDe(usuario)
  if (!medioId) return fallo(MENSAJES_CUENTAS.sinMedio)
  const validacion = esquemaCapturaCodigo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { verificacionId, captura } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data: verificacion, error } = await supabase
      .from("verificaciones_cuenta")
      .select(
        "id, cuenta_social_id, metodo, estado_validacion, captura_path, codigo_expira_at"
      )
      .eq("id", verificacionId)
      .eq("medio_id", medioId)
      .maybeSingle()
    if (error) return falloBd("leer verificación", error)
    if (!verificacion || verificacion.estado_validacion !== "PENDIENTE") {
      return conflicto(MENSAJES_CUENTAS.verificacionInexistente)
    }
    if (verificacion.metodo !== "CODIGO_HISTORIA") {
      return fallo(MENSAJES_CUENTAS.noEsCodigo)
    }
    if (verificacion.captura_path === captura.ruta) {
      return exito({ verificacionId })
    }
    if (!codigoVigente(verificacion.codigo_expira_at, new Date())) {
      return conflicto(MENSAJES_CUENTAS.codigoVencido)
    }
    const invalida = await comprobarCaptura(
      supabase,
      medioId,
      verificacion.cuenta_social_id,
      captura
    )
    if (invalida) return invalida

    const { data, error: errorGuardar } = await supabase
      .from("verificaciones_cuenta")
      .update({ captura_path: captura.ruta })
      .eq("id", verificacionId)
      .eq("estado_validacion", "PENDIENTE")
      .select("id")
    if (errorGuardar) return falloBd("guardar captura del código", errorGuardar)
    if (data.length === 0) {
      return conflicto(MENSAJES_CUENTAS.verificacionInexistente)
    }
    refresh()
    return exito({ verificacionId })
  } catch (error) {
    return falloInesperado("enviarCapturaCodigo", error)
  }
}
