"use client"

import { FileText, X } from "lucide-react"
import { type RefObject, useEffect, useId, useRef } from "react"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { Button } from "@/components/ui/button"
import { formatearTamano } from "@/lib/archivos/formato"

import { LIMITES_PDF } from "../schemas"
import type { PdfDocumento } from "./use-pdf-documento"

export interface CampoPdfProps {
  pdf: PdfDocumento
  titulo: string
  ayuda: string
  error?: string | null
  deshabilitado?: boolean
  /** Botón «Quitar» del archivo elegido (recibe el foco si el error es del archivo). */
  refQuitar: RefObject<HTMLButtonElement | null>
  /** Contenedor de la zona (su primer botón recibe el foco si falta el archivo). */
  refZona: RefObject<HTMLDivElement | null>
}

/**
 * Un PDF obligatorio dentro de un diálogo: zona para elegirlo o arrastrarlo, el archivo elegido con
 * «Quitar» y, mientras sube o si falló, su progreso (se puede cancelar). Reintentar es volver a pulsar el
 * botón del diálogo: sube lo que falta y registra en un solo paso. El error del campo queda asociado a la
 * zona o al archivo.
 */
export function CampoPdf({
  pdf,
  titulo,
  ayuda,
  error,
  deshabilitado = false,
  refQuitar,
  refZona,
}: CampoPdfProps) {
  const id = useId()
  const idError = `${id}-error`
  const { archivo, elemento } = pdf
  // Elegir o quitar el archivo desmonta el control usado: el foco pasa a «Quitar» o a «Elegir archivo».
  const destinoFoco = useRef<"quitar" | "zona" | null>(null)

  useEffect(() => {
    const destino = destinoFoco.current
    if (!destino) return
    destinoFoco.current = null
    if (destino === "quitar") refQuitar.current?.focus()
    else refZona.current?.querySelector<HTMLElement>("button")?.focus()
  }, [archivo, refQuitar, refZona])

  return (
    <div className="grid gap-2">
      {archivo ? (
        <div
          className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3"
          aria-describedby={error ? idError : undefined}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <FileText aria-hidden className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-muted-foreground">{titulo}</span>
            <span className="truncate text-sm font-medium" title={archivo.name}>
              {archivo.name}
            </span>
            <span className="text-xs cifras text-muted-foreground">
              {formatearTamano(archivo.size)}
            </span>
          </div>
          <Button
            ref={refQuitar}
            type="button"
            variant="ghost"
            size="sm"
            disabled={deshabilitado}
            onClick={() => {
              destinoFoco.current = "zona"
              pdf.quitar()
            }}
            aria-label={`Quitar ${archivo.name}`}
            aria-describedby={error ? idError : undefined}
          >
            <X data-icon="inline-start" aria-hidden />
            Quitar
          </Button>
        </div>
      ) : (
        <div ref={refZona}>
          <ZonaArchivos
            reglas={LIMITES_PDF}
            onArchivos={([elegido]) => {
              if (!elegido) return
              destinoFoco.current = "quitar"
              pdf.elegir(elegido)
            }}
            titulo={titulo}
            descripcion={ayuda}
            deshabilitada={deshabilitado}
            invalida={Boolean(error)}
            describidaPor={error ? idError : undefined}
            compacta
          />
        </div>
      )}
      {elemento ? (
        <ListaSubidas
          elementos={[elemento]}
          etiqueta={`Subida de ${titulo.toLocaleLowerCase("es-CO")}`}
          onCancelar={() => pdf.subida.cancelar()}
        />
      ) : null}
      {error ? (
        <p id={idError} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
