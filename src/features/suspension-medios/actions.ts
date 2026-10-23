"use server"

/**
 * Server Actions de la suspensión de medios (ADM-002). Patrón de cada acción:
 *
 * 1. DAL (`requerirPermiso("medios.suspender")`) antes que nada.
 * 2. zod: el MISMO esquema que el diálogo.
 * 3. El cambio de estado va por `transicionar` (`transicionar_srv`) con actor y
 *    sesión: la BD revalida permiso, estado y motivo, deja la bitácora y avisa
 *    al medio (`medio.suspendido` / `medio.reactivado`).
 * 4. Suspender NO cancela asignaciones: responde cuántas siguen en curso para
 *    que el equipo decida en la ficha de cada una (ADM-002 c2).
 * 5. `refresh()` para que la cabecera, el aviso y la lista muestren el cambio
 *    (también cuando otra persona cambió el estado mientras tanto).
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { transicionar } from "@/lib/negocio/transicionar"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"

import { resumirEnCurso } from "./en-curso"
import { interpretarErrorSuspension, MENSAJES_SUSPENSION } from "./errores"
import { asignacionesEnCursoDelMedio } from "./queries"
import {
  type EntradaMedio,
  type EntradaMotivoMedio,
  esquemaMedio,
  esquemaMotivoMedio,
} from "./schemas"
import type {
  AccionSuspension,
  AsignacionEnCurso,
  ResultadoSuspension,
  ResumenEnCurso,
} from "./tipos"

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[suspension-medios] ${operacion} falló (${codigo})`)
}

function falloBd(
  operacion: string,
  error: ErrorBd,
  accion: AccionSuspension
): ResultadoFallo {
  const { mensaje, campo, esperado, codigo } = interpretarErrorSuspension(
    error,
    accion
  )
  if (!esperado) informar(operacion, error)
  // Otra persona cambió el estado: la ficha muestra cómo quedó.
  if (codigo === "AMO_TRANSICION_INVALIDA") refresh()
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

const HACIA: Readonly<Record<AccionSuspension, "SUSPENDIDO" | "VERIFICADO">> = {
  suspender: "SUSPENDIDO",
  reactivar: "VERIFICADO",
}

async function cambiarEstado(
  actor: UsuarioSesion,
  accion: AccionSuspension,
  { medioId, motivo }: { medioId: string; motivo: string }
): Promise<ResultadoFallo | null> {
  const operacion = accion === "suspender" ? "suspenderMedio" : "reactivarMedio"
  try {
    const { error } = await transicionar(await contextoDelActor(actor), {
      entidad: "medios",
      id: medioId,
      hacia: HACIA[accion],
      motivo,
    })
    return error ? falloBd(operacion, error, accion) : null
  } catch (error) {
    informar(operacion, error)
    return fallo(MENSAJE_INESPERADO)
  }
}

/**
 * Lo que sigue en curso tras suspender. Si no se puede leer (sin
 * `asignaciones.ver` o un fallo), la suspensión ya quedó hecha: `null`.
 */
async function resumenTrasSuspender(
  actor: UsuarioSesion,
  medioId: string
): Promise<ResumenEnCurso | null> {
  if (!tieneAlgunPermiso(actor, ["asignaciones.ver"])) return null
  try {
    return resumirEnCurso(await asignacionesEnCursoDelMedio(medioId))
  } catch (error) {
    informar("resumenTrasSuspender", error)
    return null
  }
}

/**
 * Suspende un medio verificado (deja de ver ofertas y no acepta nuevas) con
 * motivo. Conserva lo que tiene en curso: el resultado dice cuántas
 * asignaciones siguen así.
 */
export async function suspenderMedio(
  entrada: EntradaMotivoMedio
): Promise<ResultadoAccion<ResultadoSuspension>> {
  const actor = await requerirPermiso("medios.suspender")
  const validacion = esquemaMotivoMedio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const falla = await cambiarEstado(actor, "suspender", validacion.data)
  if (falla) return falla
  const enCurso = await resumenTrasSuspender(actor, validacion.data.medioId)
  refresh()
  return exito({ enCurso })
}

/** Reactiva un medio suspendido: vuelve a VERIFICADO con su nivel. */
export async function reactivarMedio(
  entrada: EntradaMotivoMedio
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.suspender")
  const validacion = esquemaMotivoMedio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const falla = await cambiarEstado(actor, "reactivar", validacion.data)
  if (falla) return falla
  refresh()
  return exito()
}

/**
 * ADM-002 c2: al abrir el diálogo de suspensión, las asignaciones que el medio
 * tiene en curso (con enlace a su ficha para decidir si se cancelan). Se lee
 * con la sesión: la RPC exige `asignaciones.ver`.
 */
export async function consultarAsignacionesEnCurso(
  entrada: EntradaMedio
): Promise<ResultadoAccion<AsignacionEnCurso[]>> {
  const actor = await requerirPermiso("medios.suspender")
  if (!tieneAlgunPermiso(actor, ["asignaciones.ver"])) {
    return fallo(MENSAJES_SUSPENSION.sinPermisoAsignaciones)
  }
  const validacion = esquemaMedio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    return exito(await asignacionesEnCursoDelMedio(validacion.data.medioId))
  } catch (error) {
    informar("consultarAsignacionesEnCurso", error)
    return fallo(MENSAJES_SUSPENSION.enCursoNoDisponible)
  }
}
