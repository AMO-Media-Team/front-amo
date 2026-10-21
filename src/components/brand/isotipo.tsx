import { useId, type SVGProps } from "react"

import { cn } from "@/lib/utils"

import { GradienteAurora } from "./gradiente-aurora"
import type { TonoMarca } from "./tono"
import { ISOTIPO, ISOTIPO_COMPACTO } from "./trazos"

/** Por debajo de este alto (px) se usa la versión compacta (un arco, huecos más anchos). */
const UMBRAL_COMPACTO = 24

export interface IsotipoProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "viewBox"
> {
  /** Alto en píxeles; el ancho sale de la proporción. Sin `size`, lo decide `className`. */
  size?: number
  variante?: "gradiente" | "mono"
  /** Solo aplica a `gradiente`. */
  tono?: TonoMarca
  /** Fuerza la versión compacta; por defecto se elige según `size`. */
  compacto?: boolean
  /** Oculta el isotipo a lectores de pantalla cuando va junto a texto que ya dice "AMO". */
  decorativo?: boolean
}

export function Isotipo({
  size,
  variante = "gradiente",
  tono = "auto",
  compacto,
  decorativo = false,
  className,
  ...props
}: IsotipoProps) {
  const id = useId()
  const usarCompacto =
    compacto ?? (size !== undefined && size <= UMBRAL_COMPACTO)
  const trazos = usarCompacto ? ISOTIPO_COMPACTO : ISOTIPO
  const relleno = variante === "mono" ? "currentColor" : `url(#${id})`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={trazos.viewBox}
      height={size}
      width={size === undefined ? undefined : size * trazos.proporcion}
      className={cn("shrink-0", size === undefined && "h-8 w-auto", className)}
      {...(decorativo
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": "AMO" })}
      {...props}
    >
      {variante === "gradiente" && (
        <defs>
          <GradienteAurora id={id} coordenadas={trazos.gradiente} tono={tono} />
        </defs>
      )}
      <path fill={relleno} d={trazos.pin + trazos.arcos.join("")} />
    </svg>
  )
}
