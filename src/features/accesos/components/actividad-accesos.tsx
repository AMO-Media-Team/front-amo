"use client"

import { DIAS_SEMANA, franjaHoraria } from "@/components/charts/datos"
import { MapaCalorActividad } from "@/components/charts/mapa-calor-actividad"
import { TarjetaGrafico } from "@/components/charts/tarjeta-grafico"
import { formatearNumero } from "@/lib/format"

import { celdaPico } from "../actividad"
import type { ActividadAccesos as DatosActividad } from "../tipos"

const UNIDAD = { singular: "ingreso", plural: "ingresos" }

function nota(actividad: DatosActividad): string | null {
  const pico = celdaPico(actividad.celdas)
  const partes = [
    pico
      ? `Mayor actividad: ${DIAS_SEMANA[pico.diaSemana - 1].toLowerCase()}, ${franjaHoraria(pico.hora)} (${formatearNumero(pico.cantidad)}).`
      : null,
    actividad.muestraCompleta
      ? null
      : "Calculado con los ingresos más recientes del periodo.",
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(" ") : null
}

/**
 * Mapa de calor día × hora de los ingresos exitosos (hora de Colombia), con
 * el componente compartido de gráficos: tabla accesible, PNG y pantalla completa.
 */
export function ActividadAccesos({
  actividad,
  className,
}: {
  actividad: DatosActividad
  className?: string
}) {
  return (
    <TarjetaGrafico
      titulo="Actividad por día y hora"
      descripcion="Ingresos exitosos del periodo según el día de la semana y la hora de Colombia."
      alto="min-h-64 sm:min-h-72"
      vacio={
        actividad.total === 0
          ? {
              titulo: "Sin ingresos en el periodo",
              descripcion:
                "Cuando alguien ingrese a AMO, su hora de acceso aparecerá aquí.",
            }
          : false
      }
      pie={nota(actividad)}
      className={className}
    >
      <MapaCalorActividad
        titulo="Ingresos por día y hora"
        celdas={actividad.celdas}
        unidad={UNIDAD}
      />
    </TarjetaGrafico>
  )
}
