"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react"
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  type Dimensiones,
  type Encuadre,
  ENCUADRE_INICIAL,
  escalaVisor,
  limitarEncuadre,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
} from "../avatar"

/** Lado del visor en px (cabe en un diálogo de 390 px de ancho). */
export const LADO_VISOR = 272
const PASO_TECLADO = 12
const PASO_ZOOM = 0.1

const formatoPorcentaje = new Intl.NumberFormat("es-CO", {
  style: "percent",
  maximumFractionDigits: 0,
})

/**
 * Control de acercamiento. Se compone sobre Base UI (y no sobre
 * `components/ui/slider`) para dar nombre accesible al propio control
 * deslizante: la etiqueta del grupo no llega al `input` del pulgar.
 */
function ControlAcercamiento({
  zoom,
  deshabilitado,
  onCambio,
}: {
  zoom: number
  deshabilitado: boolean
  onCambio: (zoom: number) => void
}) {
  return (
    <SliderPrimitive.Root
      value={zoom}
      min={ZOOM_MINIMO}
      max={ZOOM_MAXIMO}
      step={0.01}
      disabled={deshabilitado}
      thumbAlignment="edge"
      onValueChange={(valor) =>
        onCambio(Array.isArray(valor) ? valor[0] : valor)
      }
      className="min-w-0 flex-1"
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center py-2 select-none data-disabled:opacity-50">
        <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-foreground/15 select-none">
          <SliderPrimitive.Indicator className="h-full bg-primary select-none" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label="Acercamiento"
          getAriaValueText={(_, valor) => formatoPorcentaje.format(valor)}
          className="relative block size-3.5 shrink-0 rounded-full border border-ring bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

interface RecortadorAvatarProps {
  url: string
  dimensiones: Dimensiones
  encuadre: Encuadre
  onEncuadreChange: (encuadre: Encuadre) => void
  deshabilitado?: boolean
}

/**
 * Visor de recorte cuadrado con máscara circular: arrastrar (ratón o dedo),
 * rueda o control deslizante para acercar y flechas / + / − con teclado. La
 * imagen siempre cubre el visor, así que el avatar nunca queda con bordes.
 */
export function RecortadorAvatar({
  url,
  dimensiones,
  encuadre,
  onEncuadreChange,
  deshabilitado = false,
}: RecortadorAvatarProps) {
  const visor = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ x: number; y: number } | null>(null)
  const [arrastrando, setArrastrando] = useState(false)

  const fijar = (siguiente: Encuadre) =>
    onEncuadreChange(limitarEncuadre(siguiente, dimensiones, LADO_VISOR))

  // La rueda necesita un listener no pasivo para no desplazar la página.
  const ultimoEncuadre = useRef(encuadre)
  useEffect(() => {
    ultimoEncuadre.current = encuadre
  }, [encuadre])
  useEffect(() => {
    const nodo = visor.current
    if (!nodo || deshabilitado) return
    const alRodar = (evento: WheelEvent) => {
      evento.preventDefault()
      const actual = ultimoEncuadre.current
      const zoom = actual.zoom * (evento.deltaY < 0 ? 1.08 : 1 / 1.08)
      onEncuadreChange(
        limitarEncuadre({ ...actual, zoom }, dimensiones, LADO_VISOR)
      )
    }
    nodo.addEventListener("wheel", alRodar, { passive: false })
    return () => nodo.removeEventListener("wheel", alRodar)
  }, [deshabilitado, dimensiones, onEncuadreChange])

  const alPresionar = (evento: PointerEvent<HTMLDivElement>) => {
    if (deshabilitado) return
    evento.currentTarget.setPointerCapture(evento.pointerId)
    arrastre.current = { x: evento.clientX, y: evento.clientY }
    setArrastrando(true)
  }
  const alMover = (evento: PointerEvent<HTMLDivElement>) => {
    const inicio = arrastre.current
    if (!inicio) return
    arrastre.current = { x: evento.clientX, y: evento.clientY }
    fijar({
      ...encuadre,
      x: encuadre.x + evento.clientX - inicio.x,
      y: encuadre.y + evento.clientY - inicio.y,
    })
  }
  const alSoltar = () => {
    arrastre.current = null
    setArrastrando(false)
  }

  const alTeclear = (evento: KeyboardEvent<HTMLDivElement>) => {
    const movimientos: Record<string, Partial<Encuadre>> = {
      ArrowLeft: { x: encuadre.x - PASO_TECLADO },
      ArrowRight: { x: encuadre.x + PASO_TECLADO },
      ArrowUp: { y: encuadre.y - PASO_TECLADO },
      ArrowDown: { y: encuadre.y + PASO_TECLADO },
      "+": { zoom: encuadre.zoom + PASO_ZOOM },
      "=": { zoom: encuadre.zoom + PASO_ZOOM },
      "-": { zoom: encuadre.zoom - PASO_ZOOM },
    }
    const cambio = movimientos[evento.key]
    if (!cambio || deshabilitado) return
    evento.preventDefault()
    fijar({ ...encuadre, ...cambio })
  }

  const escala = escalaVisor(dimensiones, LADO_VISOR, encuadre.zoom)
  const ancho = dimensiones.ancho * escala
  const alto = dimensiones.alto * escala
  const izquierda = (LADO_VISOR - ancho) / 2 + encuadre.x
  const arriba = (LADO_VISOR - alto) / 2 + encuadre.y

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={visor}
        role="group"
        tabIndex={deshabilitado ? -1 : 0}
        aria-label="Encuadre de la foto. Arrastra o usa las flechas para moverla; + y − para acercar o alejar."
        aria-roledescription="recortador"
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onKeyDown={alTeclear}
        style={{ width: LADO_VISOR, height: LADO_VISOR }}
        className={cn(
          "relative shrink-0 touch-none overflow-hidden rounded-2xl bg-muted outline-none select-none focus-visible:anillo-foco",
          deshabilitado
            ? "opacity-60"
            : arrastrando
              ? "cursor-grabbing"
              : "cursor-grab"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- URL local (blob:) del archivo elegido */}
        <img
          src={url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
          style={{
            width: ancho,
            height: alto,
            transform: `translate3d(${izquierda}px, ${arriba}px, 0)`,
          }}
        />
        {/* Máscara circular: lo que queda fuera del círculo no se verá en el avatar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(10_8_18/0.62)] ring-2 ring-white/85"
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-200",
            arrastrando ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
          <span className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
          <span className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
          <span className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
        </div>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[0.6875rem] font-medium whitespace-nowrap text-white backdrop-blur-sm transition-opacity",
            arrastrando ? "opacity-0" : "opacity-100"
          )}
        >
          <Move className="size-3" />
          Arrastra para encuadrar
        </span>
      </div>

      <div className="flex w-full max-w-[17rem] items-center gap-3">
        <ZoomOut
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <ControlAcercamiento
          zoom={encuadre.zoom}
          deshabilitado={deshabilitado}
          onCambio={(zoom) => fijar({ ...encuadre, zoom })}
        />
        <ZoomIn aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Restablecer encuadre"
          disabled={deshabilitado}
          onClick={() => onEncuadreChange(ENCUADRE_INICIAL)}
        >
          <RotateCcw aria-hidden />
        </Button>
      </div>
    </div>
  )
}
