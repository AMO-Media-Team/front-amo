import { ClipboardCheck } from "lucide-react"

import { EnlaceBotonExterno } from "@/components/layout/enlace-boton"
import { AvisoEstadoOferta } from "@/features/ofertas/components/aviso-estado-oferta"
import { CabeceraOferta } from "@/features/ofertas/components/cabecera-oferta"
import { COLUMNAS_FICHA_OFERTA } from "@/features/ofertas/components/esqueletos"
import { HistorialOferta } from "@/features/ofertas/components/historial-oferta"
import { ResumenOferta } from "@/features/ofertas/components/resumen-oferta"
import { construirHistorial } from "@/features/ofertas/historial"
import {
  fechaLimiteVencida,
  situacionOferta,
  urgenciaSegunEstado,
} from "@/features/ofertas/presentacion"
import type { OfertaCompleta } from "@/features/ofertas/tipos"
import { rutaAnunciante, rutaCampana } from "@/features/operacion/rutas"
import type { UsuarioSesion } from "@/lib/auth/tipos"

import { RUTA_MODERACION } from "../cola"
import { decisionesDisponibles } from "../decision"
import { CreativosModeracion } from "./creativos-moderacion"
import { DecisionModeracion } from "./decision-moderacion"

const ID_DECISION = "decision-oferta"

/**
 * Ficha interna de la oferta (ADM-005): vista completa para moderar
 * (segmentación, presupuesto y cupos, condiciones, creativos e historial) y
 * la decisión que el estado y el rol permiten. Quien solo consulta ofertas
 * la ve sin el panel de decisión.
 */
export function FichaOfertaInterna({
  oferta,
  usuario,
}: {
  oferta: OfertaCompleta
  usuario: UsuarioSesion
}) {
  const ahora = new Date()
  const { permisos } = usuario
  const puedeModerar = permisos.includes("ofertas.moderar")
  const urgencia = urgenciaSegunEstado(
    oferta.estado,
    oferta.fechaLimiteAceptacion,
    ahora
  )
  const opciones = decisionesDisponibles(oferta.estado, permisos, {
    fechaLimiteVencida: fechaLimiteVencida(oferta.fechaLimiteAceptacion, ahora),
    cuposOcupados: oferta.cupos.ocupados,
  })
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
    "interno"
  )
  const historial = construirHistorial(
    {
      filas: oferta.historial,
      fechas: oferta.fechas,
      comentarioModeracion: oferta.comentarioModeracion,
      ventanaInicio: oferta.ventanaInicio,
    },
    { perspectiva: "interno", usuarioId: usuario.id }
  )

  return (
    <>
      <CabeceraOferta
        oferta={oferta}
        urgencia={urgencia}
        conReenvio={
          oferta.estado === "EN_REVISION" && oferta.fechas.devueltaAt !== null
        }
        enlaces={{
          volver: puedeModerar
            ? { href: RUTA_MODERACION, titulo: "Moderación" }
            : {
                href: rutaCampana(oferta.campana.id),
                titulo: oferta.campana.nombre,
              },
          campana: {
            href: rutaCampana(oferta.campana.id),
            permitido: permisos.includes("campanas.ver"),
          },
          anunciante: {
            href: rutaAnunciante(oferta.anunciante.id),
            permitido:
              oferta.anunciante.id !== "" &&
              permisos.includes("anunciantes.ver"),
          },
        }}
        acciones={
          opciones.length > 0 ? (
            // En pantallas angostas la decisión queda al final, tras revisar todo.
            <EnlaceBotonExterno
              href={`#${ID_DECISION}`}
              size="lg"
              className="w-full sm:w-auto lg:hidden"
            >
              <ClipboardCheck data-icon="inline-start" aria-hidden />
              Ir a la decisión
            </EnlaceBotonExterno>
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
            perspectiva="interno"
            urgencia={urgencia}
          />
          <CreativosModeracion versiones={oferta.creativos} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {opciones.length > 0 ? (
            <div id={ID_DECISION} className="scroll-mt-20">
              <DecisionModeracion
                oferta={{
                  id: oferta.id,
                  titulo: oferta.titulo,
                  estado: oferta.estado,
                  enviadaAt: oferta.fechas.enviadaAt,
                }}
                opciones={opciones}
              />
            </div>
          ) : null}
          <HistorialOferta historial={historial} />
        </div>
      </div>
    </>
  )
}
