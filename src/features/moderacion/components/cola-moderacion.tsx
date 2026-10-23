import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Hourglass,
  Megaphone,
  RotateCcw,
  Ticket,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import {
  formatoYPlataforma,
  type UrgenciaFechaLimite,
  urgenciaFechaLimite,
} from "@/features/ofertas/presentacion"
import { rutaOfertaInterna } from "@/features/ofertas/rutas"
import {
  InsigniaTono,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { contar, formatearFechaHoraFija } from "@/features/operacion/formato"
import {
  formatearCOP,
  formatearFechaHora,
  formatearNumero,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { rutaModeracion, TAMANO_PAGINA_MODERACION } from "../cola"
import { colaModeracion } from "../queries"
import type { OfertaEnCola } from "../tipos"

function Dato({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
      {icono}
      {children}
    </span>
  )
}

function FechaLimite({
  oferta,
  urgencia,
}: {
  oferta: OfertaEnCola
  urgencia: UrgenciaFechaLimite
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-muted-foreground">
        Aceptación hasta{" "}
        <time
          dateTime={oferta.fechaLimiteAceptacion}
          title={formatearFechaHora(oferta.fechaLimiteAceptacion)}
          className="cifras text-foreground"
        >
          {formatearFechaHoraFija(oferta.fechaLimiteAceptacion)}
        </time>
      </span>
      {urgencia.nivel !== "holgada" ? (
        <InsigniaTono
          tono={urgencia.tono}
          etiqueta={urgencia.texto}
          className="h-5 px-2 text-[0.6875rem]"
        />
      ) : null}
    </span>
  )
}

/** Una oferta de la cola: quién, qué, cuánto y para cuándo. */
export function TarjetaOfertaCola({
  oferta,
  ahora,
}: {
  oferta: OfertaEnCola
  ahora: Date
}) {
  const ruta = rutaOfertaInterna(oferta.id)
  const urgencia = urgenciaFechaLimite(oferta.fechaLimiteAceptacion, ahora)
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between",
        urgencia.nivel === "vencida" && "border-destructive/40",
        urgencia.nivel === "proxima" && "border-warning/45"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <MarcaPlataforma
          plataforma={oferta.plataforma}
          className="[&>span:first-child]:size-11 [&>span:first-child]:rounded-xl [&>span:first-child]:text-xs"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] font-semibold">
            <Link
              href={ruta}
              className="break-words underline-offset-4 hover:underline focus-visible:underline"
            >
              {oferta.titulo}
            </Link>
            {oferta.reenvio ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full border border-info/40 bg-info/8 px-2 text-[0.6875rem] font-medium text-info">
                <RotateCcw aria-hidden className="size-3" />
                Reenvío
              </span>
            ) : null}
          </h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Dato icono={<Building2 aria-hidden />}>
              <span className="sr-only">Anunciante: </span>
              {oferta.anunciante ?? "Anunciante"}
            </Dato>
            <Dato icono={<Megaphone aria-hidden />}>
              <span className="sr-only">Campaña: </span>
              {oferta.campana ?? "Campaña"}
            </Dato>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Dato icono={<ClipboardCheck aria-hidden />}>
              {formatoYPlataforma(oferta)}
            </Dato>
            <Dato icono={<Coins aria-hidden />}>
              <span className="cifras">
                {formatearCOP(oferta.presupuestoMaximo)}
              </span>
            </Dato>
            <Dato icono={<Ticket aria-hidden />}>
              <span className="cifras">
                {contar(oferta.cuposTotales, "cupo", "cupos")}
              </span>
            </Dato>
            {oferta.enviadaAt ? (
              <Dato icono={<Hourglass aria-hidden />}>
                <span title={formatearFechaHora(oferta.enviadaAt)}>
                  Enviada{" "}
                  <time dateTime={oferta.enviadaAt}>
                    {formatearRelativo(oferta.enviadaAt, ahora)}
                  </time>
                </span>
              </Dato>
            ) : null}
          </p>
          <FechaLimite oferta={oferta} urgencia={urgencia} />
        </div>
      </div>
      <EnlaceBoton
        href={ruta}
        size="lg"
        className="w-full shrink-0 sm:w-auto"
        aria-label={`Revisar ${oferta.titulo}`}
      >
        Revisar
        <ArrowRight data-icon="inline-end" aria-hidden />
      </EnlaceBoton>
    </article>
  )
}

/** Anterior / siguiente de la cola (casi siempre basta la primera página). */
export function PaginacionModeracion({
  pagina,
  total,
}: {
  pagina: number
  total: number
}) {
  const ultima = Math.max(1, Math.ceil(total / TAMANO_PAGINA_MODERACION))
  if (ultima <= 1) return null
  const desde = (pagina - 1) * TAMANO_PAGINA_MODERACION + 1
  const hasta = Math.min(total, pagina * TAMANO_PAGINA_MODERACION)

  return (
    <nav
      aria-label="Páginas de la cola de moderación"
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"
    >
      <p className="text-muted-foreground" aria-live="polite">
        <span className="cifras">
          {formatearNumero(desde)}–{formatearNumero(hasta)}
        </span>{" "}
        de <span className="cifras">{formatearNumero(total)}</span>
      </p>
      <div className="flex gap-2">
        {pagina > 1 ? (
          <EnlaceBoton
            href={rutaModeracion(pagina - 1)}
            variant="outline"
            size="lg"
            scroll={false}
          >
            <ChevronLeft data-icon="inline-start" aria-hidden />
            Anteriores
          </EnlaceBoton>
        ) : (
          <Button variant="outline" size="lg" disabled>
            <ChevronLeft data-icon="inline-start" aria-hidden />
            Anteriores
          </Button>
        )}
        {pagina < ultima ? (
          <EnlaceBoton
            href={rutaModeracion(pagina + 1)}
            variant="outline"
            size="lg"
            scroll={false}
          >
            Siguientes
            <ChevronRight data-icon="inline-end" aria-hidden />
          </EnlaceBoton>
        ) : (
          <Button variant="outline" size="lg" disabled>
            Siguientes
            <ChevronRight data-icon="inline-end" aria-hidden />
          </Button>
        )}
      </div>
    </nav>
  )
}

/**
 * Cola de ofertas en revisión (ADM-005), la enviada hace más tiempo primero,
 * con la fecha límite destacada si está cerca o ya pasó.
 */
export async function ColaModeracion({ pagina }: { pagina: number }) {
  const cola = await colaModeracion(pagina)
  const ahora = new Date()
  return (
    <section aria-labelledby="cola-moderacion" className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="cola-moderacion" className="text-base font-semibold">
          En revisión
        </h2>
        <p className="text-sm text-muted-foreground">
          {cola.total > 0
            ? `${contar(cola.total, "oferta espera", "ofertas esperan")} tu decisión, la enviada hace más tiempo primero.`
            : "Las ofertas que los anunciantes envíen a revisión aparecerán aquí."}
        </p>
      </div>
      {cola.filas.length === 0 ? (
        <EstadoVacio
          icono={ClipboardCheck}
          titulo="No hay ofertas por moderar"
          descripcion="Cuando un anunciante envíe una oferta a revisión, aparecerá aquí con su fecha límite de aceptación."
        />
      ) : (
        <ol aria-label="Ofertas por moderar" className="flex flex-col gap-3">
          {cola.filas.map((oferta) => (
            <li key={oferta.id}>
              <TarjetaOfertaCola oferta={oferta} ahora={ahora} />
            </li>
          ))}
        </ol>
      )}
      <PaginacionModeracion pagina={cola.pagina} total={cola.total} />
    </section>
  )
}
