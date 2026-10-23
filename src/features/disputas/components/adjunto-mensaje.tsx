"use client"

import { FileText, ImageIcon } from "lucide-react"
import { useState } from "react"

import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { firmarAdjuntoDisputa } from "../actions"
import { etiquetaAdjunto } from "../adjuntos"
import type { AdjuntoMensaje as Adjunto } from "../tipos"

/**
 * Adjunto de un mensaje del hilo: un botón que abre el visor. La URL firmada
 * (como usuario, de corta duración) se pide al abrirlo, no al pintar el
 * hilo: una conversación larga no firma lo que nadie mira.
 */
export function AdjuntoMensaje({
  disputaId,
  mensajeId,
  adjunto,
  describidoPor,
}: {
  disputaId: string
  mensajeId: number
  adjunto: Adjunto
  /** Id del autor y la hora del mensaje: distingue los botones de un hilo largo. */
  describidoPor?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const pdf = adjunto.tipo === "application/pdf"
  const etiqueta = etiquetaAdjunto(adjunto)
  const Icono = pdf ? FileText : ImageIcon
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit max-w-full"
        aria-describedby={describidoPor}
        onClick={() => setAbierto(true)}
      >
        <Icono data-icon="inline-start" aria-hidden />
        {pdf ? "Abrir el PDF adjunto" : "Ver la imagen adjunta"}
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent showCloseButton={false} className="gap-4 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{etiqueta}</DialogTitle>
            <DialogDescription>
              Se abre con un enlace temporal; descárgalo si lo necesitas fuera
              de la plataforma.
            </DialogDescription>
          </DialogHeader>
          {abierto ? (
            <VisorArchivoFirmado
              firmar={() => firmarAdjuntoDisputa({ disputaId, mensajeId })}
              firmarDescarga={() =>
                firmarAdjuntoDisputa({ disputaId, mensajeId, descargar: true })
              }
              nombre={adjunto.nombre}
              tipo={adjunto.tipo}
              descripcion={etiqueta}
            />
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cerrar
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
