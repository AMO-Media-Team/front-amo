"use client"

import { GraficoCombo } from "@/components/charts/grafico-combo"
import { TarjetaGrafico } from "@/components/charts/tarjeta-grafico"
import { formatearCOP, formatearNumero } from "@/lib/format"

import { type PuntoMensual, serieConDatos } from "../calculos"

/**
 * Doce meses de actividad de un medio, anunciante o campaña: GMV verificado
 * (columnas, por fecha de verificación) y asignaciones aceptadas (línea, por
 * fecha de aceptación), en bandas apiladas con su propio eje.
 */
export function GraficoActividad({
  serie,
  sujeto,
  className,
}: {
  serie: readonly PuntoMensual[]
  /** "del medio", "del anunciante"… (título del PNG exportado). */
  sujeto: string
  className?: string
}) {
  const conDatos = serieConDatos(serie)
  const totalGmv = serie.reduce((suma, punto) => suma + punto.gmvVerificado, 0)
  const totalAceptadas = serie.reduce(
    (suma, punto) => suma + punto.aceptadas,
    0
  )

  return (
    <TarjetaGrafico
      titulo="Actividad de los últimos 12 meses"
      descripcion="GMV verificado por mes de verificación y asignaciones aceptadas por mes de aceptación."
      nombreArchivo={`Actividad ${sujeto}`}
      alto="min-h-72"
      nivelTitulo="h3"
      className={className}
      vacio={
        conDatos
          ? false
          : {
              titulo: "Sin actividad en los últimos 12 meses",
              descripcion:
                "Cuando haya asignaciones aceptadas o verificadas verás aquí su evolución mes a mes.",
            }
      }
      pie={
        conDatos ? (
          <span className="cifras">
            Doce meses: {formatearCOP(totalGmv)} verificados ·{" "}
            {formatearNumero(totalAceptadas)}{" "}
            {totalAceptadas === 1
              ? "asignación aceptada"
              : "asignaciones aceptadas"}
          </span>
        ) : null
      }
    >
      <GraficoCombo
        titulo="Actividad mensual"
        etiquetas={serie.map((punto) => punto.etiqueta)}
        barras={{
          id: "gmv_verificado",
          nombre: "GMV verificado",
          valores: serie.map((punto) => punto.gmvVerificado),
          formato: "copCompacto",
        }}
        linea={{
          id: "aceptadas",
          nombre: "Aceptadas",
          valores: serie.map((punto) => punto.aceptadas),
          formato: "numero",
        }}
      />
    </TarjetaGrafico>
  )
}
