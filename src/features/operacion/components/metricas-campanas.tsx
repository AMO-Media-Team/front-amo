import {
  CircleDollarSign,
  Flag,
  Megaphone,
  PiggyBank,
  Rocket,
} from "lucide-react"
import type { Route } from "next"

import {
  formatearCOP,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import { proporcion } from "../calculos"
import type { EstadoCampana } from "../estados"
import { estadoTablaCampanas } from "../estado-tablas"
import { contar } from "../formato"
import { RUTAS_OPERACION } from "../rutas"
import type { ResumenCampanas } from "../tipos"
import { BarraLlenado } from "./distintivos"
import { RejillaResumen, TarjetaResumen } from "./tarjeta-resumen"

function filtrado(estado: EstadoCampana): Route {
  return estadoTablaCampanas.serializar(RUTAS_OPERACION.campanas, {
    estado: [estado],
  }) as Route
}

/**
 * Indicadores de las campañas visibles (sin los filtros de la tabla): cuántas
 * hay y en qué estado, y cuánto del presupuesto de las activas ya está
 * comprometido en cupos aceptados.
 */
export function MetricasCampanas({ resumen }: { resumen: ResumenCampanas }) {
  const comprometido = proporcion(
    resumen.comprometidoActivas,
    resumen.presupuestoActivas
  )

  return (
    <RejillaResumen etiqueta="Resumen de campañas" columnas={5}>
      <TarjetaResumen
        indice={0}
        titulo="Campañas"
        valor={resumen.total}
        icono={Megaphone}
        detalle={
          resumen.total > 0
            ? `${formatearNumero(resumen.borradores)} en borrador`
            : "Aún no hay campañas creadas"
        }
      />
      <TarjetaResumen
        indice={1}
        titulo="Activas"
        valor={resumen.activas}
        icono={Rocket}
        tono="exito"
        href={filtrado("ACTIVA")}
        detalle="Con ofertas en curso o por publicar"
      />
      <TarjetaResumen
        indice={2}
        titulo="Presupuesto activo"
        valor={resumen.presupuestoActivas}
        formato="copCompacto"
        icono={PiggyBank}
        detalle="Suma de las campañas activas"
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
              )} libres`
        }
      >
        <BarraLlenado fraccion={comprometido} tono="info" />
      </TarjetaResumen>
      <TarjetaResumen
        indice={4}
        titulo="Finalizadas"
        valor={resumen.finalizadas}
        icono={Flag}
        href={filtrado("FINALIZADA")}
        detalle={
          resumen.canceladas > 0
            ? `${contar(resumen.canceladas, "cancelada", "canceladas")} aparte`
            : "Ninguna cancelada"
        }
      />
    </RejillaResumen>
  )
}
