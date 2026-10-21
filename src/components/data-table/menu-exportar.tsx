"use client"

import { Download, FileSpreadsheet, FileText } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

import type { FormatoExportacion } from "./exportar"

interface MenuExportarProps {
  /** Filas que saldrán en el archivo (la página visible o la selección). */
  cantidad: number
  alcance: "pagina" | "seleccion"
  onExportar: (formato: FormatoExportacion) => Promise<void>
}

function describirAlcance(
  alcance: MenuExportarProps["alcance"],
  cantidad: number
) {
  const filas = cantidad === 1 ? "1 fila" : `${cantidad} filas`
  return alcance === "seleccion"
    ? `Selección · ${filas}`
    : `Esta vista · ${filas}`
}

/** Descarga la vista actual en Excel o CSV (columnas visibles, orden actual). */
export function MenuExportar({
  cantidad,
  alcance,
  onExportar,
}: MenuExportarProps) {
  const [exportando, iniciar] = useTransition()

  function exportar(formato: FormatoExportacion) {
    iniciar(async () => {
      try {
        await onExportar(formato)
        toast.success("Archivo descargado", {
          description: describirAlcance(alcance, cantidad),
        })
      } catch {
        toast.error("No se pudo generar el archivo. Intenta de nuevo.")
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={cantidad === 0 || exportando}
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {describirAlcance(alcance, cantidad)}
          </DropdownMenuLabel>
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
