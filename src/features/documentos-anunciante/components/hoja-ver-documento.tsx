"use client"

import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { Button } from "@/components/ui/button"
import { SheetClose } from "@/components/ui/sheet"
import { HojaDocumento } from "@/features/documentos-medio/components/hoja-documento"

import { firmarDocumentoAnunciante } from "../actions"
import { fichaDocumento, nombreArchivoDocumento } from "../catalogo"
import type { DocumentoAnunciante } from "../tipos"
import { ICONOS_DOCUMENTO_ANUNCIANTE } from "./iconos"

export interface HojaVerDocumentoAnuncianteProps {
  documento: DocumentoAnunciante
  pais: string
  /** Fechas y estado de la carga, como en la tarjeta. */
  detalle: string | null
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
}

/**
 * El archivo que cargó la empresa, con URL firmada de corta duración que se
 * pide al abrir (y se renueva sola): imagen en línea, PDF para abrir en otra
 * pestaña, y descarga con el nombre del documento.
 */
export function HojaVerDocumentoAnunciante({
  documento,
  pais,
  detalle,
  abierta,
  onAbiertaChange,
}: HojaVerDocumentoAnuncianteProps) {
  const ficha = fichaDocumento(documento.tipo, pais)
  const nombre = nombreArchivoDocumento(documento.tipo, documento.formato, pais)
  return (
    <HojaDocumento
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      icono={ICONOS_DOCUMENTO_ANUNCIANTE[documento.tipo]}
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
          firmar={() =>
            firmarDocumentoAnunciante({ documentoId: documento.id })
          }
          firmarDescarga={() =>
            firmarDocumentoAnunciante({
              documentoId: documento.id,
              descargar: true,
            })
          }
          nombre={nombre}
          tipo={documento.formato ?? undefined}
          descripcion={`${ficha.titulo} que cargaste`}
        />
      ) : null}
    </HojaDocumento>
  )
}
