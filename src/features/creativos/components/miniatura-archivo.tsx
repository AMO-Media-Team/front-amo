"use client"

import { FileImage, FileVideo, ImageOff, Play } from "lucide-react"
import Image from "next/image"
import { useState } from "react"

import { formatearDuracion } from "@/lib/archivos/formato"
import { categoriaDe } from "@/lib/archivos/mime"
import { cn } from "@/lib/utils"

import type { ArchivoCreativo } from "../tipos"

export interface FirmaArchivo {
  url: string
  miniatura: string | null
}

/**
 * Vista en miniatura de un archivo: la miniatura de 320 px que generó el
 * navegador al subirlo o, si no la hay, la imagen original. Un video sin
 * miniatura muestra su icono (no se descarga para previsualizarlo). Es
 * decorativa: quien la contiene nombra el archivo.
 */
export function MiniaturaArchivo({
  archivo,
  firma,
  cargando,
  sizes = "(min-width: 1024px) 12rem, 45vw",
  className,
}: {
  archivo: Pick<ArchivoCreativo, "mime" | "duracionSegundos">
  /** `undefined` mientras se firma; `null` si el objeto no está en Storage. */
  firma: FirmaArchivo | null | undefined
  cargando: boolean
  sizes?: string
  className?: string
}) {
  const video = categoriaDe(archivo.mime) === "video"
  const fuente = firma ? (firma.miniatura ?? (video ? null : firma.url)) : null
  const [fallida, setFallida] = useState<string | null>(null)
  const visible = fuente !== null && fuente !== fallida

  return (
    <div
      className={cn(
        "relative grid size-full place-items-center overflow-hidden bg-muted text-muted-foreground",
        className
      )}
    >
      {visible ? (
        <Image
          src={fuente}
          alt=""
          fill
          unoptimized
          sizes={sizes}
          onError={() => setFallida(fuente)}
          className="object-cover"
        />
      ) : cargando && firma === undefined ? (
        <div aria-hidden className="size-full esqueleto-shimmer" />
      ) : firma === null ? (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-[0.6875rem] leading-tight">
          <ImageOff aria-hidden className="size-5" />
          Vista previa no disponible
        </span>
      ) : video ? (
        <FileVideo aria-hidden className="size-7" />
      ) : (
        <FileImage aria-hidden className="size-7" />
      )}
      {video ? (
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-medium cifras text-white">
          <Play aria-hidden className="size-3 fill-current" />
          {archivo.duracionSegundos !== null
            ? formatearDuracion(archivo.duracionSegundos)
            : "Video"}
        </span>
      ) : null}
    </div>
  )
}
