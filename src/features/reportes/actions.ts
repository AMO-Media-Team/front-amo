"use server"

/**
 * Server Actions de Reportes. Autorizan con el DAL, validan con zod (mismo
 * contrato que la URL) y consultan con el cliente del usuario: cada RPC
 * vuelve a exigir sus permisos. Los errores esperados se devuelven.
 */
import "server-only"

import { requerirPermiso } from "@/lib/auth/dal"
import { desdeErrorZod, exito, fallo, type ResultadoAccion } from "@/lib/result"

import { filtrosPara, puedeVerReporte, REPORTES } from "./catalogo"
import { cargarDatosReporte } from "./consultas"
import { contenidoReporte } from "./definiciones"
import {
  filtrosDesdeValores,
  filtrosParaBitacora,
  limitarFiltros,
  MENSAJE_PERIODO_EXCEDIDO,
  periodoExcedido,
  valoresDesdeEntrada,
} from "./filtros"
import {
  type EntradaExportacionReporte,
  esquemaExportacionReporte,
} from "./schemas"
import { informar, registrarExportacionReporte } from "./servidor"
import type { ArchivoReporte } from "./tipos"

/**
 * Prepara la exportación de un reporte: vuelve a consultar con los filtros de
 * la URL, deja `EXPORTAR` en la bitácora (formato, filas y filtros) y entrega
 * los datos para que el navegador arme el Excel o el PDF. Sin ese registro no
 * se entregan datos.
 */
export async function prepararExportacionReporte(
  entrada: EntradaExportacionReporte
): Promise<ResultadoAccion<ArchivoReporte>> {
  const usuario = await requerirPermiso("reportes.exportar")
  const validacion = esquemaExportacionReporte.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  const { reporte, formato } = validacion.data
  const catalogo = REPORTES[reporte]
  if (!puedeVerReporte(usuario, catalogo)) {
    return fallo("No tienes permiso para consultar este reporte.")
  }

  try {
    const aplicables = filtrosPara(catalogo, usuario)
    const filtros = limitarFiltros(
      aplicables,
      filtrosDesdeValores(valoresDesdeEntrada(validacion.data.filtros))
    )
    if (periodoExcedido(catalogo, filtros))
      return fallo(MENSAJE_PERIODO_EXCEDIDO)
    const datos = await cargarDatosReporte(reporte, filtros, usuario)
    const filas = contenidoReporte({ reporte, datos }).tabla.filas.length
    const registrado = await registrarExportacionReporte(usuario, reporte, {
      formato,
      filas,
      filtros: filtrosParaBitacora(aplicables, filtros),
    })
    if (!registrado) {
      return fallo(
        "No se pudo registrar la exportación en la bitácora, así que no se generó el archivo. Intenta de nuevo."
      )
    }
    return exito({
      reporte,
      datos,
      generadoPor: usuario.nombre,
      generadoAt: new Date().toISOString(),
    })
  } catch (error) {
    informar("prepararExportacionReporte", error)
    return fallo("No pudimos preparar la exportación. Intenta de nuevo.")
  }
}
