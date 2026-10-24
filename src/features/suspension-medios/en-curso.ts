/**
 * Asignaciones en curso de un medio (ADM-002 c2), módulo puro: de la fila de
 * `asignaciones_en_curso_medio` a lo que muestra la interfaz, en qué punto va
 * cada una y los textos del diálogo y del resultado de la suspensión.
 *
 * Suspender no cancela nada: el medio conserva lo que tiene en curso hasta que
 * el equipo AMO decide, en la ficha de cada asignación, si la cancela con su
 * causa. Una en disputa se decide al resolver la disputa.
 */
import {
  ESTADOS_ASIGNACION,
  type EstadoAsignacion,
} from "@/features/operacion/estados"
import { contar } from "@/features/operacion/formato"
import { formatearFechaHora } from "@/lib/format"

import type { AsignacionEnCurso, ResumenEnCurso } from "./tipos"

/** Fila de la RPC (las SRF se generan sin nulos en los tipos; aquí se corrigen). */
export interface FilaEnCurso {
  id: string
  estado: EstadoAsignacion
  estado_previo_disputa: EstadoAsignacion | null
  oferta_id: string
  oferta_titulo: string | null
  anunciante: string | null
  fecha_limite_publicacion: string | null
  monto_bruto: number | null
  disputa_abierta_id: string | null
  cancelable: boolean | null
}

export function asignacionEnCurso(fila: FilaEnCurso): AsignacionEnCurso {
  return {
    id: fila.id,
    estado: fila.estado,
    estadoPrevioDisputa: fila.estado_previo_disputa,
    ofertaId: fila.oferta_id,
    oferta: fila.oferta_titulo?.trim() || "Oferta sin título",
    anunciante: fila.anunciante?.trim() || "Anunciante sin nombre visible",
    fechaLimitePublicacion: fila.fecha_limite_publicacion,
    montoBruto: fila.monto_bruto,
    disputaAbiertaId: fila.disputa_abierta_id,
    // En disputa se cancela al resolverla (la BD lo rechaza con `en_disputa`).
    cancelable: fila.cancelable ?? fila.estado !== "EN_DISPUTA",
  }
}

/**
 * Primero las que se pueden decidir desde su ficha (por plazo, la más urgente
 * arriba); al final las que esperan la resolución de su disputa.
 */
export function ordenarEnCurso(
  lista: readonly AsignacionEnCurso[]
): AsignacionEnCurso[] {
  const plazo = (asignacion: AsignacionEnCurso) =>
    asignacion.fechaLimitePublicacion
      ? Date.parse(asignacion.fechaLimitePublicacion)
      : Number.POSITIVE_INFINITY
  return [...lista].sort(
    (a, b) =>
      Number(b.cancelable) - Number(a.cancelable) ||
      plazo(a) - plazo(b) ||
      a.id.localeCompare(b.id)
  )
}

export function resumirEnCurso(
  lista: readonly AsignacionEnCurso[]
): ResumenEnCurso {
  const cancelables = lista.filter((asignacion) => asignacion.cancelable).length
  return {
    total: lista.length,
    cancelables,
    enDisputa: lista.length - cancelables,
  }
}

/** En qué punto va la asignación, dicho para quien decide si la cancela. */
export function situacionEnCurso(asignacion: AsignacionEnCurso): string {
  const plazo = asignacion.fechaLimitePublicacion
    ? ` · publica hasta el ${formatearFechaHora(asignacion.fechaLimitePublicacion)}`
    : ""
  switch (asignacion.estado) {
    case "ACEPTADA":
      return `Aún no descarga el contenido${plazo}`
    case "CONTENIDO_ENTREGADO":
      return `Descargó el contenido${plazo}`
    case "PUBLICADA":
      return "Publicó; su evidencia espera validación"
    case "EVIDENCIA_VALIDADA":
      return "Evidencia aprobada; faltan sus métricas"
    case "METRICAS_CARGADAS":
      return "Cargó sus métricas; falta verificarla"
    case "VERIFICADA":
      return "Verificada: se liquida aunque el medio esté suspendido"
    case "EN_DISPUTA":
      return "En disputa: se decide al resolverla"
    default:
      return ESTADOS_ASIGNACION[asignacion.estado].descripcion
  }
}

function enCurso(cantidad: number): string {
  return contar(cantidad, "asignación en curso", "asignaciones en curso")
}

/** Encabezado de la lista en el diálogo de suspensión y en la ficha. */
export function textoResumenEnCurso(resumen: ResumenEnCurso): string {
  if (resumen.total === 0) {
    return "No tiene asignaciones en curso: la suspensión solo le impide ver y aceptar ofertas nuevas."
  }
  const partes = [`Tiene ${enCurso(resumen.total)}.`]
  if (resumen.cancelables > 0) {
    partes.push(
      resumen.cancelables === 1 && resumen.total === 1
        ? "Ábrela para decidir si la cancelas con su causa; si no, el medio puede seguir cumpliéndola."
        : "Abre cada una para decidir si la cancelas con su causa; las que no canceles, el medio puede seguir cumpliéndolas."
    )
  }
  if (resumen.enDisputa > 0) {
    partes.push(
      resumen.enDisputa === 1
        ? "Una está en disputa: se decide al resolverla."
        : `${contar(resumen.enDisputa, "está", "están")} en disputa: se deciden al resolverlas.`
    )
  }
  return partes.join(" ")
}

/** Descripción del aviso tras suspender: cuántas quedan en curso (ADM-002 c2). */
export function avisoResultadoSuspension(
  resumen: ResumenEnCurso | null
): string {
  if (resumen === null) {
    return "No puedes ver sus asignaciones: pide a quien tenga acceso que revise las que tiene en curso."
  }
  if (resumen.total === 0) return "No tenía asignaciones en curso."
  return resumen.total === 1
    ? "Queda 1 asignación en curso: revísala en la ficha para decidir si se cancela."
    : `Quedan ${enCurso(resumen.total)}: revísalas en la ficha para decidir si se cancelan.`
}

/** Ancla del título de «Asignaciones en curso por revisar» en la ficha (el aviso tras suspender lleva a él). */
export const ID_EN_CURSO_SUSPENDIDO = "asignaciones-en-curso"
