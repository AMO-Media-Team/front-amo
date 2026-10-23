import { ImagePlus } from "lucide-react"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { VersionesCreativo } from "@/features/creativos/components/versiones-creativo"

import { ESTADOS_EDITABLES } from "../acciones"
import { rutaPasoAsistente } from "../rutas"
import type { OfertaCompleta } from "../tipos"

/** Estados en los que el anunciante prepara una versión nueva del creativo (ANU-010). */
const ESTADOS_VERSIONABLES = new Set([
  "PUBLICADA",
  "CUPOS_COMPLETOS",
  "EN_EJECUCION",
])

/** Bloque titulado de la ficha (sin tarjeta: el contenido trae las suyas). */
export function SeccionFicha({
  id,
  titulo,
  descripcion,
  children,
}: {
  id: string
  titulo: string
  descripcion?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-base font-semibold">
          {titulo}
        </h2>
        {descripcion ? (
          <p className="text-sm text-pretty text-muted-foreground">
            {descripcion}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/**
 * Paquete creativo en la ficha del anunciante: versión vigente, pendiente e
 * historial (`VersionesCreativo`). En una oferta publicada puede preparar y
 * activar una versión nueva; antes de publicarla se edita en el asistente.
 */
export function SeccionCreativosAnunciante({
  oferta,
  puedeGestionar,
}: {
  oferta: OfertaCompleta
  /** `ofertas.gestionar_propias`. */
  puedeGestionar: boolean
}) {
  const editable = puedeGestionar && ESTADOS_EDITABLES.has(oferta.estado)
  return (
    <SeccionFicha
      id="paquete-creativo"
      titulo="Paquete creativo"
      descripcion={
        editable
          ? "Lo que descargarán los medios. Mientras la oferta no esté publicada, se edita en el asistente."
          : "Lo que descargan los medios. Si publicas una versión nueva, los medios con cupo reciben el aviso."
      }
    >
      {oferta.creativos.length === 0 ? (
        <EstadoVacio
          icono={ImagePlus}
          titulo="Aún no hay paquete creativo"
          descripcion="Carga las imágenes o videos, el copy sugerido y el enlace de destino. Sin creativo la oferta no se puede enviar a revisión."
        >
          {editable ? (
            <EnlaceBoton
              href={rutaPasoAsistente(oferta.campana.id, oferta.id, "creativo")}
              size="lg"
            >
              Cargar el paquete creativo
            </EnlaceBoton>
          ) : null}
        </EstadoVacio>
      ) : (
        <VersionesCreativo
          ofertaId={oferta.id}
          versiones={oferta.creativos}
          puedeVersionar={
            puedeGestionar && ESTADOS_VERSIONABLES.has(oferta.estado)
          }
        />
      )}
    </SeccionFicha>
  )
}
