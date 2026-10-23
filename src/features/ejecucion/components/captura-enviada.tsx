"use client"

import { Expand, ImageIcon, X } from "lucide-react"
import Image from "next/image"
import { useCallback, useState } from "react"

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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { firmarCapturaMetrica, firmarCapturaPublicacion } from "../actions"

export interface CapturaEnviadaProps {
  /** De qué fila es la captura: se firma por id, la ruta no viaja. */
  origen: { tipo: "publicacion" | "metrica"; id: string }
  /** «Captura de la publicación 1», «Captura de 24 horas». */
  titulo: string
  /** Una línea bajo la miniatura («La que enviaste el …»). */
  detalle?: string
  className?: string
}

function firmarCon(origen: CapturaEnviadaProps["origen"], miniatura: boolean) {
  return origen.tipo === "publicacion"
    ? firmarCapturaPublicacion({ publicacionId: origen.id, miniatura })
    : firmarCapturaMetrica({ metricaId: origen.id, miniatura })
}

/**
 * La captura que el medio ya envió: miniatura firmada como usuario y la
 * imagen completa en un diálogo (se firma al abrirlo).
 */
export function CapturaEnviada({
  origen,
  titulo,
  detalle,
  className,
}: CapturaEnviadaProps) {
  const [abierta, setAbierta] = useState(false)
  const { tipo, id } = origen
  const firmarMiniatura = useCallback(
    () => firmarCon({ tipo, id }, true),
    [tipo, id]
  )
  const firmarCompleta = useCallback(
    () => firmarCon({ tipo, id }, false),
    [tipo, id]
  )
  const { estado, url } = useUrlFirmada(firmarMiniatura)
  const [sinVista, setSinVista] = useState(false)

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-muted/20 p-2",
        className
      )}
    >
      <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {url && !sinVista ? (
          <Image
            src={url}
            alt=""
            fill
            unoptimized
            sizes="5rem"
            onError={() => setSinVista(true)}
            className="object-cover"
          />
        ) : estado.tipo === "cargando" ? (
          <Skeleton className="size-full" />
        ) : (
          <ImageIcon aria-hidden className="size-6" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium">{titulo}</p>
        {detalle ? (
          <p className="text-xs text-muted-foreground">{detalle}</p>
        ) : null}
        <Dialog open={abierta} onOpenChange={setAbierta}>
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto self-start p-0"
              />
            }
          >
            <Expand data-icon="inline-start" aria-hidden />
            Ver la captura
          </DialogTrigger>
          <DialogContent
            showCloseButton={false}
            className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-2xl"
          >
            <DialogHeader className="flex-row items-start justify-between gap-3 text-left">
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle>{titulo}</DialogTitle>
                <DialogDescription>
                  Es la captura que enviaste. Para cambiarla, elige otra en el
                  formulario.
                </DialogDescription>
              </div>
              <DialogClose
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Cerrar" />
                }
              >
                <X aria-hidden />
              </DialogClose>
            </DialogHeader>
            {abierta ? (
              <VisorArchivoFirmado
                firmar={firmarCompleta}
                nombre={titulo}
                tipo="image/webp"
                descripcion={titulo}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
