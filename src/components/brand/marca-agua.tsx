import type { SVGProps } from "react"

import { cn } from "@/lib/utils"

import { ISOTIPO } from "./trazos"

export type MarcaAguaProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "viewBox"
>

/**
 * Isotipo decorativo de gran formato para fondos (login, estados vacíos,
 * portadas). Toma `currentColor` con opacidad baja: ajústalo con `text-*` y
 * `opacity-*`. Siempre oculto para lectores de pantalla.
 */
export function MarcaAgua({ className, ...props }: MarcaAguaProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={ISOTIPO.viewBox}
      aria-hidden
      focusable="false"
      className={cn(
        "pointer-events-none text-primary opacity-[0.06] select-none",
        className
      )}
      {...props}
    >
      <path fill="currentColor" d={ISOTIPO.pin + ISOTIPO.arcos.join("")} />
    </svg>
  )
}
