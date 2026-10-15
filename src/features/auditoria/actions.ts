"use server"

/**
 * Server Actions de Auditoría. Cada una autoriza con el DAL, valida la entrada
 * con zod (mismo contrato que la URL) y lee con el cliente del usuario: la RLS
 * de `bitacora` vuelve a exigir `auditoria.ver`. Los errores esperados se
 * devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import { serializarFecha } from "@/lib/fechas"
import { desdeErrorZod, exito, fallo, type ResultadoAccion } from "@/lib/result"

import { datosExportacionBitacora } from "./exportacion"
import { rangoDeValores } from "./periodo"
import { eventosParaExportar, tramoLineaTiempo } from "./queries"
import {
  type EntradaExportacionBitacora,
  type EntradaTramo,
  esquemaExportacionBitacora,
  esquemaTramo,
} from "./schemas"
import { informar, registrarExportacion } from "./servidor"
import type { ArchivoExportado, TramoLineaTiempo } from "./tipos"

/** Siguiente tramo de la línea de tiempo (paginación por cursor). */
export async function cargarMasEventos(
  entrada: EntradaTramo
): Promise<ResultadoAccion<TramoLineaTiempo>> {
  const usuario = await requerirPermiso("auditoria.ver")
  const validacion = esquemaTramo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const { periodo, filtros, cursor } = validacion.data
    return exito(
      await tramoLineaTiempo(filtros, rangoDeValores(periodo), cursor, usuario)
    )
  } catch (error) {
    informar("cargarMasEventos", error)
    return fallo("No pudimos cargar más eventos. Intenta de nuevo.")
  }
}

/**
 * Exporta los eventos filtrados (hasta el límite) y deja `EXPORTAR` en la
 * bitácora con formato, filas y filtros. Sin ese registro no se entregan datos.
 */
export async function exportarBitacora(
  entrada: EntradaExportacionBitacora
): Promise<ResultadoAccion<ArchivoExportado>> {
  const usuario = await requerirPermiso("auditoria.exportar")
  if (!tieneAlgunPermiso(usuario, ["auditoria.ver"])) {
    return fallo(
      "Para exportar la bitácora también necesitas poder consultarla."
    )
  }
  const validacion = esquemaExportacionBitacora.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const { periodo, filtros, formato } = validacion.data
    const rango = rangoDeValores(periodo)
    const { eventos, total } = await eventosParaExportar(
      filtros,
      rango,
      usuario
    )
    const registrado = await registrarExportacion(usuario, "bitacora", {
      formato,
      filas: eventos.length,
      total,
      truncado: total > eventos.length,
      periodo: {
        desde: serializarFecha(rango.desde),
        hasta: serializarFecha(rango.hasta),
      },
      filtros,
    })
    if (!registrado) {
      return fallo(
        "No se pudo registrar la exportación en la bitácora, así que no se generó el archivo. Intenta de nuevo."
      )
    }
    return exito({ datos: datosExportacionBitacora(eventos), total })
  } catch (error) {
    informar("exportarBitacora", error)
    return fallo("No pudimos preparar la exportación. Intenta de nuevo.")
  }
}
