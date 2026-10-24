"use server"

/**
 * Server Actions de Operación (consulta). Cada una autoriza con el DAL, valida
 * con zod y deja que la BD vuelva a decidir: la RLS del usuario para leer y
 * los `*_srv` (actor + sesión + permiso) para lo privilegiado. Los errores
 * esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { mensajeErrorBd } from "@/features/usuarios/errores"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { ClavePermiso } from "@/lib/auth/permisos"
import { registrarEvento } from "@/lib/auth/registro"
import { type ErrorBd, interpretarErrorBd } from "@/lib/errores-bd"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { crearClienteServidor } from "@/lib/supabase/server"

import { ESTADOS_ASIGNACION } from "./estados"
import { MENSAJES_HINT_CANCELACION } from "./gestion-asignacion"
import { type DatoRevelado, grupoPrivado, presentarRevelados } from "./privados"
import { configuracionOperacion } from "./queries/comun"
import {
  type EntidadExportable,
  type EntradaCancelarAsignacion,
  type EntradaEvidencias,
  type EntradaExportacion,
  type EntradaRevelar,
  esquemaCancelarAsignacion,
  esquemaEvidencias,
  esquemaExportacion,
  esquemaRevelar,
} from "./schemas"
import { informar } from "./servidor"

const MENSAJE_INESPERADO =
  "No pudimos completar la operación. Intenta de nuevo en unos minutos."

// ── Datos privados ───────────────────────────────────────────────────────────

export interface DatosRevelados {
  titulo: string
  datos: DatoRevelado[]
}

/**
 * ¿El USUARIO puede leer esa ficha? Se consulta con su JWT: la RLS decide. La
 * función `revelar_privado_srv` valida el permiso, no el alcance de la fila.
 */
async function fichaVisible(
  entidad: EntradaRevelar["entidad"],
  id: string
): Promise<boolean> {
  const supabase = await crearClienteServidor()
  const { data, error } =
    entidad === "medio"
      ? await supabase
          .from("medios")
          .select("id")
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle()
      : await supabase
          .from("anunciantes")
          .select("id")
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle()
  if (error) throw error
  return data !== null
}

/**
 * Revela un grupo de datos `_privado` de un medio o anunciante. Exige
 * `datos_sensibles.ver`, el permiso de la ficha y que la fila sea visible
 * para quien consulta (RLS); `revelar_privado_srv` vuelve a validar actor,
 * sesión y permiso, y deja `REVELAR_DATO` en la bitácora con los campos
 * pedidos. Un id inexistente o ajeno no llega a la bitácora.
 */
export async function revelarDatosPrivados(
  entrada: EntradaRevelar
): Promise<ResultadoAccion<DatosRevelados>> {
  const actor = await requerirPermiso("datos_sensibles.ver")
  const validacion = esquemaRevelar.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { entidad, id, grupo } = validacion.data
  const permisoFicha = entidad === "medio" ? "medios.ver" : "anunciantes.ver"
  if (!tieneAlgunPermiso(actor, [permisoFicha])) {
    return fallo("No tienes permiso para ver esta ficha.")
  }
  const definicion = grupoPrivado(entidad, grupo)
  if (!definicion) return fallo("Ese grupo de datos no existe.")

  try {
    if (!(await fichaVisible(entidad, id))) {
      return fallo("No encontramos esa ficha o no tienes acceso a ella.")
    }
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc("revelar_privado_srv", {
      p_tabla: definicion.tabla,
      p_id: id,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_campos: definicion.campos.map((campo) => campo.campo),
    })
    if (error) {
      if (!error.message?.startsWith("AMO_"))
        informar("revelarDatosPrivados", error)
      return fallo(mensajeErrorBd(error))
    }
    return exito({
      titulo: definicion.titulo,
      datos: presentarRevelados(definicion, data),
    })
  } catch (error) {
    informar("revelarDatosPrivados", error)
    return fallo(MENSAJE_INESPERADO)
  }
}

// ── Evidencias (URL firmadas de corta duración) ──────────────────────────────

const BUCKET_EVIDENCIAS = "evidencias"
/** Capturas compartidas de los datos demo: solo se firman con la secret key (§10). */
const PREFIJO_MUESTRAS = "muestras/"

export interface ImagenEvidencia {
  /** Miniatura (o la captura si no hay miniatura). */
  miniatura: string | null
  captura: string | null
}

export interface ImagenesEvidencia {
  publicaciones: Record<string, ImagenEvidencia>
  metricas: Record<string, ImagenEvidencia>
  /** Segundos que viven estas URL (`archivos.vigencia_url_firmada_segundos`, §8). */
  vigenciaSegundos: number
}

interface FilaImagen {
  id: string
  captura_path: string
  miniatura_path: string | null
}

type Firmador = (rutas: string[]) => Promise<Map<string, string>>

function firmadorCon(
  almacen: ReturnType<
    Awaited<ReturnType<typeof crearClienteServidor>>["storage"]["from"]
  >,
  vigenciaSegundos: number
): Firmador {
  return async (rutas) => {
    if (rutas.length === 0) return new Map()
    const { data, error } = await almacen.createSignedUrls(
      rutas,
      vigenciaSegundos
    )
    if (error) throw error
    return new Map(
      data.flatMap((firmada) =>
        firmada.path && firmada.signedUrl && !firmada.error
          ? [[firmada.path, firmada.signedUrl] as const]
          : []
      )
    )
  }
}

function rutasDe(filas: readonly FilaImagen[]): string[] {
  return filas.flatMap((fila) =>
    fila.miniatura_path
      ? [fila.captura_path, fila.miniatura_path]
      : [fila.captura_path]
  )
}

function imagenesPorFila(
  filas: readonly FilaImagen[],
  firmadas: ReadonlyMap<string, string>
): Record<string, ImagenEvidencia> {
  return Object.fromEntries(
    filas.map((fila) => {
      const captura = firmadas.get(fila.captura_path) ?? null
      const miniatura = fila.miniatura_path
        ? (firmadas.get(fila.miniatura_path) ?? captura)
        : captura
      return [fila.id, { miniatura, captura }]
    })
  )
}

/**
 * Firma las capturas de evidencia y métricas de una asignación por el tiempo
 * configurado (`archivos.vigencia_url_firmada_segundos`, 300 s por defecto). Las
 * rutas salen de las filas que el USUARIO puede leer (RLS), nunca del cliente:
 * - `asignacion/<id>/…`: se firman con el cliente del usuario (regla 1, §8).
 * - `muestras/…` (datos demo): con la secret key tras leer la fila, dejando
 *   `URL_FIRMADA` en la bitácora (regla 2). Sin ese registro no se entregan.
 */
export async function firmarEvidencias(
  entrada: EntradaEvidencias
): Promise<ResultadoAccion<ImagenesEvidencia>> {
  const actor = await requerirPermiso("asignaciones.ver")
  const validacion = esquemaEvidencias.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { asignacionId } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const [publicaciones, metricas, configuracion] = await Promise.all([
      supabase
        .from("publicaciones")
        .select("id, captura_path, miniatura_path")
        .eq("asignacion_id", asignacionId),
      supabase
        .from("metricas")
        .select("id, captura_path, miniatura_path")
        .eq("asignacion_id", asignacionId),
      configuracionOperacion(),
    ])
    if (publicaciones.error) throw publicaciones.error
    if (metricas.error) throw metricas.error
    const vigenciaSegundos = configuracion.vigenciaUrlFirmadaSegundos

    const rutas = [
      ...new Set([...rutasDe(publicaciones.data), ...rutasDe(metricas.data)]),
    ]
    const prefijoPropio = `asignacion/${asignacionId}/`
    const propias = rutas.filter((ruta) => ruta.startsWith(prefijoPropio))
    const muestras = rutas.filter((ruta) => ruta.startsWith(PREFIJO_MUESTRAS))

    const firmadas = await firmadorCon(
      supabase.storage.from(BUCKET_EVIDENCIAS),
      vigenciaSegundos
    )(propias)
    if (muestras.length > 0) {
      const contexto = await contextoDelActor(actor)
      const registrado = await registrarEvento({
        actorId: contexto.actorId,
        admin: contexto.admin,
        accion: "URL_FIRMADA",
        entidad: "asignaciones",
        entidadId: asignacionId,
        metadatos: {
          bucket: BUCKET_EVIDENCIAS,
          rutas: muestras,
          expira_s: vigenciaSegundos,
        },
      })
      if (registrado) {
        const deMuestras = await firmadorCon(
          contexto.admin.storage.from(BUCKET_EVIDENCIAS),
          vigenciaSegundos
        )(muestras)
        for (const [ruta, url] of deMuestras) firmadas.set(ruta, url)
      }
    }

    return exito({
      publicaciones: imagenesPorFila(publicaciones.data, firmadas),
      metricas: imagenesPorFila(metricas.data, firmadas),
      vigenciaSegundos,
    })
  } catch (error) {
    informar("firmarEvidencias", error)
    return fallo("No pudimos cargar las capturas. Intenta de nuevo.")
  }
}

// ── Exportaciones ────────────────────────────────────────────────────────────

const PERMISO_EXPORTACION: Readonly<Record<EntidadExportable, ClavePermiso>> = {
  medios: "medios.ver",
  anunciantes: "anunciantes.ver",
  campanas: "campanas.ver",
  asignaciones: "asignaciones.ver",
}

/** Deja `EXPORTAR` en la bitácora tras generar un CSV/Excel de un listado. */
export async function registrarExportacionOperacion(
  entrada: EntradaExportacion
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(Object.values(PERMISO_EXPORTACION))
  const validacion = esquemaExportacion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { entidad, formato, filas } = validacion.data
  if (!tieneAlgunPermiso(actor, [PERMISO_EXPORTACION[entidad]])) {
    return fallo("No tienes permiso para consultar este listado.")
  }

  try {
    const contexto = await contextoDelActor(actor)
    const registrado = await registrarEvento({
      actorId: contexto.actorId,
      admin: contexto.admin,
      accion: "EXPORTAR",
      entidad,
      entidadId: null,
      metadatos: { formato, filas },
    })
    return registrado
      ? exito()
      : fallo("No se pudo registrar la exportación en la bitácora.")
  } catch (error) {
    informar("registrarExportacionOperacion", error)
    return fallo(MENSAJE_INESPERADO)
  }
}

// ── Gestión de la asignación (ADM-010) ───────────────────────────────────────
// Abrir una disputa (ADM-011) usa `abrirDisputa` de `@/features/disputas`.

/** Errores de la BD con texto propio para los `hint` que la interfaz explica. */
function falloGestion(
  operacion: string,
  error: ErrorBd,
  mensajesHint: Readonly<Record<string, string>> = {}
): ResultadoFallo {
  const porHint = error.hint ? mensajesHint[error.hint] : undefined
  if (porHint) return fallo(porHint)
  const { mensaje, esperado } = interpretarErrorBd(error)
  if (!esperado) informar(operacion, error)
  return fallo(mensaje)
}

const NO_ENCONTRADA =
  "No encontramos la asignación o ya no tienes acceso a ella. Actualiza la página."

export interface ResultadoCancelacion {
  /** El medio quedó suspendido en la misma transacción. */
  medioSuspendido: boolean
}

function medioSuspendidoDe(datos: unknown): boolean {
  return (
    typeof datos === "object" &&
    datos !== null &&
    "medio_suspendido" in datos &&
    datos.medio_suspendido === true
  )
}

/**
 * Cancela la asignación con una causa del catálogo y un motivo (ADM-010).
 * Con fraude o incumplimiento del medio puede suspenderlo en la misma
 * transacción (INT-006), lo que exige además `medios.suspender`. Antes de
 * cancelar comprueba (con la sesión: la RLS prueba el acceso) que siga en el
 * estado que mostraba la ficha; si cambió, la refresca y no cancela.
 * `cancelar_asignacion_srv` libera cupo y presupuesto, deja la bitácora y los
 * avisos; una liquidada o en disputa se rechaza con su `hint`.
 */
export async function cancelarAsignacion(
  entrada: EntradaCancelarAsignacion
): Promise<ResultadoAccion<ResultadoCancelacion>> {
  const actor = await requerirPermiso("asignaciones.gestionar")
  const validacion = esquemaCancelarAsignacion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { asignacionId, estadoVisto, causa, motivo, suspenderMedio } =
    validacion.data
  if (suspenderMedio && !tieneAlgunPermiso(actor, ["medios.suspender"])) {
    const mensaje =
      "No tienes permiso para suspender medios: cancela sin suspenderlo o pídeselo a quien lo tenga."
    return fallo(mensaje, { suspenderMedio: [mensaje] })
  }

  try {
    const supabase = await crearClienteServidor()
    const { data: actual, error: errorLectura } = await supabase
      .from("asignaciones")
      .select("estado")
      .eq("id", asignacionId)
      .maybeSingle()
    if (errorLectura) throw errorLectura
    if (!actual) return fallo(NO_ENCONTRADA)
    if (actual.estado !== estadoVisto) {
      refresh()
      return fallo(
        `La asignación cambió mientras la revisabas: ahora está «${ESTADOS_ASIGNACION[actual.estado].etiqueta.toLocaleLowerCase("es-CO")}». La ficha ya muestra su estado actual; revísala antes de cancelar.`
      )
    }

    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "cancelar_asignacion_srv",
      {
        p_asignacion_id: asignacionId,
        p_causa: causa,
        p_motivo: motivo,
        p_suspender_medio: suspenderMedio,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      }
    )
    if (error) {
      return falloGestion(
        "cancelarAsignacion",
        error,
        MENSAJES_HINT_CANCELACION
      )
    }
    refresh()
    return exito({ medioSuspendido: medioSuspendidoDe(data) })
  } catch (error) {
    informar("cancelarAsignacion", error)
    return fallo(MENSAJE_INESPERADO)
  }
}
