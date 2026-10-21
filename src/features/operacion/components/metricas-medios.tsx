import {
  BadgeCheck,
  Ban,
  Hourglass,
  RadioTower,
  Target,
  UsersRound,
} from "lucide-react"
import type { Route } from "next"

import { formatearNumero, formatearPorcentaje } from "@/lib/format"

import { estadoTablaMedios } from "../estado-tablas"
import { contar } from "../formato"
import { RUTAS_OPERACION } from "../rutas"
import type { ResumenMedios } from "../tipos"
import { RejillaResumen, TarjetaResumen } from "./tarjeta-resumen"

function filtrado(estado: "PENDIENTE" | "SUSPENDIDO" | "VERIFICADO"): Route {
  return estadoTablaMedios.serializar(RUTAS_OPERACION.medios, {
    estado: [estado],
  }) as Route
}

/**
 * Indicadores de la red de medios (todos los visibles, sin los filtros de la
 * tabla): tamaño, verificación por nivel, cola de verificación, suspendidos,
 * cuentas verificadas y cumplimiento ponderado por número de asignaciones.
 */
export function MetricasMedios({ resumen }: { resumen: ResumenMedios }) {
  const [n1, n2, n3] = resumen.porNivel
  const proporcionVerificados =
    resumen.total > 0 ? resumen.verificados / resumen.total : null

  return (
    <RejillaResumen etiqueta="Resumen de la red de medios" columnas={6}>
      <TarjetaResumen
        indice={0}
        titulo="Medios"
        valor={resumen.total}
        icono={RadioTower}
        detalle={
          resumen.rechazados > 0
            ? contar(
                resumen.rechazados,
                "rechazado incluido",
                "rechazados incluidos"
              )
            : "Registrados en la red"
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
            ? "Aún sin medios verificados"
            : `${formatearPorcentaje(proporcionVerificados, 0)} de la red`
        }
      >
        {resumen.verificados > 0 ? (
          <span className="flex flex-col gap-1.5">
            <span
              aria-hidden
              className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              {[n1, n2, n3].map((cantidad, indice) => (
                <span
                  key={indice}
                  style={{ width: `${(cantidad / resumen.total) * 100}%` }}
                  className={
                    ["bg-primary/45", "bg-primary/75", "bg-primary"][indice]
                  }
                />
              ))}
            </span>
            <span className="text-[0.6875rem] cifras whitespace-nowrap text-muted-foreground">
              N1 {formatearNumero(n1)} · N2 {formatearNumero(n2)} · N3{" "}
              {formatearNumero(n3)}
            </span>
          </span>
        ) : null}
      </TarjetaResumen>
      <TarjetaResumen
        indice={2}
        titulo="En verificación"
        valor={resumen.pendientes}
        icono={Hourglass}
        tono="info"
        href={filtrado("PENDIENTE")}
        detalle={
          resumen.pendientes > 0 ? "Esperan revisión de AMO" : "Cola al día"
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
          resumen.suspendidos > 0 ? "No ven ofertas por ahora" : "Ninguno"
        }
      />
      <TarjetaResumen
        indice={4}
        titulo="Cuentas verificadas"
        valor={resumen.cuentasVerificadas}
        icono={UsersRound}
        detalle="Con seguidores comprobados por AMO"
      />
      <TarjetaResumen
        indice={5}
        titulo="Cumplimiento"
        valor={resumen.cumplimiento.valor}
        formato="porcentaje"
        icono={Target}
        tono={
          resumen.cumplimiento.valor !== null &&
          resumen.cumplimiento.valor < 0.8
            ? "aviso"
            : "exito"
        }
        detalle={
          resumen.cumplimiento.n > 0
            ? `Ponderado por ${contar(resumen.cumplimiento.n, "asignación", "asignaciones")}`
            : "Sin asignaciones con desenlace"
        }
      />
    </RejillaResumen>
  )
}
