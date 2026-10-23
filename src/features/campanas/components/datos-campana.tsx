import { FileText, Pencil } from "lucide-react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import { formatearVigencia } from "@/features/operacion/formato"
import { formatearCOP, formatearFecha, formatearFechaHora } from "@/lib/format"

import { duracionVigencia, ESTADOS_MI_CAMPANA } from "../presentacion"
import { rutaEditarCampana } from "../rutas"
import type { MiCampana } from "../tipos"

function Momento({ valor }: { valor: string | null }) {
  if (!valor) return <SinDato />
  return (
    <time dateTime={valor} title={formatearFechaHora(valor)}>
      {formatearFecha(valor, "largo")}
    </time>
  )
}

/** Pestaña «Datos»: lo que se escribió al crearla y sus fechas clave. */
export function DatosCampana({
  campana,
  puedeEditar,
}: {
  campana: MiCampana
  puedeEditar: boolean
}) {
  return (
    <TarjetaFicha
      titulo="Datos de la campaña"
      descripcion={ESTADOS_MI_CAMPANA[campana.estado].descripcion}
      icono={FileText}
      acciones={
        puedeEditar ? (
          <EnlaceBoton
            href={rutaEditarCampana(campana.id)}
            variant="outline"
            size="sm"
          >
            <Pencil data-icon="inline-start" aria-hidden />
            Editar datos
          </EnlaceBoton>
        ) : null
      }
    >
      <ListaDatos
        datos={[
          { etiqueta: "Nombre", valor: campana.nombre },
          { etiqueta: "Marca o producto", valor: campana.marca },
          {
            etiqueta: "Objetivo",
            valor: campana.objetivo ? (
              <span className="whitespace-pre-line">{campana.objetivo}</span>
            ) : (
              <SinDato>Sin objetivo escrito</SinDato>
            ),
          },
          {
            etiqueta: "Vigencia",
            valor: formatearVigencia(campana.fechaInicio, campana.fechaFin),
            ayuda: duracionVigencia(campana.fechaInicio, campana.fechaFin),
          },
          {
            etiqueta: "Presupuesto total",
            valor: (
              <span className="cifras">
                {formatearCOP(campana.presupuestoTotal)}
              </span>
            ),
          },
          {
            etiqueta: "Comprometido en cupos aceptados",
            valor: (
              <span className="cifras">
                {formatearCOP(campana.presupuestoComprometido)}
              </span>
            ),
          },
          { etiqueta: "Creada", valor: <Momento valor={campana.creadaAt} /> },
          {
            etiqueta: "Activada",
            valor: <Momento valor={campana.activadaAt} />,
          },
          ...(campana.finalizadaAt
            ? [
                {
                  etiqueta: "Finalizada",
                  valor: <Momento valor={campana.finalizadaAt} />,
                },
              ]
            : []),
          ...(campana.canceladaAt
            ? [
                {
                  etiqueta: "Cancelada",
                  valor: <Momento valor={campana.canceladaAt} />,
                },
              ]
            : []),
          {
            etiqueta: "Última modificación",
            valor: <Momento valor={campana.actualizadaAt} />,
          },
        ]}
      />
    </TarjetaFicha>
  )
}
