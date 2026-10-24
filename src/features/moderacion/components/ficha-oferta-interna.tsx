import { ClipboardCheck } from "lucide-react"

import { EnlaceBotonExterno } from "@/components/layout/enlace-boton"
import { puedeGestionarOfertasAsistidas } from "@/features/campanas/gestion"
import type { ModoGestion } from "@/features/campanas/rutas-gestion"
import { accionesGestion, ESTADOS_EDITABLES } from "@/features/ofertas/acciones"
import { AvisoEstadoOferta } from "@/features/ofertas/components/aviso-estado-oferta"
import { CabeceraOferta } from "@/features/ofertas/components/cabecera-oferta"
import { COLUMNAS_FICHA_OFERTA } from "@/features/ofertas/components/esqueletos"
import { HistorialOferta } from "@/features/ofertas/components/historial-oferta"
import { ResumenOferta } from "@/features/ofertas/components/resumen-oferta"
import {
  creativoGestionable,
  SeccionCreativosAnunciante,
} from "@/features/ofertas/components/seccion-creativos"
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
import { PanelGestionAsistida } from "./panel-gestion-asistida"

const ID_DECISION = "decision-oferta"

/**
 * Lo que el equipo AMO hace con la oferta por cuenta del anunciante
 * (ADM-014): sus transiciones de `ofertas.gestionar` (no las de moderación) y
 * editarla si puede abrir el asistente asistido (todos sus permisos).
 */
function gestionAsistida(oferta: OfertaCompleta, usuario: UsuarioSesion) {
  const { permisos } = usuario
  if (usuario.rol.tipo !== "ADMIN" || !permisos.includes("ofertas.gestionar")) {
    return null
  }
  const asistente = puedeGestionarOfertasAsistidas(permisos)
  const opciones = accionesGestion(oferta.estado, "ADMIN", permisos, {
    cuposOcupados: oferta.cupos.ocupados,
  }).filter((opcion) => opcion.accion !== "editar" || asistente)
  const gestion: Extract<ModoGestion, { modo: "asistido" }> = {
    modo: "asistido",
    anuncianteId: oferta.anunciante.id,
    anunciante: oferta.anunciante.nombre ?? "el anunciante",
  }
  return { opciones, gestion, asistente }
}

/**
 * Ficha interna de la oferta (ADM-005): vista completa para moderar
 * (segmentación, presupuesto y cupos, condiciones, creativos e historial) y
 * la decisión que el estado y el rol permiten. Quien solo consulta ofertas
 * la ve sin el panel de decisión. Con `ofertas.gestionar` (ADM-014) suma el
 * panel «Gestión por cuenta del anunciante», separado de la decisión, y la
 * carga del paquete creativo mientras la oferta lo admite.
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
  const asistida = gestionAsistida(oferta, usuario)
  const verAnunciante =
    oferta.anunciante.id !== "" && permisos.includes("anunciantes.ver")
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
          // Un borrador o una devuelta que el equipo prepara por cuenta del
          // anunciante no está en la cola: se vuelve a su campaña.
          volver:
            puedeModerar && !(asistida && ESTADOS_EDITABLES.has(oferta.estado))
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
            permitido: verAnunciante,
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
          {/* Cargar y versionar el paquete lleva al asistente asistido: exige sus permisos. */}
          {asistida?.asistente && creativoGestionable(oferta.estado) ? (
            <SeccionCreativosAnunciante
              oferta={oferta}
              puedeGestionar
              gestion={asistida.gestion}
            />
          ) : (
            <CreativosModeracion versiones={oferta.creativos} />
          )}
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
          {asistida ? (
            <PanelGestionAsistida
              oferta={{
                id: oferta.id,
                campanaId: oferta.campana.id,
                titulo: oferta.titulo,
                estado: oferta.estado,
              }}
              opciones={asistida.opciones}
              gestion={asistida.gestion}
              enlaceAnunciante={
                verAnunciante ? rutaAnunciante(oferta.anunciante.id) : null
              }
            />
          ) : null}
          <HistorialOferta historial={historial} />
        </div>
      </div>
    </>
  )
}
