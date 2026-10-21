import type { CSSProperties } from "react"

import {
  RECUADRO_SAN_ANDRES,
  VIEWBOX_COLOMBIA,
} from "@/lib/geo/svg-departamentos"
import { cn } from "@/lib/utils"

import { calcularDatosIlustracion } from "./geometria-ilustracion"
import estilos from "./ilustracion-colombia.module.css"

/** Secuencia (segundos): departamentos → medios → capitales → arcos → señales. */
const TIEMPOS = {
  departamentos: { inicio: 0.15, paso: 0.045 },
  medios: { inicio: 1.2, paso: 0.19, ciclo: 23 },
  capitales: { inicio: 1.5, paso: 0.035 },
  pulsos: { inicio: 2.4, paso: 0.37 },
  arcos: { inicio: 2.3, paso: 0.07 },
  senales: { inicio: 3.6, paso: 1.9 },
} as const

/** Solo una de cada tres conexiones emite señales, para que respire. */
const CADA_CUANTOS_ARCOS_SENAL = 3
const CAPITAL_PRINCIPAL = "11"

const retraso = (segundos: number) =>
  ({ "--retraso": `${segundos.toFixed(2)}s` }) as CSSProperties

// Constante del módulo: la geometría no cambia entre solicitudes.
const DATOS = calcularDatosIlustracion()

/**
 * Colombia dibujándose departamento por departamento, con medios locales que
 * titilan, capitales que laten y arcos por los que viaja la señal: la red de
 * medios hiperlocales de AMO. Decorativa (oculta a lectores de pantalla);
 * animada solo con CSS y estática con movimiento reducido.
 */
export function IlustracionColombia({ className }: { className?: string }) {
  const { departamentos, capitales, medios, arcos } = DATOS
  const recuadro = RECUADRO_SAN_ANDRES

  return (
    <svg
      viewBox={VIEWBOX_COLOMBIA}
      aria-hidden
      focusable="false"
      className={cn(estilos.lienzo, className)}
    >
      <rect
        x={recuadro.x}
        y={recuadro.y}
        width={recuadro.ancho}
        height={recuadro.alto}
        rx={14}
        className={estilos.recuadro}
      />

      <g>
        {departamentos.map((departamento) => (
          <path
            key={departamento.codigo}
            d={departamento.path}
            pathLength={1}
            className={estilos.departamento}
            style={retraso(
              TIEMPOS.departamentos.inicio +
                departamento.orden * TIEMPOS.departamentos.paso
            )}
          />
        ))}
      </g>

      <g>
        {medios.map(([x, y], indice) => (
          <circle
            key={`${x}-${y}-${indice}`}
            cx={x}
            cy={y}
            r={2.6}
            className={estilos.medio}
            style={retraso(
              TIEMPOS.medios.inicio +
                (indice % TIEMPOS.medios.ciclo) * TIEMPOS.medios.paso
            )}
          />
        ))}
      </g>

      <g>
        {arcos.map((arco) => (
          <path
            key={arco.id}
            d={arco.path}
            pathLength={1}
            className={estilos.arco}
            style={retraso(
              TIEMPOS.arcos.inicio + arco.orden * TIEMPOS.arcos.paso
            )}
          />
        ))}
        {arcos
          .filter((arco) => arco.orden % CADA_CUANTOS_ARCOS_SENAL === 0)
          .map((arco, indice) => (
            <path
              key={`senal-${arco.id}`}
              d={arco.path}
              pathLength={1}
              className={estilos.senal}
              style={retraso(
                TIEMPOS.senales.inicio + indice * TIEMPOS.senales.paso
              )}
            />
          ))}
      </g>

      <g>
        {capitales.map(({ codigoDepartamento, punto: [x, y], orden }) => {
          const principal = codigoDepartamento === CAPITAL_PRINCIPAL
          return (
            <g key={codigoDepartamento}>
              <circle
                cx={x}
                cy={y}
                r={principal ? 11 : 8}
                className={estilos.halo}
                style={retraso(
                  TIEMPOS.pulsos.inicio + ((orden * TIEMPOS.pulsos.paso) % 3.2)
                )}
              />
              <circle
                cx={x}
                cy={y}
                r={principal ? 7 : 5}
                className={cn(
                  estilos.capital,
                  principal && estilos.capitalPrincipal
                )}
                style={retraso(
                  TIEMPOS.capitales.inicio + orden * TIEMPOS.capitales.paso
                )}
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
}
