"use client"

import { parseAsStringLiteral, useQueryState } from "nuqs"

import { GraficoBarrasApiladas } from "@/components/charts/grafico-barras-apiladas"
import { TarjetaGrafico } from "@/components/charts/tarjeta-grafico"
import { ControlSegmentado } from "@/features/roles/components/control-segmentado"
import { formatearCOP, formatearNumero } from "@/lib/format"

import { SegmentosEnLinea } from "../../components/segmentos-en-linea"
import {
  GRANULARIDADES_GANANCIAS,
  type GranularidadGanancias,
  type SerieGanancias,
  textoVentana,
} from "../datos"

const OPCIONES = [
  { valor: "semana", etiqueta: "Semanas" },
  { valor: "mes", etiqueta: "Meses" },
] as const satisfies readonly {
  valor: GranularidadGanancias
  etiqueta: string
}[]

const POR_UNIDAD: Readonly<Record<GranularidadGanancias, string>> = {
  semana: "cada semana",
  mes: "cada mes",
}

/** Vista del gráfico en la URL (`?ganancias=mes`): solo visual, sin viaje al servidor. */
const parserVista = parseAsStringLiteral(GRANULARIDADES_GANANCIAS)

function Resumen({
  serie,
  ventana,
}: {
  serie: SerieGanancias
  ventana: string
}) {
  const negocios =
    serie.asignaciones === 1 ? "negocio verificado" : "negocios verificados"
  return (
    <span className="cifras">
      {formatearCOP(serie.totalGanado)} ganados con{" "}
      {formatearNumero(serie.asignaciones)} {negocios} en {ventana} (antes de
      retenciones) · {formatearCOP(serie.totalPagado)} recibidos (neto).
    </span>
  )
}

/**
 * Cuánto ganó el medio en cada semana o mes (al verificarse cada negocio,
 * antes de retenciones). Columnas y no líneas: son sumas de periodos
 * discretos, y lo pagado llega en pagos sueltos, por eso va en el resumen y
 * no como una curva. Las dos vistas llegan del servidor: cambiar es inmediato.
 */
export function GraficoGanancias({
  series,
  porDefecto,
  className,
}: {
  series: Readonly<Record<GranularidadGanancias, SerieGanancias>>
  porDefecto: GranularidadGanancias
  className?: string
}) {
  const [elegida, setElegida] = useQueryState("ganancias", parserVista)
  const vista = elegida ?? porDefecto
  const serie = series[vista]
  const vacio = serie.totalGanado === 0 && serie.totalPagado === 0
  const ventana = textoVentana(serie)

  const cambiar = (valor: GranularidadGanancias) =>
    void setElegida(valor === porDefecto ? null : valor)

  return (
    <TarjetaGrafico
      titulo="Tus ganancias"
      descripcion={`Lo que ganaste ${POR_UNIDAD[vista]}, al verificarse cada negocio.`}
      alto="min-h-64"
      nombreArchivo={`Tus ganancias por ${vista}`}
      className={className}
      acciones={
        <ControlSegmentado
          etiqueta="Agrupar las ganancias por"
          opciones={OPCIONES}
          valor={vista}
          onCambio={cambiar}
          className="w-auto @max-lg/bloque:hidden"
        />
      }
      vacio={
        vacio
          ? {
              titulo: "Aún no hay ganancias en este tramo",
              descripcion: `Cuando se verifiquen tus publicaciones verás aquí cuánto ganas ${POR_UNIDAD[vista]}.`,
            }
          : false
      }
      pie={
        // En una celda angosta (menos de 32 rem) el control baja al pie: junto
        // a las acciones estándar de la tarjeta dejaba el título con una
        // palabra por línea. En pantalla completa solo se ve este.
        <span className="flex flex-col gap-2">
          <SegmentosEnLinea
            etiqueta="Agrupar las ganancias por"
            opciones={OPCIONES}
            valor={vista}
            onCambio={cambiar}
            className="@lg/bloque:hidden"
          />
          {vacio ? (
            ventana ? (
              <span className="cifras">Revisamos {ventana}.</span>
            ) : null
          ) : (
            <Resumen serie={serie} ventana={ventana} />
          )}
        </span>
      }
    >
      <GraficoBarrasApiladas
        key={vista}
        titulo="Tus ganancias"
        categorias={serie.etiquetas}
        series={[{ id: "ganado", nombre: "Ganado", valores: serie.ganado }]}
        formato="cop"
        nombreCategoria={vista === "semana" ? "Semana" : "Mes"}
      />
    </TarjetaGrafico>
  )
}
