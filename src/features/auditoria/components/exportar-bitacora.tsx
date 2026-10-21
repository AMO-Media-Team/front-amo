"use client"

import { useQueryStates } from "nuqs"

import { exportarBitacora } from "../actions"
import { estadoTablaBitacora, filtrosDeEstado } from "../estado-bitacora"
import { parsersPeriodo } from "../periodo"
import { MenuExportarRegistros } from "./menu-exportar-registros"

const parsers = { ...estadoTablaBitacora.parsers, ...parsersPeriodo }

/** Exportación de la bitácora con el periodo y los filtros de la URL. */
export function ExportarBitacora({ limite }: { limite: number }) {
  const [estado] = useQueryStates(parsers)
  return (
    <MenuExportarRegistros
      nombreArchivo="Bitácora AMO"
      limite={limite}
      onExportar={(formato) =>
        exportarBitacora({
          formato,
          periodo: {
            periodo: estado.periodo,
            desde: estado.desde,
            hasta: estado.hasta,
          },
          filtros: filtrosDeEstado(estado),
        })
      }
    />
  )
}
