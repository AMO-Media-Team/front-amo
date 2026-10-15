"use client"

import { useQueryStates } from "nuqs"

import { MenuExportarRegistros } from "@/features/auditoria/components/menu-exportar-registros"
import { parsersPeriodo } from "@/features/auditoria/periodo"

import { exportarAccesos } from "../actions"
import { estadoTablaAccesos, filtrosDeEstado } from "../estado-accesos"

const parsers = { ...estadoTablaAccesos.parsers, ...parsersPeriodo }

/** Exportación del registro de accesos con el periodo y los filtros de la URL. */
export function ExportarAccesos({ limite }: { limite: number }) {
  const [estado] = useQueryStates(parsers)
  return (
    <MenuExportarRegistros
      nombreArchivo="Accesos AMO"
      limite={limite}
      onExportar={(formato) =>
        exportarAccesos({
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
