"use client"

import { TarjetaGrafico } from "@/components/charts/tarjeta-grafico"
import { useTemaGraficos } from "@/components/charts/use-tema-graficos"
import type { PeriodoEnlace } from "@/features/geo/rutas"

import { distribuirAnchos, type EspecGrafico } from "../graficos"
import { filasRanking } from "../exportacion/tamanos"
import { type EspecGraficoLienzo, GraficoEspec } from "./grafico-espec"
import { MapaReporte } from "./mapa-reporte"

/** Clases estáticas (Tailwind no ve clases armadas en tiempo de ejecución). */
function altoPorFilas(filas: number): string {
  if (filas <= 4) return "min-h-56"
  if (filas <= 7) return "min-h-72"
  return "min-h-96"
}

/**
 * Las barras apiladas horizontales llevan los nombres en el eje: necesitan
 * más alto por barra para que Chart.js no omita nombres alternos.
 */
function altoApiladas(filas: number): string {
  if (filas <= 4) return "min-h-56"
  if (filas <= 6) return "min-h-72"
  if (filas <= 9) return "min-h-96"
  if (filas <= 10) return "min-h-[26rem]"
  return "min-h-[30rem]"
}

function altoGrafico(espec: EspecGraficoLienzo): string {
  switch (espec.tipo) {
    case "tendencia":
    case "combo":
      return "min-h-80"
    case "dona":
      return "min-h-72"
    case "ranking":
      return altoPorFilas(filasRanking(espec))
    case "apiladas":
      return espec.orientacion === "horizontal"
        ? altoApiladas(espec.categorias.length)
        : "min-h-80"
    case "calor":
      return "min-h-72"
  }
}

/**
 * Gráficos del reporte en una rejilla de dos columnas (una en móvil y
 * tableta). Cada uno con la tarjeta estándar: ver datos en tabla, exportar
 * PNG con marca, pantalla completa y estado vacío propio.
 */
export function GraficosReporte({
  graficos,
  periodoExplorador,
}: {
  graficos: readonly EspecGrafico[]
  /** Periodo con que el mapa enlaza al explorador; `null` = no enlaza. */
  periodoExplorador: PeriodoEnlace | null
}) {
  const { reducirMovimiento } = useTemaGraficos()
  if (graficos.length === 0) return null
  const anchos = distribuirAnchos(graficos)
  // Con «reducir movimiento» el tema se conoce tras hidratar: si la animación
  // de entrada se apaga a mitad de camino, las líneas se quedan a medio
  // dibujar. Al cambiar la preferencia el gráfico se crea de nuevo, ya quieto.
  const claveMovimiento = reducirMovimiento ? "quieto" : "animado"
  return (
    <section aria-labelledby="titulo-graficos" className="flex flex-col gap-3">
      <h2 id="titulo-graficos" className="sr-only">
        Gráficos
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {graficos.map((espec, indice) => {
          const clase =
            anchos[indice] === "completo" ? "lg:col-span-2" : undefined
          if (espec.tipo === "mapa") {
            return (
              <MapaReporte
                key={espec.id}
                espec={espec}
                periodoExplorador={periodoExplorador}
                className={clase}
              />
            )
          }
          return (
            <TarjetaGrafico
              key={espec.id}
              titulo={espec.titulo}
              descripcion={espec.descripcion}
              pie={espec.pie}
              vacio={espec.vacio}
              alto={altoGrafico(espec)}
              nivelTitulo="h3"
              className={clase}
            >
              <GraficoEspec key={claveMovimiento} espec={espec} />
            </TarjetaGrafico>
          )
        })}
      </div>
    </section>
  )
}
