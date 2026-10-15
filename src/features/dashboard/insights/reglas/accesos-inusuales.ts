/**
 * Regla 6 — Accesos desde países inusuales (motivo `PAIS_INUSUAL`). Es
 * `critico` si alguna cuenta es interna (rol de tipo ADMIN).
 */
import { formatearNumero } from "@/lib/format"

import { construirHref, RUTAS_INSIGHTS } from "../rutas"
import { enumerarLimitado, nombrePais, plural } from "../textos"
import type { EntradaInsights, Insight } from "../tipos"

export const MOTIVO_PAIS_INUSUAL = "PAIS_INUSUAL"
const ACCESOS_SATURACION = 10

export function reglaAccesosInusuales(
  entrada: EntradaInsights
): Insight | null {
  const accesos = (entrada.accesosSospechosos ?? []).filter(
    (acceso) => acceso.motivo === MOTIVO_PAIS_INUSUAL
  )
  if (accesos.length === 0) return null

  const usuarios = new Set(accesos.map((a) => a.usuarioId))
  const paises = new Map<string, string>()
  for (const acceso of accesos) {
    if (!acceso.paisIso2) continue
    const iso = acceso.paisIso2.toUpperCase()
    if (!paises.has(iso)) paises.set(iso, nombrePais(iso, acceso.paisNombre))
  }
  const nombres = [...paises.values()].sort((a, b) => a.localeCompare(b, "es"))
  const interno = accesos.some((a) => a.esInterno)
  const uno = accesos.length === 1

  const detalle = [
    `${plural(accesos.length, "inicio de sesión", "inicios de sesión")} desde ${
      nombres.length === 1 ? "un país inusual" : "países inusuales"
    }${nombres.length ? ` (${enumerarLimitado(nombres)})` : ""} para ${plural(usuarios.size, "usuario", "usuarios")}.`,
    interno ? "Incluye cuentas internas con permisos administrativos." : "",
  ]

  return {
    id: "accesos-inusuales",
    regla: 6,
    severidad: interno ? "critico" : "atencion",
    titulo: uno
      ? "1 acceso desde un país inusual"
      : `${formatearNumero(accesos.length)} accesos desde países inusuales`,
    detalle: detalle.filter(Boolean).join(" "),
    metrica: "accesos_sospechosos",
    valor: accesos.length,
    magnitud: Math.min(1, accesos.length / ACCESOS_SATURACION),
    accion: {
      etiqueta: "Revisar el registro de accesos",
      href: construirHref(
        RUTAS_INSIGHTS.accesos,
        {
          motivo: MOTIVO_PAIS_INUSUAL,
          // El registro de accesos lee un rango propio solo con este preset.
          periodo: entrada.periodo ? "personalizado" : undefined,
        },
        entrada.periodo
      ),
    },
  }
}
