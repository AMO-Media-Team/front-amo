/**
 * Textos de la compuerta de términos (AUT-012), módulo puro: qué documento es
 * cada uno, cómo se acepta y cómo se presenta la pantalla según la persona los
 * vea por primera vez o porque se publicó una versión nueva.
 */
import { NOMBRES_TERMINOS } from "@/features/configuracion/presentacion"
import type { TerminoPendiente, TipoTerminos } from "@/lib/auth/compuertas"
import { formatearFecha } from "@/lib/format"

interface TextosDocumento {
  /** Para qué sirve el documento, dicho a quien lo acepta. */
  resumen: string
  /** Texto de la casilla: una declaración en primera persona. */
  aceptacion: string
  /** Botón de la lectura en pantalla completa que marca la casilla. */
  accion: string
}

const TEXTOS_DOCUMENTO: Readonly<Record<TipoTerminos, TextosDocumento>> = {
  TERMINOS_MEDIO: {
    resumen:
      "Las reglas para recibir ofertas de pauta, publicar, cargar evidencias y recibir tus pagos.",
    aceptacion: "He leído y acepto los términos para medios.",
    accion: "Acepto los términos",
  },
  TERMINOS_ANUNCIANTE: {
    resumen:
      "Las reglas para crear campañas, contratar pauta con medios locales y pagar el servicio.",
    aceptacion: "He leído y acepto los términos para anunciantes.",
    accion: "Acepto los términos",
  },
  POLITICA_DATOS: {
    resumen:
      "Qué datos personales tratamos, para qué y cómo ejercer tus derechos (Ley 1581 de 2012).",
    aceptacion:
      "He leído la política y autorizo el tratamiento de mis datos personales.",
    accion: "Autorizo el tratamiento",
  },
  CONDICIONES_COMERCIALES: {
    resumen: "Comisiones, pagos y condiciones del servicio.",
    aceptacion: "He leído y acepto las condiciones comerciales.",
    accion: "Acepto las condiciones",
  },
}

/** Primero las reglas del portal; luego los datos personales y lo comercial. */
const ORDEN_TIPO: Readonly<Record<TipoTerminos, number>> = {
  TERMINOS_MEDIO: 0,
  TERMINOS_ANUNCIANTE: 0,
  POLITICA_DATOS: 1,
  CONDICIONES_COMERCIALES: 2,
}

/** Lo que la pantalla necesita de cada documento (sin el texto, que se pinta aparte). */
export interface DocumentoPorAceptar {
  id: string
  tipo: TipoTerminos
  titulo: string
  resumen: string
  aceptacion: string
  accion: string
  /** «Versión 2.1 · vigente desde el 22 de octubre de 2026». */
  vigencia: string
  /** La persona ya había aceptado una versión anterior de este documento. */
  actualizado: boolean
}

export function textoVigencia(version: string, vigenteDesde: string): string {
  return `Versión ${version} · vigente desde el ${formatearFecha(vigenteDesde, "largo")}`
}

export function documentosPorAceptar(
  terminos: readonly TerminoPendiente[],
  tiposAceptadosAntes: ReadonlySet<TipoTerminos>
): DocumentoPorAceptar[] {
  return [...terminos]
    .sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo])
    .map((termino) => ({
      id: termino.id,
      tipo: termino.tipo,
      titulo: NOMBRES_TERMINOS[termino.tipo].titulo,
      ...TEXTOS_DOCUMENTO[termino.tipo],
      vigencia: textoVigencia(termino.version, termino.vigenteDesde),
      actualizado: tiposAceptadosAntes.has(termino.tipo),
    }))
}

export interface EncabezadoTerminos {
  titulo: string
  descripcion: string
}

/**
 * Primera vez (o algún documento nuevo para la persona): se piden todos. Solo
 * versiones nuevas de lo que ya aceptó: se explica por qué vuelve a verlos.
 */
export function encabezadoTerminos(
  documentos: readonly Pick<DocumentoPorAceptar, "actualizado">[]
): EncabezadoTerminos {
  const soloActualizaciones =
    documentos.length > 0 && documentos.every((d) => d.actualizado)
  if (!soloActualizaciones) {
    return {
      titulo: "Revisa y acepta los términos",
      descripcion:
        "Para usar AMO necesitamos que leas y aceptes estos documentos: las reglas del servicio y cómo cuidamos tus datos personales.",
    }
  }
  return {
    titulo: "Actualizamos los términos",
    descripcion:
      documentos.length === 1
        ? "Publicamos una versión nueva de un documento que ya habías aceptado. Léela y acéptala para seguir usando AMO."
        : `Publicamos versiones nuevas de ${documentos.length} documentos que ya habías aceptado. Léelas y acéptalas para seguir usando AMO.`,
  }
}

/** «1 de 3 aceptados» · «Los 3 aceptados». */
export function textoProgreso(aceptados: number, total: number): string {
  if (aceptados >= total) return `Los ${total} aceptados`
  return `${aceptados} de ${total} aceptados`
}

/** Mensaje general cuando se intenta continuar sin marcar todo. */
export function textoFaltan(faltan: number): string {
  return faltan === 1
    ? "Te falta aceptar 1 documento para continuar."
    : `Te faltan ${faltan} documentos por aceptar para continuar.`
}

export const MENSAJE_CASILLA = "Marca la casilla para aceptar este documento."
