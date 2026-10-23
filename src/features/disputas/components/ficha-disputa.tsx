import { ClipboardCheck, EyeOff, Scale } from "lucide-react"

import { EnlaceBotonExterno } from "@/components/layout/enlace-boton"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import {
  AvisoFicha,
  CabeceraFicha,
  EnlaceFicha,
  Monograma,
} from "@/features/operacion/components/ficha"
import { formatearFechaHoraFija } from "@/features/operacion/formato"
import {
  rutaAnunciante,
  rutaCampana,
  rutaMedio,
} from "@/features/operacion/rutas"
import type { UsuarioSesion } from "@/lib/auth/tipos"

import { ETIQUETAS_PARTE, MOTIVOS } from "../presentacion"
import {
  decisionesDisputa,
  opcionesResolucion,
  situacionVerificacion,
} from "../resolucion"
import { RUTA_DISPUTAS } from "../rutas"
import type { DisputaInterna } from "../tipos"
import { DecisionDisputa } from "./decision-disputa"
import { COLUMNAS_FICHA_DISPUTA } from "./esqueletos"
import { EstadoDisputa, InsigniaEstadoDisputa } from "./estado-disputa"
import { HiloDisputa } from "./hilo-disputa"
import { ResumenAsignacionDisputa } from "./resumen-asignacion"

const ENLACE = "font-medium text-foreground"
const ID_DECISION = "decision-disputa"

/** Quién abrió la disputa: la entidad de su parte y, si el rol la ve, la persona. */
function autorApertura(disputa: DisputaInterna): string | undefined {
  const { asignacion } = disputa
  const entidad =
    disputa.parte === "MEDIO"
      ? asignacion?.medio.nombre
      : disputa.parte === "ANUNCIANTE"
        ? asignacion?.anunciante.nombre
        : "Equipo AMO"
  const partes = [entidad, disputa.abiertaPor].filter(Boolean)
  return partes.length > 0 ? partes.join(" · ") : undefined
}

/**
 * Ficha interna de una disputa (ADM-012): la asignación resumida, quién la
 * abrió y por qué, el hilo con las notas internas resaltadas y sus adjuntos,
 * y la decisión que permiten el estado y el rol (tomar en revisión, resolver
 * con su efecto o descartar). Quien solo consulta (FINANZAS) la ve en solo
 * lectura: sin decisión y sin caja de respuesta.
 */
export function FichaDisputa({
  disputa,
  usuario,
}: {
  disputa: DisputaInterna
  usuario: UsuarioSesion
}) {
  const ahora = new Date()
  const { permisos } = usuario
  const { asignacion } = disputa
  const resuelve = permisos.includes("disputas.resolver")
  const opciones = decisionesDisputa(disputa.estado, permisos)
  const verificacion = asignacion
    ? situacionVerificacion(
        {
          publicacionesEsperadas: asignacion.publicacionesEsperadas,
          cortesRequeridos: asignacion.cortesRequeridos,
          publicaciones: asignacion.publicaciones,
          metricas: asignacion.metricas,
        },
        ahora
      )
    : null
  const resolucion =
    asignacion && verificacion
      ? opcionesResolucion({
          estadoPrevio: asignacion.estadoPrevioDisputa,
          ofertaCerrada: asignacion.oferta.cerrada,
          verificacion,
          puedeVerificar: permisos.includes("metricas.validar"),
          puedeConstanciaManual: permisos.includes("metricas.editar_validadas"),
          plazoRecargaHoras: disputa.plazoRecargaHoras,
        })
      : []
  const motivo = MOTIVOS[disputa.motivo].etiqueta
  const titulo =
    asignacion?.oferta.titulo ??
    `Disputa por ${motivo.toLocaleLowerCase("es-CO")}`
  const enlaces = {
    asignacion: permisos.includes("asignaciones.ver"),
    medio: permisos.includes("medios.ver"),
    campana: permisos.includes("campanas.ver"),
    anunciante: permisos.includes("anunciantes.ver"),
    oferta: permisos.includes("ofertas.ver"),
  }

  return (
    <>
      <CabeceraFicha
        volver={{ href: RUTA_DISPUTAS, titulo: "Disputas" }}
        antetitulo={`Disputa · ${motivo}`}
        titulo={titulo}
        visual={<Monograma icono={Scale} />}
        subtitulo={
          asignacion ? (
            <span className="flex flex-col gap-x-2 gap-y-1 sm:flex-row sm:flex-wrap sm:items-center">
              <EnlaceFicha
                href={rutaMedio(asignacion.medio.id)}
                permitido={enlaces.medio}
                className={ENLACE}
              >
                {asignacion.medio.nombre ?? "Medio"}
              </EnlaceFicha>
              <span aria-hidden className="max-sm:hidden">
                ×
              </span>
              <EnlaceFicha
                href={rutaCampana(asignacion.campana.id)}
                permitido={enlaces.campana}
                className={ENLACE}
              >
                {asignacion.campana.nombre ?? "Campaña"}
              </EnlaceFicha>
              <span aria-hidden className="max-sm:hidden">
                ·
              </span>
              <EnlaceFicha
                href={rutaAnunciante(asignacion.anunciante.id)}
                permitido={enlaces.anunciante}
              >
                {asignacion.anunciante.nombre ?? "Anunciante"}
              </EnlaceFicha>
            </span>
          ) : null
        }
        distintivos={
          <>
            <InsigniaEstadoDisputa
              estado={disputa.estado}
              perspectiva="interno"
            />
            <InsigniaTono
              tono="neutro"
              etiqueta={`La abrió: ${ETIQUETAS_PARTE[disputa.parte].toLocaleLowerCase("es-CO")}`}
            />
          </>
        }
        lateral={
          <>
            <span>
              Abierta el{" "}
              <time dateTime={disputa.creadaAt} className="cifras">
                {formatearFechaHoraFija(disputa.creadaAt)}
              </time>
            </span>
            {disputa.resueltaAt ? (
              <span>
                Cerrada el{" "}
                <time dateTime={disputa.resueltaAt} className="cifras">
                  {formatearFechaHoraFija(disputa.resueltaAt)}
                </time>
                {disputa.resueltaPor ? ` por ${disputa.resueltaPor}` : ""}
              </span>
            ) : null}
          </>
        }
        acciones={
          opciones.length > 0 ? (
            // En pantallas angostas la decisión queda tras la conversación.
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
          <EstadoDisputa
            disputa={disputa}
            perspectiva="interno"
            contexto={{
              fechaLimitePublicacion: asignacion?.fechaLimitePublicacion,
              causaCancelacion: asignacion?.causaCancelacion,
              plazoRecargaHoras: disputa.plazoRecargaHoras,
            }}
          />
        }
      />
      <div className={COLUMNAS_FICHA_DISPUTA}>
        <div className="flex min-w-0 flex-col gap-6">
          <HiloDisputa
            // Solo lo que pinta el hilo: el resto de la ficha no viaja al cliente.
            disputa={{
              id: disputa.id,
              estado: disputa.estado,
              parte: disputa.parte,
              motivo: disputa.motivo,
              descripcion: disputa.descripcion,
              creadaAt: disputa.creadaAt,
              resueltaAt: disputa.resueltaAt,
            }}
            mensajes={disputa.mensajes}
            perspectiva="interno"
            puedeEscribir={resuelve}
            puedeNotaInterna={resuelve}
            autorApertura={autorApertura(disputa)}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {opciones.length > 0 ? (
            <div id={ID_DECISION} className="scroll-mt-20">
              <DecisionDisputa
                disputa={{ id: disputa.id, estado: disputa.estado, titulo }}
                opciones={opciones}
                resolucion={resolucion}
                permanenciaHasta={verificacion?.permanenciaHasta ?? null}
              />
            </div>
          ) : null}
          {asignacion ? (
            <ResumenAsignacionDisputa
              asignacion={asignacion}
              enlaces={enlaces}
            />
          ) : (
            <AvisoFicha
              tono="neutro"
              icono={EyeOff}
              titulo="No ves la asignación de esta disputa"
            >
              Tu rol no tiene acceso a las asignaciones. Pide a un administrador
              el permiso «Ver asignaciones» si necesitas revisarla.
            </AvisoFicha>
          )}
        </div>
      </div>
    </>
  )
}
