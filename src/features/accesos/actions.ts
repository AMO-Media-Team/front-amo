"use server"

/**
 * Server Actions de Accesos: autorizan con el DAL, validan con zod y leen con
 * el cliente del usuario (la RLS de `accesos` vuelve a exigir `accesos.ver`).
 */
import "server-only"

import { rangoDeValores } from "@/features/auditoria/periodo"
import { informar, registrarExportacion } from "@/features/auditoria/servidor"
import type { ArchivoExportado } from "@/features/auditoria/tipos"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import { serializarFecha } from "@/lib/fechas"
import { desdeErrorZod, exito, fallo, type ResultadoAccion } from "@/lib/result"

import { datosExportacionAccesos } from "./exportacion"
import { accesosParaExportar } from "./queries"
import {
  type EntradaExportacionAccesos,
  esquemaExportacionAccesos,
} from "./schemas"

/**
 * Exporta los accesos filtrados (hasta el límite) y deja `EXPORTAR` en la
 * bitácora con formato, filas y filtros. Sin ese registro no se entregan datos.
 */
export async function exportarAccesos(
  entrada: EntradaExportacionAccesos
): Promise<ResultadoAccion<ArchivoExportado>> {
  const usuario = await requerirPermiso("accesos.exportar")
  if (!tieneAlgunPermiso(usuario, ["accesos.ver"])) {
    return fallo(
      "Para exportar los accesos también necesitas poder consultarlos."
    )
  }
  const validacion = esquemaExportacionAccesos.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const { periodo, filtros, formato } = validacion.data
    const rango = rangoDeValores(periodo)
    const { filas, total } = await accesosParaExportar(filtros, rango, usuario)
    const registrado = await registrarExportacion(usuario, "accesos", {
      formato,
      filas: filas.length,
      total,
      truncado: total > filas.length,
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
    return exito({ datos: datosExportacionAccesos(filas), total })
  } catch (error) {
    informar("exportarAccesos", error)
    return fallo("No pudimos preparar la exportación. Intenta de nuevo.")
  }
}
