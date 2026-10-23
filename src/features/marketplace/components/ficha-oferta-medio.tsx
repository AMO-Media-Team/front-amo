import {
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  Megaphone,
  PencilOff,
  Repeat,
  ShieldCheck,
  Timer,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"

import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import {
  CabeceraFicha,
  ListaDatos,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { formatearFechaHora } from "@/lib/format"

import {
  type Condicion,
  condicionesOferta,
  type ConsumoTopeMedio,
  type DisponibilidadAceptar,
  formatoDeOferta,
  textoPublicaciones,
} from "../presentacion"
import { RUTA_OFERTAS_MEDIO } from "../rutas"
import type { DetalleOfertaMedio } from "../tipos"
import { DecisionOferta } from "./decision-oferta"
import { RegistroVista } from "./registro-vista"

type Icono = ComponentType<SVGProps<SVGSVGElement>>

const ICONO_CONDICION: Readonly<Record<string, Icono>> = {
  etiqueta: Megaphone,
  copy: PencilOff,
  permanencia: Timer,
  exclusividad: ShieldCheck,
  metricas: Repeat,
}

/** Texto del anunciante tal como lo escribió (respeta los saltos de línea). */
function TextoLibre({ texto }: { texto: string }) {
  return <p className="text-sm text-pretty whitespace-pre-line">{texto}</p>
}

function SeccionQuePublicar({ detalle }: { detalle: DetalleOfertaMedio }) {
  return (
    <TarjetaFicha
      titulo="Qué publicar"
      icono={ClipboardList}
      descripcion="El contenido (archivos, texto, hashtags y enlace) lo descargas después de aceptar."
    >
      <div className="flex flex-col gap-5">
        <ListaDatos
          datos={[
            { etiqueta: "Formato", valor: formatoDeOferta(detalle) },
            {
              etiqueta: "Publicaciones",
              valor: textoPublicaciones(detalle.publicacionesPorMedio),
            },
            { etiqueta: "Marca", valor: detalle.marca },
            { etiqueta: "Anunciante", valor: detalle.anunciante },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            Instrucciones del anunciante
          </h3>
          {detalle.instrucciones ? (
            <TextoLibre texto={detalle.instrucciones} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No dejó instrucciones adicionales: publica el contenido y su texto
              tal como vienen.
            </p>
          )}
        </div>
        {detalle.restricciones ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              Lo que no debes hacer
            </h3>
            <TextoLibre texto={detalle.restricciones} />
          </div>
        ) : null}
      </div>
    </TarjetaFicha>
  )
}

function SeccionFechas({
  detalle,
  ahoraServidor,
}: {
  detalle: DetalleOfertaMedio
  ahoraServidor: number
}) {
  return (
    <TarjetaFicha titulo="Fechas" icono={CalendarClock}>
      <ListaDatos
        datos={[
          {
            etiqueta: "Aceptas hasta",
            valor: (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <time
                  dateTime={detalle.fechaLimiteAceptacion}
                  className="cifras"
                >
                  {formatearFechaHora(detalle.fechaLimiteAceptacion)}
                </time>
                <CuentaRegresiva
                  venceAt={detalle.fechaLimiteAceptacion}
                  ahoraServidor={ahoraServidor}
                  etiqueta="Fecha límite para aceptar"
                  textos={{ pendiente: "Cierra en", vencido: "Cerró hace" }}
                />
              </span>
            ),
          },
          {
            etiqueta: "Ventana de publicación",
            valor: (
              <span className="flex flex-col">
                <span>
                  Desde el{" "}
                  <time dateTime={detalle.ventanaInicio} className="cifras">
                    {formatearFechaHora(detalle.ventanaInicio)}
                  </time>
                </span>
                <span>
                  hasta el{" "}
                  <time dateTime={detalle.ventanaFin} className="cifras">
                    {formatearFechaHora(detalle.ventanaFin)}
                  </time>
                </span>
              </span>
            ),
            ayuda:
              "Publica y carga la evidencia dentro de la ventana; después no se reciben.",
          },
        ]}
      />
    </TarjetaFicha>
  )
}

function ItemCondicion({ condicion }: { condicion: Condicion }) {
  const Icono = ICONO_CONDICION[condicion.clave] ?? BadgeCheck
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
        <Icono aria-hidden className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{condicion.titulo}</span>
        <span className="text-sm text-pretty text-muted-foreground">
          {condicion.descripcion}
        </span>
      </span>
    </li>
  )
}

function SeccionCondiciones({ detalle }: { detalle: DetalleOfertaMedio }) {
  return (
    <TarjetaFicha
      titulo="Condiciones"
      icono={BadgeCheck}
      descripcion="Al aceptar te comprometes a cumplirlas: la verificación las revisa antes del pago."
    >
      <ul className="flex flex-col gap-4">
        {condicionesOferta(detalle).map((condicion) => (
          <ItemCondicion key={condicion.clave} condicion={condicion} />
        ))}
      </ul>
    </TarjetaFicha>
  )
}

/**
 * Detalle de una oferta para el medio (MED-009): marca, formato, qué
 * publicar, pago por cuenta con su franja y sus multiplicadores, fechas y
 * condiciones; el pie fijo para aceptar o decir «No me interesa» (MED-010).
 * Registra la vista al mostrarse.
 */
export function FichaOfertaMedio({
  detalle,
  disponibilidad,
  consumo,
  puedeAceptar,
  ahoraServidor,
}: {
  detalle: DetalleOfertaMedio
  disponibilidad: DisponibilidadAceptar
  consumo: ConsumoTopeMedio | null
  puedeAceptar: boolean
  ahoraServidor: number
}) {
  return (
    <>
      <CabeceraFicha
        volver={{ href: RUTA_OFERTAS_MEDIO, titulo: "Ofertas" }}
        antetitulo={formatoDeOferta(detalle)}
        titulo={detalle.titulo}
        subtitulo={
          detalle.anunciante !== detalle.marca
            ? `${detalle.marca} · ${detalle.anunciante}`
            : detalle.marca
        }
        visual={
          <MarcaPlataforma
            plataforma={detalle.plataforma}
            className="[&>span:first-child]:size-12 [&>span:first-child]:rounded-xl [&>span:first-child]:text-sm"
          />
        }
        distintivos={
          disponibilidad.tipo === "disponible" ? (
            <CuentaRegresiva
              venceAt={detalle.fechaLimiteAceptacion}
              ahoraServidor={ahoraServidor}
              etiqueta="Fecha límite para aceptar"
              textos={{
                pendiente: "Aceptación cierra en",
                vencido: "La aceptación cerró hace",
              }}
            />
          ) : null
        }
      />
      <RegistroVista ofertaId={detalle.id} />
      {/* Otra oferta, otra decisión: clave de idempotencia y cuenta elegida nuevas. */}
      <DecisionOferta
        key={detalle.id}
        oferta={{
          id: detalle.id,
          titulo: detalle.titulo,
          ventanaFin: detalle.ventanaFin,
          fechaLimiteAceptacion: detalle.fechaLimiteAceptacion,
          cuentas: detalle.cuentas,
        }}
        disponibilidad={disponibilidad}
        consumo={consumo}
        puedeAceptar={puedeAceptar}
      >
        <SeccionQuePublicar detalle={detalle} />
        <SeccionFechas detalle={detalle} ahoraServidor={ahoraServidor} />
        <SeccionCondiciones detalle={detalle} />
      </DecisionOferta>
    </>
  )
}
