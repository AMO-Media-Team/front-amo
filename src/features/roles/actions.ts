"use server"

/**
 * Server Actions de Roles y permisos. Patrón de cada acción:
 *
 * 1. `requerirPermiso("roles.gestionar")` (DAL): sesión al día + permiso.
 * 2. zod: el MISMO esquema que el formulario del cliente.
 * 3. Reglas que la interfaz ya aplicó (rol de sistema, rol propio,
 *    anti-escalada), de nuevo en el servidor para responder con un mensaje claro.
 * 4. Escritura con el cliente del USUARIO (JWT + cabecera de contexto
 *    confiable): la BD vuelve a exigir `roles.gestionar`, sesión viva y AAL2
 *    (RLS), y sus triggers aplican las guardas y auditan con el actor real.
 *    La matriz de permisos es la excepción: se guarda de forma atómica con
 *    `guardar_permisos_rol_srv` (solo `service_role`, revalida actor y sesión).
 * 5. `refresh()` para que la página muestre el cambio en la misma respuesta.
 *
 * Los errores esperados se devuelven como `ResultadoAccion` (nunca se lanzan).
 */
import "server-only"

import { refresh } from "next/cache"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import { MENSAJE_INESPERADO } from "@/features/usuarios/errores"
import { PERMISOS } from "@/lib/auth/permisos"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { crearClienteServidor } from "@/lib/supabase/server"

import { permisosValidos } from "./catalogo"
import {
  type ErrorBdRol,
  esErrorEsperado,
  interpretarErrorRol,
} from "./errores"
import { TIPOS_ROL_ETIQUETA } from "./presentacion"
import { fueraDeAlcance, noAplicables, permisosClonables } from "./reglas"
import {
  type EntradaCrearRol,
  type EntradaEditarRol,
  type EntradaEliminarRol,
  type EntradaPermisosRol,
  esquemaCrearRol,
  esquemaEditarRol,
  esquemaEliminarRol,
  esquemaPermisosRol,
  mfaObligatoria,
} from "./schemas"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

const ROL_INEXISTENTE = "El rol ya no existe o no tienes acceso a él."
const ROL_SISTEMA =
  "Los permisos de los roles de sistema solo cambian con una actualización de la plataforma."

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[roles] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBdRol): ResultadoFallo {
  if (!esErrorEsperado(error)) informar(operacion, error)
  const { mensaje, campo } = interpretarErrorRol(error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

async function leerRol(supabase: ClienteUsuario, id: string) {
  const { data, error } = await supabase
    .from("roles")
    .select("id, nombre, tipo, es_sistema, rol_permisos ( permiso_clave )")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  return data
}

function listaDeDescripciones(claves: readonly (keyof typeof PERMISOS)[]) {
  return claves.map((clave) => `«${PERMISOS[clave].descripcion}»`).join(", ")
}

// ── Acciones ─────────────────────────────────────────────────────────────────

export type RolCreado = { id: string; copiados: number; omitidos: number }

/**
 * Crea un rol personalizado. Con `clonarDesde` copia los permisos del rol de
 * origen que el actor tiene (anti-escalada); si la copia falla, el rol recién
 * creado se borra para no dejarlo a medias.
 */
export async function crearRol(
  entrada: EntradaCrearRol
): Promise<ResultadoAccion<RolCreado>> {
  const actor = await requerirPermiso("roles.gestionar")
  const validacion = esquemaCrearRol.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const origen = datos.clonarDesde
      ? await leerRol(supabase, datos.clonarDesde)
      : null
    if (datos.clonarDesde && !origen) {
      return fallo("El rol de origen ya no existe.", {
        clonarDesde: ["El rol de origen ya no existe."],
      })
    }

    const { data: creado, error } = await supabase
      .from("roles")
      .insert({
        clave: datos.clave,
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        tipo: datos.tipo,
        requiere_mfa: datos.requiereMfa,
        color: datos.color,
      })
      .select("id")
      .single()
    if (error) return falloBd("crear rol", error)

    const {
      copiables,
      sinAlcance,
      noAplicables: noAdmitidos,
    } = permisosClonables(
      permisosValidos(origen?.rol_permisos.map((p) => p.permiso_clave) ?? []),
      actor,
      datos.tipo
    )
    if (copiables.length > 0) {
      const { error: errorCopia } = await supabase.from("rol_permisos").insert(
        copiables.map((clave) => ({
          rol_id: creado.id,
          permiso_clave: clave,
        }))
      )
      if (errorCopia) {
        const { error: errorDeshacer } = await supabase
          .from("roles")
          .delete()
          .eq("id", creado.id)
        if (errorDeshacer) informar("deshacer rol sin permisos", errorDeshacer)
        return falloBd("copiar permisos", errorCopia)
      }
    }

    refresh()
    return exito({
      id: creado.id,
      copiados: copiables.length,
      omitidos: sinAlcance.length + noAdmitidos.length,
    })
  } catch (error) {
    return falloInesperado("crearRol", error)
  }
}

/**
 * Nombre, descripción, color y verificación en dos pasos. De un rol de
 * sistema solo se cambian la descripción y el color (D20); la clave y el tipo
 * son permanentes.
 */
export async function editarRol(
  entrada: EntradaEditarRol
): Promise<ResultadoAccion> {
  await requerirPermiso("roles.gestionar")
  const validacion = esquemaEditarRol.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const rol = await leerRol(supabase, datos.rolId)
    if (!rol) return fallo(ROL_INEXISTENTE)

    const cambios = rol.es_sistema
      ? { descripcion: datos.descripcion, color: datos.color }
      : {
          nombre: datos.nombre,
          descripcion: datos.descripcion,
          color: datos.color,
          requiere_mfa: mfaObligatoria(rol.tipo) || datos.requiereMfa,
        }
    const { data, error } = await supabase
      .from("roles")
      .update(cambios)
      .eq("id", datos.rolId)
      .select("id")
    if (error) return falloBd("editar rol", error)
    if (data.length === 0) return fallo(ROL_INEXISTENTE)

    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("editarRol", error)
  }
}

export type PermisosGuardados = { agregados: number; quitados: number }

/**
 * Aplica el diff de la matriz con `guardar_permisos_rol_srv`: retira y otorga
 * en UNA transacción (todo o nada; antes eran dos peticiones y un fallo de la
 * segunda dejaba el rol a medias). La BD revalida actor, sesión y todas las
 * guardas (rol de sistema, rol propio, anti-escalada, permiso aplicable al
 * tipo de rol) antes de tocar una fila, y audita cada cambio con el actor.
 * Devuelve las filas que cambiaron de verdad: otorgar un permiso ya otorgado
 * o retirar uno ausente no cuenta.
 */
export async function guardarPermisosRol(
  entrada: EntradaPermisosRol
): Promise<ResultadoAccion<PermisosGuardados>> {
  const actor = await requerirPermiso("roles.gestionar")
  const validacion = esquemaPermisosRol.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { rolId, agregar, quitar } = validacion.data

  // Las mismas reglas que aplica la BD, antes, para responder nombrando todos
  // los permisos en español (la BD solo informa el primero que infringe).
  if (rolId === actor.rol.id) {
    return fallo("No puedes cambiar los permisos de tu propio rol.")
  }
  const fuera = fueraDeAlcance(actor, [...agregar, ...quitar])
  if (fuera.length > 0) {
    return fallo(
      `No puedes otorgar ni retirar permisos que tú no tienes: ${listaDeDescripciones(fuera)}.`
    )
  }

  try {
    const supabase = await crearClienteServidor()
    const rol = await leerRol(supabase, rolId)
    if (!rol) return fallo(ROL_INEXISTENTE)
    if (rol.es_sistema) return fallo(ROL_SISTEMA)
    const ajenos = noAplicables(rol.tipo, agregar)
    if (ajenos.length > 0) {
      return fallo(
        `Un rol de tipo «${TIPOS_ROL_ETIQUETA[rol.tipo]}» no admite estos permisos: ${listaDeDescripciones(ajenos)}.`
      )
    }

    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "guardar_permisos_rol_srv",
      {
        p_rol_id: rolId,
        p_agregar: agregar,
        p_quitar: quitar,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      }
    )
    if (error) return falloBd("guardar permisos", error)

    refresh()
    const cambios = data[0]
    return exito({
      agregados: cambios?.agregados ?? 0,
      quitados: cambios?.quitados ?? 0,
    })
  } catch (error) {
    return falloInesperado("guardarPermisosRol", error)
  }
}

/**
 * Elimina un rol personalizado sin cuentas asignadas. La confirmación exige
 * escribir su nombre; la FK de `perfiles` impide borrarlo si alguien lo usa.
 * No refresca: la interfaz vuelve al listado.
 */
export async function eliminarRol(
  entrada: EntradaEliminarRol
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("roles.gestionar")
  const validacion = esquemaEliminarRol.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { rolId, confirmacion } = validacion.data
  if (rolId === actor.rol.id) return fallo("No puedes eliminar tu propio rol.")

  try {
    const supabase = await crearClienteServidor()
    const rol = await leerRol(supabase, rolId)
    if (!rol) return fallo(ROL_INEXISTENTE)
    if (rol.es_sistema)
      return fallo("Los roles de sistema no se pueden eliminar.")
    if (confirmacion !== rol.nombre) {
      return fallo("El nombre no coincide.", {
        confirmacion: ["El nombre no coincide."],
      })
    }

    const { data, error } = await supabase
      .from("roles")
      .delete()
      .eq("id", rolId)
      .select("id")
    if (error) return falloBd("eliminar rol", error)
    if (data.length === 0) return fallo(ROL_INEXISTENTE)
    return exito()
  } catch (error) {
    return falloInesperado("eliminarRol", error)
  }
}
