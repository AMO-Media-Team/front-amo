"use server"

/**
 * Server Actions del registro y la edición de medios por el equipo AMO.
 *
 * 1. DAL (`requerirPermiso("medios.editar")`), antes que nada.
 * 2. zod: el MISMO esquema que el formulario.
 * 3. Escritura con el cliente del USUARIO (JWT + contexto confiable): la RLS
 *    vuelve a exigir `medios.editar`, el trigger del municipio rechaza los
 *    inhabilitados y la bitácora registra al actor real. El medio nace
 *    PENDIENTE (lo fija la BD).
 * 4. `refresh()` para que la página muestre el cambio en la misma respuesta.
 *
 * `medios` y `medio_categorias` se escriben en dos solicitudes: si las
 * categorías fallan al registrar, el medio recién creado se da de baja
 * (`deleted_at`, el borrado de la plataforma) para no dejarlo a medias. Al
 * editar, la fila del medio se escribe primero con la condición de versión
 * (también cuando solo cambian las categorías): nadie pisa el cambio de otro.
 */
import "server-only"

import { refresh } from "next/cache"

import { requerirPermiso } from "@/lib/auth/dal"
import {
  type ErrorBd,
  MENSAJE_INESPERADO,
  MENSAJE_SIN_PERMISO,
} from "@/lib/errores-bd"
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
  type CambioCategorias,
  categoriasNoPermitidas,
  diferenciaCategorias,
  hayCambioCategorias,
} from "./categorias"
import {
  cambiosMedio,
  type ColumnasEditablesMedio,
  columnasMedio,
  escrituraConVersion,
  hayCambiosMedio,
} from "./edicion"
import {
  CATEGORIAS_NO_DISPONIBLES,
  CATEGORIAS_SIN_GUARDAR,
  EDICION_SIN_CATEGORIAS,
  interpretarErrorMedio,
  MEDIO_DESACTUALIZADO,
  MEDIO_INEXISTENTE,
  MUNICIPIO_DESCONOCIDO,
  REGISTRO_REVERTIDO,
  REGISTRO_SIN_CATEGORIAS,
} from "./errores"
import {
  type CampoMedio,
  type EntradaEditarMedio,
  type EntradaRegistrarMedio,
  esquemaEditarMedio,
  esquemaRegistrarMedio,
} from "./schemas"
import type { MedioGuardado, MedioRegistrado } from "./tipos"

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
  console.error(`[gestion-medios] ${operacion} falló (${codigo})`)
}

function falloCampo(campo: CampoMedio, mensaje: string): ResultadoFallo {
  return fallo(mensaje, { [campo]: [mensaje] })
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorMedio(error)
  if (!esperado) informar(operacion, error)
  return campo ? falloCampo(campo, mensaje) : fallo(mensaje)
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

/** El código debe existir en DIVIPOLA; que esté habilitado lo decide la BD. */
function validarMunicipio(codigo: string): ResultadoFallo | null {
  return obtenerMunicipio(codigo)
    ? null
    : falloCampo("municipioCodigo", MUNICIPIO_DESCONOCIDO)
}

/**
 * Las categorías nuevas deben estar activas: `medio_categorias` no lo valida.
 * Las que el medio ya tenía se pueden conservar aunque estén archivadas.
 */
async function validarCategorias(
  supabase: ClienteUsuario,
  elegidas: readonly string[],
  actuales: readonly string[] = []
): Promise<ResultadoFallo | null> {
  const nuevas = elegidas.filter((id) => !actuales.includes(id))
  if (nuevas.length === 0) return null
  const { data, error } = await supabase
    .from("categorias")
    .select("id")
    .in("id", nuevas)
    .eq("activo", true)
    .is("deleted_at", null)
  if (error) return falloBd("validar categorías", error)
  const activas = data.map((fila) => fila.id)
  if (categoriasNoPermitidas(elegidas, activas, actuales).length === 0) {
    return null
  }
  // La lista de la hoja se actualiza con la respuesta.
  refresh()
  return falloCampo("categoriaIds", CATEGORIAS_NO_DISPONIBLES)
}

/** Primero inserta y luego borra: si lo primero falla, nada cambió. */
async function aplicarCategorias(
  supabase: ClienteUsuario,
  medioId: string,
  { agregar, quitar }: CambioCategorias
): Promise<ErrorBd | null> {
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

/** Da de baja el medio recién creado (la bitácora conserva el alta y la baja). */
async function revertirRegistro(
  supabase: ClienteUsuario,
  medioId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("medios")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", medioId)
    .select("id")
  if (error) informar("revertir registro de medio", error)
  return !error && data.length === 1
}

/** Una edición con bloqueo optimista no tocó filas: ¿se borró, cambió o faltó permiso? */
async function motivoSinFilas(
  supabase: ClienteUsuario,
  medioId: string,
  actualizadoAt: string
): Promise<ResultadoFallo> {
  const { data, error } = await supabase
    .from("medios")
    .select("updated_at, deleted_at")
    .eq("id", medioId)
    .maybeSingle()
  if (error) return falloBd("releer medio", error)
  if (!data || data.deleted_at) return conflicto(MEDIO_INEXISTENTE)
  if (data.updated_at !== actualizadoAt) return conflicto(MEDIO_DESACTUALIZADO)
  return fallo(MENSAJE_SIN_PERMISO)
}

interface VersionMedio {
  columnas: ColumnasEditablesMedio
  categoriaIds: string[]
}

/** Lee el medio y confirma que es la misma versión que la persona abrió. */
async function leerVersionAbierta(
  supabase: ClienteUsuario,
  medioId: string,
  actualizadoAt: string
): Promise<VersionMedio | ResultadoFallo> {
  const [medio, categorias] = await Promise.all([
    supabase
      .from("medios")
      .select(
        "nombre, tipo, municipio_codigo, descripcion_audiencia, updated_at, deleted_at"
      )
      .eq("id", medioId)
      .maybeSingle(),
    supabase
      .from("medio_categorias")
      .select("categoria_id")
      .eq("medio_id", medioId),
  ])
  if (medio.error) return falloBd("leer medio", medio.error)
  if (categorias.error) return falloBd("leer categorías", categorias.error)
  if (!medio.data || medio.data.deleted_at) return conflicto(MEDIO_INEXISTENTE)
  if (medio.data.updated_at !== actualizadoAt) {
    return conflicto(MEDIO_DESACTUALIZADO)
  }
  return {
    columnas: medio.data,
    categoriaIds: categorias.data.map((fila) => fila.categoria_id),
  }
}

/** Escribe con la condición de versión, sin pisar otra edición; devuelve la nueva versión. */
async function escribirColumnas(
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
  if (error) return falloBd("editar medio", error)
  if (data.length === 0) return motivoSinFilas(supabase, medioId, actualizadoAt)
  return { actualizadoAt: data[0].updated_at }
}

function esFallo<T extends object>(
  resultado: T | ResultadoFallo
): resultado is ResultadoFallo {
  return "ok" in resultado && resultado.ok === false
}

// ── Acciones ─────────────────────────────────────────────────────────────────

/**
 * Registra un medio (nace PENDIENTE) con sus categorías. Devuelve su id para
 * llevar a la ficha, donde se invita a su equipo.
 */
export async function registrarMedio(
  entrada: EntradaRegistrarMedio
): Promise<ResultadoAccion<MedioRegistrado>> {
  await requerirPermiso("medios.editar")
  const validacion = esquemaRegistrarMedio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const municipioInvalido = validarMunicipio(datos.municipioCodigo)
  if (municipioInvalido) return municipioInvalido

  try {
    const supabase = await crearClienteServidor()
    const categoriasInvalidas = await validarCategorias(
      supabase,
      datos.categoriaIds
    )
    if (categoriasInvalidas) return categoriasInvalidas

    const { data: medio, error } = await supabase
      .from("medios")
      .insert(columnasMedio(datos))
      .select("id")
      .single()
    if (error) return falloBd("registrar medio", error)

    const errorCategorias = await aplicarCategorias(supabase, medio.id, {
      agregar: datos.categoriaIds,
      quitar: [],
    })
    if (errorCategorias) {
      informar("asignar categorías al medio nuevo", errorCategorias)
      const revertido = await revertirRegistro(supabase, medio.id)
      refresh()
      if (!revertido) {
        return exito({ id: medio.id, advertencia: REGISTRO_SIN_CATEGORIAS })
      }
      const { campo } = interpretarErrorMedio(errorCategorias)
      return campo === "categoriaIds"
        ? falloCampo(campo, CATEGORIAS_NO_DISPONIBLES)
        : fallo(REGISTRO_REVERTIDO)
    }

    refresh()
    return exito({ id: medio.id, advertencia: null })
  } catch (error) {
    return falloInesperado("registrarMedio", error)
  }
}

/**
 * Edita nombre, tipo, municipio, descripción y categorías de un medio con
 * bloqueo optimista (`updated_at`, también para las categorías): no pisa el
 * cambio de otra persona. Solo escribe las columnas que cambiaron.
 */
export async function editarMedio(
  entrada: EntradaEditarMedio
): Promise<ResultadoAccion<MedioGuardado>> {
  await requerirPermiso("medios.editar")
  const validacion = esquemaEditarMedio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { medioId, actualizadoAt, ...datos } = validacion.data
  const municipioInvalido = validarMunicipio(datos.municipioCodigo)
  if (municipioInvalido) return municipioInvalido

  try {
    const supabase = await crearClienteServidor()
    const version = await leerVersionAbierta(supabase, medioId, actualizadoAt)
    if (esFallo(version)) return version
    const categoriasInvalidas = await validarCategorias(
      supabase,
      datos.categoriaIds,
      version.categoriaIds
    )
    if (categoriasInvalidas) return categoriasInvalidas

    const cambios = cambiosMedio(version.columnas, columnasMedio(datos))
    const cambioCategorias = diferenciaCategorias(
      version.categoriaIds,
      datos.categoriaIds
    )
    const cambianColumnas = hayCambiosMedio(cambios)
    if (!cambianColumnas && !hayCambioCategorias(cambioCategorias)) {
      return exito({ actualizadoAt, advertencia: null })
    }

    // Primero la fila del medio con la condición de versión: si otra persona
    // guardó antes (datos o categorías), aquí se detiene sin pisar nada.
    const escrito = await escribirColumnas(
      supabase,
      medioId,
      actualizadoAt,
      escrituraConVersion(version.columnas, cambios)
    )
    if (esFallo(escrito)) return escrito

    const errorCategorias = hayCambioCategorias(cambioCategorias)
      ? await aplicarCategorias(supabase, medioId, cambioCategorias)
      : null
    refresh()
    if (!errorCategorias) {
      return exito({ actualizadoAt: escrito.actualizadoAt, advertencia: null })
    }
    informar("editar categorías del medio", errorCategorias)
    // La versión ya cambió: reintentar con la hoja abierta daría un conflicto
    // falso, así que ambos mensajes piden volver a abrirla.
    if (!cambianColumnas) return fallo(CATEGORIAS_SIN_GUARDAR)
    return exito({
      actualizadoAt: escrito.actualizadoAt,
      advertencia: EDICION_SIN_CATEGORIAS,
    })
  } catch (error) {
    return falloInesperado("editarMedio", error)
  }
}
