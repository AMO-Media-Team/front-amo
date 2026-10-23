import {
  BadgeCheck,
  Download,
  Hourglass,
  Lock,
  RadioTower,
  TimerOff,
  type LucideIcon,
} from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import {
  CabeceraEjecucion,
  NavegacionPublicaciones,
} from "@/features/ejecucion/components/cabecera-ejecucion"
import { EstadoEjecucion } from "@/features/ejecucion/components/estado-ejecucion"
import {
  FormularioEvidencia,
  type ModoEvidencia,
} from "@/features/ejecucion/components/formulario-evidencia"
import { ResumenEvidencia } from "@/features/ejecucion/components/resumen-evidencia"
import { MENSAJES_EJECUCION } from "@/features/ejecucion/errores"
import {
  admiteEnvio,
  type SituacionEvidencia,
  situacionEvidencia,
} from "@/features/ejecucion/evidencia"
import {
  textoSituacionEvidencia,
  tituloEvidencia,
} from "@/features/ejecucion/presentacion"
import { contextoEvidencia } from "@/features/ejecucion/queries"
import type { ContextoEvidencia } from "@/features/ejecucion/tipos"
import {
  rutaAsignacionMedio,
  rutaContenido,
  rutaEvidencia,
} from "@/features/mis-campanas/rutas"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Evidencia de publicación" }

const ICONOS: Readonly<Record<SituacionEvidencia["tipo"], LucideIcon>> = {
  "descargar-primero": Download,
  cargar: Download,
  corregir: Download,
  "en-revision": Hourglass,
  aprobada: BadgeCheck,
  vencida: TimerOff,
  cerrada: Lock,
}

function modoDe(situacion: SituacionEvidencia): ModoEvidencia {
  if (situacion.tipo === "corregir") return "corregir"
  return situacion.tipo === "en-revision" ? "revision" : "cargar"
}

/** Publicaciones de la oferta que aún no tienen evidencia válida. */
function pendientesDe({ asignacion, publicaciones }: ContextoEvidencia) {
  return Array.from(
    { length: asignacion.publicaciones },
    (_, i) => i + 1
  ).filter((numero) => {
    const registrada = publicaciones.find((p) => p.numero === numero)
    return !registrada || registrada.estado === "RECHAZADA"
  })
}

/** Acción que sigue cuando la evidencia no se puede enviar. */
function AccionSiguiente({
  contexto,
  situacion,
}: {
  contexto: ContextoEvidencia
  situacion: SituacionEvidencia
}) {
  const { asignacion, numero } = contexto
  if (situacion.tipo === "descargar-primero") {
    return (
      <EnlaceBoton href={rutaContenido(asignacion.id)}>
        <Download data-icon="inline-start" aria-hidden />
        Ver y descargar el contenido
      </EnlaceBoton>
    )
  }
  const siguiente = pendientesDe(contexto).find((otro) => otro !== numero)
  if (situacion.tipo === "aprobada" && siguiente) {
    return (
      <EnlaceBoton href={rutaEvidencia(asignacion.id, siguiente)}>
        Sigue con la publicación {siguiente}
      </EnlaceBoton>
    )
  }
  return (
    <EnlaceBoton href={rutaAsignacionMedio(asignacion.id)} variant="outline">
      Volver a la campaña
    </EnlaceBoton>
  )
}

/**
 * Evidencia de una publicación (MED-013, INT-001, INT-002): el medio registra
 * el enlace del post, la fecha y hora de publicación, la captura de las
 * estadísticas y la etiqueta de publicidad; corrige la que AMO rechazó con
 * sus observaciones. `?numero=N` elige la publicación cuando la oferta pide
 * varias.
 */
export default async function PaginaEvidencia({
  params,
  searchParams,
}: PageProps<"/mis-campanas/[id]/evidencia">) {
  const usuario = await requerirPermiso("asignaciones.ejecutar")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  if (!usuario.medioId) {
    return (
      <ContenedorPagina ancho="estrecho">
        <EstadoVacio
          icono={RadioTower}
          titulo="Tu usuario no está vinculado a un medio"
          descripcion={MENSAJES_EJECUCION.sinMedio}
        />
      </ContenedorPagina>
    )
  }
  const { numero: numeroPedido } = await searchParams
  const contexto = await contextoEvidencia(id, numeroPedido)
  if (!contexto) notFound()

  const ahora = new Date().getTime()
  const { asignacion, numero, publicacion, publicaciones } = contexto
  const situacion = situacionEvidencia(asignacion, publicacion, new Date(ahora))
  const titulo = tituloEvidencia(numero, asignacion.publicaciones)
  const texto = textoSituacionEvidencia(situacion)

  return (
    <ContenedorPagina ancho="estrecho" className="gap-5">
      <TituloMiga titulo={titulo} />
      <CabeceraEjecucion
        asignacion={asignacion}
        titulo={titulo}
        descripcion={`${asignacion.ofertaTitulo}. Registra el enlace, la fecha y la captura de tu publicación para que el equipo AMO la valide.`}
      />
      <NavegacionPublicaciones
        total={asignacion.publicaciones}
        actual={numero}
        estados={new Map(publicaciones.map((p) => [p.numero, p.estado]))}
        ruta={(otro) => rutaEvidencia(asignacion.id, otro)}
      />
      {admiteEnvio(situacion) ? (
        <FormularioEvidencia
          // Otra publicación es otro formulario (valores y captura propios).
          key={`${numero}-${publicacion?.actualizadaAt ?? "nueva"}`}
          asignacion={asignacion}
          numero={numero}
          publicacion={publicacion}
          modo={modoDe(situacion)}
          observaciones={
            situacion.tipo === "corregir" ? situacion.observaciones : null
          }
          contenido={contexto.contenido}
          pendientes={pendientesDe(contexto)}
          ahoraServidor={ahora}
        />
      ) : (
        <>
          {texto ? (
            <EstadoEjecucion texto={texto} icono={ICONOS[situacion.tipo]}>
              <AccionSiguiente contexto={contexto} situacion={situacion} />
            </EstadoEjecucion>
          ) : null}
          {publicacion ? (
            <ResumenEvidencia
              publicacion={publicacion}
              total={asignacion.publicaciones}
            />
          ) : null}
        </>
      )}
    </ContenedorPagina>
  )
}
