import { rutaMiCampana } from "@/features/campanas/rutas"
import type { UsuarioSesion } from "@/lib/auth/tipos"

import { accionesGestion } from "../acciones"
import { construirHistorial } from "../historial"
import { situacionOferta, urgenciaSegunEstado } from "../presentacion"
import { rutaOfertasDeCampana } from "../rutas"
import type { OfertaCompleta } from "../tipos"
import { AccionesOferta } from "./acciones-oferta"
import { AvisoEstadoOferta } from "./aviso-estado-oferta"
import { CabeceraOferta } from "./cabecera-oferta"
import { COLUMNAS_FICHA_OFERTA } from "./esqueletos"
import { HistorialOferta } from "./historial-oferta"
import { ResumenOferta } from "./resumen-oferta"
import { SeccionCreativosAnunciante } from "./seccion-creativos"

/**
 * Ficha de la oferta para su anunciante (ANU-009, ANU-014): estado con su
 * explicación y la devolución destacada, resumen, paquete creativo con sus
 * versiones, historial y las acciones que el estado permite.
 */
export function FichaOfertaAnunciante({
  oferta,
  usuario,
}: {
  oferta: OfertaCompleta
  usuario: UsuarioSesion
}) {
  const ahora = new Date()
  const urgencia = urgenciaSegunEstado(
    oferta.estado,
    oferta.fechaLimiteAceptacion,
    ahora
  )
  const situacion = situacionOferta(
    {
      estado: oferta.estado,
      fechas: oferta.fechas,
      fechaLimiteAceptacion: oferta.fechaLimiteAceptacion,
      ventanaInicio: oferta.ventanaInicio,
      ventanaFin: oferta.ventanaFin,
      comentarioModeracion: oferta.comentarioModeracion,
      ultimoCambio: oferta.historial.at(-1) ?? null,
    },
    "anunciante"
  )
  const historial = construirHistorial(
    {
      filas: oferta.historial,
      fechas: oferta.fechas,
      comentarioModeracion: oferta.comentarioModeracion,
      ventanaInicio: oferta.ventanaInicio,
    },
    { perspectiva: "anunciante", usuarioId: usuario.id }
  )
  const opciones = accionesGestion(
    oferta.estado,
    "ANUNCIANTE",
    usuario.permisos,
    { cuposOcupados: oferta.cupos.ocupados }
  )

  return (
    <>
      <CabeceraOferta
        oferta={oferta}
        urgencia={urgencia}
        perspectiva="anunciante"
        enlaces={{
          volver: {
            href: rutaOfertasDeCampana(oferta.campana.id),
            titulo: oferta.campana.nombre,
          },
          campana: {
            href: rutaMiCampana(oferta.campana.id),
            permitido: true,
          },
        }}
        acciones={
          opciones.length > 0 ? (
            <AccionesOferta
              ofertaId={oferta.id}
              campanaId={oferta.campana.id}
              titulo={oferta.titulo}
              estado={oferta.estado}
              opciones={opciones}
            />
          ) : null
        }
        aviso={
          <AvisoEstadoOferta estado={oferta.estado} situacion={situacion} />
        }
      />
      <div className={COLUMNAS_FICHA_OFERTA}>
        <div className="flex min-w-0 flex-col gap-6">
          <ResumenOferta
            oferta={oferta}
            perspectiva="anunciante"
            urgencia={urgencia}
          />
          <SeccionCreativosAnunciante
            oferta={oferta}
            puedeGestionar={usuario.permisos.includes(
              "ofertas.gestionar_propias"
            )}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <HistorialOferta historial={historial} />
        </div>
      </div>
    </>
  )
}
