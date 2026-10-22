"use server"

/**
 * Server Actions del registro y la edición de anunciantes por el equipo AMO.
 * Patrón de cada acción:
 *
 * 1. DAL (`requerirPermiso("anunciantes.editar")`) antes de todo.
 * 2. zod: el MISMO esquema que el formulario; país y municipio, además,
 *    contra el diccionario geográfico, y el sector, contra los activos.
 * 3. Escritura con el cliente del USUARIO (JWT): la RLS vuelve a exigir el
 *    permiso, los triggers validan el DV del NIT y el municipio activo, la
 *    fila nace PENDIENTE y la bitácora registra al actor. La edición escribe
 *    solo lo que cambió y lleva bloqueo optimista (`updated_at`): si otra
 *    persona cambió el anunciante, no se pisa.
 *
 * Los errores esperados se devuelven como `ResultadoAccion` (nunca se lanzan).
 */
import "server-only"

import { refresh, revalidatePath } from "next/cache"

import { RUTAS_OPERACION } from "@/features/operacion/rutas"
import { requerirPermiso } from "@/lib/auth/dal"
import { MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { obtenerMunicipio, obtenerPais } from "@/lib/geo/catalogo"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  ANUNCIANTE_DESACTUALIZADO,
  ANUNCIANTE_INEXISTENTE,
  esErrorEsperado,
  esNitRepetido,
  interpretarErrorAnunciante,
  mensajeNitRepetido,
  SECTOR_NO_DISPONIBLE,
  SIN_PERMISO,
} from "./errores"
import {
  cambiosAnunciante,
  columnasAnunciante,
  conCorreoFacturacion,
  hayCambiosAnunciante,
} from "./filas"
import {
  type DatosAnunciante,
  type EntradaAnunciante,
  type EntradaEditarAnunciante,
  esquemaAnunciante,
  esquemaEditarAnunciante,
} from "./schemas"
import type { AnuncianteRegistrado } from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

interface ErrorConCodigo {
  code?: string | null
  message?: string | null
  details?: string | null
}

/** Log de servidor sin datos de la empresa: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[gestion-anunciantes] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorConCodigo): ResultadoFallo {
  if (!esErrorEsperado(error)) informar(operacion, error)
  const { mensaje, campo } = interpretarErrorAnunciante(error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** Lo abierto ya no coincide con la BD: se repinta la ficha en la misma respuesta. */
function conflicto(mensaje: string): ResultadoFallo {
  refresh()
  return fallo(mensaje)
}

/**
 * País y municipio existen en el diccionario (el cliente no lo carga: son
 * miles de filas). Que el municipio esté habilitado lo decide la BD.
 */
function validarGeografia(datos: DatosAnunciante): ResultadoFallo | null {
  if (!obtenerPais(datos.paisIso2)) {
    const mensaje = "Elige un país de la lista."
    return fallo(mensaje, { paisIso2: [mensaje] })
  }
  const { identificacion } = datos
  if (
    identificacion.tipo === "NIT" &&
    !obtenerMunicipio(identificacion.municipioCodigo)
  ) {
    const mensaje = "Elige un municipio de la lista."
    return fallo(mensaje, { municipioCodigo: [mensaje] })
  }
  return null
}

/**
 * El sector elegido sigue activo: la FK admite uno inactivo o dado de baja, y
 * el formulario solo ofrece los activos (más el actual al editar, que no se
 * revalida si no cambia).
 */
async function falloSector(
  supabase: ClienteUsuario,
  sectorId: string
): Promise<ResultadoFallo | null> {
  const { data, error } = await supabase
    .from("sectores")
    .select("id")
    .eq("id", sectorId)
    .eq("activo", true)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) return falloBd("validar el sector", error)
  return data
    ? null
    : fallo(SECTOR_NO_DISPONIBLE, { sectorId: [SECTOR_NO_DISPONIBLE] })
}

/** NIT ya registrado: nombra al anunciante que lo tiene (si quien registra lo ve). */
async function falloNitRepetido(
  supabase: ClienteUsuario,
  datos: DatosAnunciante
): Promise<ResultadoFallo> {
  const nit =
    datos.identificacion.tipo === "NIT" ? datos.identificacion.nit : null
  const { data } = nit
    ? await supabase
        .from("anunciantes")
        .select("nombre_comercial")
        .eq("nit", nit)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null }
  const mensaje = mensajeNitRepetido(data?.nombre_comercial ?? null)
  return fallo(mensaje, { nit: [mensaje] })
}

/**
 * La edición no tocó filas y no hubo error: el anunciante cambió o se dio de
 * baja entre la lectura y la escritura, o la RLS no dejó escribir.
 */
async function motivoSinFilas(
  supabase: ClienteUsuario,
  id: string,
  actualizadoAt: string
): Promise<ResultadoFallo> {
  const { data, error } = await supabase
    .from("anunciantes")
    .select("updated_at, deleted_at")
    .eq("id", id)
    .maybeSingle()
  if (error) return falloBd("releer tras editar", error)
  if (!data || data.deleted_at) return conflicto(ANUNCIANTE_INEXISTENTE)
  if (data.updated_at !== actualizadoAt) {
    return conflicto(ANUNCIANTE_DESACTUALIZADO)
  }
  return fallo(SIN_PERMISO)
}

async function falloEscritura(
  supabase: ClienteUsuario,
  operacion: string,
  error: ErrorConCodigo,
  datos: DatosAnunciante
): Promise<ResultadoFallo> {
  return esNitRepetido(error)
    ? falloNitRepetido(supabase, datos)
    : falloBd(operacion, error)
}

// ── Acciones ────────────────────────────────────────────────────────────────

/**
 * Registra un anunciante (nace PENDIENTE de verificación). Devuelve su id
 * para abrir la ficha, desde donde se invita a su equipo.
 */
export async function registrarAnunciante(
  entrada: EntradaAnunciante
): Promise<ResultadoAccion<AnuncianteRegistrado>> {
  await requerirPermiso("anunciantes.editar")
  const validacion = esquemaAnunciante.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const errorGeografia = validarGeografia(datos)
  if (errorGeografia) return errorGeografia

  try {
    const supabase = await crearClienteServidor()
    const errorSector = await falloSector(supabase, datos.sectorId)
    if (errorSector) return errorSector

    const { data, error } = await supabase
      .from("anunciantes")
      .insert({
        ...columnasAnunciante(datos),
        datos_facturacion: conCorreoFacturacion({}, datos.emailFacturacion),
      })
      .select("id, nombre_comercial")
      .single()
    if (error) {
      return await falloEscritura(supabase, "registrar", error, datos)
    }
    // El listado (y los selectores de organización) ya incluyen al nuevo.
    revalidatePath(RUTAS_OPERACION.anunciantes)
    return exito({ id: data.id, nombreComercial: data.nombre_comercial })
  } catch (error) {
    return falloInesperado("registrarAnunciante", error)
  }
}

/**
 * Corrige los datos de un anunciante, incluida su identificación tributaria
 * (solo el equipo AMO puede: lo exige también el trigger). Escribe solo las
 * columnas que cambiaron; el correo de facturación se combina con el resto de
 * `datos_facturacion` sin pisarlo.
 */
export async function editarAnunciante(
  entrada: EntradaEditarAnunciante
): Promise<ResultadoAccion> {
  await requerirPermiso("anunciantes.editar")
  const validacion = esquemaEditarAnunciante.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { id, actualizadoAt, ...datos } = validacion.data
  const errorGeografia = validarGeografia(datos)
  if (errorGeografia) return errorGeografia

  try {
    const supabase = await crearClienteServidor()
    const { data: actual, error: errorLectura } = await supabase
      .from("anunciantes")
      .select(
        `razon_social, nombre_comercial, sector_id, pais_iso2, nit, digito_verificacion,
         municipio_codigo, identificacion_extranjera, ciudad_extranjera, datos_facturacion,
         updated_at, deleted_at`
      )
      .eq("id", id)
      .maybeSingle()
    if (errorLectura) return falloBd("leer para editar", errorLectura)
    if (!actual || actual.deleted_at) return conflicto(ANUNCIANTE_INEXISTENTE)
    if (actual.updated_at !== actualizadoAt) {
      return conflicto(ANUNCIANTE_DESACTUALIZADO)
    }

    const cambios = cambiosAnunciante(actual, datos)
    // Lo escrito equivale a lo guardado (p. ej. solo espacios): nada que escribir.
    if (!hayCambiosAnunciante(cambios)) return exito()
    if (cambios.sector_id) {
      const errorSector = await falloSector(supabase, cambios.sector_id)
      if (errorSector) return errorSector
    }

    const { data, error } = await supabase
      .from("anunciantes")
      .update(cambios)
      .eq("id", id)
      .eq("updated_at", actualizadoAt)
      .is("deleted_at", null)
      .select("id")
    if (error) return await falloEscritura(supabase, "editar", error, datos)
    if (data.length === 0) return motivoSinFilas(supabase, id, actualizadoAt)
    // La ficha se repinta en esta respuesta; el listado, al volver a él.
    revalidatePath(RUTAS_OPERACION.anunciantes)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("editarAnunciante", error)
  }
}
