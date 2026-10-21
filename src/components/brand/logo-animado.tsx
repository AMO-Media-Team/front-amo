"use client"

import * as m from "motion/react-m"
import { useId } from "react"

import { cn } from "@/lib/utils"

import { GradienteAurora } from "./gradiente-aurora"
import { Isotipo } from "./isotipo"
import type { TonoMarca } from "./tono"
import { ISOTIPO } from "./trazos"

/** Curvas y tiempos de marca (docs/marca.md › Movimiento). */
const EASE_ENTRADA = [0.65, 0, 0.35, 1] as const
const EASE_SALIDA = [0.22, 1, 0.36, 1] as const
const DIBUJO = 0.9
const RELLENO = 0.4
const PULSO = 1.6
const DESFASE_ARCOS = 0.22
const OPACIDAD_REPOSO = 0.35

export interface LogoAnimadoProps {
  /** Alto en píxeles. */
  size?: number
  tono?: TonoMarca
  /** Repite el pulso de los arcos (splash de carga). Sin bucle, se asientan tras la entrada. */
  bucle?: boolean
  className?: string
}

/**
 * Isotipo con entrada animada: se dibuja el contorno del pin, se rellena el
 * pin con la Λ calada y los arcos pulsan en onda de dentro hacia fuera.
 *
 * Con movimiento reducido se muestra el isotipo estático. Se resuelve con la
 * media query en CSS (no con `useReducedMotion`) para que servidor y cliente
 * rendericen lo mismo y no haya desajustes de hidratación.
 */
export function LogoAnimado({
  size = 96,
  tono = "auto",
  bucle = true,
  className,
}: LogoAnimadoProps) {
  const id = useId()
  const relleno = `url(#${id})`
  const inicioArcos = DIBUJO + RELLENO * 0.5

  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <Isotipo
        size={size}
        tono={tono}
        compacto={false}
        className="hidden motion-reduce:block"
      />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={ISOTIPO.viewBox}
        height={size}
        width={size * ISOTIPO.proporcion}
        role="img"
        aria-label="AMO"
        className="overflow-visible motion-reduce:hidden"
      >
        <defs>
          <GradienteAurora
            id={id}
            coordenadas={ISOTIPO.gradiente}
            tono={tono}
          />
        </defs>
        <m.path
          d={ISOTIPO.contornoPin}
          fill="none"
          stroke={relleno}
          strokeWidth={1.6}
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 1 }}
          animate={{ pathLength: 1, opacity: 0 }}
          transition={{
            pathLength: { duration: DIBUJO, ease: EASE_ENTRADA },
            opacity: { delay: DIBUJO, duration: RELLENO, ease: EASE_SALIDA },
          }}
        />
        <m.path
          d={ISOTIPO.pin}
          fill={relleno}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            delay: DIBUJO * 0.7,
            duration: RELLENO,
            ease: EASE_SALIDA,
          }}
        />
        {/* El grupo controla la entrada; cada arco, su pulso desfasado (onda hacia fuera). */}
        <m.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            delay: inicioArcos,
            duration: RELLENO,
            ease: EASE_SALIDA,
          }}
        >
          {ISOTIPO.arcos.map((arco, i) => (
            <m.path
              key={arco}
              d={arco}
              fill={relleno}
              initial={{ opacity: bucle ? OPACIDAD_REPOSO : 1 }}
              animate={
                bucle
                  ? { opacity: [OPACIDAD_REPOSO, 1, OPACIDAD_REPOSO] }
                  : undefined
              }
              transition={{
                delay: inicioArcos + i * DESFASE_ARCOS,
                duration: PULSO,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            />
          ))}
        </m.g>
      </svg>
    </span>
  )
}
