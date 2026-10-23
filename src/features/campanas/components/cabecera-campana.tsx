import { CalendarRange, CircleSlash, Flag, Megaphone } from "lucide-react"
import type { ReactNode } from "react"

import { InsigniaDemo } from "@/features/operacion/components/distintivos"
import {
  AvisoFicha,
  CabeceraFicha,
  Monograma,
} from "@/features/operacion/components/ficha"
import { formatearVigencia } from "@/features/operacion/formato"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import { duracionVigencia } from "../presentacion"
import { RUTA_MIS_CAMPANAS } from "../rutas"
import type { MiCampana } from "../tipos"
import { FaseCampana, InsigniaCampana } from "./distintivos-campana"

function AvisoEstado({ campana }: { campana: MiCampana }) {
  if (campana.estado === "CANCELADA") {
    return (
      <AvisoFicha
        tono="peligro"
        icono={CircleSlash}
        titulo={`Campaña cancelada${campana.canceladaAt ? ` el ${formatearFecha(campana.canceladaAt, "largo")}` : ""}`}
      >
        Sus ofertas sin cupos aceptados se cancelaron y dejaron de verse en el
        marketplace; las que tenían obligaciones con medios se cierran solas y
        lo que los medios ya publicaron se conserva.
      </AvisoFicha>
    )
  }
  if (campana.estado === "FINALIZADA") {
    return (
      <AvisoFicha
        tono="info"
        icono={Flag}
        titulo={`Campaña finalizada${campana.finalizadaAt ? ` el ${formatearFecha(campana.finalizadaAt, "largo")}` : ""}`}
      >
        Todas sus ofertas cerraron. Sus resultados verificados están en
        Reportes.
      </AvisoFicha>
    )
  }
  return null
}

/**
 * Cabecera de la ficha de una campaña propia: identidad, vigencia, estado con
 * su fase, fechas clave y las acciones (`acciones`, del cliente). Bajo ella,
 * el aviso de una campaña cerrada o, si se pasa, el de la empresa sin
 * verificar (`aviso`).
 */
export function CabeceraCampana({
  campana,
  hoy,
  acciones,
  aviso,
}: {
  campana: MiCampana
  /** Hoy en Bogotá ('YYYY-MM-DD'). */
  hoy: string
  acciones?: ReactNode
  aviso?: ReactNode
}) {
  const avisoEstado = <AvisoEstado campana={campana} />
  return (
    <CabeceraFicha
      volver={{ href: RUTA_MIS_CAMPANAS, titulo: "Mis campañas" }}
      antetitulo={`Campaña · ${campana.marca}`}
      titulo={campana.nombre}
      visual={<Monograma icono={Megaphone} />}
      subtitulo={
        <span className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 cifras">
            <CalendarRange aria-hidden className="size-3.5 shrink-0" />
            {formatearVigencia(campana.fechaInicio, campana.fechaFin)} ·{" "}
            {duracionVigencia(campana.fechaInicio, campana.fechaFin)}
          </span>
          {campana.objetivo ? (
            <span
              className="line-clamp-2 max-w-2xl text-pretty"
              title={campana.objetivo}
            >
              {campana.objetivo}
            </span>
          ) : null}
        </span>
      }
      distintivos={
        <>
          <InsigniaCampana estado={campana.estado} />
          <FaseCampana campana={campana} hoy={hoy} />
          {campana.esDemo ? <InsigniaDemo /> : null}
        </>
      }
      acciones={acciones}
      lateral={
        <>
          <span>
            Creada el{" "}
            <time
              dateTime={campana.creadaAt}
              title={formatearFechaHora(campana.creadaAt)}
            >
              {formatearFecha(campana.creadaAt)}
            </time>
          </span>
          {campana.activadaAt ? (
            <span>
              Activada el{" "}
              <time
                dateTime={campana.activadaAt}
                title={formatearFechaHora(campana.activadaAt)}
              >
                {formatearFecha(campana.activadaAt)}
              </time>
            </span>
          ) : null}
        </>
      }
      aviso={
        campana.estado === "CANCELADA" || campana.estado === "FINALIZADA"
          ? avisoEstado
          : aviso
      }
    />
  )
}
