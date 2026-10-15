"use client"

import type { ComponentProps, CSSProperties, PointerEvent } from "react"

import { cn } from "@/lib/utils"

interface ResplandorCursorProps extends ComponentProps<"div"> {
  /** Color del halo (cualquier color CSS o token). */
  color?: string
  /** Radio del halo en px. */
  radio?: number
}

function seguirPuntero(evento: PointerEvent<HTMLDivElement>) {
  if (evento.pointerType !== "mouse") return
  const elemento = evento.currentTarget
  const caja = elemento.getBoundingClientRect()
  elemento.style.setProperty(
    "--resplandor-x",
    `${evento.clientX - caja.left}px`
  )
  elemento.style.setProperty("--resplandor-y", `${evento.clientY - caja.top}px`)
}

/**
 * Halo sutil que sigue al puntero sobre tarjetas. Solo con ratón: se oculta en
 * pantallas táctiles (`pointer-coarse`) y con movimiento reducido. Actualiza
 * variables CSS directamente, sin estado de React, para no re-renderizar.
 */
export function ResplandorCursor({
  children,
  className,
  color = "var(--primary)",
  radio = 320,
  onPointerMove,
  ...props
}: ResplandorCursorProps) {
  const estiloHalo = {
    background: `radial-gradient(${radio}px circle at var(--resplandor-x, 50%) var(--resplandor-y, 50%), color-mix(in oklab, ${color} 12%, transparent), transparent 70%)`,
  } satisfies CSSProperties

  return (
    <div
      className={cn("group/resplandor relative isolate", className)}
      onPointerMove={(evento) => {
        seguirPuntero(evento)
        onPointerMove?.(evento)
      }}
      {...props}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/resplandor:opacity-100 motion-reduce:hidden pointer-coarse:hidden"
        style={estiloHalo}
      />
    </div>
  )
}
