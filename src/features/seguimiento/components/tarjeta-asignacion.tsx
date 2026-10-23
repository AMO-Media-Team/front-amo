"use client"

import {
  ChevronDown,
  ExternalLink,
  ImageOff,
  TriangleAlert,
} from "lucide-react"
import type { ReactNode } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import {
  InsigniaEstado,
  InsigniaNivel,
  InsigniaTono,
} from "@/features/operacion/components/distintivos"
import {
  formatearFechaCompacta,
  formatearFechaHoraFija,
  formatearHandle,
} from "@/features/operacion/formato"
import { nombresColumnas } from "@/features/operacion/metricas"
import { formatearCOP, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  ESTADOS_PARA_ANUNCIANTE,
  esperaPublicacion,
  VALIDACION_PARA_ANUNCIANTE,
} from "../estados"
import {
  hitosAsignacion,
  resultadosAsignacion,
  tituloPublicacion,
  urlLegible,
} from "../presentacion"
import { idTarjetaAsignacion } from "../rutas"
import type { AsignacionSeguimiento, PublicacionSeguimiento } from "../tipos"
import { CapturaPublicacion } from "./captura-publicacion"
import { EnlaceCuenta, FichaMedio, ubicacionMedio } from "./ficha-medio"
import { LineaTiempo } from "./linea-tiempo"
import { TablaCortes } from "./tabla-cortes"

export type Novedad = "nueva" | "cambiada" | null

function Dato({
  etiqueta,
  children,
  className,
}: {
  etiqueta: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function EnlacePost({
  publicacion,
  texto,
}: {
  publicacion: PublicacionSeguimiento
  texto: string
}) {
  return (
    <a
      href={publicacion.urlPost}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:anillo-foco"
    >
      <span className="truncate">{texto}</span>
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">
        {" "}
        (abre la publicación en una pestaña nueva)
      </span>
    </a>
  )
}

/** Plazo, fecha de publicación o el motivo por el que no habrá publicación. */
function SituacionPublicacion({
  asignacion,
  ahoraServidor,
}: {
  asignacion: AsignacionSeguimiento
  ahoraServidor: number
}) {
  if (asignacion.publicadaAt) {
    return (
      <time dateTime={asignacion.publicadaAt} className="cifras">
        {formatearFechaHoraFija(asignacion.publicadaAt)}
      </time>
    )
  }
  if (esperaPublicacion(asignacion.estado)) {
    return asignacion.fechaLimitePublicacion ? (
      <CuentaRegresiva
        venceAt={asignacion.fechaLimitePublicacion}
        ahoraServidor={ahoraServidor}
        etiqueta="Plazo para publicar"
        variante="texto"
      />
    ) : (
      <span className="text-muted-foreground">Aún sin publicar</span>
    )
  }
  return <span className="text-muted-foreground">Sin publicación</span>
}

/** «Alcance 8.750 · Impresiones 11.062 · Interacciones 276» al último corte aprobado. */
function ResumenResultados({
  asignacion,
}: {
  asignacion: AsignacionSeguimiento
}) {
  const resultados = resultadosAsignacion(asignacion.publicaciones)
  if (!resultados) return null
  const nombres = nombresColumnas(asignacion.plataforma)
  const cifras = [
    { etiqueta: nombres.alcance, valor: resultados.alcance },
    { etiqueta: nombres.impresiones, valor: resultados.impresiones },
    { etiqueta: "Interacciones", valor: resultados.interacciones },
  ]
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        Resultados al último corte aprobado
      </p>
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        {cifras.map((cifra) => (
          <div key={cifra.etiqueta} className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">{cifra.etiqueta}</dt>
            <dd className="text-sm font-semibold cifras">
              {formatearNumero(cifra.valor)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function DetallePublicacion({
  publicacion,
  asignacion,
  total,
}: {
  publicacion: PublicacionSeguimiento
  asignacion: AsignacionSeguimiento
  total: number
}) {
  const titulo = tituloPublicacion(publicacion, total)
  const handle = asignacion.cuenta.handle
    ? formatearHandle(asignacion.cuenta.handle)
    : asignacion.medio.nombre
  const etiqueta = `${titulo} de ${handle}`
  const publicada = `Publicada el ${formatearFechaHoraFija(publicacion.fechaPublicacion)}.`
  return (
    <article aria-label={etiqueta} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <div className="mx-auto w-36 sm:mx-0 sm:w-full">
          {publicacion.conCaptura ? (
            <CapturaPublicacion
              publicacionId={publicacion.id}
              titulo={`Captura de la ${titulo.toLocaleLowerCase("es-CO")} de ${handle}`}
              descripcion={publicada}
            />
          ) : (
            <div className="grid aspect-[4/5] w-full place-items-center rounded-lg border border-dashed bg-muted/30 p-3 text-center text-xs text-muted-foreground">
              <span className="flex flex-col items-center gap-1.5">
                <ImageOff aria-hidden className="size-5" />
                Sin captura
              </span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{titulo}</h4>
            <InsigniaEstado
              catalogo={VALIDACION_PARA_ANUNCIANTE}
              estado={publicacion.estadoValidacion}
              className="h-5 px-2 text-[0.6875rem]"
            />
          </div>
          <EnlacePost
            publicacion={publicacion}
            texto={urlLegible(publicacion.urlPost)}
          />
          <p className="text-xs cifras text-muted-foreground">{publicada}</p>
          {publicacion.estadoValidacion === "RECHAZADA" ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/6 px-3 py-2 text-xs text-pretty">
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-warning"
              />
              El equipo AMO pidió corregir esta evidencia. El medio la está
              corrigiendo dentro de su plazo.
            </p>
          ) : null}
        </div>
      </div>
      {publicacion.cortes.length > 0 ? (
        <TablaCortes
          cortes={publicacion.cortes}
          plataforma={asignacion.plataforma}
          etiqueta={etiqueta}
        />
      ) : (
        <p className="text-xs text-pretty text-muted-foreground">
          Aún no hay cortes de métricas aprobados. Los verás aquí apenas el
          equipo AMO los valide.
        </p>
      )}
    </article>
  )
}

const TEXTO_NOVEDAD: Readonly<Record<Exclude<Novedad, null>, string>> = {
  nueva: "Nueva",
  cambiada: "Con novedades",
}

/**
 * Una asignación de la campaña: el medio (su ficha pública a un toque), la
 * cuenta y el alcance que declaró al aceptar, el estado con su plazo, el valor
 * del cupo y el enlace a cada publicación. Al desplegarla: la captura firmada,
 * los cortes aprobados y la línea de tiempo.
 */
export function TarjetaAsignacion({
  asignacion,
  abierta,
  onAbiertaChange,
  destacada,
  novedad,
  ahoraServidor,
}: {
  asignacion: AsignacionSeguimiento
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  /** La que pidió la URL (`?asignacion=`): se resalta. */
  destacada: boolean
  novedad: Novedad
  ahoraServidor: number
}) {
  const { medio, cuenta, publicaciones } = asignacion
  const ubicacion = ubicacionMedio(medio)
  const idTitulo = `titulo-${idTarjetaAsignacion(asignacion.id)}`
  const alcanceDeclarado = [
    cuenta.seguidoresAlAceptar !== null
      ? `${formatearNumero(cuenta.seguidoresAlAceptar)} seguidores al aceptar`
      : null,
    cuenta.franja ? `Franja ${cuenta.franja}` : null,
  ].filter(Boolean)

  return (
    <article
      id={idTarjetaAsignacion(asignacion.id)}
      aria-labelledby={idTitulo}
      tabIndex={-1}
      className={cn(
        "scroll-mt-28 overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] duration-300 outline-none focus-visible:anillo-foco",
        destacada &&
          "border-primary/60 shadow-[inset_0_0_0_1px_var(--color-primary)]"
      )}
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 id={idTitulo} className="min-w-0 text-base leading-snug">
              <FichaMedio medio={medio} cuenta={cuenta} />
            </h3>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {ubicacion ? <span>{ubicacion}</span> : null}
              <InsigniaNivel nivel={medio.nivel} compacta className="text-xs" />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {novedad ? (
              <InsigniaTono
                tono="info"
                etiqueta={TEXTO_NOVEDAD[novedad]}
                titulo="Cambió desde la última actualización"
                className="h-5 px-2 text-[0.6875rem]"
              />
            ) : null}
            <InsigniaEstado
              catalogo={ESTADOS_PARA_ANUNCIANTE}
              estado={asignacion.estado}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-0.5 text-sm">
          <EnlaceCuenta cuenta={cuenta} />
          {alcanceDeclarado.length > 0 ? (
            <span className="text-xs cifras text-muted-foreground">
              {alcanceDeclarado.join(" · ")}
            </span>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
          <Dato etiqueta="Oferta" className="col-span-2">
            <span className="line-clamp-2" title={asignacion.oferta}>
              {asignacion.oferta}
            </span>
          </Dato>
          <Dato etiqueta="Aceptó">
            <time dateTime={asignacion.aceptadaAt} className="cifras">
              {formatearFechaCompacta(asignacion.aceptadaAt)}
            </time>
          </Dato>
          <Dato etiqueta="Valor del cupo">
            <span className="cifras">
              {formatearCOP(asignacion.montoBruto)}
            </span>
          </Dato>
          <Dato
            etiqueta={asignacion.publicadaAt ? "Publicó" : "Publicación"}
            className="col-span-2"
          >
            <SituacionPublicacion
              asignacion={asignacion}
              ahoraServidor={ahoraServidor}
            />
          </Dato>
        </dl>

        {publicaciones.length > 0 ? (
          <ul aria-label="Publicaciones" className="flex flex-col gap-1.5">
            {publicaciones.map((publicacion) => (
              <li
                key={publicacion.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1"
              >
                <EnlacePost
                  publicacion={publicacion}
                  texto={`Ver ${tituloPublicacion(publicacion, publicaciones.length).toLocaleLowerCase("es-CO")}`}
                />
                <InsigniaEstado
                  catalogo={VALIDACION_PARA_ANUNCIANTE}
                  estado={publicacion.estadoValidacion}
                  className="h-5 px-2 text-[0.6875rem]"
                />
              </li>
            ))}
          </ul>
        ) : null}

        <ResumenResultados asignacion={asignacion} />
      </div>

      <Collapsible open={abierta} onOpenChange={onAbiertaChange}>
        <CollapsibleTrigger className="group/detalle flex min-h-11 w-full items-center justify-between gap-2 border-t px-4 py-2.5 text-left text-sm font-medium text-foreground/90 transition-colors hover:bg-muted/40 focus-visible:anillo-foco focus-visible:outline-none">
          {publicaciones.length > 0
            ? "Evidencia, métricas y línea de tiempo"
            : "Línea de tiempo"}
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]/detalle:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t">
          <div className="flex flex-col gap-5 p-4">
            {publicaciones.map((publicacion) => (
              <DetallePublicacion
                key={publicacion.id}
                publicacion={publicacion}
                asignacion={asignacion}
                total={publicaciones.length}
              />
            ))}
            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">Línea de tiempo</h4>
              <LineaTiempo
                hitos={hitosAsignacion(asignacion)}
                etiqueta={`Línea de tiempo de ${medio.nombre}`}
              />
            </section>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </article>
  )
}
