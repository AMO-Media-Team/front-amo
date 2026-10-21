import {
  ArrowRight,
  ChartNoAxesColumn,
  CircleCheck,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import {
  Bandera,
  InsigniaSospecha,
} from "@/features/accesos/components/distintivos"
import type { AccesoFila } from "@/features/accesos/tipos"
import {
  construirHref,
  RUTAS_INSIGHTS,
} from "@/features/dashboard/insights/rutas"
import type { MetricasAtipicas } from "@/features/dashboard/insights/tipos"
import { formatearNumero, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { TarjetaPanel } from "../../components/tarjeta-panel"

/** Lo que el panel muestra de cada acceso sospechoso. */
export type AccesoSospechosoReciente = Pick<
  AccesoFila,
  "id" | "at" | "paisIso2" | "pais" | "bandera" | "ciudad" | "motivoSospecha"
> & { usuario: Pick<NonNullable<AccesoFila["usuario"]>, "nombre"> | null }

export interface AlertaAccesos {
  total: number
  recientes: readonly AccesoSospechosoReciente[]
  href: Route
}

/** Accesos sospechosos que se listan (el total va en la cabecera). */
const ACCESOS_VISIBLES = 3

/** El mismo destino que la acción del insight de métricas atípicas (regla 5). */
const HREF_METRICAS_ATIPICAS = construirHref(RUTAS_INSIGHTS.asignaciones, {
  alerta: "metricas",
})

/** Una familia de alertas: icono con tono, título, cantidad y su enlace. */
function Seccion({
  icono: Icono,
  titulo,
  cantidad,
  tono,
  enlace,
  children,
}: {
  icono: typeof ShieldAlert
  titulo: string
  cantidad: number
  tono: "aviso" | "peligro"
  enlace: { href: Route; texto: string }
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5" aria-label={titulo}>
      <p className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            tono === "peligro"
              ? "bg-destructive/12 text-destructive"
              : "bg-warning/10 text-warning"
          )}
        >
          <Icono className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-[0.8125rem] font-semibold">
          {titulo}
        </span>
        <span className="text-lg leading-none font-semibold cifras">
          {formatearNumero(cantidad)}
        </span>
      </p>
      {children}
      <Link
        href={enlace.href}
        className="group/enlace inline-flex w-fit items-center gap-1 rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:anillo-foco"
      >
        {enlace.texto}
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform duration-200 group-hover/enlace:translate-x-0.5 motion-reduce:transition-none"
        />
      </Link>
    </section>
  )
}

/**
 * Alertas que piden acción: accesos sospechosos del periodo (`accesos.ver`)
 * y métricas con alertas de integridad esperando validación
 * (`asignaciones.ver`). Cada familia lleva a su pantalla. Sin alertas, lo
 * dice en positivo.
 */
export function AlertasPanel({
  accesos,
  atipicas,
  ahora,
  className,
}: {
  accesos: AlertaAccesos | null
  atipicas: MetricasAtipicas | null
  ahora: Date
  className?: string
}) {
  const hayAccesos = (accesos?.total ?? 0) > 0
  const hayAtipicas = (atipicas?.total ?? 0) > 0
  return (
    <TarjetaPanel
      titulo="Alertas"
      descripcion="Seguridad e integridad de los datos."
      icono={TriangleAlert}
      className={className}
    >
      {!hayAccesos && !hayAtipicas ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-background/40 p-6 text-center">
          <span className="grid size-10 place-items-center rounded-xl bg-success/12 text-success">
            <CircleCheck aria-hidden className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">Sin alertas</p>
            <p className="max-w-56 text-[0.8125rem] text-muted-foreground">
              {accesos && atipicas
                ? "Ningún acceso sospechoso ni métrica atípica pendiente."
                : accesos
                  ? "Ningún acceso sospechoso en el periodo."
                  : "Ninguna métrica atípica pendiente de validar."}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {hayAccesos && accesos ? (
            <Seccion
              icono={ShieldAlert}
              titulo="Accesos sospechosos en el periodo"
              cantidad={accesos.total}
              tono="peligro"
              enlace={{ href: accesos.href, texto: "Revisar los accesos" }}
            >
              <ul className="flex flex-col divide-y rounded-lg border">
                {accesos.recientes.slice(0, ACCESOS_VISIBLES).map((acceso) => (
                  <li
                    key={acceso.id}
                    className="flex items-start gap-2.5 px-3 py-2 text-[0.8125rem]"
                  >
                    <Bandera
                      bandera={acceso.bandera}
                      iso2={acceso.paisIso2}
                      className="mt-0.5"
                    />
                    {/* El motivo comparte línea con el nombre; lugar y hora
                        van debajo a todo el ancho (en la columna angosta se
                        recortaban los dos). */}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {acceso.usuario?.nombre ?? "Correo sin cuenta"}
                        </span>
                        <InsigniaSospecha motivo={acceso.motivoSospecha} />
                      </span>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        {[acceso.ciudad, acceso.pais]
                          .filter(Boolean)
                          .join(", ") || "Ubicación desconocida"}{" "}
                        · {formatearRelativo(acceso.at, ahora)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Seccion>
          ) : null}
          {hayAtipicas && atipicas ? (
            <Seccion
              icono={ChartNoAxesColumn}
              titulo="Métricas atípicas por validar"
              cantidad={atipicas.total}
              tono="aviso"
              enlace={{
                href: HREF_METRICAS_ATIPICAS,
                texto: "Revisar la cola de validación",
              }}
            >
              <p className="text-xs text-muted-foreground">
                {[
                  atipicas.desviacion > 0
                    ? `${formatearNumero(atipicas.desviacion)} se desvían del histórico`
                    : null,
                  atipicas.multiplo > 0
                    ? `${formatearNumero(atipicas.multiplo)} superan el alcance esperado`
                    : null,
                  atipicas.masAntiguaAt
                    ? `la más antigua llegó ${formatearRelativo(atipicas.masAntiguaAt, ahora)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Seccion>
          ) : null}
        </div>
      )}
    </TarjetaPanel>
  )
}

/** Enlace del registro de accesos filtrado a los sospechosos del periodo. */
export function hrefAccesosSospechosos(periodo: {
  desde: string
  hasta: string
}): Route {
  const busqueda = new URLSearchParams({
    sospechoso: "SI",
    periodo: "personalizado",
    desde: periodo.desde,
    hasta: periodo.hasta,
  })
  return `/administracion/accesos?${busqueda}` as Route
}
