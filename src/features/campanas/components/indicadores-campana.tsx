import { CalendarDays, PiggyBank, Wallet, WalletCards } from "lucide-react"

import { BarraLlenado } from "@/features/operacion/components/distintivos"
import {
  RejillaResumen,
  TarjetaResumen,
} from "@/features/operacion/components/tarjeta-resumen"
import { proporcion } from "@/features/operacion/calculos"
import {
  diasDeVigencia,
  formatearRangoCompacto,
  instanteDeDia,
} from "@/features/operacion/formato"
import { formatearCOP, formatearPorcentaje } from "@/lib/format"

import { textoFase } from "../presentacion"
import type { MiCampana } from "../tipos"

/**
 * Resumen de la campaña: el presupuesto total, lo que queda para ofertas
 * nuevas (`disponible_campana`), lo comprometido en cupos aceptados y su
 * vigencia.
 */
export function IndicadoresCampana({
  campana,
  hoy,
}: {
  campana: MiCampana
  hoy: string
}) {
  const uso = proporcion(
    campana.presupuestoComprometido,
    campana.presupuestoTotal
  )
  const reservado =
    campana.disponible === null
      ? null
      : Math.max(0, campana.presupuestoTotal - campana.disponible)
  const agotado = campana.disponible !== null && campana.disponible <= 0
  const fase = textoFase(campana, hoy)
  return (
    <RejillaResumen etiqueta="Resumen de la campaña" columnas={4}>
      <TarjetaResumen
        indice={0}
        titulo="Presupuesto total"
        valor={campana.presupuestoTotal}
        formato="copCompacto"
        icono={PiggyBank}
        detalle="Lo que destinas a la campaña"
      />
      <TarjetaResumen
        indice={1}
        titulo="Disponible para ofertas"
        valor={campana.disponible}
        formato="copCompacto"
        icono={WalletCards}
        tono={agotado ? "aviso" : "exito"}
        alerta={agotado && campana.estado === "ACTIVA"}
        detalle={
          reservado === null
            ? "No pudimos calcularlo; actualiza la página"
            : reservado > 0
              ? `${formatearCOP(reservado)} reservados por tus ofertas en revisión o publicadas`
              : "Ninguna oferta lo reserva todavía"
        }
      />
      <TarjetaResumen
        indice={2}
        titulo="Comprometido"
        valor={campana.presupuestoComprometido}
        formato="copCompacto"
        icono={Wallet}
        tono="info"
        detalle={
          campana.presupuestoComprometido > 0
            ? `${formatearPorcentaje(uso, 0)} del total, en cupos que aceptaron los medios`
            : "Aún ningún medio ha aceptado un cupo"
        }
      >
        <BarraLlenado fraccion={uso} tono="info" />
      </TarjetaResumen>
      <TarjetaResumen
        indice={3}
        titulo="Días de vigencia"
        valor={diasDeVigencia(campana.fechaInicio, campana.fechaFin)}
        icono={CalendarDays}
        detalle={`${formatearRangoCompacto(
          instanteDeDia(campana.fechaInicio),
          instanteDeDia(campana.fechaFin)
        )}${fase ? ` · ${fase.texto}` : ""}`}
      />
    </RejillaResumen>
  )
}
