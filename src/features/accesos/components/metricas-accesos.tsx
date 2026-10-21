import { Ban, Earth, KeyRound, LogIn, ShieldAlert } from "lucide-react"

import { TarjetaIndicador } from "@/features/auditoria/components/tarjeta-indicador"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"

import { N_MINIMO_TASAS } from "../catalogo"
import type { ResumenAccesos } from "../tipos"
import { BotonVerSospechosos } from "./boton-ver-sospechosos"

function plural(cantidad: number, singular: string, varios: string): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : varios}`
}

/** Tasa de fallo solo con muestra suficiente (docs/kpis.md §4: n mínimo de intentos). */
function detalleFallidos(resumen: ResumenAccesos): string {
  const intentos = resumen.exitosos.valor + resumen.fallidos.valor
  if (intentos === 0) return "Sin intentos de ingreso"
  if (resumen.tasaFallo === null || intentos < N_MINIMO_TASAS) {
    return `De ${plural(intentos, "intento", "intentos")} de ingreso`
  }
  return `${formatearPorcentaje(resumen.tasaFallo, 1)} de los intentos`
}

/**
 * Indicadores del periodo: ingresos, fallos, bloqueos del limitador, países
 * de origen y accesos sospechosos (resaltado y con atajo si hay alguno).
 */
export function MetricasAccesos({ resumen }: { resumen: ResumenAccesos }) {
  const { comparacion } = resumen
  const haySospechosos = resumen.sospechosos.valor > 0
  return (
    <section
      aria-label="Resumen de accesos"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
    >
      <TarjetaIndicador
        indice={0}
        titulo="Ingresos exitosos"
        tituloCorto="Exitosos"
        valor={resumen.exitosos.valor}
        Icono={LogIn}
        tono="exito"
        comparacion={{
          anterior: resumen.exitosos.anterior,
          texto: comparacion,
          subirEsBueno: null,
        }}
        serie={resumen.serieExitosos}
        detalle={plural(
          resumen.usuariosUnicos,
          "persona distinta",
          "personas distintas"
        )}
      />
      <TarjetaIndicador
        indice={1}
        titulo="Intentos fallidos"
        tituloCorto="Fallidos"
        valor={resumen.fallidos.valor}
        Icono={KeyRound}
        tono="peligro"
        comparacion={{
          anterior: resumen.fallidos.anterior,
          texto: comparacion,
          subirEsBueno: false,
        }}
        detalle={detalleFallidos(resumen)}
      />
      <TarjetaIndicador
        indice={2}
        titulo="Ingresos bloqueados"
        tituloCorto="Bloqueados"
        valor={resumen.bloqueados.valor}
        Icono={Ban}
        tono="aviso"
        comparacion={{
          anterior: resumen.bloqueados.anterior,
          texto: comparacion,
          subirEsBueno: false,
        }}
        detalle="Frenados por exceso de intentos"
      />
      <TarjetaIndicador
        indice={3}
        titulo="Países de origen"
        tituloCorto="Países"
        valor={resumen.paises}
        Icono={Earth}
        tono="info"
        detalle={
          resumen.paises === 0
            ? "Los ingresos no traen ubicación"
            : "Distintos, en ingresos exitosos"
        }
      />
      <TarjetaIndicador
        indice={4}
        titulo="Sospechosos"
        valor={resumen.sospechosos.valor}
        Icono={ShieldAlert}
        tono="aviso"
        alerta={haySospechosos}
        comparacion={{
          anterior: resumen.sospechosos.anterior,
          texto: comparacion,
          subirEsBueno: false,
        }}
        detalle={
          haySospechosos
            ? "País inusual o fallos repetidos"
            : "Sin alertas en el periodo"
        }
        accion={
          haySospechosos ? (
            <BotonVerSospechosos etiqueta="Ver los accesos sospechosos en el registro">
              Ver
            </BotonVerSospechosos>
          ) : null
        }
        className="col-span-2 xl:col-span-1"
      />
    </section>
  )
}
