"use client"

import { useId } from "react"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import type { ReglasArchivo } from "@/lib/archivos/validar"

import type { ArchivoSoporte } from "./use-archivo-soporte"

export interface CampoArchivoProps {
  /** Título de la zona («PDF de la factura expedida»). */
  titulo: string
  descripcion: string
  reglas: ReglasArchivo
  archivo: ArchivoSoporte
  error?: string | null
  /** Al elegir o quitar el archivo (p. ej. para limpiar el error). */
  onCambio?: () => void
  deshabilitado?: boolean
  /** Id del contenedor: el formulario enfoca su primer botón si el archivo tiene error. */
  id?: string
}

/** Enfoca el primer botón habilitado del campo («Elegir archivo», «Quitar»…). */
export function enfocarCampoArchivo(id: string): void {
  document
    .getElementById(id)
    ?.querySelector<HTMLElement>("button:not([disabled])")
    ?.focus()
}

/**
 * Campo de archivo de un formulario de Finanzas: la zona para elegir o
 * arrastrar el PDF (o la foto del soporte) y, una vez elegido, su subida con
 * progreso, reintento y «Quitar». El error del campo se asocia a la zona.
 */
export function CampoArchivo({
  titulo,
  descripcion,
  reglas,
  archivo,
  error,
  onCambio,
  deshabilitado = false,
  id,
}: CampoArchivoProps) {
  const idError = useId()
  return (
    <div id={id} className="flex flex-col gap-2">
      {archivo.elemento ? (
        <ListaSubidas
          elementos={[archivo.elemento]}
          etiqueta={titulo}
          onReintentar={() => archivo.reintentar()}
          onCancelar={() => {
            archivo.descartar()
            onCambio?.()
          }}
          onQuitar={() => {
            archivo.descartar()
            onCambio?.()
          }}
        />
      ) : (
        <ZonaArchivos
          reglas={reglas}
          onArchivos={([elegido]) => {
            if (!elegido) return
            archivo.elegir(elegido)
            onCambio?.()
          }}
          titulo={titulo}
          descripcion={descripcion}
          compacta
          deshabilitada={deshabilitado}
          invalida={Boolean(error)}
          describidaPor={error ? idError : undefined}
        />
      )}
      {error ? (
        <p id={idError} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
