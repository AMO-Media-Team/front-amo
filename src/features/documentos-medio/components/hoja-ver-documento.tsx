"use client"

import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { SheetClose } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

import { firmarDocumento } from "../actions"
import { FICHAS_DOCUMENTO, nombreArchivoDocumento } from "../catalogo"
import type { DocumentoCargado } from "../tipos"
import { HojaDocumento } from "./hoja-documento"
import { ICONOS_DOCUMENTO } from "./iconos"

export interface HojaVerDocumentoProps {
  documento: DocumentoCargado
  /** Fechas y estado de la carga, como en la tarjeta. */
  detalle: string | null
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
}

/**
 * El archivo que cargó el medio, con URL firmada de corta duración que se
 * pide al abrir (y se renueva sola): imagen en línea, PDF para abrir en otra
 * pestaña, y descarga con el nombre del documento.
 */
export function HojaVerDocumento({
  documento,
  detalle,
  abierta,
  onAbiertaChange,
}: HojaVerDocumentoProps) {
  const ficha = FICHAS_DOCUMENTO[documento.tipo]
  const nombre = nombreArchivoDocumento(documento.tipo, documento.formato)
  return (
    <HojaDocumento
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      icono={ICONOS_DOCUMENTO[documento.tipo]}
      titulo={ficha.titulo}
      descripcion={detalle ?? undefined}
      pie={
        <SheetClose
          render={<Button type="button" variant="outline" size="lg" />}
        >
          Cerrar
        </SheetClose>
      }
    >
      {abierta ? (
        <VisorArchivoFirmado
          key={documento.id}
          firmar={() => firmarDocumento({ documentoId: documento.id })}
          firmarDescarga={() =>
            firmarDocumento({ documentoId: documento.id, descargar: true })
          }
          nombre={nombre}
          tipo={documento.formato ?? undefined}
          descripcion={`${ficha.titulo} que cargaste`}
        />
      ) : null}
    </HojaDocumento>
  )
}
