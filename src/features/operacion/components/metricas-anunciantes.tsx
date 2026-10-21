import { BadgeCheck, Ban, Building2, Globe2, Hourglass } from "lucide-react"
import type { Route } from "next"

import { formatearPorcentaje } from "@/lib/format"

import type { EstadoAnunciante } from "../estados"
import { estadoTablaAnunciantes } from "../estado-tablas"
import { contar } from "../formato"
import { RUTAS_OPERACION } from "../rutas"
import type { ResumenAnunciantes } from "../tipos"
import { RejillaResumen, TarjetaResumen } from "./tarjeta-resumen"

function filtrado(estado: EstadoAnunciante): Route {
  return estadoTablaAnunciantes.serializar(RUTAS_OPERACION.anunciantes, {
    estado: [estado],
  }) as Route
}

/** Plural sencillo para las líneas de apoyo ("1 país", "3 países"). */
/**
 * Indicadores de los anunciantes visibles (sin los filtros de la tabla):
 * tamaño de la cartera de clientes, verificación, cola de revisión,
 * suspendidos y presencia internacional.
 */
export function MetricasAnunciantes({
  resumen,
}: {
  resumen: ResumenAnunciantes
}) {
  const proporcionVerificados =
    resumen.total > 0 ? resumen.verificados / resumen.total : null

  return (
    <RejillaResumen etiqueta="Resumen de anunciantes" columnas={5}>
      <TarjetaResumen
        indice={0}
        titulo="Anunciantes"
        valor={resumen.total}
        icono={Building2}
        detalle={
          resumen.total > 0
            ? `De ${contar(resumen.paises, "país", "países")}`
            : "Aún no hay empresas registradas"
        }
      />
      <TarjetaResumen
        indice={1}
        titulo="Verificados"
        valor={resumen.verificados}
        icono={BadgeCheck}
        tono="exito"
        href={filtrado("VERIFICADO")}
        detalle={
          proporcionVerificados === null
            ? "Pueden publicar campañas"
            : `${formatearPorcentaje(proporcionVerificados, 0)} del total · pueden publicar`
        }
      />
      <TarjetaResumen
        indice={2}
        titulo="En verificación"
        valor={resumen.pendientes}
        icono={Hourglass}
        tono="info"
        href={filtrado("PENDIENTE")}
        alerta={resumen.pendientes > 0}
        detalle={
          resumen.pendientes > 0 ? "Documentos por revisar" : "Cola al día"
        }
      />
      <TarjetaResumen
        indice={3}
        titulo="Suspendidos"
        valor={resumen.suspendidos}
        icono={Ban}
        tono={resumen.suspendidos > 0 ? "aviso" : "neutro"}
        href={filtrado("SUSPENDIDO")}
        detalle={
          resumen.rechazados > 0
            ? `${contar(resumen.rechazados, "rechazado", "rechazados")} aparte`
            : resumen.suspendidos > 0
              ? "No pueden publicar ofertas"
              : "Ninguno"
        }
      />
      <TarjetaResumen
        indice={4}
        titulo="Internacionales"
        valor={resumen.internacionales}
        icono={Globe2}
        detalle={
          resumen.internacionales > 0
            ? "Con sede fuera de Colombia"
            : "Todos registrados en Colombia"
        }
      />
    </RejillaResumen>
  )
}
