"use client"

import {
  CircleAlert,
  Download,
  ExternalLink,
  File as IconoArchivo,
  FileImage,
  FileText,
  RotateCcw,
} from "lucide-react"
import Image from "next/image"
import {
  type ReactNode,
  type SyntheticEvent,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { EnlaceBotonExterno } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { formatearTamano } from "@/lib/archivos/formato"
import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"
import type { UrlFirmada } from "@/lib/archivos/tipos"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import { useUrlFirmada } from "./use-url-firmada"

type Firmar = () => Promise<ResultadoAccion<UrlFirmada>>

export interface VisorArchivoFirmadoProps {
  /**
   * Server Action de la feature: autoriza con el DAL, lee la fila con la
   * sesión (RLS) y llama a `firmarDescarga` con la ruta de ESA fila. Se pide
   * al montar: si el visor pasa a mostrar otro archivo, cámbiale la `key`
   * (p. ej. el id de la fila) para que firme el nuevo.
   */
  firmar: Firmar
  /** Igual, pero firmada con `descarga`: habilita el botón «Descargar». */
  firmarDescarga?: Firmar
  nombre: string
  /** MIME; si falta se deduce de la extensión de `nombre`. */
  tipo?: string
  tamano?: number
  /** Texto alternativo de una imagen (por defecto, el nombre). */
  descripcion?: string
  className?: string
}

/** Dos fallos seguidos con URL nueva: el problema no es la vigencia. */
const FALLOS_ANTES_DE_RENDIRSE = 2
const ALTO_MEDIO = "h-[min(70vh,32rem)]"

/**
 * Imágenes que solo Safari muestra: fuera de él fallarían dos veces (y, con
 * firma de servicio, dejarían dos `URL_FIRMADA`) antes de ofrecer abrirlas.
 */
const IMAGENES_NO_EN_LINEA = new Set(["image/heic"])

type Presentacion = "imagen" | "video" | "archivo"

function presentacionDe(mime: string): Presentacion {
  const categoria = categoriaDe(mime)
  if (categoria === "video") return "video"
  if (categoria === "imagen" && !IMAGENES_NO_EN_LINEA.has(mime)) {
    return "imagen"
  }
  return "archivo"
}

const MENSAJE_NO_SE_MUESTRA =
  "No pudimos mostrar el archivo aquí. Ábrelo en una pestaña nueva o inténtalo de nuevo."

function BotonDescargar({ firmar }: { firmar: Firmar }) {
  const [descargando, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={descargando}
      onClick={() =>
        iniciar(async () => {
          const resultado = await firmar()
          if (!resultado.ok) {
            toast.error(resultado.error)
            return
          }
          // Llega como adjunto (`Content-Disposition`): no sale de la página.
          window.location.assign(resultado.datos.url)
        })
      }
    >
      {descargando ? (
        <Spinner data-icon="inline-start" role={undefined} aria-hidden />
      ) : (
        <Download data-icon="inline-start" aria-hidden />
      )}
      Descargar
    </Button>
  )
}

function EnlaceAbrir({ url, texto }: { url: string | null; texto: string }) {
  if (!url) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <ExternalLink data-icon="inline-start" aria-hidden />
        {texto}
      </Button>
    )
  }
  return (
    <EnlaceBotonExterno
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      variant="outline"
      size="sm"
    >
      <ExternalLink data-icon="inline-start" aria-hidden />
      {texto}
      <span className="sr-only"> (abre en una pestaña nueva)</span>
    </EnlaceBotonExterno>
  )
}

function Fallo({
  mensaje,
  onReintentar,
  children,
}: {
  mensaje: string
  onReintentar: () => void
  children?: ReactNode
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/6 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 text-pretty">
        <CircleAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-destructive"
        />
        {mensaje}
      </p>
      <div className="flex flex-wrap gap-2">
        {children}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReintentar}
        >
          <RotateCcw data-icon="inline-start" aria-hidden />
          Reintentar
        </Button>
      </div>
    </div>
  )
}

/**
 * Muestra un archivo privado de Storage con URL firmada de corta duración:
 * imagen en línea, video con `<video>`, PDF (y lo demás) para abrir en una
 * pestaña nueva. La URL se renueva antes de vencer; si el medio falla a mitad
 * (p. ej. un video largo cuya URL caducó), se pide otra y se retoma donde iba.
 */
export function VisorArchivoFirmado({
  firmar,
  firmarDescarga,
  nombre,
  tipo,
  tamano,
  descripcion,
  className,
}: VisorArchivoFirmadoProps) {
  const { estado, url, renovar, reintentar } = useUrlFirmada(firmar)
  const mime = tipo ?? mimeDeArchivo({ name: nombre, type: "" })
  const categoria = categoriaDe(mime)
  const presentacion = presentacionDe(mime)
  // El medio conserva la URL con que cargó: renovarla no lo recarga.
  const [fijada, setFijada] = useState<string | null>(null)
  const [fallida, setFallida] = useState<string | null>(null)
  const [fallos, setFallos] = useState(0)
  const reanudar = useRef<{ segundo: number; reproducir: boolean } | null>(null)
  const fuente = fijada ?? (url !== fallida ? url : null)
  const rendido = fallos >= FALLOS_ANTES_DE_RENDIRSE

  function alCargar(src: string) {
    setFijada(src)
    setFallos(0)
  }

  function alFallar(src: string | null) {
    setFijada(null)
    setFallida(src)
    setFallos((previos) => previos + 1)
    renovar()
  }

  function volverAIntentar() {
    setFijada(null)
    setFallida(null)
    setFallos(0)
    reintentar()
  }

  function alFallarVideo(evento: SyntheticEvent<HTMLVideoElement>) {
    const video = evento.currentTarget
    reanudar.current = {
      segundo: video.currentTime,
      reproducir: !video.paused,
    }
    alFallar(fuente)
  }

  function alTenerMetadatosVideo(evento: SyntheticEvent<HTMLVideoElement>) {
    const video = evento.currentTarget
    const pendiente = reanudar.current
    reanudar.current = null
    if (pendiente && pendiente.segundo > 0) {
      video.currentTime = pendiente.segundo
      if (pendiente.reproducir) void video.play().catch(() => undefined)
    }
  }

  const detalle = (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate font-medium" title={nombre}>
        {nombre}
      </span>
      {tamano !== undefined ? (
        <span className="shrink-0 text-xs cifras text-muted-foreground">
          {formatearTamano(tamano)}
        </span>
      ) : null}
    </span>
  )

  const acciones = (
    <div className="flex flex-wrap gap-2">
      <EnlaceAbrir
        url={url}
        texto={categoria === "pdf" ? "Abrir PDF" : "Abrir en pestaña nueva"}
      />
      {firmarDescarga ? <BotonDescargar firmar={firmarDescarga} /> : null}
    </div>
  )

  if (estado.tipo === "error") {
    return (
      <div className={cn("flex flex-col gap-2 text-sm", className)}>
        {detalle}
        <Fallo mensaje={estado.mensaje} onReintentar={volverAIntentar} />
      </div>
    )
  }

  if (presentacion === "archivo") {
    return (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between",
          className
        )}
      >
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            {categoria === "pdf" ? (
              <FileText aria-hidden className="size-5" />
            ) : categoria === "imagen" ? (
              <FileImage aria-hidden className="size-5" />
            ) : (
              <IconoArchivo aria-hidden className="size-5" />
            )}
          </span>
          {detalle}
        </div>
        {acciones}
        {estado.tipo === "cargando" ? (
          <span role="status" className="sr-only">
            Preparando el enlace del archivo…
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      {rendido ? (
        <Fallo mensaje={MENSAJE_NO_SE_MUESTRA} onReintentar={volverAIntentar} />
      ) : !fuente ? (
        <Skeleton className={cn("w-full rounded-lg", ALTO_MEDIO)}>
          <span role="status" className="sr-only">
            Cargando el archivo…
          </span>
        </Skeleton>
      ) : presentacion === "video" ? (
        <video
          key={fuente}
          src={fuente}
          controls
          playsInline
          preload="metadata"
          aria-label={descripcion ?? nombre}
          onLoadedData={() => alCargar(fuente)}
          onLoadedMetadata={alTenerMetadatosVideo}
          onError={alFallarVideo}
          className={cn(
            "w-full rounded-lg bg-black object-contain",
            ALTO_MEDIO
          )}
        >
          Tu navegador no puede reproducir este video. Ábrelo en una pestaña
          nueva.
        </video>
      ) : (
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-lg bg-muted",
            ALTO_MEDIO
          )}
        >
          <Image
            key={fuente}
            src={fuente}
            alt={descripcion ?? nombre}
            fill
            unoptimized
            sizes="(min-width: 1024px) 48rem, 100vw"
            onLoad={() => alCargar(fuente)}
            onError={() => alFallar(fuente)}
            className="object-contain"
          />
        </div>
      )}
      <figcaption className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        {detalle}
        {acciones}
      </figcaption>
    </figure>
  )
}
