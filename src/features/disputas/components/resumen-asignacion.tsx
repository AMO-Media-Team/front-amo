import {
  ArrowRight,
  ExternalLink,
  Handshake,
  TriangleAlert,
} from "lucide-react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import {
  EnlaceFicha,
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import {
  ESTADOS_ASIGNACION,
  ESTADOS_VALIDACION,
  PLATAFORMAS,
} from "@/features/operacion/estados"
import { formatearFechaHoraFija } from "@/features/operacion/formato"
import {
  rutaAnunciante,
  rutaAsignacion,
  rutaCampana,
  rutaMedio,
} from "@/features/operacion/rutas"
import { rutaOfertaInterna } from "@/features/ofertas/rutas"
import { formatearCOP } from "@/lib/format"

import { estadoEnFrase } from "../presentacion"
import type { AsignacionDisputa } from "../tipos"

const ENLACE = "font-medium text-foreground"

/** Fichas relacionadas que el rol puede abrir (permiso de cada sección). */
export interface EnlacesDisputa {
  asignacion: boolean
  medio: boolean
  campana: boolean
  anunciante: boolean
  oferta: boolean
}

function Publicaciones({ asignacion }: { asignacion: AsignacionDisputa }) {
  if (asignacion.publicaciones.length === 0) {
    return <SinDato>Sin publicaciones registradas</SinDato>
  }
  const varias = asignacion.publicaciones.length > 1
  return (
    <ul className="flex flex-col gap-2.5">
      {asignacion.publicaciones.map((publicacion) => (
        <li key={publicacion.id} className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            {varias ? (
              <span className="text-xs font-medium text-muted-foreground">
                Publicación {publicacion.numero}
              </span>
            ) : null}
            <InsigniaEstado
              catalogo={ESTADOS_VALIDACION}
              estado={publicacion.estado}
              className="h-5 px-2 text-[0.6875rem]"
            />
          </span>
          <a
            href={publicacion.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex w-fit max-w-full items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          >
            <span className="truncate">
              {publicacion.url.replace(/^https?:\/\//, "")}
            </span>
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only"> (abre en una pestaña nueva)</span>
          </a>
          {publicacion.retiradaDetectadaAt ? (
            <span className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              Reportada como retirada el{" "}
              {formatearFechaHoraFija(publicacion.retiradaDetectadaAt)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * La asignación disputada, resumida: estado (y de dónde venía), medio y su
 * cuenta, campaña, anunciante, oferta, monto, plazo y publicaciones, con
 * enlace a la ficha completa (evidencia, métricas, línea de tiempo).
 */
export function ResumenAsignacionDisputa({
  asignacion,
  enlaces,
}: {
  asignacion: AsignacionDisputa
  enlaces: EnlacesDisputa
}) {
  const vencida =
    asignacion.estado === "VENCIDA_SIN_PUBLICAR" ||
    asignacion.estadoPrevioDisputa === "VENCIDA_SIN_PUBLICAR"
  return (
    <TarjetaFicha titulo="Asignación" icono={Handshake}>
      <div className="flex flex-col gap-5">
        <ListaDatos
          className="sm:grid-cols-2 lg:grid-cols-1"
          datos={[
            {
              etiqueta: "Estado",
              valor: (
                <span className="flex flex-col items-start gap-1">
                  <InsigniaEstado
                    catalogo={ESTADOS_ASIGNACION}
                    estado={asignacion.estado}
                  />
                  {asignacion.estado === "EN_DISPUTA" &&
                  asignacion.estadoPrevioDisputa ? (
                    <span className="text-xs text-muted-foreground">
                      Venía de «{estadoEnFrase(asignacion.estadoPrevioDisputa)}»
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              etiqueta: "Medio",
              valor: (
                <span className="flex flex-col gap-0.5">
                  <EnlaceFicha
                    href={rutaMedio(asignacion.medio.id)}
                    permitido={enlaces.medio}
                    className={ENLACE}
                  >
                    {asignacion.medio.nombre ?? "Medio"}
                  </EnlaceFicha>
                  {asignacion.cuenta ? (
                    <a
                      href={asignacion.cuenta.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      <MarcaPlataforma plataforma={asignacion.plataforma} />
                      {asignacion.cuenta.handle}
                      <span className="sr-only">
                        {" "}
                        en {PLATAFORMAS[asignacion.plataforma]} (abre en una
                        pestaña nueva)
                      </span>
                    </a>
                  ) : null}
                </span>
              ),
            },
            {
              etiqueta: "Campaña",
              valor: (
                <span className="flex flex-col gap-0.5">
                  <EnlaceFicha
                    href={rutaCampana(asignacion.campana.id)}
                    permitido={enlaces.campana}
                    className={ENLACE}
                  >
                    {asignacion.campana.nombre ?? "Campaña"}
                  </EnlaceFicha>
                  <EnlaceFicha
                    href={rutaAnunciante(asignacion.anunciante.id)}
                    permitido={enlaces.anunciante}
                    className="text-xs text-muted-foreground"
                  >
                    {asignacion.anunciante.nombre ?? "Anunciante"}
                  </EnlaceFicha>
                </span>
              ),
            },
            {
              etiqueta: "Oferta",
              valor: (
                <span className="flex flex-col gap-0.5">
                  <EnlaceFicha
                    href={rutaOfertaInterna(asignacion.oferta.id)}
                    permitido={enlaces.oferta}
                    className={ENLACE}
                  >
                    {asignacion.oferta.titulo ?? "Oferta"}
                  </EnlaceFicha>
                  <span className="text-xs text-muted-foreground">
                    {[PLATAFORMAS[asignacion.plataforma], asignacion.formato]
                      .filter(Boolean)
                      .join(" · ")}
                    {asignacion.oferta.cerrada ? " · ya cerró" : ""}
                  </span>
                </span>
              ),
            },
            {
              etiqueta: "Monto bruto",
              valor:
                asignacion.montoBruto === null ? (
                  <SinDato />
                ) : (
                  <span className="font-medium cifras">
                    {formatearCOP(asignacion.montoBruto)}
                  </span>
                ),
            },
            vencida
              ? {
                  etiqueta: "Venció sin publicar",
                  valor: asignacion.vencidaAt ? (
                    <span className="cifras">
                      {formatearFechaHoraFija(asignacion.vencidaAt)}
                    </span>
                  ) : (
                    <SinDato />
                  ),
                }
              : {
                  etiqueta: "Límite para publicar",
                  valor: asignacion.fechaLimitePublicacion ? (
                    <span className="cifras">
                      {formatearFechaHoraFija(
                        asignacion.fechaLimitePublicacion
                      )}
                    </span>
                  ) : (
                    <SinDato />
                  ),
                },
          ]}
        />
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Publicaciones
          </h3>
          <Publicaciones asignacion={asignacion} />
        </div>
        {enlaces.asignacion ? (
          <EnlaceBoton
            href={rutaAsignacion(asignacion.id)}
            variant="outline"
            className="w-full"
          >
            Ver la ficha de la asignación
            <ArrowRight data-icon="inline-end" aria-hidden />
          </EnlaceBoton>
        ) : null}
      </div>
    </TarjetaFicha>
  )
}
