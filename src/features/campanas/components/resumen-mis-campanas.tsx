import { CircleDollarSign, FilePen, PiggyBank, Rocket } from "lucide-react"

import { BarraLlenado } from "@/features/operacion/components/distintivos"
import {
  RejillaResumen,
  TarjetaResumen,
} from "@/features/operacion/components/tarjeta-resumen"
import { proporcion } from "@/features/operacion/calculos"
import {
  formatearCOP,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import { rutaMisCampanasEn } from "../rutas"
import type { ResumenMisCampanas } from "../tipos"

/**
 * Cuatro cifras de la empresa, sin los filtros de la tabla: campañas activas y
 * en borrador (enlazan al listado filtrado), el presupuesto de las activas y
 * cuánto de él ya aceptaron los medios. Lo «sin comprometer» no es lo libre
 * para ofertas nuevas: las ofertas en revisión o publicadas reservan su
 * presupuesto (`disponible_campana`, en la ficha de cada campaña).
 */
export function ResumenCampanas({ resumen }: { resumen: ResumenMisCampanas }) {
  const comprometido = proporcion(
    resumen.comprometidoActivas,
    resumen.presupuestoActivas
  )
  return (
    <RejillaResumen etiqueta="Resumen de tus campañas" columnas={4}>
      <TarjetaResumen
        indice={0}
        titulo="Activas"
        valor={resumen.activas}
        icono={Rocket}
        tono="exito"
        href={rutaMisCampanasEn("ACTIVA")}
        detalle={
          resumen.cerradas > 0
            ? `${formatearNumero(resumen.cerradas)} finalizadas o canceladas`
            : "En curso: puedes enviar sus ofertas a revisión"
        }
      />
      <TarjetaResumen
        indice={1}
        titulo="En borrador"
        valor={resumen.borradores}
        icono={FilePen}
        href={rutaMisCampanasEn("BORRADOR")}
        detalle="Actívalas para enviar sus ofertas a revisión"
      />
      <TarjetaResumen
        indice={2}
        titulo="Presupuesto activo"
        valor={resumen.presupuestoActivas}
        formato="copCompacto"
        icono={PiggyBank}
        detalle="Suma de tus campañas activas"
      />
      <TarjetaResumen
        indice={3}
        titulo="Comprometido"
        valor={resumen.comprometidoActivas}
        formato="copCompacto"
        icono={CircleDollarSign}
        tono="info"
        detalle={
          comprometido === null
            ? "En cupos aceptados por los medios"
            : `${formatearPorcentaje(comprometido, 0)} del presupuesto activo · ${formatearCOP(
                Math.max(
                  0,
                  resumen.presupuestoActivas - resumen.comprometidoActivas
                )
              )} sin comprometer`
        }
      >
        <BarraLlenado fraccion={comprometido} tono="info" />
      </TarjetaResumen>
    </RejillaResumen>
  )
}
