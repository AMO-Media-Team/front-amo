import { CalendarClock, Coins, ScrollText, Tag, Target } from "lucide-react"
import type { ReactNode } from "react"

import {
  BarraLlenado,
  InsigniaTono,
} from "@/features/operacion/components/distintivos"
import {
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/usuarios/components/tarjeta-ficha"
import { CORTES } from "@/features/operacion/estados"
import {
  contar,
  formatearFechaHoraFija,
  formatearRangoCompacto,
} from "@/features/operacion/formato"
import {
  formatearCOP,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import {
  formatearTopePorMedio,
  type UrgenciaFechaLimite,
} from "../presentacion"
import type { OfertaCompleta, Perspectiva } from "../tipos"

function Chips({
  elementos,
  vacio,
  etiqueta,
}: {
  elementos: readonly { clave: string; texto: string }[]
  vacio: string
  etiqueta: string
}) {
  if (elementos.length === 0) return <SinDato>{vacio}</SinDato>
  return (
    <ul aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {elementos.map((elemento) => (
        <li
          key={elemento.clave}
          className="max-w-full rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs break-words"
        >
          {elemento.texto}
        </li>
      ))}
    </ul>
  )
}

// ── Segmentación ─────────────────────────────────────────────────────────────

function textoSeguidores(
  oferta: OfertaCompleta,
  perspectiva: Perspectiva
): ReactNode {
  const { seguidoresMinimos, umbralPlataforma, seguidoresEfectivos } =
    oferta.segmentacion
  const quien = perspectiva === "anunciante" ? "Pediste" : "El anunciante pidió"
  const ayuda =
    seguidoresMinimos === null
      ? "Es el mínimo de la plataforma."
      : seguidoresMinimos < umbralPlataforma
        ? `${quien} ${formatearNumero(seguidoresMinimos)}; se aplica el mínimo de la plataforma (${formatearNumero(umbralPlataforma)}).`
        : null
  return (
    <>
      <span className="cifras">
        Desde {formatearNumero(seguidoresEfectivos)} seguidores
      </span>
      {ayuda ? (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {ayuda}
        </span>
      ) : null}
    </>
  )
}

function Excluidos({ oferta }: { oferta: OfertaCompleta }) {
  const { total, medios } = oferta.segmentacion.excluidos
  if (total === 0) return <SinDato>Ninguno</SinDato>
  if (medios === null) {
    return <span>{contar(total, "medio excluido", "medios excluidos")}</span>
  }
  return (
    <Chips
      etiqueta="Medios excluidos"
      vacio="Ninguno"
      elementos={medios.map((medio) => ({
        clave: medio.id,
        texto: medio.municipio
          ? `${medio.nombre} · ${medio.municipio}`
          : medio.nombre,
      }))}
    />
  )
}

function Segmentacion({
  oferta,
  perspectiva,
}: {
  oferta: OfertaCompleta
  perspectiva: Perspectiva
}) {
  const { departamentos, municipios, categorias } = oferta.segmentacion
  const territorio = [
    ...departamentos.map((departamento) => ({
      clave: departamento.codigo,
      texto: departamento.nombre,
    })),
    ...municipios.map((municipio) => ({
      clave: municipio.codigo,
      texto: municipio.departamento
        ? `${municipio.nombre} (${municipio.departamento})`
        : municipio.nombre,
    })),
  ]
  return (
    <TarjetaFicha
      titulo="A quién le llega"
      icono={Target}
      descripcion="Medios elegibles para tomar un cupo."
    >
      <ListaDatos
        className="sm:grid-cols-1"
        datos={[
          {
            etiqueta: "Territorio",
            valor: (
              <Chips
                etiqueta="Territorio"
                vacio="Todo el país"
                elementos={territorio}
              />
            ),
          },
          {
            etiqueta: "Categorías de medio",
            valor: (
              <Chips
                etiqueta="Categorías de medio"
                vacio="Todas las categorías"
                elementos={categorias.map((categoria) => ({
                  clave: categoria,
                  texto: categoria,
                }))}
              />
            ),
          },
          {
            etiqueta: "Seguidores",
            valor: textoSeguidores(oferta, perspectiva),
          },
          {
            etiqueta: "Medios excluidos",
            valor: <Excluidos oferta={oferta} />,
          },
        ]}
      />
    </TarjetaFicha>
  )
}

// ── Presupuesto y cupos ──────────────────────────────────────────────────────

function CuposPorFranja({ oferta }: { oferta: OfertaCompleta }) {
  const { cupos } = oferta
  if (cupos.franjas.length === 0) {
    return <SinDato>Aún sin cupos definidos.</SinDato>
  }
  const conAvance = cupos.ocupados > 0
  return (
    <div className="flex flex-col gap-2.5">
      <ul className="flex flex-col gap-2">
        {cupos.franjas.map((franja) => (
          <li key={franja.franjaId} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-medium">{franja.clave}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {franja.nombre} seguidores
                </span>
              </span>
              <span className="shrink-0 cifras">
                {conAvance ? (
                  <>
                    <span className="font-medium">
                      {formatearNumero(franja.ocupados)}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      / {formatearNumero(franja.totales)}
                    </span>
                  </>
                ) : (
                  contar(franja.totales, "cupo", "cupos")
                )}
              </span>
            </span>
            {conAvance ? (
              <BarraLlenado
                fraccion={
                  franja.totales > 0 ? franja.ocupados / franja.totales : null
                }
                tono={franja.ocupados >= franja.totales ? "exito" : "primario"}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs cifras text-muted-foreground">
        {conAvance
          ? `${formatearNumero(cupos.ocupados)} de ${contar(cupos.totales, "cupo tomado", "cupos tomados")} · ${formatearNumero(cupos.libres)} ${cupos.libres === 1 ? "libre" : "libres"}`
          : `${contar(cupos.totales, "cupo", "cupos")} en total`}
      </p>
    </div>
  )
}

function Presupuesto({ oferta }: { oferta: OfertaCompleta }) {
  // Como en el asistente y en `reservar_cupo`: sobre el total de la campaña.
  const { presupuestoTotal } = oferta.campana
  const topeCop = presupuestoTotal * oferta.topePorMedio
  return (
    <TarjetaFicha
      titulo="Cuánto"
      icono={Coins}
      descripcion="El precio de cada cupo lo calcula la plataforma."
    >
      <div className="flex flex-col gap-5">
        <ListaDatos
          datos={[
            {
              etiqueta: "Presupuesto máximo",
              valor: (
                <span className="font-heading text-lg font-semibold cifras">
                  {formatearCOP(oferta.presupuestoMaximo)}
                </span>
              ),
              ayuda:
                oferta.presupuestoComprometido > 0
                  ? `${formatearCOP(oferta.presupuestoComprometido)} comprometidos en cupos aceptados`
                  : undefined,
            },
            {
              etiqueta: "Tope por medio",
              valor: (
                <span className="cifras">
                  {formatearTopePorMedio(oferta.topePorMedio)} · hasta{" "}
                  {formatearCOP(topeCop)} de la campaña
                </span>
              ),
              ayuda: `Sobre su presupuesto total de ${formatearCOP(presupuestoTotal)}. ${
                oferta.permiteMultiplesCupos
                  ? "Un medio puede tomar varios cupos."
                  : "Un cupo por medio."
              }`,
            },
          ]}
        />
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Cupos por franja de seguidores
          </h3>
          <CuposPorFranja oferta={oferta} />
        </div>
      </div>
    </TarjetaFicha>
  )
}

// ── Fechas y condiciones ─────────────────────────────────────────────────────

function textoExclusividad(oferta: OfertaCompleta): ReactNode {
  if (!oferta.exclusividadDias) return <SinDato>Sin exclusividad</SinDato>
  const recargo =
    oferta.recargoExclusividad !== null && oferta.recargoExclusividad > 1
      ? ` · recargo del ${formatearPorcentaje(oferta.recargoExclusividad - 1, 0)} en el precio`
      : ""
  return (
    <span className="cifras">
      {contar(oferta.exclusividadDias, "día", "días")}
      {recargo}
    </span>
  )
}

function Condiciones({
  oferta,
  urgencia,
}: {
  oferta: OfertaCompleta
  urgencia: UrgenciaFechaLimite | null
}) {
  const cortes = [...oferta.cortes].sort(
    (a, b) => CORTES[a].orden - CORTES[b].orden
  )
  return (
    <TarjetaFicha
      titulo="Cuándo y cómo"
      icono={CalendarClock}
      descripcion="Fechas de la oferta y lo que se exige a cada publicación."
    >
      <ListaDatos
        datos={[
          {
            etiqueta: "Ventana de publicación",
            valor: (
              <span
                className="cifras"
                title={`${formatearFechaHora(oferta.ventanaInicio)} – ${formatearFechaHora(oferta.ventanaFin)}`}
              >
                {formatearRangoCompacto(
                  oferta.ventanaInicio,
                  oferta.ventanaFin
                )}
              </span>
            ),
          },
          {
            etiqueta: "Aceptación hasta",
            valor: (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="cifras">
                  {formatearFechaHoraFija(oferta.fechaLimiteAceptacion)}
                </span>
                {urgencia && urgencia.nivel !== "holgada" ? (
                  <InsigniaTono
                    tono={urgencia.tono}
                    etiqueta={urgencia.texto}
                    className="h-5 px-2 text-[0.6875rem]"
                  />
                ) : null}
              </span>
            ),
          },
          {
            etiqueta: "Publicaciones por medio",
            valor: (
              <span className="cifras">
                {formatearNumero(oferta.publicacionesPorMedio)}
              </span>
            ),
          },
          {
            etiqueta: "Permanencia mínima",
            valor: (
              <span className="cifras">
                {contar(oferta.permanenciaDias, "día", "días")}
              </span>
            ),
            ayuda: "Tiempo que la publicación debe seguir visible.",
          },
          {
            etiqueta: "Cortes de métricas",
            valor:
              cortes.length > 0 ? (
                cortes.map((corte) => CORTES[corte].etiqueta).join(" · ")
              ) : (
                <SinDato />
              ),
          },
          { etiqueta: "Exclusividad", valor: textoExclusividad(oferta) },
        ]}
      />
    </TarjetaFicha>
  )
}

// ── Instrucciones y restricciones ────────────────────────────────────────────

function Indicaciones({ oferta }: { oferta: OfertaCompleta }) {
  return (
    <TarjetaFicha
      titulo="Instrucciones para el medio"
      icono={ScrollText}
      descripcion="Lo que el medio lee antes de aceptar y al publicar."
    >
      <div className="flex flex-col gap-4">
        <p className="flex gap-2.5 rounded-lg border border-primary/30 bg-primary/6 px-3 py-2.5 text-sm text-pretty">
          <Tag aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium">
              Etiqueta de publicidad obligatoria.
            </span>{" "}
            Toda publicación debe marcarse como contenido pagado con la
            herramienta de la red social (por ejemplo, «Colaboración pagada» o
            «Publicidad»).
          </span>
        </p>
        {oferta.instrucciones || oferta.restricciones ? (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {oferta.instrucciones ? (
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  Instrucciones
                </dt>
                <dd className="text-pretty break-words whitespace-pre-line">
                  {oferta.instrucciones}
                </dd>
              </div>
            ) : null}
            {oferta.restricciones ? (
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  Restricciones
                </dt>
                <dd className="text-pretty break-words whitespace-pre-line">
                  {oferta.restricciones}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin instrucciones ni restricciones adicionales.
          </p>
        )}
      </div>
    </TarjetaFicha>
  )
}

/**
 * Resumen completo de la oferta para su anunciante y para la moderación:
 * segmentación (con los medios excluidos por nombre), presupuesto y cupos
 * por franja, fechas y condiciones, e instrucciones con la etiqueta de
 * publicidad siempre obligatoria.
 */
export function ResumenOferta({
  oferta,
  perspectiva,
  urgencia,
}: {
  oferta: OfertaCompleta
  perspectiva: Perspectiva
  /** Urgencia de la fecha límite, calculada en el servidor (`null` si ya no aplica). */
  urgencia: UrgenciaFechaLimite | null
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <Segmentacion oferta={oferta} perspectiva={perspectiva} />
      <Presupuesto oferta={oferta} />
      <Condiciones oferta={oferta} urgencia={urgencia} />
      <Indicaciones oferta={oferta} />
    </div>
  )
}
