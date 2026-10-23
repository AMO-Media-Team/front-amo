/**
 * ¿El paquete creativo está listo? (módulo puro). Repite, en el mismo orden y
 * con los mismos textos, lo que la BD exige al enviar la oferta a revisión
 * (`private.validar_envio_oferta`, paso `creativo`) y al activar una versión
 * (`activar_creativo_srv`), y suma lo que solo sabe el navegador: subidas en
 * curso o fallidas y textos sin guardar. Lo consume el asistente de oferta por
 * `alCambiar` y el botón «Activar versión».
 */
import { categoriaDe } from "@/lib/archivos/mime"

import { maximoArchivos, MIN_ARCHIVOS_CARRUSEL, tipoAdmitido } from "./formatos"
import type {
  ArchivoCreativo,
  EstadoCreativo,
  FormatoOferta,
  TipoCreativo,
} from "./tipos"

/** Estado de los textos en el navegador. */
export type EstadoTextos =
  "guardados" | "guardando" | "sin-guardar" | "invalidos"

export interface EntradaPaquete {
  formato: FormatoOferta
  /** `null` mientras no exista la versión (nada cargado aún). */
  tipo: TipoCreativo | null
  archivos: readonly Pick<ArchivoCreativo, "mime">[]
  /** Subidas en cola, procesando o subiendo. */
  subidasEnCurso?: number
  /** Subidas que fallaron y siguen en la lista. */
  subidasConError?: number
  textos?: EstadoTextos
}

export const FALTAS = {
  sinArchivos: "Carga el paquete creativo con al menos un archivo.",
  carrusel: `Un carrusel necesita al menos ${MIN_ARCHIVOS_CARRUSEL} archivos.`,
  tipoFormato: "El tipo de creativo no corresponde al formato elegido.",
  tipoArchivos: "Los archivos no corresponden al tipo de creativo.",
  subiendo: "Espera a que terminen de subir los archivos.",
  subidasFallidas:
    "Hay archivos que no se pudieron subir: reinténtalos o quítalos de la lista.",
  textosInvalidos: "Corrige los textos del creativo marcados en rojo.",
  textosPendientes: "Espera a que se guarden los textos del creativo.",
} as const

export function mensajeMaximo(maximo: number): string {
  return maximo === 1
    ? "Este formato admite un solo archivo."
    : `Este formato admite hasta ${maximo} archivos.`
}

function faltasDeArchivos(entrada: EntradaPaquete): string[] {
  const { formato, tipo, archivos } = entrada
  const cantidad = archivos.length
  if (tipo === null || cantidad === 0) return [FALTAS.sinArchivos]
  const maximo = maximoArchivos(formato)
  if (cantidad > maximo) return [mensajeMaximo(maximo)]
  // Carrusel solo en su formato; imagen, si el formato admite imágenes
  // (`private.tipo_creativo_valido`).
  if (!tipoAdmitido(formato, tipo)) return [FALTAS.tipoFormato]
  if (tipo === "CARRUSEL" && cantidad < MIN_ARCHIVOS_CARRUSEL) {
    return [FALTAS.carrusel]
  }
  const videos = archivos.filter(
    (archivo) => categoriaDe(archivo.mime) === "video"
  ).length
  if (
    (tipo === "VIDEO" && videos < cantidad) ||
    (tipo === "IMAGEN" && videos > 0)
  ) {
    return [FALTAS.tipoArchivos]
  }
  return []
}

function faltasDelNavegador(entrada: EntradaPaquete): string[] {
  const faltan: string[] = []
  if ((entrada.subidasEnCurso ?? 0) > 0) faltan.push(FALTAS.subiendo)
  if ((entrada.subidasConError ?? 0) > 0) faltan.push(FALTAS.subidasFallidas)
  if (entrada.textos === "invalidos") faltan.push(FALTAS.textosInvalidos)
  else if (entrada.textos === "guardando" || entrada.textos === "sin-guardar") {
    faltan.push(FALTAS.textosPendientes)
  }
  return faltan
}

export function evaluarPaquete(entrada: EntradaPaquete): EstadoCreativo {
  // Mientras sube un archivo, «falta al menos un archivo» confundiría.
  const subiendo = (entrada.subidasEnCurso ?? 0) > 0
  const deArchivos = faltasDeArchivos(entrada).filter(
    (falta) => !(subiendo && falta === FALTAS.sinArchivos)
  )
  const faltan = [...deArchivos, ...faltasDelNavegador(entrada)]
  return {
    listo: faltan.length === 0,
    archivos: entrada.archivos.length,
    faltan,
  }
}

/** Mismo estado (para no avisar al asistente en cada render). */
export function mismoEstado(a: EstadoCreativo, b: EstadoCreativo): boolean {
  return (
    a.listo === b.listo &&
    a.archivos === b.archivos &&
    a.faltan.length === b.faltan.length &&
    a.faltan.every((falta, indice) => falta === b.faltan[indice])
  )
}
