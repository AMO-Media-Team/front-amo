"use client"

import { ArrowLeft, ArrowRight, Save, Send } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { fraccionProgreso, textoPaso } from "./navegacion"

/** Acción del pie en curso (muestra su indicador de carga y bloquea las demás). */
export type AccionAsistente = "siguiente" | "borrador" | "enviar"

export interface PieAsistenteProps {
  indice: number
  total: number
  ocupado?: AccionAsistente | null
  onAnterior: () => void
  /**
   * Sin él, «Siguiente» es el botón `submit` del formulario que envuelve al
   * pie (así Enter en un campo avanza); con él, un botón normal.
   */
  onSiguiente?: () => void
  onEnviar: () => void
  /** Sin él no se ofrece «Guardar borrador». */
  onGuardarBorrador?: () => void
  textoSiguiente?: string
  textoEnviar?: string
  textoGuardarBorrador?: string
  /** Estado del borrador («Guardado a las 10:42»); se anuncia con cortesía. */
  notaBorrador?: ReactNode
  deshabilitado?: boolean
  className?: string
}

/*
 * Bloqueados siguen siendo enfocables (`aria-disabled`): con `disabled` el
 * foco del teclado se perdería en el documento al pulsar «Guardar borrador».
 */
const BLOQUEO = "aria-disabled:cursor-not-allowed aria-disabled:opacity-60"

/**
 * Pie fijo del asistente: Atrás · (paso y borrador) · Guardar borrador ·
 * Siguiente o Enviar. Queda pegado al borde inferior mientras se recorre el
 * paso y respeta la barra de navegación inferior del móvil mediante
 * `--reserva-inferior` (si el shell no la define, deja el margen seguro del
 * dispositivo). Mientras una acción corre, todas se bloquean. Ningún
 * ancestro debe tener `overflow: hidden` (anula el `sticky`).
 */
export function PieAsistente({
  indice,
  total,
  ocupado = null,
  onAnterior,
  onSiguiente,
  onEnviar,
  onGuardarBorrador,
  textoSiguiente = "Siguiente",
  textoEnviar = "Enviar",
  textoGuardarBorrador = "Guardar borrador",
  notaBorrador,
  deshabilitado = false,
  className,
}: PieAsistenteProps) {
  const esPrimero = indice <= 0
  const esUltimo = indice >= total - 1
  const bloqueado = deshabilitado || ocupado !== null
  const progreso = fraccionProgreso(indice, total)

  return (
    <div
      className={cn(
        "pointer-events-none sticky bottom-[calc(var(--reserva-inferior,env(safe-area-inset-bottom))+0.75rem)] z-20 flex justify-center",
        className
      )}
    >
      {/* Si un texto largo no cabe (390 px dentro de una tarjeta), el botón
          baja de línea en vez de quedar recortado: por eso `flex-wrap` y solo
          la línea de progreso lleva `overflow-hidden`. */}
      <div
        role="group"
        aria-label="Acciones del asistente"
        className="pointer-events-auto relative flex w-full flex-wrap items-center justify-end gap-2 rounded-2xl border bg-popover/90 p-2 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-xl"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <span
            className="absolute inset-x-0 top-0 h-0.5 origin-left bg-primary transition-transform duration-500 ease-out"
            style={{ transform: `scaleX(${progreso})` }}
          />
        </span>
        {esPrimero ? null : (
          <Button
            variant="ghost"
            size="lg"
            onClick={onAnterior}
            disabled={bloqueado}
            focusableWhenDisabled
            className={BLOQUEO}
          >
            <ArrowLeft data-icon="inline-start" aria-hidden />
            {/* En 390 px solo la flecha; el nombre accesible sigue siendo «Atrás». */}
            <span className="max-sm:sr-only">Atrás</span>
          </Button>
        )}
        <p className="min-w-0 flex-1 truncate px-1 text-xs cifras text-muted-foreground max-sm:sr-only">
          {textoPaso(indice, total)}
          {/* Solo el borrador se anuncia: el cambio de paso ya lo anuncia el foco en su título. */}
          <span aria-live="polite">
            {notaBorrador ? <> · {notaBorrador}</> : null}
          </span>
        </p>
        <span aria-hidden className="flex-1 sm:hidden" />
        {onGuardarBorrador ? (
          <Button
            variant="outline"
            size="lg"
            onClick={onGuardarBorrador}
            disabled={bloqueado}
            focusableWhenDisabled
            className={BLOQUEO}
          >
            {ocupado === "borrador" ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" aria-hidden />
            )}
            {ocupado === "borrador" ? (
              "Guardando…"
            ) : (
              <BorradorCorto texto={textoGuardarBorrador} />
            )}
          </Button>
        ) : null}
        {esUltimo ? (
          <Button
            size="lg"
            onClick={onEnviar}
            disabled={bloqueado}
            focusableWhenDisabled
            className={BLOQUEO}
          >
            {ocupado === "enviar" ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" aria-hidden />
            )}
            {ocupado === "enviar" ? "Enviando…" : textoEnviar}
          </Button>
        ) : (
          <Button
            size="lg"
            type={onSiguiente ? "button" : "submit"}
            onClick={onSiguiente}
            disabled={bloqueado}
            focusableWhenDisabled
            className={BLOQUEO}
          >
            {textoSiguiente}
            {ocupado === "siguiente" ? (
              <Spinner aria-hidden data-icon="inline-end" />
            ) : (
              <ArrowRight data-icon="inline-end" aria-hidden />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * «Guardar borrador» cabe completo desde `sm`; en 390 px se lee «Guardar» y
 * el resto queda para lectores de pantalla (mismo nombre accesible).
 */
function BorradorCorto({ texto }: { texto: string }) {
  const [primera, ...resto] = texto.split(" ")
  if (resto.length === 0) return <>{texto}</>
  return (
    <span>
      {primera} <span className="max-sm:sr-only">{resto.join(" ")}</span>
    </span>
  )
}
