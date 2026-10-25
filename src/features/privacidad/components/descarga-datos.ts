/**
 * Descarga en el navegador de los datos de un titular (JSON tal como lo
 * entregó la BD, o el Excel de marca). Solo se llama desde componentes de
 * cliente, al pulsar un botón.
 */
import { nombreArchivoExportacion } from "@/components/data-table/exportar"
import { descargarArchivo } from "@/lib/export/descarga"
import { exportarExcel } from "@/lib/export/excel"

import {
  jsonDatosTitular,
  leerDatosTitular,
  libroDatosTitular,
  NOMBRE_ARCHIVO_DATOS,
} from "../exportacion"

export type FormatoDatos = "json" | "xlsx"

export const NOMBRES_FORMATO: Readonly<Record<FormatoDatos, string>> = {
  json: "JSON",
  xlsx: "Excel",
}

/**
 * Genera y descarga el archivo. `false` si el JSON no tiene la forma esperada
 * (el Excel no se puede armar; el JSON sí se descarga tal cual).
 */
export async function descargarDatosTitular(
  datos: unknown,
  formato: FormatoDatos,
  {
    titular,
    base = NOMBRE_ARCHIVO_DATOS,
  }: { titular?: string; base?: string } = {}
): Promise<boolean> {
  if (formato === "json") {
    descargarArchivo(
      jsonDatosTitular(datos),
      `${nombreArchivoExportacion(base, new Date())}.json`,
      "application/json"
    )
    return true
  }
  const leidos = leerDatosTitular(datos)
  if (!leidos) return false
  await exportarExcel(libroDatosTitular(leidos, { titular }), base)
  return true
}
