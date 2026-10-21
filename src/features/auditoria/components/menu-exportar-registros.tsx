"use client"

import { Download, FileSpreadsheet, FileText } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  exportarDatos,
  type FormatoExportacion,
} from "@/components/data-table/exportar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { formatearNumero } from "@/lib/format"
import type { ResultadoAccion } from "@/lib/result"

import type { ArchivoExportado } from "../tipos"

interface MenuExportarRegistrosProps {
  /** Server Action que lee los registros filtrados y deja constancia en la bitácora. */
  onExportar: (
    formato: FormatoExportacion
  ) => Promise<ResultadoAccion<ArchivoExportado>>
  /** Base del nombre del archivo ("Bitácora AMO"). */
  nombreArchivo: string
  limite: number
}

/**
 * Exporta TODOS los registros que cumplen el periodo y los filtros (hasta el
 * límite), no solo la página visible. El servidor registra la exportación en
 * la bitácora antes de entregar los datos; el navegador genera el archivo.
 */
export function MenuExportarRegistros({
  onExportar,
  nombreArchivo,
  limite,
}: MenuExportarRegistrosProps) {
  const [exportando, iniciar] = useTransition()

  function exportar(formato: FormatoExportacion) {
    iniciar(async () => {
      const resultado = await onExportar(formato)
      if (!resultado.ok) {
        toast.error(resultado.error)
        return
      }
      const { datos, total } = resultado.datos
      try {
        await exportarDatos(datos, formato, nombreArchivo)
      } catch {
        toast.error("No se pudo generar el archivo. Intenta de nuevo.")
        return
      }
      const filas = datos.filas.length
      toast.success("Archivo descargado", {
        description:
          total > filas
            ? `${formatearNumero(filas)} de ${formatearNumero(total)} registros (máximo ${formatearNumero(limite)}). Acota el periodo para el resto.`
            : `${formatearNumero(filas)} ${filas === 1 ? "registro" : "registros"} · la exportación quedó en la bitácora.`,
      })
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            disabled={exportando}
            className="bg-card dark:bg-input/30"
          />
        }
      >
        {exportando ? (
          <Spinner data-icon="inline-start" aria-label="Exportando" />
        ) : (
          <Download data-icon="inline-start" aria-hidden />
        )}
        Exportar
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span>Registros filtrados</span>
            <span className="text-xs font-normal text-muted-foreground">
              Periodo y filtros actuales · hasta {formatearNumero(limite)}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => exportar("xlsx")}>
            <FileSpreadsheet aria-hidden />
            Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportar("csv")}>
            <FileText aria-hidden />
            CSV (.csv)
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
