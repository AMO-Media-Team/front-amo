/**
 * Regla 3 — Medios en riesgo con GMV en juego: medios activos que dejaron de
 * aceptar ofertas. Es `atencion` si lo que generaron pesa ≥ 5 % del GMV
 * verificado de 90 días; si no, `info`.
 */
import {
  formatearCOPCompacto,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import { construirHref, RUTAS_INSIGHTS } from "../rutas"
import { enumerar, porCantidadDesc } from "../textos"
import type { EntradaInsights, Insight } from "../tipos"

export const PROPORCION_ATENCION = 0.05

export function reglaMediosEnRiesgo(entrada: EntradaInsights): Insight | null {
  const riesgo = entrada.mediosEnRiesgo
  if (!riesgo || riesgo.cantidad < 1 || !(riesgo.gmvEnJuego > 0)) return null

  const { diasRiesgoSinAceptar, diasActividad } = entrada.config
  const proporcion =
    riesgo.gmvVerificado90d && riesgo.gmvVerificado90d > 0
      ? riesgo.gmvEnJuego / riesgo.gmvVerificado90d
      : null
  const uno = riesgo.cantidad === 1
  const cantidad = formatearNumero(riesgo.cantidad)
  const principales = [...riesgo.top]
    .sort(porCantidadDesc((m) => m.gmv90d))
    .slice(0, 3)
    .map((m) => m.nombre)

  const detalle = [
    `${cantidad} ${uno ? "medio activo no acepta" : "medios activos no aceptan"} ofertas hace más de ${diasRiesgoSinAceptar} días; ${
      uno ? "representa" : "representan"
    } ${formatearCOPCompacto(riesgo.gmvEnJuego)} de GMV en los últimos ${diasActividad} días${
      proporcion === null
        ? ""
        : ` (${formatearPorcentaje(proporcion, 1)} del GMV verificado)`
    }.`,
    principales.length && !uno
      ? `Los de mayor GMV: ${enumerar(principales)}.`
      : "",
  ]

  return {
    id: "medios-riesgo",
    regla: 3,
    severidad:
      proporcion !== null && proporcion >= PROPORCION_ATENCION
        ? "atencion"
        : "info",
    titulo: uno
      ? "1 medio en riesgo de abandono"
      : `${cantidad} medios en riesgo de abandono`,
    detalle: detalle.filter(Boolean).join(" "),
    metrica: "medios_en_riesgo",
    valor: riesgo.cantidad,
    magnitud: proporcion ?? 0,
    accion: {
      etiqueta: "Ver medios en riesgo",
      href: construirHref(RUTAS_INSIGHTS.medios, { segmento: "en_riesgo" }),
    },
  }
}
