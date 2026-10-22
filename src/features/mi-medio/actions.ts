"use server"

/**
 * Server Actions de «Mi medio» (MED-002, MED-004).
 *
 * 1. DAL (`requerirPermiso("medios.editar_propio")`), antes que nada. El medio
 *    sale SIEMPRE de la sesión (`usuario.medioId`), nunca de la entrada.
 * 2. zod: el MISMO esquema que el formulario, armado con lo que el servidor
 *    relee de la BD (audiencia verificada, documento y cuenta ya cifrados).
 * 3. Perfil: cliente del USUARIO (RLS «propio» + bitácora con el actor). Pago:
 *    el servidor cifra y llama a `guardar_datos_pago_medio_srv` como servicio
 *    con el actor y su sesión, que la BD vuelve a validar. Envío:
 *    `enviar_medio_a_verificacion_srv`, que exige cuentas, documentos y pago.
 * 4. `refresh()` para que la página muestre lo guardado en la misma respuesta.
 */
import "server-only"

import { refresh } from "next/cache"

import { requerirPermiso } from "@/lib/auth/dal"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { obtenerMunicipio } from "@/lib/geo/catalogo"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { crearClienteServidor } from "@/lib/supabase/server"
import {
  categoriasNoPermitidas,
  diferenciaCategorias,
  hayCambioCategorias,
} from "@/features/gestion-medios/categorias"
import {
  cambiosMedio,
  columnasMedio,
  type ColumnasEditablesMedio,
  escrituraConVersion,
  hayCambiosMedio,
} from "@/features/gestion-medios/edicion"

import {
  cambiosAudiencia,
  type CambiosAudiencia,
  hayCambiosAudiencia,
  type PorcentajePais,
  sumaPorcentajes,
} from "./audiencia"
import { datosRpcPago } from "./cifrado-pago"
import {
  CATEGORIAS_NO_DISPONIBLES,
  type EscrituraPerfil,
  interpretarErrorEnvio,
  interpretarErrorPago,
  interpretarErrorPerfil,
  PERFIL_DESACTUALIZADO,
  PERFIL_SIN_AUDIENCIA,
  PERFIL_SIN_CATEGORIAS,
  SIN_MEDIO,
} from "./errores"
import { pagoResumen } from "./queries"
import {
  type EntradaDatosPago,
  type EntradaPerfilMedio,
  esquemaDatosPago,
  esquemaPerfilMedio,
} from "./schemas"
import type { MetodoPago } from "./requisitos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[mi-medio] ${operacion} falló (${codigo})`)
}

function falloCampo(campo: string, mensaje: string): ResultadoFallo {
  return fallo(mensaje, { [campo]: [mensaje] })
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

function falloPerfil(
  operacion: string,
  error: ErrorBd,
  escritura: EscrituraPerfil
): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorPerfil(error, escritura)
  if (!esperado) informar(operacion, error)
  return campo ? falloCampo(campo, mensaje) : fallo(mensaje)
}

function esFallo<T extends object>(
  resultado: T | ResultadoFallo
): resultado is ResultadoFallo {
  return "ok" in resultado && resultado.ok === false
}

/** El medio de la sesión: el único que esta cuenta puede tocar. */
function medioDe(usuario: UsuarioSesion): string | ResultadoFallo {
  return usuario.medioId ?? fallo(SIN_MEDIO)
}

// ── Perfil ───────────────────────────────────────────────────────────────────

interface EstadoPerfil {
  columnas: ColumnasEditablesMedio
  actualizadoAt: string
  categoriaIds: string[]
  declaradas: PorcentajePais[]
  fija: { paises: string[]; porcentaje: number }
}

/** Lo guardado hoy: columnas, versión, categorías y audiencia (declarada y fija). */
async function leerPerfil(
  supabase: ClienteUsuario,
  medioId: string
): Promise<EstadoPerfil | ResultadoFallo> {
  const [medio, categorias, audiencia] = await Promise.all([
    supabase
      .from("medios")
      .select(
        "nombre, tipo, municipio_codigo, descripcion_audiencia, updated_at"
      )
      .eq("id", medioId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("medio_categorias")
      .select("categoria_id")
      .eq("medio_id", medioId),
    supabase
      .from("medio_audiencia_paises")
      .select("pais_iso2, porcentaje, fuente")
      .eq("medio_id", medioId),
  ])
  if (medio.error) return falloPerfil("leer perfil", medio.error, "medio")
  if (categorias.error) {
    return falloPerfil("leer categorías", categorias.error, "categorias")
  }
  if (audiencia.error) {
    return falloPerfil("leer audiencia", audiencia.error, "audiencia")
  }
  if (!medio.data) return fallo(SIN_MEDIO)
  const filas = audiencia.data.map((fila) => ({
    paisIso2: fila.pais_iso2,
    porcentaje: Number(fila.porcentaje),
    declarada: fila.fuente === "DECLARADA",
  }))
  const fijas = filas.filter((fila) => !fila.declarada)
  const { updated_at: actualizadoAt, ...columnas } = medio.data
  return {
    columnas,
    actualizadoAt,
    categoriaIds: categorias.data.map((fila) => fila.categoria_id),
    declaradas: filas
      .filter((fila) => fila.declarada)
      .map(({ paisIso2, porcentaje }) => ({ paisIso2, porcentaje })),
    fija: {
      paises: fijas.map((fila) => fila.paisIso2),
      porcentaje: sumaPorcentajes(fijas.map((fila) => fila.porcentaje)),
    },
  }
}

/** Las categorías nuevas deben estar activas (las que ya tenía se conservan). */
async function validarCategorias(
  supabase: ClienteUsuario,
  elegidas: readonly string[],
  actuales: readonly string[]
): Promise<ResultadoFallo | null> {
  const nuevas = elegidas.filter((id) => !actuales.includes(id))
  if (nuevas.length === 0) return null
  const { data, error } = await supabase
    .from("categorias")
    .select("id")
    .in("id", nuevas)
    .eq("activo", true)
    .is("deleted_at", null)
  if (error) return falloPerfil("validar categorías", error, "categorias")
  const activas = data.map((fila) => fila.id)
  if (categoriasNoPermitidas(elegidas, activas, actuales).length === 0) {
    return null
  }
  refresh()
  return falloCampo("categoriaIds", CATEGORIAS_NO_DISPONIBLES)
}

/** Primero inserta y luego borra: si lo primero falla, nada cambió. */
async function aplicarCategorias(
  supabase: ClienteUsuario,
  medioId: string,
  actuales: readonly string[],
  elegidas: readonly string[]
): Promise<ErrorBd | null> {
  const { agregar, quitar } = diferenciaCategorias(actuales, elegidas)
  if (agregar.length > 0) {
    const { error } = await supabase.from("medio_categorias").insert(
      agregar.map((categoriaId) => ({
        medio_id: medioId,
        categoria_id: categoriaId,
      }))
    )
    if (error) return error
  }
  if (quitar.length > 0) {
    const { error } = await supabase
      .from("medio_categorias")
      .delete()
      .eq("medio_id", medioId)
      .in("categoria_id", quitar)
    if (error) return error
  }
  return null
}

/**
 * Lo que baja antes que lo que sube: cada solicitud es su propia transacción
 * y la suma (que el esquema ya validó ≤ 100 %) se comprueba al final de cada
 * una (`trg_medio_audiencia_paises_z_suma`).
 */
async function aplicarAudiencia(
  supabase: ClienteUsuario,
  medioId: string,
  { borrar, reducir, aumentar, insertar }: CambiosAudiencia
): Promise<ErrorBd | null> {
  if (borrar.length > 0) {
    const { error } = await supabase
      .from("medio_audiencia_paises")
      .delete()
      .eq("medio_id", medioId)
      .eq("fuente", "DECLARADA")
      .in("pais_iso2", borrar)
    if (error) return error
  }
  for (const fila of [...reducir, ...aumentar]) {
    const { error } = await supabase
      .from("medio_audiencia_paises")
      .update({ porcentaje: fila.porcentaje })
      .eq("medio_id", medioId)
      .eq("pais_iso2", fila.paisIso2)
      .eq("fuente", "DECLARADA")
    if (error) return error
  }
  if (insertar.length > 0) {
    const { error } = await supabase.from("medio_audiencia_paises").insert(
      insertar.map((fila) => ({
        medio_id: medioId,
        pais_iso2: fila.paisIso2,
        porcentaje: fila.porcentaje,
        fuente: "DECLARADA" as const,
      }))
    )
    if (error) return error
  }
  return null
}

/** Escribe con la condición de versión; sin filas, otra edición ganó. */
async function escribirMedio(
  supabase: ClienteUsuario,
  medioId: string,
  actualizadoAt: string,
  cambios: Partial<ColumnasEditablesMedio>
): Promise<{ actualizadoAt: string } | ResultadoFallo> {
  const { data, error } = await supabase
    .from("medios")
    .update(cambios)
    .eq("id", medioId)
    .eq("updated_at", actualizadoAt)
    .select("updated_at")
  if (error) return falloPerfil("guardar perfil", error, "medio")
  if (data.length === 0) return fallo(PERFIL_DESACTUALIZADO)
  return { actualizadoAt: data[0].updated_at }
}

export interface PerfilGuardado {
  actualizadoAt: string
  /** Se guardó lo principal, pero algo secundario no. */
  advertencia: string | null
}

/**
 * Guarda el perfil propio: datos del medio, categorías y origen de la
 * audiencia, con bloqueo optimista (`updated_at` de `medios`, que también se
 * renueva si solo cambian categorías o audiencia): no pisa el cambio de otra
 * pestaña ni el del equipo AMO.
 */
export async function guardarPerfilMedio(
  entrada: EntradaPerfilMedio
): Promise<ResultadoAccion<PerfilGuardado>> {
  const usuario = await requerirPermiso("medios.editar_propio")
  const medioId = medioDe(usuario)
  if (typeof medioId !== "string") return medioId

  try {
    const supabase = await crearClienteServidor()
    const actual = await leerPerfil(supabase, medioId)
    if (esFallo(actual)) return actual

    const validacion = esquemaPerfilMedio(actual.fija).safeParse(entrada)
    if (!validacion.success) return desdeErrorZod(validacion.error)
    const { actualizadoAt, categoriaIds, audiencia, ...datos } = validacion.data
    if (!obtenerMunicipio(datos.municipioCodigo)) {
      return falloCampo("municipioCodigo", "Elige un municipio de la lista.")
    }
    if (actual.actualizadoAt !== actualizadoAt) {
      return fallo(PERFIL_DESACTUALIZADO)
    }
    const categoriasInvalidas = await validarCategorias(
      supabase,
      categoriaIds,
      actual.categoriaIds
    )
    if (categoriasInvalidas) return categoriasInvalidas

    const cambios = cambiosMedio(actual.columnas, columnasMedio(datos))
    const cambioCategorias = diferenciaCategorias(
      actual.categoriaIds,
      categoriaIds
    )
    const cambioAudiencia = cambiosAudiencia(actual.declaradas, audiencia)
    if (
      !hayCambiosMedio(cambios) &&
      !hayCambioCategorias(cambioCategorias) &&
      !hayCambiosAudiencia(cambioAudiencia)
    ) {
      return exito({ actualizadoAt, advertencia: null })
    }

    // Primero la fila del medio con la condición de versión: si otra persona
    // guardó antes, aquí se detiene sin pisar nada.
    const escrito = await escribirMedio(
      supabase,
      medioId,
      actualizadoAt,
      escrituraConVersion(actual.columnas, cambios)
    )
    if (esFallo(escrito)) return escrito

    const errorCategorias = hayCambioCategorias(cambioCategorias)
      ? await aplicarCategorias(
          supabase,
          medioId,
          actual.categoriaIds,
          categoriaIds
        )
      : null
    if (errorCategorias) informar("guardar categorías", errorCategorias)
    const errorAudiencia = hayCambiosAudiencia(cambioAudiencia)
      ? await aplicarAudiencia(supabase, medioId, cambioAudiencia)
      : null
    if (errorAudiencia) informar("guardar audiencia", errorAudiencia)

    refresh()
    return exito({
      actualizadoAt: escrito.actualizadoAt,
      advertencia: errorCategorias
        ? PERFIL_SIN_CATEGORIAS
        : errorAudiencia
          ? PERFIL_SIN_AUDIENCIA
          : null,
    })
  } catch (error) {
    return falloInesperado("guardarPerfilMedio", error)
  }
}

// ── Pago y condición tributaria ──────────────────────────────────────────────

export interface PagoGuardadoResultado {
  /** Se registró una cuenta (nueva o distinta): hay que cargar su certificado. */
  cuentaNueva: boolean
  metodo: MetodoPago | null
}

/**
 * Guarda titular, documento, cuenta y condición tributaria. El número de
 * documento y la cuenta se cifran aquí (AES-256-GCM) y nunca vuelven al
 * navegador; si no se escriben de nuevo, la BD conserva los guardados.
 */
export async function guardarDatosPagoMedio(
  entrada: EntradaDatosPago
): Promise<ResultadoAccion<PagoGuardadoResultado>> {
  const usuario = await requerirPermiso("medios.editar_propio")
  const medioId = medioDe(usuario)
  if (typeof medioId !== "string") return medioId

  try {
    const guardado = await pagoResumen(medioId)
    const validacion = esquemaDatosPago({
      tipoDocumento: guardado.tipoDocumento,
      documentoRegistrado: guardado.documentoRegistrado,
      cuentaRegistrada: guardado.cuentaRegistrada,
    }).safeParse(entrada)
    if (!validacion.success) return desdeErrorZod(validacion.error)
    const datos = validacion.data

    const contexto = await contextoDelActor(usuario)
    const { error } = await contexto.admin.rpc("guardar_datos_pago_medio_srv", {
      p_medio_id: medioId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_datos: datosRpcPago(medioId, datos),
    })
    if (error) {
      const { mensaje, campo, esperado } = interpretarErrorPago(error)
      if (!esperado) informar("guardar datos de pago", error)
      return campo ? falloCampo(campo, mensaje) : fallo(mensaje)
    }
    refresh()
    return exito({
      cuentaNueva: datos.cuenta !== null,
      metodo: datos.cuenta?.metodo ?? null,
    })
  } catch (error) {
    return falloInesperado("guardarDatosPagoMedio", error)
  }
}

// ── Envío a verificación ─────────────────────────────────────────────────────

/**
 * Envía el medio a la cola de verificación del equipo AMO (o lo reenvía tras
 * un rechazo). La BD exige al menos una cuenta social, documentos del nivel y
 * datos de pago completos; si falta algo, su `detail` lo nombra.
 */
export async function enviarMedioAVerificacion(): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso("medios.editar_propio")
  const medioId = medioDe(usuario)
  if (typeof medioId !== "string") return medioId

  try {
    const contexto = await contextoDelActor(usuario)
    const { error } = await contexto.admin.rpc(
      "enviar_medio_a_verificacion_srv",
      {
        p_medio_id: medioId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      }
    )
    if (error) {
      const { mensaje, esperado } = interpretarErrorEnvio(error)
      if (!esperado) informar("enviar a verificación", error)
      refresh()
      return fallo(mensaje)
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("enviarMedioAVerificacion", error)
  }
}
