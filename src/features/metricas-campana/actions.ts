"use server"

/**
 * Server Actions de las métricas de campaña (ANU-012). Autorizan con el DAL,
 * validan con zod y consultan con la sesión: `desempeno_anunciante` vuelve a
 * exigir `reportes.ver` y filtra a la empresa del usuario. Los errores
 * esperados se devuelven; nunca se lanzan.
 */
import "server-only"

import { obtenerMiCampana } from "@/features/campanas/queries"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import { registrarEvento } from "@/lib/auth/registro"
import { desdeErrorZod, exito, fallo, type ResultadoAccion } from "@/lib/result"

import { campanaMetricas } from "./calculos"
import { filasDeCorte } from "./contenido"
import { metricasDeCampana } from "./queries"
import {
  type EntradaExportacionMetricas,
  esquemaExportacionMetricas,
} from "./schemas"
import type { ArchivoMetricas } from "./tipos"

/** Identifica el documento en la bitácora (`metadatos.reporte`). */
const REPORTE_METRICAS_CAMPANA = "metricas-campana"

/** Log de servidor sin datos personales: operación y código del fallo. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[metricas-campana] ${operacion} falló (${codigo})`)
}

/**
 * Prepara la exportación de las métricas de una campaña: vuelve a consultar,
 * deja `EXPORTAR` en la bitácora (sobre la campaña, con formato, corte y
 * filas) y entrega los datos para que el navegador arme el Excel o el PDF de
 * marca. Sin ese registro no se entregan datos.
 */
export async function prepararExportacionMetricas(
  entrada: EntradaExportacionMetricas
): Promise<ResultadoAccion<ArchivoMetricas>> {
  const usuario = await requerirPermiso("reportes.exportar")
  const validacion = esquemaExportacionMetricas.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { campanaId, formato, dimension } = validacion.data
  if (!tieneAlgunPermiso(usuario, ["reportes.ver"])) {
    return fallo("No tienes permiso para consultar las métricas.")
  }
  if (!usuario.anuncianteId) {
    return fallo("Tu cuenta no está vinculada a una empresa anunciante.")
  }

  try {
    const campana = await obtenerMiCampana(usuario.anuncianteId, campanaId)
    if (!campana) {
      return fallo("No encontramos esa campaña o no tienes acceso a ella.")
    }
    const datos = await metricasDeCampana(campanaMetricas(campana))
    if (datos.totales.verificadas === 0) {
      return fallo(
        "Aún no hay negocios verificados: no hay resultados que exportar."
      )
    }
    const registrado = await registrarEvento({
      actorId: usuario.id,
      accion: "EXPORTAR",
      entidad: "campanas",
      entidadId: campanaId,
      metadatos: {
        reporte: REPORTE_METRICAS_CAMPANA,
        formato,
        corte: dimension,
        filas: filasDeCorte(datos, dimension).length,
      },
    })
    if (!registrado) {
      return fallo(
        "No se pudo registrar la exportación en la bitácora, así que no se generó el archivo. Intenta de nuevo."
      )
    }
    return exito({
      datos,
      dimension,
      generadoPor: usuario.nombre,
      generadoAt: new Date().toISOString(),
    })
  } catch (error) {
    informar("prepararExportacionMetricas", error)
    return fallo("No pudimos preparar la exportación. Intenta de nuevo.")
  }
}
