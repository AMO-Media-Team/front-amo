"use client"

import {
  EllipsisVertical,
  Flame,
  ImageDown,
  LocateFixed,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Percent,
  Play,
  Plus,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Toggle } from "@/components/ui/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { CLASE_PANEL } from "./lienzo"

function ConAyuda({
  texto,
  children,
}: {
  texto: string
  children: React.ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">{texto}</TooltipContent>
    </Tooltip>
  )
}

const CLASE_BOTON_ICONO =
  "size-9 rounded-xl text-muted-foreground hover:bg-foreground/8 hover:text-foreground"

const CLASE_TOGGLE =
  "h-9 gap-1.5 rounded-xl px-2.5 text-muted-foreground hover:bg-foreground/8 hover:text-foreground aria-pressed:bg-primary/15 aria-pressed:text-primary data-[pressed]:bg-primary/15 data-[pressed]:text-primary"

export interface OpcionesVista {
  readonly admitePor100k: boolean
  readonly por100k: boolean
  readonly onPor100k: (activo: boolean) => void
  readonly admiteCalor: boolean
  readonly calor: boolean
  readonly onCalor: (activo: boolean) => void
  readonly pantallaCompleta: boolean
  readonly onPantallaCompleta: () => void
  readonly exportando: boolean
  readonly onExportar: () => void
}

/** Vistas y acciones del mapa en la barra superior (escritorio y tableta). */
export function AccionesMapa({
  opciones,
  className,
}: {
  opciones: OpcionesVista
  className?: string
}) {
  const {
    admitePor100k,
    por100k,
    onPor100k,
    admiteCalor,
    calor,
    onCalor,
    pantallaCompleta,
    onPantallaCompleta,
    exportando,
    onExportar,
  } = opciones
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {admitePor100k ? (
        <ConAyuda texto="Normaliza por población (DANE)">
          <Toggle
            pressed={por100k}
            onPressedChange={onPor100k}
            className={CLASE_TOGGLE}
          >
            <Percent aria-hidden />
            <span>Por 100 mil hab.</span>
          </Toggle>
        </ConAyuda>
      ) : null}
      {admiteCalor ? (
        <ConAyuda texto="Densidad de puntos reales">
          <Toggle
            pressed={calor}
            onPressedChange={onCalor}
            className={CLASE_TOGGLE}
          >
            <Flame aria-hidden />
            <span>Calor</span>
          </Toggle>
        </ConAyuda>
      ) : null}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-foreground/10" />
      <ConAyuda
        texto={
          pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"
        }
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={onPantallaCompleta}
          aria-label={
            pantallaCompleta
              ? "Salir de pantalla completa"
              : "Pantalla completa"
          }
          aria-pressed={pantallaCompleta}
          className={CLASE_BOTON_ICONO}
        >
          {pantallaCompleta ? (
            <Minimize aria-hidden />
          ) : (
            <Maximize aria-hidden />
          )}
        </Button>
      </ConAyuda>
      <ConAyuda texto="Descargar imagen (PNG)">
        <Button
          variant="ghost"
          size="icon"
          onClick={onExportar}
          disabled={exportando}
          aria-label="Descargar imagen del mapa"
          className={CLASE_BOTON_ICONO}
        >
          <ImageDown aria-hidden />
        </Button>
      </ConAyuda>
    </div>
  )
}

/** Las mismas acciones agrupadas en un menú (móvil). */
export function MenuAccionesMapa({ opciones }: { opciones: OpcionesVista }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Más opciones del mapa"
            className={cn(CLASE_BOTON_ICONO, "bg-foreground/5")}
          />
        }
      >
        <EllipsisVertical aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {opciones.admitePor100k ? (
          <DropdownMenuCheckboxItem
            checked={opciones.por100k}
            onCheckedChange={opciones.onPor100k}
          >
            <Percent aria-hidden />
            Por 100 mil habitantes
          </DropdownMenuCheckboxItem>
        ) : null}
        {opciones.admiteCalor ? (
          <DropdownMenuCheckboxItem
            checked={opciones.calor}
            onCheckedChange={opciones.onCalor}
          >
            <Flame aria-hidden />
            Mapa de calor
          </DropdownMenuCheckboxItem>
        ) : null}
        {opciones.admitePor100k || opciones.admiteCalor ? (
          <DropdownMenuSeparator />
        ) : null}
        <DropdownMenuItem onClick={opciones.onPantallaCompleta}>
          {opciones.pantallaCompleta ? (
            <Minimize aria-hidden />
          ) : (
            <Maximize aria-hidden />
          )}
          {opciones.pantallaCompleta
            ? "Salir de pantalla completa"
            : "Pantalla completa"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={opciones.onExportar}
          disabled={opciones.exportando}
        >
          <ImageDown aria-hidden />
          Descargar imagen (PNG)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BotonZoom({
  etiqueta,
  onClick,
  children,
}: {
  etiqueta: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className="size-8 rounded-lg text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
    >
      {children}
    </Button>
  )
}

/** Estado del giro automático del globo y cómo pausarlo o reanudarlo. */
export interface ControlGiro {
  readonly girando: boolean
  readonly onAlternar: () => void
}

export function etiquetaGiro(girando: boolean): string {
  return girando ? "Pausar el giro del planeta" : "Reanudar el giro del planeta"
}

/** Icono del botón de giro: la acción disponible, no el estado. */
export function IconoGiro({ girando }: { girando: boolean }) {
  return girando ? <Pause aria-hidden /> : <Play aria-hidden />
}

/**
 * Acercar, alejar y volver al encuadre del nivel; en la vista mundial, además,
 * pausar o reanudar el giro del globo.
 */
export function ControlesZoom({
  onAcercar,
  onAlejar,
  onRecentrar,
  giro,
  className,
}: {
  onAcercar: () => void
  onAlejar: () => void
  onRecentrar: () => void
  giro?: ControlGiro | null
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Zoom del mapa"
      className={cn(
        CLASE_PANEL,
        "flex flex-col gap-0.5 rounded-xl p-1",
        className
      )}
    >
      <BotonZoom etiqueta="Acercar" onClick={onAcercar}>
        <Plus aria-hidden />
      </BotonZoom>
      <BotonZoom etiqueta="Alejar" onClick={onAlejar}>
        <Minus aria-hidden />
      </BotonZoom>
      <span aria-hidden className="mx-1.5 h-px bg-foreground/10" />
      <BotonZoom etiqueta="Volver al encuadre" onClick={onRecentrar}>
        <LocateFixed aria-hidden />
      </BotonZoom>
      {giro ? (
        <BotonZoom
          etiqueta={etiquetaGiro(giro.girando)}
          onClick={giro.onAlternar}
        >
          <IconoGiro girando={giro.girando} />
        </BotonZoom>
      ) : null}
    </div>
  )
}
