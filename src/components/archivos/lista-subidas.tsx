"use client"

import {
  CircleAlert,
  CircleCheck,
  File as IconoArchivo,
  FileImage,
  FileText,
  FileVideo,
  RotateCcw,
  Trash2,
  WifiOff,
  X,
} from "lucide-react"
import Image from "next/image"
import { useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatearTamano } from "@/lib/archivos/formato"
import { categoriaDe } from "@/lib/archivos/mime"
import { POLITICA_REINTENTOS } from "@/lib/archivos/reintentos"
import { cn } from "@/lib/utils"

import { ESTADOS_ACTIVOS, type EstadoSubida } from "./motor-subida"
import { anuncioEstado, textoEstado } from "./textos"
import type { ElementoSubida } from "./use-subidas"

export interface ListaSubidasProps {
  elementos: readonly ElementoSubida[]
  onReintentar?: (id: string) => void
  /** En curso: cancela. Sin empezar: la quita. */
  onCancelar?: (id: string) => void
  onQuitar?: (id: string) => void
  /** Nombre accesible de la lista. */
  etiqueta?: string
  /** Reintentos automáticos configurados (para «Reintento 2 de 4»). */
  maxIntentos?: number
  className?: string
}

const REINTENTABLES: ReadonlySet<EstadoSubida> = new Set(["error", "cancelada"])
const QUITABLES: ReadonlySet<EstadoSubida> = new Set([
  "completada",
  "error",
  "cancelada",
])

const suscribirSegundos = (avisar: () => void) => {
  const intervalo = setInterval(avisar, 1000)
  return () => clearInterval(intervalo)
}
const sinSuscripcion = () => () => {}
const segundoActual = () => Math.floor(Date.now() / 1000)
const sinHora = () => null

/** Segundos que faltan para `momento`; el reloj solo corre mientras hay cuenta. */
function useSegundosRestantes(momento: number | null): number | null {
  const segundo = useSyncExternalStore<number | null>(
    momento === null ? sinSuscripcion : suscribirSegundos,
    segundoActual,
    sinHora
  )
  if (momento === null || segundo === null) return null
  return Math.max(0, Math.ceil((momento - segundo * 1000) / 1000))
}

function IconoTipo({ tipo }: { tipo: string }) {
  switch (categoriaDe(tipo)) {
    case "imagen":
      return <FileImage aria-hidden className="size-5" />
    case "video":
      return <FileVideo aria-hidden className="size-5" />
    case "pdf":
      return <FileText aria-hidden className="size-5" />
    default:
      return <IconoArchivo aria-hidden className="size-5" />
  }
}

function IconoEstado({ estado }: { estado: EstadoSubida }) {
  switch (estado) {
    case "completada":
      return <CircleCheck aria-hidden className="size-3.5 shrink-0" />
    case "error":
      return <CircleAlert aria-hidden className="size-3.5 shrink-0" />
    case "pausada":
      return <WifiOff aria-hidden className="size-3.5 shrink-0" />
    default:
      return null
  }
}

function tonoEstado(estado: EstadoSubida): string {
  switch (estado) {
    case "completada":
      return "text-success"
    case "error":
      return "text-destructive"
    case "pausada":
    case "reintentando":
      return "text-warning"
    default:
      return "text-muted-foreground"
  }
}

/** Barra determinada al subir; indeterminada mientras se prepara o confirma. */
function valorProgreso(elemento: ElementoSubida): number | null {
  if (elemento.estado === "subiendo" || elemento.estado === "pausada") {
    return Math.round(elemento.progreso * 100)
  }
  if (elemento.estado === "reintentando" && elemento.progreso > 0) {
    return Math.round(elemento.progreso * 100)
  }
  return null
}

function FilaSubida({
  elemento,
  maxIntentos,
  onReintentar,
  onCancelar,
  onQuitar,
}: {
  elemento: ElementoSubida
  maxIntentos: number
  onReintentar?: (id: string) => void
  onCancelar?: (id: string) => void
  onQuitar?: (id: string) => void
}) {
  const segundos = useSegundosRestantes(
    elemento.estado === "reintentando" ? elemento.reanudaEn : null
  )
  const activa =
    elemento.estado === "en-cola" || ESTADOS_ACTIVOS.has(elemento.estado)
  const nombre = elemento.nombre
  return (
    <li className="flex animate-aparecer-arriba items-center gap-3 rounded-lg border bg-card p-2.5">
      <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {elemento.vistaPrevia ? (
          <Image
            src={elemento.vistaPrevia}
            alt=""
            fill
            unoptimized
            sizes="3rem"
            className="object-cover"
          />
        ) : (
          <IconoTipo tipo={elemento.tipo} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium" title={nombre}>
            {nombre}
          </p>
          <span className="shrink-0 text-xs cifras text-muted-foreground">
            {formatearTamano(elemento.tamano)}
          </span>
        </div>
        {activa ? (
          <Progress
            value={valorProgreso(elemento)}
            aria-label={`Progreso de ${nombre}`}
            getAriaValueText={(formateado, valor) =>
              valor === null ? "Preparando" : `${formateado} subido`
            }
            locale="es-CO"
          />
        ) : null}
        <p
          className={cn(
            "flex min-w-0 items-start gap-1.5 text-xs text-pretty",
            tonoEstado(elemento.estado)
          )}
        >
          <IconoEstado estado={elemento.estado} />
          <span className="min-w-0 cifras">
            {textoEstado(elemento, segundos, maxIntentos)}
          </span>
        </p>
        <span aria-live="polite" className="sr-only">
          {anuncioEstado(nombre, elemento)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {onReintentar && REINTENTABLES.has(elemento.estado) ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Reintentar ${nombre}`}
            title="Reintentar"
            onClick={() => onReintentar(elemento.id)}
          >
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
        {onCancelar && activa ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Cancelar la subida de ${nombre}`}
            title="Cancelar"
            onClick={() => onCancelar(elemento.id)}
          >
            <X aria-hidden />
          </Button>
        ) : null}
        {onQuitar && QUITABLES.has(elemento.estado) ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Quitar ${nombre}`}
            title="Quitar"
            onClick={() => onQuitar(elemento.id)}
          >
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </div>
    </li>
  )
}

/**
 * Archivos en subida con su progreso, su estado en español (pausa sin
 * conexión, cuenta regresiva del reintento, error con su causa) y las
 * acciones de reintentar, cancelar y quitar. Solo pinta: el estado lo lleva
 * `useSubidas`.
 */
export function ListaSubidas({
  elementos,
  onReintentar,
  onCancelar,
  onQuitar,
  etiqueta = "Archivos",
  maxIntentos = POLITICA_REINTENTOS.intentos,
  className,
}: ListaSubidasProps) {
  if (elementos.length === 0) return null
  return (
    <ul aria-label={etiqueta} className={cn("flex flex-col gap-2", className)}>
      {elementos.map((elemento) => (
        <FilaSubida
          key={elemento.id}
          elemento={elemento}
          maxIntentos={maxIntentos}
          onReintentar={onReintentar}
          onCancelar={onCancelar}
          onQuitar={onQuitar}
        />
      ))}
    </ul>
  )
}
