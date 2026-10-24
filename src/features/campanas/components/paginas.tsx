import "server-only"

import { ArrowLeft, Building2, Info, Lock } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import { serializarFecha } from "@/lib/fechas"

import { RUTAS_OPERACION, rutaAnunciante } from "@/features/operacion/rutas"

import { reglasEdicion, reglasNuevaCampana } from "../formularios"
import { motivoSinActivar } from "../presentacion"
import {
  anunciantesParaGestion,
  obtenerCampanaGestionable,
  obtenerMiCampana,
  ofertasDeMiCampana,
  situacionEmpresa,
} from "../queries"
import { esEditable } from "../reglas"
import { RUTA_MI_EMPRESA, rutaMiCampana } from "../rutas"
import {
  GESTION_PROPIA,
  type ModoGestion,
  rutasGestion,
} from "../rutas-gestion"
import type { EstadoAnunciante } from "../tipos"
import { AvisoModoAsistido } from "./aviso-modo-asistido"
import {
  FormularioEditarCampana,
  FormularioNuevaCampana,
  FormularioNuevaCampanaAsistida,
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

/**
 * Contenido de `/operacion/campanas/nueva` (ADM-014; la página ya autorizó
 * con el DAL): el equipo AMO elige la empresa —preseleccionada con
 * `?anunciante=`— y crea la campaña por su cuenta.
 */
export async function NuevaCampanaAsistida({
  anuncianteInicial,
}: {
  anuncianteInicial: string | null
}) {
  const anunciantes = await anunciantesParaGestion()
  const hoy = serializarFecha(new Date())
  const desconocido =
    anuncianteInicial !== null &&
    !anunciantes.some((opcion) => opcion.id === anuncianteInicial)
  return (
    <ContenedorPagina ancho="estrecho">
      <TituloMiga titulo="Nueva campaña" />
      <div className="flex flex-col gap-4">
        <EnlaceBoton
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground"
          href={RUTAS_OPERACION.campanas}
        >
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Campañas
        </EnlaceBoton>
        <EncabezadoPagina
          antetitulo="Gestión asistida"
          titulo="Nueva campaña"
          descripcion="Crea la campaña por cuenta de un anunciante. Nace en borrador; después le agregas sus ofertas desde su ficha."
        />
      </div>
      {desconocido ? (
        <p className="flex items-start gap-2.5 rounded-xl border bg-muted/30 p-3.5 text-sm text-pretty text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            El anunciante del enlace ya no está disponible. Elige otro de la
            lista.
          </span>
        </p>
      ) : null}
      {anunciantes.length === 0 ? (
        <EstadoVacio
          icono={Building2}
          titulo="Aún no hay anunciantes"
          descripcion="Cuando una empresa se registre en AMO podrás crear campañas por su cuenta."
        />
      ) : (
        <FormularioNuevaCampanaAsistida
          reglas={reglasNuevaCampana(hoy)}
          anunciantes={anunciantes}
          anuncianteInicial={desconocido ? null : anuncianteInicial}
        />
      )}
    </ContenedorPagina>
  )
}

type PropsEdicion = { campanaId: string } & (
  { anuncianteId: string; asistido?: false } | { asistido: true }
)

/**
 * Contenido de `/campanas/[id]/editar` y, en la gestión asistida (ADM-014),
 * de `/operacion/campanas/[id]/editar` (la página ya autorizó con el DAL).
 * El anunciante solo abre las de su empresa; el equipo AMO, la que la RLS le
 * deje ver, con el aviso de que actúa por cuenta de la empresa.
 */
export async function EdicionCampana(props: PropsEdicion) {
  const { campanaId } = props
  const [campana, ofertas] = await Promise.all([
    props.asistido
      ? obtenerCampanaGestionable(campanaId)
      : obtenerMiCampana(props.anuncianteId, campanaId),
    ofertasDeMiCampana(campanaId),
  ])
  if (!campana) notFound()
  const empresa = props.asistido
    ? await situacionEmpresa(campana.anuncianteId)
    : null
  const gestion: ModoGestion = props.asistido
    ? {
        modo: "asistido",
        anuncianteId: campana.anuncianteId,
        anunciante: empresa?.nombre ?? "el anunciante",
      }
    : GESTION_PROPIA
  const rutas = rutasGestion(gestion)
  const aviso = props.asistido ? (
    <AvisoModoAsistido
      anunciante={empresa?.nombre ?? "el anunciante"}
      estado={empresa?.estado ?? null}
      enlace={rutaAnunciante(campana.anuncianteId)}
    />
  ) : null
  const volver = (
    <EnlaceBoton
      variant="ghost"
      size="sm"
      className="-ml-2 w-fit text-muted-foreground"
      href={rutas.campana(campana.id)}
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
          <EnlaceBoton
            href={
              props.asistido
                ? rutas.campana(campana.id)
                : rutaMiCampana(campana.id, "datos")
            }
          >
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
              ? `Las fechas y el presupuesto deben seguir cubriendo lo que ya tienen ${props.asistido ? "sus" : "tus"} ofertas en revisión o publicadas.`
              : "Ajusta su nombre, objetivo, vigencia o presupuesto."
          }
        />
      </div>
      {aviso}
      <FormularioEditarCampana
        key={campana.actualizadaAt}
        campana={campana}
        reglas={reglas}
        gestion={gestion}
      />
    </ContenedorPagina>
  )
}
