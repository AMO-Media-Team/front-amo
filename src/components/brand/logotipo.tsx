import { useId, type SVGProps } from "react"

import { cn } from "@/lib/utils"

import { TINTA } from "./colores"
import { GradienteAurora } from "./gradiente-aurora"
import { rellenoSegunTono, type TonoMarca } from "./tono"
import { LOGOS } from "./trazos"

type Orientacion = "horizontal" | "vertical"

export interface LogotipoProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "viewBox"
> {
  orientacion?: Orientacion
  /** Añade "Advertising Market Optimization". Úsalo desde 64 px de alto (ver docs/marca.md). */
  conDescriptor?: boolean
  /**
   * `color` (por defecto): isotipo Aurora y tintas de marca. `mono`: todo en
   * `currentColor`, para fotos y fondos de color (p. ej. `text-white`).
   */
  variante?: "color" | "mono"
  /** Fondo sobre el que va el logo (solo `color`). `auto` sigue el tema activo. */
  tono?: TonoMarca
  /** Alto en píxeles; sin él, lo decide `className`. */
  alto?: number
}

function claveLogo(orientacion: Orientacion, conDescriptor: boolean) {
  if (orientacion === "horizontal") {
    return conDescriptor ? "horizontalDescriptor" : "horizontal"
  }
  return conDescriptor ? "verticalDescriptor" : "vertical"
}

const MONO = { fill: "currentColor" } as const

function coloresTexto(variante: "color" | "mono", tono: TonoMarca) {
  if (variante === "mono") return { palabra: MONO, descriptor: MONO }
  const { sobreClaro, sobreOscuro } = TINTA
  return {
    palabra: rellenoSegunTono(tono, sobreClaro.palabra, sobreOscuro.palabra),
    descriptor: rellenoSegunTono(
      tono,
      sobreClaro.descriptor,
      sobreOscuro.descriptor
    ),
  }
}

export function Logotipo({
  orientacion = "horizontal",
  conDescriptor = false,
  variante = "color",
  tono = "auto",
  alto,
  className,
  ...props
}: LogotipoProps) {
  const id = useId()
  const logo = LOGOS[claveLogo(orientacion, conDescriptor)]
  const colores = coloresTexto(variante, tono)
  const { isotipo } = logo

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={logo.viewBox}
      height={alto}
      width={alto === undefined ? undefined : alto * logo.proporcion}
      role="img"
      aria-label="AMO"
      className={cn("shrink-0", alto === undefined && "h-8 w-auto", className)}
      {...props}
    >
      {variante === "color" && (
        <defs>
          <GradienteAurora
            id={id}
            coordenadas={isotipo.gradiente}
            tono={tono}
          />
        </defs>
      )}
      <path
        fill={variante === "mono" ? "currentColor" : `url(#${id})`}
        d={isotipo.pin + isotipo.arcos.join("")}
      />
      <path {...colores.palabra} d={logo.palabra} />
      {logo.separador && (
        <path {...colores.descriptor} fillOpacity={0.45} d={logo.separador} />
      )}
      {logo.descriptor && <path {...colores.descriptor} d={logo.descriptor} />}
    </svg>
  )
}
