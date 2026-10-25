"use server"

/**
 * Server Actions de las campañas del anunciante (ANU-003, ANU-014) y de la
 * gestión asistida del equipo AMO por cuenta de un anunciante (ADM-014).
 * Patrón de cada acción:
 *
 * 1. DAL antes que nada: `campanas.gestionar_propias` (el anunciante) o
 *    `campanas.gestionar` (el equipo AMO). La empresa propia solo se le exige
 *    al anunciante; el equipo elige la empresa al crear y después la deriva la
 *    BD de la campaña. La BD es la autoridad: propiedad para el anunciante,
 *    permiso de la transición para el equipo (la bitácora queda con el
 *    operador como actor y el anunciante como propietario).
 * 2. zod: el MISMO esquema que el formulario; las reglas que dependen de la
 *    campaña (lo comprometido, las ventanas de sus ofertas vivas) se vuelven a
 *    leer de la BD con la sesión antes de validar.
 * 3. Crear y editar van con el cliente de la SESIÓN (RLS + bitácora con el
 *    actor); activar y cancelar, por `transicionar_srv` con actor y sesión
 *    (`contextoDelActor`): la BD revalida empresa verificada, asignaciones
 *    vivas y motivo, y cancela en cascada las ofertas. Archivar va por
 *    `archivar_campana_srv`, también con actor y sesión: la sesión del dueño
 *    no puede ocultar la fila (su RLS de lectura exige `deleted_at is null`).
 * 4. Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import {
  codigoNegocio,
  type ErrorBd,
  MENSAJE_INESPERADO,
} from "@/lib/errores-bd"
import { serializarFecha } from "@/lib/fechas"
import { transicionar } from "@/lib/negocio/transicionar"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Database } from "@/types/database.types"

import {
  CAMPANA_DESACTUALIZADA,
  CAMPANA_NO_EDITABLE,
  CAMPANA_NO_ENCONTRADA,
  interpretarErrorCampana,
  mensajePresupuestoCampana,
  SIN_EMPRESA,
} from "./errores"
import { reglasEdicion, reglasNuevaCampana } from "./formularios"
import { exigeEmpresaPropia, PERMISOS_GESTION_CAMPANAS } from "./gestion"
import {
  obtenerCampanaGestionable,
  obtenerMiCampana,
  ofertasDeMiCampana,
} from "./queries"
import { esEditable, presupuestoMinimo } from "./reglas"
import {
  type DatosNuevaCampana,
  type EntradaCampanaId,
  type EntradaCancelarCampana,
  type EntradaEditarCampana,
  type EntradaNuevaCampana,
  esquemaCampanaId,
  esquemaCancelarCampana,
  esquemaEditarCampana,
  esquemaNuevaCampana,
  esquemaNuevaCampanaAsistida,
} from "./schemas"
import type { MiCampana } from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[campanas] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorCampana(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

type ClienteSesion = Awaited<ReturnType<typeof crearClienteServidor>>

/**
 * Piso vigente del presupuesto, leído de nuevo (sin la caché de la
 * solicitud): entre la validación y el guardado otra oferta pudo pasar a
 * revisión. `null` si no se pudo leer.
 */
async function pisoPresupuesto(
  supabase: ClienteSesion,
  campanaId: string
): Promise<number | null> {
  const [campana, disponible] = await Promise.all([
    supabase
      .from("campanas")
      .select("presupuesto_total, presupuesto_comprometido")
      .eq("id", campanaId)
      .maybeSingle(),
    supabase.rpc("disponible_campana", { p_campana_id: campanaId }),
  ])
  if (campana.error || !campana.data || disponible.error) return null
  // La función devuelve null si la campaña no es visible (las SQL generan `number`).
  const valor = disponible.data as number | null
  return presupuestoMinimo({
    presupuestoTotal: Number(campana.data.presupuesto_total),
    presupuestoComprometido: Number(campana.data.presupuesto_comprometido),
    disponible: typeof valor === "number" ? Number(valor) : null,
  })
}

/** Hoy en Bogotá: el servidor corre en UTC. */
function hoy(): string {
  return serializarFecha(new Date())
}

type ActualizacionCampana = Pick<
  Database["public"]["Tables"]["campanas"]["Update"],
  | "nombre"
  | "marca"
  | "objetivo"
  | "fecha_inicio"
  | "fecha_fin"
  | "presupuesto_total"
>

type ColumnasEditables = Pick<
  MiCampana,
  "nombre" | "marca" | "objetivo" | "fechaInicio" | "fechaFin"
> & { presupuestoTotal: number }

/** Solo las columnas que cambian (cada cambio queda en la bitácora). */
function cambiosCampana(
  actual: MiCampana,
  nuevo: ColumnasEditables
): ActualizacionCampana {
  const cambios: ActualizacionCampana = {}
  if (nuevo.nombre !== actual.nombre) cambios.nombre = nuevo.nombre
  if (nuevo.marca !== actual.marca) cambios.marca = nuevo.marca
  if (nuevo.objetivo !== actual.objetivo) cambios.objetivo = nuevo.objetivo
  if (nuevo.fechaInicio !== actual.fechaInicio) {
    cambios.fecha_inicio = nuevo.fechaInicio
  }
  if (nuevo.fechaFin !== actual.fechaFin) cambios.fecha_fin = nuevo.fechaFin
  if (nuevo.presupuestoTotal !== actual.presupuestoTotal) {
    cambios.presupuesto_total = nuevo.presupuestoTotal
  }
  return cambios
}

/** Cambio de estado por `transicionar_srv` y refresco de la ficha. */
async function aplicarTransicion(
  usuario: UsuarioSesion,
  operacion: string,
  solicitud: {
    id: string
    hacia: "ACTIVA" | "CANCELADA"
    motivo?: string | null
  }
): Promise<ResultadoAccion> {
  try {
    const contexto = await contextoDelActor(usuario)
    const { error } = await transicionar(contexto, {
      entidad: "campanas",
      ...solicitud,
    })
    if (error) return falloBd(operacion, error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado(operacion, error)
  }
}

// ── Crear y editar ───────────────────────────────────────────────────────────

/**
 * Datos de la campaña nueva y de qué empresa es: la del anunciante en sesión
 * (nunca la de la entrada) o, para el equipo AMO, la que eligió.
 */
function validarNuevaCampana(
  usuario: UsuarioSesion,
  entrada: EntradaNuevaCampana & { anuncianteId?: string }
): { anuncianteId: string; datos: DatosNuevaCampana } | ResultadoFallo {
  const reglas = reglasNuevaCampana(hoy())
  if (exigeEmpresaPropia(usuario)) {
    if (!usuario.anuncianteId) return fallo(SIN_EMPRESA)
    const validacion = esquemaNuevaCampana(reglas).safeParse(entrada)
    if (!validacion.success) return desdeErrorZod(validacion.error)
    return { anuncianteId: usuario.anuncianteId, datos: validacion.data }
  }
  const validacion = esquemaNuevaCampanaAsistida(reglas).safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { anuncianteId, ...datos } = validacion.data
  return { anuncianteId, datos }
}

/**
 * Nueva campaña en BORRADOR (la BD fija el estado): de la empresa del
 * anunciante o, en la gestión asistida, de la que eligió el equipo AMO (la
 * BD la marca como asistida y le avisa a la empresa).
 */
export async function crearCampana(
  entrada: EntradaNuevaCampana & { anuncianteId?: string }
): Promise<ResultadoAccion<{ id: string }>> {
  const usuario = await requerirPermiso(PERMISOS_GESTION_CAMPANAS)
  const validacion = validarNuevaCampana(usuario, entrada)
  if ("ok" in validacion) return validacion

  try {
    const { anuncianteId } = validacion
    const { nombre, marca, objetivo, fechaInicio, fechaFin, presupuesto } =
      validacion.datos
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("campanas")
      .insert({
        anunciante_id: anuncianteId,
        nombre,
        marca,
        objetivo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        presupuesto_total: presupuesto,
      })
      .select("id")
      .single()
    if (error) return falloBd("crear la campaña", error)
    return exito({ id: data.id })
  } catch (error) {
    return falloInesperado("crearCampana", error)
  }
}

/**
 * Edita nombre, objetivo, marca, fechas y presupuesto de una campaña en
 * borrador o activa. Bloqueo optimista con `updated_at`: si un compañero
 * guardó antes, no se pisa su cambio. El anunciante edita las de su empresa;
 * el equipo AMO, la que la RLS le deje ver y editar.
 */
export async function editarCampana(
  entrada: EntradaEditarCampana
): Promise<ResultadoAccion<{ actualizadoAt: string }>> {
  const usuario = await requerirPermiso(PERMISOS_GESTION_CAMPANAS)
  const propia = exigeEmpresaPropia(usuario)
  if (propia && !usuario.anuncianteId) return fallo(SIN_EMPRESA)
  const id = esquemaCampanaId.safeParse({ campanaId: entrada?.campanaId })
  if (!id.success) return desdeErrorZod(id.error)

  try {
    const campana =
      propia && usuario.anuncianteId
        ? await obtenerMiCampana(usuario.anuncianteId, id.data.campanaId)
        : await obtenerCampanaGestionable(id.data.campanaId)
    if (!campana) return fallo(CAMPANA_NO_ENCONTRADA)
    if (!esEditable(campana.estado)) return fallo(CAMPANA_NO_EDITABLE)
    const ofertas = await ofertasDeMiCampana(campana.id)
    const validacion = esquemaEditarCampana(
      reglasEdicion(campana, ofertas, hoy())
    ).safeParse(entrada)
    if (!validacion.success) return desdeErrorZod(validacion.error)
    const { actualizadoAt, presupuesto, ...datos } = validacion.data
    if (actualizadoAt !== campana.actualizadaAt) {
      return fallo(CAMPANA_DESACTUALIZADA)
    }

    const cambios = cambiosCampana(campana, {
      ...datos,
      presupuestoTotal: presupuesto,
    })
    if (Object.keys(cambios).length === 0) return exito({ actualizadoAt })

    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("campanas")
      .update(cambios)
      .eq("id", campana.id)
      .eq("updated_at", campana.actualizadaAt)
      .select("updated_at")
    if (error && codigoNegocio(error) === "AMO_PRESUPUESTO_CAMPANA") {
      // Mismo mensaje que el formulario, con la cifra vigente.
      const mensaje = mensajePresupuestoCampana(
        error,
        await pisoPresupuesto(supabase, campana.id)
      )
      return fallo(mensaje, { presupuesto: [mensaje] })
    }
    if (error) return falloBd("editar la campaña", error)
    if (data.length === 0) return fallo(CAMPANA_DESACTUALIZADA)
    return exito({ actualizadoAt: data[0].updated_at })
  } catch (error) {
    return falloInesperado("editarCampana", error)
  }
}

// ── Cambios de estado ────────────────────────────────────────────────────────

/** BORRADOR → ACTIVA. La BD exige la empresa verificada (ANU-003). */
export async function activarCampana(
  entrada: EntradaCampanaId
): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISOS_GESTION_CAMPANAS)
  const validacion = esquemaCampanaId.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(usuario, "activar la campaña", {
    id: validacion.data.campanaId,
    hacia: "ACTIVA",
  })
}

/**
 * ACTIVA → CANCELADA con motivo (ANU-014): falla si alguna asignación sigue en
 * curso (las verificadas, liquidadas o pagadas no la impiden); cancela en
 * cascada las ofertas sin cupos aceptados, y las que tienen obligaciones con
 * medios se cierran solas.
 */
export async function cancelarCampana(
  entrada: EntradaCancelarCampana
): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISOS_GESTION_CAMPANAS)
  const validacion = esquemaCancelarCampana.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(usuario, "cancelar la campaña", {
    id: validacion.data.campanaId,
    hacia: "CANCELADA",
    motivo: validacion.data.motivo,
  })
}

/**
 * Archiva una campaña en borrador, cancelada o finalizada
 * (`archivar_campana_srv`): sale de «Mis campañas» junto con sus ofertas en
 * borrador, canceladas o terminadas; el equipo AMO conserva su historial. La
 * BD revalida actor, sesión, empresa y estado. No refresca la ficha (ya no
 * existiría): el cliente vuelve al listado.
 */
export async function archivarCampana(
  entrada: EntradaCampanaId
): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISOS_GESTION_CAMPANAS)
  const validacion = esquemaCampanaId.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(usuario)
    const { error } = await contexto.admin.rpc("archivar_campana_srv", {
      p_campana_id: validacion.data.campanaId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
    })
    if (error) return falloBd("archivar la campaña", error)
    return exito()
  } catch (error) {
    return falloInesperado("archivarCampana", error)
  }
}
