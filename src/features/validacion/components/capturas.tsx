"use client"

import { CircleAlert, ImageOff, RefreshCw, ScanEye, X } from "lucide-react"
import Image from "next/image"
import { useCallback, useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  firmarEvidencias,
  type ImagenesEvidencia,
} from "@/features/operacion/actions"
import { cn } from "@/lib/utils"

/** Las URL firmadas se vuelven a pedir al consumir esta parte de su vigencia. */
const FRACCION_RENOVACION = 0.8

export type EstadoFirmas =
  | { tipo: "cargando" }
  | { tipo: "listo"; imagenes: ImagenesEvidencia; firmadoEn: number }
  | { tipo: "error"; mensaje: string }

/**
 * Firma las capturas (evidencia y métricas) de una asignación al montar y
 * bajo demanda, con URL de corta duración (`firmarEvidencias`: la ruta sale
 * de las filas que la RLS deja leer, nunca del navegador).
 */
export function useFirmas(asignacionId: string, conImagenes: boolean) {
  const [estado, setEstado] = useState<EstadoFirmas>({ tipo: "cargando" })
  const [, iniciar] = useTransition()

  const firmar = useCallback(() => {
    iniciar(async () => {
      setEstado({ tipo: "cargando" })
      const resultado = await firmarEvidencias({ asignacionId })
      setEstado(
        resultado.ok
          ? { tipo: "listo", imagenes: resultado.datos, firmadoEn: Date.now() }
          : { tipo: "error", mensaje: resultado.error }
      )
    })
  }, [asignacionId])

  useEffect(() => {
    if (conImagenes) firmar()
  }, [conImagenes, firmar])

  /** Vuelve a firmar si las URL están por caducar (se llama al abrir el visor). */
  const asegurarVigentes = useCallback(() => {
    const caducan =
      estado.tipo !== "listo" ||
      Date.now() - estado.firmadoEn >=
        estado.imagenes.vigenciaSegundos * 1000 * FRACCION_RENOVACION
    if (caducan) firmar()
  }, [estado, firmar])

  return { estado, firmar, asegurarVigentes }
}

/** El error al firmar, con «Reintentar». */
export function ErrorFirmas({
  mensaje,
  onReintentar,
  className,
}: {
  mensaje: string
  onReintentar: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm",
        className
      )}
    >
      <span className="flex items-center gap-2">
        <CircleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
        {mensaje}
      </span>
      <Button variant="outline" size="sm" onClick={onReintentar}>
        <RefreshCw data-icon="inline-start" aria-hidden />
        Reintentar
      </Button>
    </div>
  )
}

function SinCaptura({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid w-full place-items-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground",
        className
      )}
    >
      <span className="flex flex-col items-center gap-1.5 px-3 text-center text-xs">
        <ImageOff aria-hidden className="size-5" />
        Captura no disponible
      </span>
    </div>
  )
}

/** Miniatura de una captura que se amplía al tocarla. */
export function Miniatura({
  url,
  cargando,
  etiqueta,
  onAbrir,
}: {
  url: string | null
  cargando: boolean
  etiqueta: string
  onAbrir: () => void
}) {
  if (cargando) {
    return (
      <div
        role="status"
        aria-label="Cargando captura"
        className="aspect-[4/5] w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
      />
    )
  }
  if (!url) return <SinCaptura className="aspect-[4/5]" />
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group/miniatura relative block aspect-[4/5] w-full overflow-hidden rounded-lg border bg-muted focus-visible:anillo-foco"
    >
      <Image
        src={url}
        alt={etiqueta}
        fill
        unoptimized
        sizes="(min-width: 1024px) 12rem, 40vw"
        className="object-cover transition-transform duration-500 ease-suave group-hover/miniatura:scale-[1.03] motion-reduce:transition-none"
      />
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover/miniatura:opacity-100 group-focus-visible/miniatura:opacity-100">
        <ScanEye aria-hidden className="size-3.5" />
        Ampliar
      </span>
    </button>
  )
}

/**
 * La captura completa para revisarla junto a las cifras (hoja de la cola):
 * se ve entera (sin recortar) y se amplía a pantalla completa.
 */
export function CapturaRevision({
  url,
  cargando,
  etiqueta,
  onAmpliar,
}: {
  url: string | null
  cargando: boolean
  etiqueta: string
  onAmpliar: () => void
}) {
  if (cargando) {
    return (
      <div
        role="status"
        aria-label="Cargando la captura"
        className="h-[min(60vh,32rem)] w-full animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
      />
    )
  }
  if (!url) return <SinCaptura className="h-48 rounded-xl" />
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative h-[min(60vh,32rem)] w-full overflow-hidden rounded-xl border bg-muted">
        <Image
          src={url}
          alt={etiqueta}
          fill
          unoptimized
          sizes="(min-width: 1280px) 34rem, 100vw"
          className="object-contain"
        />
      </div>
      <figcaption className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>El enlace de la imagen caduca en pocos minutos.</span>
        <Button variant="outline" size="sm" onClick={onAmpliar}>
          <ScanEye data-icon="inline-start" aria-hidden />
          Ampliar
        </Button>
      </figcaption>
    </figure>
  )
}

/** Qué captura muestra el visor: la URL se resuelve con las firmas vigentes. */
export interface CapturaAbierta {
  origen: "publicaciones" | "metricas"
  id: string
  titulo: string
  descripcion: string
}

/** URL completa de la captura abierta con las firmas vigentes (o `null`). */
export function urlCaptura(
  estado: EstadoFirmas,
  abierta: Pick<CapturaAbierta, "origen" | "id"> | null
): string | null {
  if (!abierta || estado.tipo !== "listo") return null
  return estado.imagenes[abierta.origen][abierta.id]?.captura ?? null
}

/**
 * Visor a pantalla completa de una captura. La URL llega aparte: si se
 * vuelve a firmar mientras está abierto, la imagen se actualiza.
 */
export function VisorCaptura({
  abierta,
  url,
  onCerrar,
}: {
  abierta: CapturaAbierta | null
  url: string | null
  onCerrar: () => void
}) {
  return (
    <Dialog
      open={abierta !== null}
      onOpenChange={(abrirDialogo) => !abrirDialogo && onCerrar()}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] gap-3 overflow-hidden sm:max-w-2xl"
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
          <DialogTitle>{abierta?.titulo}</DialogTitle>
          <DialogDescription>
            {abierta?.descripcion} El enlace de la imagen caduca en pocos
            minutos.
          </DialogDescription>
        </DialogHeader>
        {abierta ? (
          <div
            className={cn(
              "relative h-[70vh] w-full overflow-hidden rounded-lg bg-muted",
              !url && "animate-pulse motion-reduce:animate-none"
            )}
          >
            {url ? (
              <Image
                src={url}
                alt={abierta.titulo}
                fill
                unoptimized
                sizes="(min-width: 640px) 42rem, 100vw"
                className="object-contain"
              />
            ) : (
              <span className="sr-only" role="status">
                Cargando la captura…
              </span>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
