"use client"

import { ChevronDown, FileBraces, FileSpreadsheet, FileUp } from "lucide-react"
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

import { generarArchivoCarga } from "../actions"

type FormatoCarga = "json" | "csv"

const TIPOS: Readonly<Record<FormatoCarga, string>> = {
  json: "application/json;charset=utf-8",
  csv: "text/csv;charset=utf-8",
}

function descargarTexto(contenido: string, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const enlace = document.createElement("a")
  enlace.href = url
  enlace.download = nombre
  enlace.rel = "noopener"
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * «Archivo de carga» del borrador para el software de facturación de AMO, en
 * JSON (`AMO-FV-1`) o CSV. Cada descarga queda en la bitácora; sin el permiso
 * de datos sensibles el archivo sale sin la dirección del anunciante y lo
 * dice.
 */
export function MenuArchivoCarga({ facturaId }: { facturaId: string }) {
  const [pendiente, iniciar] = useTransition()

  function descargar(formato: FormatoCarga) {
    iniciar(async () => {
      const resultado = await generarArchivoCarga({ facturaId })
      if (!resultado.ok) {
        toast.error("No se generó el archivo de carga", {
          description: resultado.error,
        })
        return
      }
      const { nombreBase, json, csv, sinDireccion, cuadra } = resultado.datos
      descargarTexto(
        formato === "json" ? json : csv,
        `${nombreBase}.${formato}`,
        TIPOS[formato]
      )
      if (!cuadra) {
        toast.warning("Revisa el archivo antes de cargarlo", {
          description:
            "Los conceptos no suman lo mismo que el borrador. Anúlalo y genera otro si alguna asignación cambió.",
        })
      } else if (sinDireccion) {
        toast.success("Archivo de carga descargado", {
          description:
            "Va sin la dirección del anunciante: incluirla exige el permiso Ver datos sensibles.",
        })
      } else {
        toast.success("Archivo de carga descargado", {
          description: "Cárgalo en el software de facturación para expedirla.",
        })
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={pendiente}
            // Enfocable mientras genera: el foco vuelve aquí al cerrar el menú
            // y no salta al <body> (no hay `:disabled` que lo atenúe).
            focusableWhenDisabled
            aria-busy={pendiente || undefined}
            className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
          />
        }
      >
        {pendiente ? (
          <Spinner aria-hidden role={undefined} data-icon="inline-start" />
        ) : (
          <FileUp data-icon="inline-start" aria-hidden />
        )}
        Archivo de carga
        <ChevronDown
          data-icon="inline-end"
          aria-hidden
          className="opacity-60"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Descargar para el software de facturación
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => descargar("json")}>
            <FileBraces aria-hidden />
            <span className="flex flex-col">
              JSON
              <span className="text-xs text-muted-foreground">
                Formato AMO-FV-1
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => descargar("csv")}>
            <FileSpreadsheet aria-hidden />
            <span className="flex flex-col">
              CSV
              <span className="text-xs text-muted-foreground">
                Una fila por concepto
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
