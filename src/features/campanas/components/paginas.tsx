import "server-only"

import { ArrowLeft, Info, Lock } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import { serializarFecha } from "@/lib/fechas"

import { reglasEdicion, reglasNuevaCampana } from "../formularios"
import { motivoSinActivar } from "../presentacion"
import {
  obtenerMiCampana,
  ofertasDeMiCampana,
  situacionEmpresa,
} from "../queries"
import { esEditable } from "../reglas"
import { RUTA_MI_EMPRESA, rutaMiCampana } from "../rutas"
import type { EstadoAnunciante } from "../tipos"
import {
  FormularioEditarCampana,
  FormularioNuevaCampana,
} from "./formulario-campana"

/** Con la empresa sin verificar, la campaña se crea igual (queda en borrador). */
function NotaEmpresa({ estado }: { estado: EstadoAnunciante }) {
  if (estado === "VERIFICADO") return null
  return (
    <p className="flex items-start gap-2.5 rounded-xl border bg-muted/30 p-3.5 text-sm text-pretty text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        La campaña quedará en borrador y podrás armar sus ofertas.{" "}
        {motivoSinActivar(estado)}{" "}
        <Link
          href={RUTA_MI_EMPRESA}
          className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
        >
          Ver mi empresa
        </Link>
      </span>
    </p>
  )
}

/** Contenido de `/campanas/nueva` (la página ya autorizó con el DAL). */
export async function NuevaCampana({ anuncianteId }: { anuncianteId: string }) {
  const empresa = await situacionEmpresa(anuncianteId)
  const hoy = serializarFecha(new Date())
  return (
    <ContenedorPagina ancho="estrecho">
      <EncabezadoPagina
        antetitulo="Mis campañas"
        titulo="Nueva campaña"
        descripcion="Define qué promocionas, su vigencia y su presupuesto. Después le agregas las ofertas para los medios."
      />
      <NotaEmpresa estado={empresa?.estado ?? "PENDIENTE"} />
      <FormularioNuevaCampana reglas={reglasNuevaCampana(hoy)} />
    </ContenedorPagina>
  )
}

/** Contenido de `/campanas/[id]/editar` (la página ya autorizó con el DAL). */
export async function EdicionCampana({
  anuncianteId,
  campanaId,
}: {
  anuncianteId: string
  campanaId: string
}) {
  const [campana, ofertas] = await Promise.all([
    obtenerMiCampana(anuncianteId, campanaId),
    ofertasDeMiCampana(campanaId),
  ])
  if (!campana) notFound()
  const volver = (
    <EnlaceBoton
      variant="ghost"
      size="sm"
      className="-ml-2 w-fit text-muted-foreground"
      href={rutaMiCampana(campana.id)}
    >
      <ArrowLeft data-icon="inline-start" aria-hidden />
      {campana.nombre}
    </EnlaceBoton>
  )

  if (!esEditable(campana.estado)) {
    return (
      <ContenedorPagina ancho="estrecho">
        <TituloMiga titulo="Editar" />
        {volver}
        <EstadoVacio
          icono={Lock}
          titulo="Esta campaña ya no se puede editar"
          descripcion="Solo se cambian las campañas en borrador o activas. Sus datos siguen a la vista en la ficha."
        >
          <EnlaceBoton href={rutaMiCampana(campana.id, "datos")}>
            Ver los datos de la campaña
          </EnlaceBoton>
        </EstadoVacio>
      </ContenedorPagina>
    )
  }

  const reglas = reglasEdicion(campana, ofertas, serializarFecha(new Date()))
  return (
    <ContenedorPagina ancho="estrecho">
      <TituloMiga titulo="Editar" />
      <div className="flex flex-col gap-4">
        {volver}
        <EncabezadoPagina
          antetitulo={`Campaña · ${campana.marca}`}
          titulo="Editar campaña"
          descripcion={
            reglas.inicioMaximo || reglas.presupuestoMinimo > 0
              ? "Las fechas y el presupuesto deben seguir cubriendo lo que ya tienen tus ofertas en revisión o publicadas."
              : "Ajusta su nombre, objetivo, vigencia o presupuesto."
          }
        />
      </div>
      <FormularioEditarCampana
        key={campana.actualizadaAt}
        campana={campana}
        reglas={reglas}
      />
    </ContenedorPagina>
  )
}
