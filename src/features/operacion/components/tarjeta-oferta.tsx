import {
  CalendarClock,
  ChevronDown,
  Coins,
  MessageSquareWarning,
  Target,
  Ticket,
} from "lucide-react"
import type { ReactNode } from "react"

import {
  formatearCOP,
  formatearCOPCompacto,
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { proporcion } from "../calculos"
import { CORTES, ESTADOS_OFERTA } from "../estados"
import {
  contar,
  formatearFechaHoraFija,
  formatearRangoCompacto,
} from "../formato"
import type { OfertaDetalle } from "../tipos"
import { BarraLlenado, InsigniaEstado, MarcaPlataforma } from "./distintivos"

function Bloque({
  titulo,
  icono: Icono,
  children,
  className,
}: {
  titulo: string
  icono: typeof Ticket
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3", className)}>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icono aria-hidden className="size-3.5" />
        {titulo}
      </h4>
      {children}
    </section>
  )
}

function CuposPorFranja({ oferta }: { oferta: OfertaDetalle }) {
  const { cupos } = oferta
  if (cupos.franjas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin cupos definidos.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {cupos.franjas.map((franja) => {
          const llenado = proporcion(franja.ocupados, franja.totales)
          return (
            <li key={franja.franjaId} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="font-medium">{franja.clave}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {franja.nombre} seguidores
                  </span>
                </span>
                <span className="shrink-0 cifras">
                  <span className="font-medium">
                    {formatearNumero(franja.ocupados)}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    / {formatearNumero(franja.totales)}
                  </span>
                </span>
              </span>
              <BarraLlenado
                fraccion={llenado}
                tono={llenado === 1 ? "exito" : "primario"}
                className="h-2"
              />
            </li>
          )
        })}
      </ul>
      <p className="text-xs cifras text-muted-foreground">
        {formatearNumero(cupos.ocupados)} de {formatearNumero(cupos.totales)}{" "}
        cupos tomados
        {cupos.llenado !== null
          ? ` (${formatearPorcentaje(cupos.llenado, 0)})`
          : ""}{" "}
        · {formatearNumero(cupos.libres)}{" "}
        {cupos.libres === 1 ? "libre" : "libres"}
      </p>
    </div>
  )
}

function Presupuesto({ oferta }: { oferta: OfertaDetalle }) {
  const uso = proporcion(
    oferta.presupuestoComprometido,
    oferta.presupuestoMaximo
  )
  // Presupuesto casi agotado con cupos libres: los que faltan pueden no caber.
  const puedeFaltar = uso !== null && uso >= 0.95 && oferta.cupos.libres > 0
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline justify-between gap-3">
        <span
          className="font-heading text-xl font-semibold cifras"
          title={formatearCOP(oferta.presupuestoComprometido)}
        >
          {formatearCOPCompacto(oferta.presupuestoComprometido)}
        </span>
        <span className="text-xs cifras text-muted-foreground">
          de {formatearCOP(oferta.presupuestoMaximo)}
        </span>
      </p>
      <BarraLlenado
        fraccion={uso}
        tono={puedeFaltar ? "aviso" : "info"}
        className="h-2"
      />
      <p className="text-xs text-muted-foreground">
        {formatearPorcentaje(uso, 0)} comprometido · cada medio hasta{" "}
        {formatearPorcentaje(oferta.topePorMedio, 0)} del máximo
      </p>
      {puedeFaltar ? (
        <p className="text-xs text-warning">
          Casi agotado: puede no alcanzar para los cupos libres.
        </p>
      ) : null}
    </div>
  )
}

function Ventana({ oferta }: { oferta: OfertaDetalle }) {
  const filas: {
    etiqueta: string
    valor: ReactNode
    titulo?: string
    ancha?: boolean
  }[] = [
    {
      etiqueta: "Publicación",
      valor: formatearRangoCompacto(oferta.ventanaInicio, oferta.ventanaFin),
      titulo: `${formatearFechaHora(oferta.ventanaInicio)} – ${formatearFechaHora(oferta.ventanaFin)}`,
      ancha: true,
    },
    {
      etiqueta: "Aceptación hasta",
      valor: formatearFechaHoraFija(oferta.fechaLimiteAceptacion),
      ancha: true,
    },
    {
      etiqueta: "Permanencia",
      valor: `${formatearNumero(oferta.permanenciaDias)} ${
        oferta.permanenciaDias === 1 ? "día" : "días"
      }`,
      titulo: "Tiempo mínimo que la publicación debe seguir visible",
    },
    {
      etiqueta: "Cortes de métricas",
      valor:
        oferta.cortes.length > 0
          ? oferta.cortes.map((corte) => CORTES[corte].corta).join(" · ")
          : "—",
    },
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
      {filas.map(({ etiqueta, valor, titulo, ancha }) => (
        <div
          key={etiqueta}
          className={cn("flex min-w-0 flex-col gap-0.5", ancha && "col-span-2")}
        >
          <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
          <dd className="min-w-0 cifras" title={titulo}>
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Chips({
  elementos,
  vacio,
}: {
  elementos: readonly string[]
  vacio: string
}) {
  if (elementos.length === 0)
    return <span className="text-muted-foreground">{vacio}</span>
  return (
    <span className="flex flex-wrap gap-1">
      {elementos.map((elemento) => (
        <span
          key={elemento}
          className="rounded-full border bg-muted/50 px-2 py-0.5 text-xs"
        >
          {elemento}
        </span>
      ))}
    </span>
  )
}

function Segmentacion({ oferta }: { oferta: OfertaDetalle }) {
  const { segmentacion: s } = oferta
  const territorio = [
    ...s.departamentos.map((departamento) => departamento.nombre),
    ...s.municipios.map(
      (municipio) => `${municipio.nombre} (${municipio.departamento})`
    ),
  ]
  const condiciones = [
    s.seguidoresMinimos !== null
      ? `Desde ${formatearNumero(s.seguidoresMinimos)} seguidores`
      : null,
    s.exclusividadDias
      ? `Exclusividad de ${contar(s.exclusividadDias, "día", "días")}`
      : null,
    s.mediosExcluidos > 0
      ? `${formatearNumero(s.mediosExcluidos)} ${s.mediosExcluidos === 1 ? "medio excluido" : "medios excluidos"}`
      : null,
  ].filter((texto): texto is string => texto !== null)
  return (
    <dl className="flex flex-col gap-2.5 text-sm">
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-muted-foreground">Territorio</dt>
        <dd>
          <Chips elementos={territorio} vacio="Todo el país" />
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-muted-foreground">Categorías</dt>
        <dd>
          <Chips elementos={s.categorias} vacio="Todas las categorías" />
        </dd>
      </div>
      {condiciones.length > 0 ? (
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Condiciones</dt>
          <dd className="text-muted-foreground">{condiciones.join(" · ")}</dd>
        </div>
      ) : null}
    </dl>
  )
}

function Indicaciones({ oferta }: { oferta: OfertaDetalle }) {
  if (!oferta.instrucciones && !oferta.restricciones) return null
  return (
    <details className="group/indicaciones border-t pt-3">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:anillo-foco [&::-webkit-details-marker]:hidden">
        Instrucciones para el medio
        <ChevronDown
          aria-hidden
          className="size-3.5 transition-transform group-open/indicaciones:rotate-180"
        />
      </summary>
      <div className="mt-2 grid gap-3 text-sm text-pretty whitespace-pre-line sm:grid-cols-2">
        {oferta.instrucciones ? (
          <p>
            <span className="block text-xs font-medium text-muted-foreground">
              Instrucciones
            </span>
            {oferta.instrucciones}
          </p>
        ) : null}
        {oferta.restricciones ? (
          <p>
            <span className="block text-xs font-medium text-muted-foreground">
              Restricciones
            </span>
            {oferta.restricciones}
          </p>
        ) : null}
      </div>
    </details>
  )
}

/**
 * Oferta de una campaña: estado, plataforma y formato, cupos por franja con
 * su llenado, presupuesto comprometido frente al máximo, ventana de
 * publicación y segmentación.
 */
export function TarjetaOferta({
  oferta,
  indice,
}: {
  oferta: OfertaDetalle
  indice: number
}) {
  return (
    <article
      style={{ animationDelay: `${indice * 60}ms` }}
      className="flex animate-aparecer-arriba flex-col gap-5 rounded-xl border bg-card p-4 motion-reduce:animate-none sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <MarcaPlataforma
            plataforma={oferta.plataforma}
            className="[&>span:first-child]:size-9 [&>span:first-child]:rounded-xl [&>span:first-child]:text-xs"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="font-semibold text-balance">{oferta.titulo}</h3>
            <p className="text-xs text-muted-foreground">
              {[
                oferta.formato,
                `${formatearNumero(oferta.publicacionesPorMedio)} ${
                  oferta.publicacionesPorMedio === 1
                    ? "publicación"
                    : "publicaciones"
                } por medio`,
                oferta.permiteMultiplesCupos
                  ? "admite varios cupos por medio"
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <InsigniaEstado catalogo={ESTADOS_OFERTA} estado={oferta.estado} />
          {oferta.publicadaAt ? (
            <span className="text-[0.6875rem] text-muted-foreground">
              Publicada el {formatearFecha(oferta.publicadaAt)}
            </span>
          ) : null}
        </div>
      </header>

      {oferta.estado === "DEVUELTA" && oferta.comentarioModeracion ? (
        <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/8 px-3 py-2 text-sm">
          <MessageSquareWarning
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
          <span>
            <span className="font-medium">Moderación:</span>{" "}
            {oferta.comentarioModeracion}
          </span>
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Bloque titulo="Cupos por franja" icono={Ticket}>
          <CuposPorFranja oferta={oferta} />
        </Bloque>
        <Bloque titulo="Presupuesto" icono={Coins}>
          <Presupuesto oferta={oferta} />
        </Bloque>
        <Bloque titulo="Ventana" icono={CalendarClock}>
          <Ventana oferta={oferta} />
        </Bloque>
        <Bloque titulo="Segmentación" icono={Target}>
          <Segmentacion oferta={oferta} />
        </Bloque>
      </div>

      <Indicaciones oferta={oferta} />
    </article>
  )
}
