import { Ban, CircleSlash, Scale, TimerOff, TriangleAlert } from "lucide-react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { rutaDisputaMedio } from "@/features/disputas/rutas"
import { AvisoFicha } from "@/features/operacion/components/ficha"
import { CAUSAS_CANCELACION } from "@/features/operacion/estados"
import { formatearFechaHora } from "@/lib/format"

import { textoContacto } from "../contacto"
import { efectoApertura } from "../disputa"
import { consecuenciaCancelacion, estaEnCurso } from "../estados"
import type { AsignacionMedio } from "../tipos"
import { AvisoSuspensionMedio } from "./aviso-suspension"

/*
 * Avisos de la ficha de una campaña del medio (bajo su cabecera). Sin lecturas
 * propias: la cabecera (Server Component) le pasa lo que sabe de apoyo.
 */

/** Lo que la cabecera sabe además de la asignación (datos de apoyo). */
export interface ContextoAvisoMedio {
  /** `soporte.correo`; `null` sin valor (entonces no se ofrece escribir). */
  correoSoporte: string | null
  /** El medio está suspendido: sus campañas en curso lo dicen (D73). */
  medioSuspendido: boolean
}

const SIN_CONTEXTO: ContextoAvisoMedio = {
  correoSoporte: null,
  medioSuspendido: false,
}

function EnlaceAvisoDisputa({
  asignacionId,
  texto,
}: {
  asignacionId: string
  texto: string
}) {
  return (
    <EnlaceBoton
      href={rutaDisputaMedio(asignacionId)}
      variant="outline"
      size="sm"
      className="mt-2 w-fit"
    >
      <Scale data-icon="inline-start" aria-hidden />
      {texto}
    </EnlaceBoton>
  )
}

/** «La abriste tú», «La abrió el anunciante», «La abrió el equipo AMO». */
function quienAbrioDisputa(asignacion: AsignacionMedio): string | null {
  switch (asignacion.disputa?.parte) {
    case "MEDIO":
      return "La abriste tú."
    case "ANUNCIANTE":
      return "La abrió el anunciante."
    case "ADMIN":
      return "La abrió el equipo AMO."
    default:
      return null
  }
}

/** El aviso del estado: cancelada, desistida, vencida, en disputa o con métricas atrasadas. */
function AvisoEstadoMedio({
  asignacion,
  correo,
}: {
  asignacion: AsignacionMedio
  correo: string | null
}) {
  switch (asignacion.estado) {
    case "CANCELADA": {
      const causa = asignacion.causaCancelacion
        ? `Causa: ${CAUSAS_CANCELACION[asignacion.causaCancelacion].toLocaleLowerCase("es-CO")}.`
        : null
      const motivo = asignacion.motivo ? `«${asignacion.motivo}»` : null
      return (
        <AvisoFicha
          tono="peligro"
          icono={Ban}
          titulo="El equipo AMO canceló tu participación en esta campaña"
        >
          <span className="flex flex-col gap-1">
            <span>{consecuenciaCancelacion(asignacion.causaCancelacion)}</span>
            {causa || motivo ? (
              <span>{[causa, motivo].filter(Boolean).join(" ")}</span>
            ) : null}
            {correo ? <span>{textoContacto(correo)}</span> : null}
          </span>
          {asignacion.disputa ? (
            <EnlaceAvisoDisputa
              asignacionId={asignacion.id}
              texto="Ver la disputa"
            />
          ) : null}
        </AvisoFicha>
      )
    }
    case "RECHAZADA":
      return (
        <AvisoFicha
          tono="neutro"
          icono={CircleSlash}
          titulo="Desististe de esta campaña"
        >
          {asignacion.motivo
            ? `Tu motivo: «${asignacion.motivo}». El cupo quedó libre para otro medio.`
            : "El cupo quedó libre para otro medio."}
        </AvisoFicha>
      )
    case "VENCIDA_SIN_PUBLICAR":
      return (
        <AvisoFicha
          tono="peligro"
          icono={TimerOff}
          titulo="Venció el plazo para publicar"
        >
          {`La fecha límite era el ${formatearFechaHora(asignacion.fechaLimitePublicacion)} y no llegó la evidencia de la publicación. El cupo se liberó.`}
        </AvisoFicha>
      )
    case "EN_DISPUTA": {
      const previo = asignacion.estadoPrevioDisputa
      const reclamo = previo === "VENCIDA_SIN_PUBLICAR"
      // Lo que queda en pausa según de dónde venía: una verificada solo deja
      // de liquidarse y ya no recibe cortes (D72).
      const efecto = reclamo
        ? "Mientras lo revisamos, el cupo no vuelve a tu cuenta."
        : previo
          ? efectoApertura({
              perspectiva: "medio",
              modo: "problema",
              estadoAsignacion: previo,
            })
          : "Mientras dure la disputa, esta publicación no se verifica ni se liquida."
      return (
        <AvisoFicha
          tono="aviso"
          icono={Scale}
          titulo={
            reclamo ? "Estamos revisando tu reclamo" : "Hay una disputa abierta"
          }
        >
          {[reclamo ? null : quienAbrioDisputa(asignacion), efecto]
            .filter(Boolean)
            .join(" ")}
          <EnlaceAvisoDisputa
            asignacionId={asignacion.id}
            texto={reclamo ? "Ver tu reclamo" : "Ver la disputa"}
          />
        </AvisoFicha>
      )
    }
    case "PUBLICADA":
    case "EVIDENCIA_VALIDADA":
      return asignacion.metricasAtrasadasAt ? (
        <AvisoFicha
          tono="aviso"
          icono={TriangleAlert}
          titulo="Tienes métricas atrasadas"
        >
          Carga los cortes que faltan lo antes posible: sin ellos la campaña no
          se verifica ni entra a liquidación.
        </AvisoFicha>
      ) : null
    default:
      return null
  }
}

/**
 * Los avisos de la ficha: la suspensión del medio en una campaña en curso
 * (D73) y lo que dice el estado (desistida, vencida, cancelada —por fraude o
 * incumplimiento no se paga—, en disputa con su enlace, métricas atrasadas).
 */
export function AvisoAsignacionMedio({
  asignacion,
  contexto = SIN_CONTEXTO,
}: {
  asignacion: AsignacionMedio
  contexto?: ContextoAvisoMedio
}) {
  const suspension = contexto.medioSuspendido && estaEnCurso(asignacion.estado)
  const estado = (
    <AvisoEstadoMedio asignacion={asignacion} correo={contexto.correoSoporte} />
  )
  if (!suspension) return estado
  return (
    <div className="flex flex-col gap-3">
      <AvisoSuspensionMedio />
      {estado}
    </div>
  )
}
