"use client"

import { ImageOff, RotateCcw, ScanEye, X } from "lucide-react"
import Image from "next/image"
import { useState } from "react"

import { useUrlFirmada } from "@/components/archivos/use-url-firmada"
import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

import { firmarCaptura } from "../actions"

/**
 * Captura del panel que el medio cargó como evidencia: la miniatura se firma
 * al montar (URL de corta duración que se renueva sola) y, al tocarla, se abre
 * el original en grande con «Abrir» y «Descargar». La ruta nunca llega al
 * navegador: la acción la toma de la fila que la sesión puede leer.
 */
export function CapturaPublicacion({
  publicacionId,
  titulo,
  descripcion,
  className,
}: {
  publicacionId: string
  /** «Captura de la publicación 2 de @noticias.pasto». */
  titulo: string
  /** «Publicada el 14 oct 2026, 8:23 a. m.» */
  descripcion: string
  className?: string
}) {
  const [abierta, setAbierta] = useState(false)
  const miniatura = useUrlFirmada(() =>
    firmarCaptura({ publicacionId, variante: "miniatura" })
  )

  return (
    <>
      {miniatura.estado.tipo === "error" ? (
        <div
          className={cn(
            "grid aspect-[4/5] w-full place-items-center rounded-lg border border-dashed bg-muted/30 p-3 text-center text-muted-foreground",
            className
          )}
        >
          <span className="flex flex-col items-center gap-2 text-xs text-pretty">
            <ImageOff aria-hidden className="size-5" />
            {miniatura.estado.mensaje}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={miniatura.reintentar}
            >
              <RotateCcw data-icon="inline-start" aria-hidden />
              Reintentar
            </Button>
          </span>
        </div>
      ) : miniatura.url ? (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-haspopup="dialog"
          className={cn(
            "group/captura relative block aspect-[4/5] w-full overflow-hidden rounded-lg border bg-muted focus-visible:anillo-foco",
            className
          )}
        >
          <Image
            src={miniatura.url}
            alt={titulo}
            fill
            unoptimized
            sizes="(min-width: 640px) 10rem, 40vw"
            className="object-cover transition-transform duration-500 ease-suave group-hover/captura:scale-[1.03] motion-reduce:transition-none"
          />
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-2 text-xs font-medium text-white">
            <ScanEye aria-hidden className="size-3.5" />
            Ver en grande
          </span>
        </button>
      ) : (
        <div
          role="status"
          aria-label="Cargando la captura"
          className={cn(
            "aspect-[4/5] w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none",
            className
          )}
        />
      )}

      <Dialog open={abierta} onOpenChange={setAbierta}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] gap-3 overflow-y-auto sm:max-w-2xl"
        >
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2"
                aria-label="Cerrar"
              />
            }
          >
            <X aria-hidden />
          </DialogClose>
          <DialogHeader className="pr-8">
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>
              {descripcion} El enlace de la imagen caduca en pocos minutos.
            </DialogDescription>
          </DialogHeader>
          {abierta ? (
            <VisorArchivoFirmado
              firmar={() => firmarCaptura({ publicacionId })}
              firmarDescarga={() =>
                firmarCaptura({ publicacionId, descargar: true })
              }
              nombre={titulo}
              // Las evidencias siempre son imágenes (la BD lo exige): se muestran en línea.
              tipo="image/webp"
              descripcion={titulo}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
