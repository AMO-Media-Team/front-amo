import {
  CalendarClock,
  Info,
  Megaphone,
  MessageSquareWarning,
  Plus,
  Ticket,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { useId } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { rutaAsistente } from "@/features/asistente-oferta/rutas"
import { rutaOfertaAnunciante } from "@/features/ofertas/rutas"
import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { ESTADOS_OFERTA } from "@/features/operacion/estados"
import { formatearFechaHoraFija } from "@/features/operacion/formato"
import {
  formatearCOP,
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { ordenarOfertas } from "../reglas"
import type { EstadoCampana, OfertaDeCampana } from "../tipos"

const ESTADOS_SIN_PLAZO = new Set(["VENCIDA", "CERRADA", "CANCELADA"])

/** Fecha límite de aceptación con su distancia, solo mientras importa. */
function LimiteAceptacion({
  oferta,
  ahora,
}: {
  oferta: OfertaDeCampana
  ahora: Date
}) {
  const vencida = Date.parse(oferta.fechaLimiteAceptacion) <= ahora.getTime()
  const conPlazo = !ESTADOS_SIN_PLAZO.has(oferta.estado)
  return (
    <span className="inline-flex items-start gap-1.5 text-xs text-muted-foreground">
      <CalendarClock aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>
        Aceptación hasta{" "}
        <time
          dateTime={oferta.fechaLimiteAceptacion}
          title={formatearFechaHora(oferta.fechaLimiteAceptacion)}
          className="cifras text-foreground"
        >
          {formatearFechaHoraFija(oferta.fechaLimiteAceptacion)}
        </time>
        {conPlazo ? (
          <span className={cn(vencida && "font-medium text-destructive")}>
            {" "}
            ·{" "}
            {vencida
              ? "ya pasó"
              : formatearRelativo(oferta.fechaLimiteAceptacion, ahora)}
          </span>
        ) : null}
      </span>
    </span>
  )
}

function Cifras({ oferta }: { oferta: OfertaDeCampana }) {
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Wallet aria-hidden className="size-3.5 shrink-0" />
        <span>
          Presupuesto{" "}
          <span className="font-medium cifras text-foreground">
            {formatearCOP(oferta.presupuestoMaximo)}
          </span>
          {oferta.presupuestoComprometido > 0 ? (
            <span className="cifras">
              {" "}
              · {formatearCOP(oferta.presupuestoComprometido)} comprometidos
            </span>
          ) : null}
        </span>
      </span>
      {oferta.cuposTotales > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <Ticket aria-hidden className="size-3.5 shrink-0" />
          <span className="cifras">
            <span className="font-medium text-foreground">
              {formatearNumero(oferta.cuposOcupados)}
            </span>{" "}
            de {formatearNumero(oferta.cuposTotales)}{" "}
            {oferta.cuposTotales === 1 ? "cupo tomado" : "cupos tomados"}
          </span>
        </span>
      ) : null}
    </span>
  )
}

function TituloOferta({
  oferta,
  campanaId,
}: {
  oferta: OfertaDeCampana
  campanaId: string
}) {
  return (
    <span className="flex min-w-0 items-start gap-2.5">
      <MarcaPlataforma plataforma={oferta.plataforma} className="mt-0.5" />
      <span className="flex min-w-0 flex-col">
        <Link
          href={rutaOfertaAnunciante(campanaId, oferta.id)}
          className="font-medium break-words text-foreground underline-offset-4 hover:underline focus-visible:underline"
        >
          {oferta.titulo}
        </Link>
        <span className="text-xs text-muted-foreground">
          {oferta.formato ?? "Formato sin nombre"}
        </span>
      </span>
    </span>
  )
}

/** Oferta devuelta por la moderación: su comentario y cómo atenderla. */
function OfertaDevuelta({
  oferta,
  campanaId,
  puedeEditar,
}: {
  oferta: OfertaDeCampana
  campanaId: string
  puedeEditar: boolean
}) {
  const idTitulo = useId()
  return (
    <li>
      <article
        aria-labelledby={idTitulo}
        className="flex flex-col gap-3 rounded-xl border border-warning/45 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--warning)_8%,var(--card))_0%,var(--card)_65%)] p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span id={idTitulo} className="min-w-0">
            <TituloOferta oferta={oferta} campanaId={campanaId} />
          </span>
          <InsigniaEstado catalogo={ESTADOS_OFERTA} estado={oferta.estado} />
        </div>
        <figure className="flex gap-2.5 rounded-lg border bg-background/60 p-3">
          <MessageSquareWarning
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <figcaption className="text-xs font-medium text-muted-foreground">
              Comentario de la moderación
              {oferta.devueltaAt
                ? ` · ${formatearFecha(oferta.devueltaAt, "largo")}`
                : ""}
            </figcaption>
            <blockquote className="text-sm break-words whitespace-pre-line">
              {oferta.comentarioModeracion?.trim() ||
                "AMO no dejó un comentario; revisa la oferta antes de reenviarla."}
            </blockquote>
          </div>
        </figure>
        <div className="flex flex-wrap gap-2">
          {puedeEditar ? (
            <EnlaceBoton href={rutaAsistente(campanaId, oferta.id)} size="sm">
              Ajustar y reenviar
            </EnlaceBoton>
          ) : null}
          <EnlaceBoton
            href={rutaOfertaAnunciante(campanaId, oferta.id)}
            variant="outline"
            size="sm"
          >
            Ver la oferta
          </EnlaceBoton>
        </div>
      </article>
    </li>
  )
}

function FilaOferta({
  oferta,
  campanaId,
  ahora,
}: {
  oferta: OfertaDeCampana
  campanaId: string
  ahora: Date
}) {
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3.5 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-6">
      <div className="flex min-w-0 flex-col gap-2">
        <TituloOferta oferta={oferta} campanaId={campanaId} />
        <span className="flex flex-col gap-1 pl-7.5">
          <LimiteAceptacion oferta={oferta} ahora={ahora} />
          <Cifras oferta={oferta} />
        </span>
      </div>
      <InsigniaEstado
        catalogo={ESTADOS_OFERTA}
        estado={oferta.estado}
        className="ml-7.5 md:ml-0 md:justify-self-end"
      />
    </li>
  )
}

/**
 * Pestaña «Ofertas» de la campaña: las devueltas por la moderación arriba,
 * con su comentario y el camino para atenderlas, y luego las demás (formato,
 * estado, fecha límite y presupuesto) enlazadas a su ficha.
 */
export function OfertasCampana({
  campana,
  ofertas,
  puedeCrear,
  ahora,
}: {
  campana: { id: string; estado: EstadoCampana }
  ofertas: readonly OfertaDeCampana[]
  /** `ofertas.gestionar_propias` y la campaña en borrador o activa. */
  puedeCrear: boolean
  ahora: Date
}) {
  const devueltas = ordenarOfertas(
    ofertas.filter((oferta) => oferta.estado === "DEVUELTA")
  )
  const demas = ordenarOfertas(
    ofertas.filter((oferta) => oferta.estado !== "DEVUELTA")
  )
  const botonNueva = puedeCrear ? (
    <EnlaceBoton href={rutaAsistente(campana.id)} className="max-sm:w-full">
      <Plus data-icon="inline-start" aria-hidden />
      Nueva oferta
    </EnlaceBoton>
  ) : null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold">
            Ofertas de la campaña
          </h2>
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
            Cada oferta es un formato en una red social, con sus cupos por
            franja y su presupuesto máximo. Los medios elegibles la toman cuando
            AMO la publica.
          </p>
        </div>
        {botonNueva}
      </div>

      {campana.estado === "BORRADOR" && puedeCrear ? (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          Puedes armar las ofertas desde ya; las enviarás a revisión cuando
          actives la campaña.
        </p>
      ) : null}

      {ofertas.length === 0 ? (
        <EstadoVacio
          icono={Megaphone}
          titulo="Esta campaña aún no tiene ofertas"
          descripcion={
            puedeCrear
              ? "Elige la red social y el formato, a quién quieres llegar, cuándo y con cuánto presupuesto. El sistema calcula el precio por medio."
              : "Las ofertas definen el formato, los cupos por franja y el presupuesto que los medios pueden tomar."
          }
        >
          {puedeCrear ? (
            <EnlaceBoton href={rutaAsistente(campana.id)}>
              <Plus data-icon="inline-start" aria-hidden />
              Crear la primera oferta
            </EnlaceBoton>
          ) : null}
        </EstadoVacio>
      ) : null}

      {devueltas.length > 0 ? (
        <section aria-label="Ofertas devueltas" className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquareWarning aria-hidden className="size-4 text-warning" />
            {devueltas.length === 1
              ? "AMO te devolvió una oferta para ajustarla"
              : `AMO te devolvió ${formatearNumero(devueltas.length)} ofertas para ajustarlas`}
          </h3>
          <ul className="flex flex-col gap-3">
            {devueltas.map((oferta) => (
              <OfertaDevuelta
                key={oferta.id}
                oferta={oferta}
                campanaId={campana.id}
                puedeEditar={puedeCrear}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {demas.length > 0 ? (
        <section
          aria-label={devueltas.length > 0 ? "Las demás ofertas" : "Ofertas"}
          className="flex flex-col gap-3"
        >
          {devueltas.length > 0 ? (
            <h3 className="text-sm font-semibold">Las demás ofertas</h3>
          ) : null}
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {demas.map((oferta) => (
              <FilaOferta
                key={oferta.id}
                oferta={oferta}
                campanaId={campana.id}
                ahora={ahora}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
