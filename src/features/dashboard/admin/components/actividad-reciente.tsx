import { History } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { IconoAccion } from "@/features/auditoria/components/distintivos"
import type { EventoBitacora } from "@/features/auditoria/tipos"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"

import { MarcoEsqueleto } from "../../components/esqueletos-panel"
import { TarjetaPanel } from "../../components/tarjeta-panel"

/** Lo que el panel muestra de cada evento de la bitácora. */
export type EventoReciente = Pick<
  EventoBitacora,
  "id" | "at" | "accion" | "tono" | "titulo" | "resumen" | "ruta"
> & { actor: Pick<EventoBitacora["actor"], "nombre"> }

/** Eventos que muestra el panel (el resto, en la bitácora). */
export const EVENTOS_VISIBLES = 6

/**
 * Los eventos bajan por columnas (1-2-3 en la primera, 4-5-6 en la segunda…):
 * el orden cronológico se lee de arriba abajo, como en la lista del móvil.
 * Dos columnas desde 42 rem de panel y tres desde 64 rem (cada una ≥ 300 px:
 * con menos, el título se parte y el resumen se recorta a unas letras).
 */
const REJILLA =
  "grid gap-x-8 gap-y-4 @2xl/panel:grid-flow-col @2xl/panel:grid-cols-2 @2xl/panel:grid-rows-3 @5xl/panel:grid-cols-3 @5xl/panel:grid-rows-2"

/** Últimos cambios de la bitácora: quién hizo qué y cuándo. */
export function ActividadReciente({
  eventos,
  ahora,
  className,
}: {
  eventos: readonly EventoReciente[]
  ahora: Date
  className?: string
}) {
  return (
    <TarjetaPanel
      titulo="Actividad reciente"
      descripcion="Los últimos cambios registrados en la bitácora."
      icono={History}
      className={className}
      enlace={{
        href: "/administracion/auditoria" as Route,
        texto: "Ver la bitácora",
      }}
    >
      {eventos.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={History}
          titulo="Sin actividad reciente"
          descripcion="Los cambios de usuarios, roles y configuración aparecerán aquí."
          className="h-full py-6"
        />
      ) : (
        <ol className={REJILLA}>
          {eventos.slice(0, EVENTOS_VISIBLES).map((evento) => {
            const contenido = (
              <>
                <span className="text-[0.8125rem] leading-snug font-medium">
                  {evento.titulo}
                </span>
                <span
                  className="truncate text-xs text-muted-foreground"
                  title={evento.resumen ?? undefined}
                >
                  {evento.actor.nombre}
                  {evento.resumen ? ` · ${evento.resumen}` : ""}
                </span>
              </>
            )
            return (
              <li key={evento.id} className="flex min-w-0 gap-3">
                <IconoAccion
                  accion={evento.accion}
                  tono={evento.tono}
                  tamano="sm"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {evento.ruta ? (
                    <Link
                      href={evento.ruta as Route}
                      className="flex min-w-0 flex-col gap-0.5 rounded-sm focus-visible:anillo-foco hover:[&>span:first-child]:text-primary"
                    >
                      {contenido}
                    </Link>
                  ) : (
                    contenido
                  )}
                </div>
                <time
                  dateTime={evento.at}
                  title={formatearFechaHora(evento.at)}
                  className="shrink-0 pt-0.5 text-[0.6875rem] whitespace-nowrap text-muted-foreground"
                >
                  {formatearRelativo(evento.at, ahora)}
                </time>
              </li>
            )
          })}
        </ol>
      )}
    </TarjetaPanel>
  )
}

/** Fallback fiel de `ActividadReciente`: la misma rejilla de eventos. */
export function EsqueletoActividadReciente({
  className,
}: {
  className?: string
}) {
  return (
    <MarcoEsqueleto className={className}>
      <div className={REJILLA}>
        {Array.from({ length: EVENTOS_VISIBLES }, (_, i) => (
          <div key={i} className="flex min-w-0 items-start gap-3">
            <Esqueleto className="size-7 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Esqueleto className="h-3.5 w-3/5" />
              <Esqueleto className="h-2.5 w-4/5" />
            </div>
            <Esqueleto className="h-3 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </MarcoEsqueleto>
  )
}
