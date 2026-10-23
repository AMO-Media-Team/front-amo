/**
 * Formatos de publicación en el asistente (módulo puro): agrupación por
 * plataforma (solo lo que admite cada una: TikTok no tiene historias),
 * nombres y un resumen corto de requisitos para elegir el formato.
 */
import type { RequisitosFormato } from "@/features/creativos/tipos"
import { ORDEN_PLATAFORMAS, PLATAFORMAS } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"

import type { FormatoAsistente, Plataforma } from "./tipos"

/**
 * `formatos.requisitos` (jsonb) → requisitos tipados: la interpretación del
 * paquete de creativos, la misma que valida los archivos.
 */
export { requisitosDeFormato } from "@/features/creativos/formatos"

export interface GrupoPlataforma {
  plataforma: Plataforma
  nombre: string
  formatos: FormatoAsistente[]
}

/** Plataformas con al menos un formato activo, en el orden de la operación. */
export function formatosPorPlataforma(
  formatos: readonly FormatoAsistente[]
): GrupoPlataforma[] {
  return ORDEN_PLATAFORMAS.map((plataforma) => ({
    plataforma,
    nombre: PLATAFORMAS[plataforma],
    formatos: formatos
      .filter((formato) => formato.plataforma === plataforma)
      .sort((a, b) => a.orden - b.orden),
  })).filter((grupo) => grupo.formatos.length > 0)
}

/** «Reel · Instagram». */
export function nombreFormato(
  formato: Pick<FormatoAsistente, "nombre" | "plataforma">
): string {
  return `${formato.nombre} · ${PLATAFORMAS[formato.plataforma]}`
}

function listaConO(elementos: readonly string[]): string {
  if (elementos.length <= 1) return elementos.join("")
  return `${elementos.slice(0, -1).join(", ")} o ${elementos.at(-1)}`
}

function duracion(segundos: number): string {
  if (segundos >= 60 && segundos % 60 === 0) {
    const minutos = segundos / 60
    return `${formatearNumero(minutos)} ${minutos === 1 ? "minuto" : "minutos"}`
  }
  return `${formatearNumero(segundos)} s`
}

/** Tipo de pieza que admite el formato según sus MIME. */
export function tipoDePieza(requisitos: RequisitosFormato): string {
  const videos = requisitos.mime.filter((m) => m.startsWith("video/")).length
  const imagenes = requisitos.mime.filter((m) => m.startsWith("image/")).length
  if (videos > 0 && imagenes === 0) return "Video"
  if (imagenes > 0 && videos === 0) return "Imagen"
  return "Imagen o video"
}

/**
 * Resumen en una línea para la persona: «Video · 9:16 · hasta 90 s · hasta 50
 * MB». El tope de peso es el menor entre el del formato y el de la plataforma.
 */
export function resumenRequisitos(
  requisitos: RequisitosFormato,
  maximoPlataformaMb?: number | null
): string {
  const partes = [tipoDePieza(requisitos)]
  if (requisitos.maxArchivos > 1) {
    partes.push(`de 2 a ${formatearNumero(requisitos.maxArchivos)} archivos`)
  }
  if (requisitos.relacionesAspecto.length > 0) {
    partes.push(listaConO(requisitos.relacionesAspecto))
  }
  if (requisitos.duracionMaxSeg) {
    partes.push(`hasta ${duracion(requisitos.duracionMaxSeg)} de video`)
  }
  const pesos = [requisitos.pesoMaxMb, maximoPlataformaMb ?? null].filter(
    (valor): valor is number => typeof valor === "number" && valor > 0
  )
  if (pesos.length > 0) {
    partes.push(`hasta ${formatearNumero(Math.min(...pesos))} MB por archivo`)
  }
  return partes.join(" · ")
}
