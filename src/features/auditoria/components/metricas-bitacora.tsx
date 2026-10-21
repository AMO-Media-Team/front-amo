import {
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react"

import { formatearNumero } from "@/lib/format"

import type { ResumenBitacora } from "../tipos"
import { BotonVerGrupo } from "./boton-ver-grupo"
import { TarjetaIndicador } from "./tarjeta-indicador"

function promedioDiario(
  serie: readonly number[],
  total: number
): string | null {
  if (serie.length === 0) return null
  const promedio = total / serie.length
  return `${formatearNumero(promedio, promedio < 10 ? 1 : 0)} al día en promedio`
}

/**
 * Indicadores de la bitácora en el periodo: volumen, personas que actuaron,
 * cambios de configuración y eventos sensibles, con su comparación contra el
 * periodo anterior. Los dos últimos llevan a sus eventos filtrados.
 */
export function MetricasBitacora({ resumen }: { resumen: ResumenBitacora }) {
  const { comparacion } = resumen
  return (
    <section
      aria-label="Resumen de la bitácora"
      className="grid grid-cols-2 gap-3 xl:grid-cols-4"
    >
      <TarjetaIndicador
        indice={0}
        titulo="Eventos en el periodo"
        tituloCorto="Eventos"
        valor={resumen.eventos.valor}
        Icono={ScrollText}
        tono="marca"
        comparacion={{
          anterior: resumen.eventos.anterior,
          texto: comparacion,
          subirEsBueno: null,
        }}
        serie={resumen.serieDiaria}
        detalle={
          promedioDiario(resumen.serieDiaria, resumen.eventos.valor) ??
          "Todos los orígenes"
        }
      />
      <TarjetaIndicador
        indice={1}
        titulo="Actores únicos"
        tituloCorto="Actores"
        valor={resumen.actoresUnicos}
        Icono={UsersRound}
        tono="info"
        detalle={
          resumen.actorPrincipal
            ? `Más activo: ${resumen.actorPrincipal.nombre} (${formatearNumero(resumen.actorPrincipal.eventos)})`
            : "Sin acciones de personas en el periodo"
        }
      />
      <TarjetaIndicador
        indice={2}
        titulo="Cambios de configuración"
        tituloCorto="Configuración"
        valor={resumen.configuracion.valor}
        Icono={SlidersHorizontal}
        tono="marca"
        comparacion={{
          anterior: resumen.configuracion.anterior,
          texto: comparacion,
          subirEsBueno: null,
        }}
        detalle="Parámetros, tarifas, roles y permisos"
        accion={
          resumen.configuracion.valor > 0 ? (
            <BotonVerGrupo grupo="CONFIGURACION">Ver</BotonVerGrupo>
          ) : null
        }
      />
      <TarjetaIndicador
        indice={3}
        titulo="Eventos sensibles"
        tituloCorto="Sensibles"
        valor={resumen.sensibles.valor}
        Icono={ShieldAlert}
        tono="aviso"
        comparacion={{
          anterior: resumen.sensibles.anterior,
          texto: comparacion,
          subirEsBueno: false,
        }}
        detalle="Exportaciones, datos revelados y borrados"
        accion={
          resumen.sensibles.valor > 0 ? (
            <BotonVerGrupo grupo="SENSIBLES">Ver</BotonVerGrupo>
          ) : null
        }
      />
    </section>
  )
}
