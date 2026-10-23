/**
 * Formatos de oferta y lo que exigen a su creativo (módulo puro, navegador y
 * servidor). `formatos.requisitos` (docs/modelo-datos.md §3.10) dice los MIME,
 * el peso, la duración, las relaciones de aspecto y cuántos archivos admite;
 * `archivos.max_creativo_mb` y `archivos.tolerancia_aspecto` lo acotan. La BD
 * vuelve a validar cada archivo con las mismas reglas
 * (`private.fn_creativo_archivos_validar`).
 */
import { PLATAFORMAS } from "@/features/operacion/estados"
import { BUCKETS } from "@/lib/archivos/buckets"
import { formatearDuracion, formatearTamano, MIB } from "@/lib/archivos/formato"
import { categoriaDe, describirFormatos } from "@/lib/archivos/mime"
import {
  reglasAspectoDeTextos,
  reglasDesdeRequisitos,
} from "@/lib/archivos/requisitos"
import {
  describirAspectos,
  describirRelacion,
  ejemploMedidas,
  type ReglasArchivo,
} from "@/lib/archivos/validar"
import type { Json } from "@/types/database.types"

import type {
  FormatoOferta,
  LimitesCreativo,
  Plataforma,
  RequisitosFormato,
  TipoCreativo,
} from "./tipos"

export const CLAVE_CARRUSEL = "CARRUSEL"
/** Un carrusel tiene al menos dos piezas (`validar_envio_oferta`). */
export const MIN_ARCHIVOS_CARRUSEL = 2
/** Sin `max_archivos`, la BD admite uno (`coalesce(…, 1)`). */
export const MAX_ARCHIVOS_POR_DEFECTO = 1

/** Valores de la semilla: rigen si la configuración no se puede leer. */
export const LIMITES_POR_DEFECTO: LimitesCreativo = {
  maxCreativoMb: 50,
  toleranciaAspecto: 0.02,
}

export const ETIQUETAS_TIPO: Readonly<Record<TipoCreativo, string>> = {
  IMAGEN: "Imagen",
  VIDEO: "Video",
  CARRUSEL: "Carrusel",
}

/** Cómo se nombra cada pieza en los mensajes («Un reel de Instagram necesita…»). */
const PIEZAS: Readonly<Record<string, string>> = {
  REEL: "Un reel",
  HISTORIA: "Una historia",
  POST_FEED: "Un post de feed",
  CARRUSEL: "Un carrusel",
  VIDEO: "Un video",
}

type Objeto = Record<string, unknown>

function comoObjeto(json: Json | null | undefined): Objeto {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Objeto)
    : {}
}

function textos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((texto): texto is string => typeof texto === "string")
    : []
}

function positivo(valor: unknown): number | null {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" && Number.isFinite(numero) && numero > 0
    ? numero
    : null
}

/** `formatos.requisitos` (JSON libre de la BD) con los mismos valores por defecto que la BD. */
export function requisitosDeFormato(json: Json | null): RequisitosFormato {
  const objeto = comoObjeto(json)
  const maximo = positivo(objeto.max_archivos)
  return {
    mime: textos(objeto.mime),
    pesoMaxMb: positivo(objeto.peso_max_mb),
    duracionMaxSeg: positivo(objeto.duracion_max_s),
    relacionesAspecto: textos(objeto.relaciones_aspecto),
    maxArchivos:
      maximo === null ? MAX_ARCHIVOS_POR_DEFECTO : Math.floor(maximo),
  }
}

/** Fila de `formatos` → contrato que reciben el panel creativo y las fichas. */
export function aFormatoOferta(fila: {
  id: string
  plataforma: Plataforma
  clave: string
  nombre: string
  requisitos: Json | null
}): FormatoOferta {
  return {
    id: fila.id,
    plataforma: fila.plataforma,
    clave: fila.clave,
    nombre: fila.nombre,
    requisitos: requisitosDeFormato(fila.requisitos),
  }
}

/** «Reel de Instagram», «Video de TikTok». */
export function nombreFormato(formato: FormatoOferta): string {
  return `${formato.nombre} de ${PLATAFORMAS[formato.plataforma]}`
}

/** «Un reel de Instagram»; un formato nuevo sin nombre conocido, «Este formato». */
export function piezaDe(formato: FormatoOferta): string {
  const pieza = PIEZAS[formato.clave]
  return pieza
    ? `${pieza} de ${PLATAFORMAS[formato.plataforma]}`
    : "Este formato"
}

export function esCarrusel(formato: FormatoOferta): boolean {
  return formato.clave === CLAVE_CARRUSEL
}

function admite(formato: FormatoOferta, categoria: "imagen" | "video") {
  return formato.requisitos.mime.some((mime) => categoriaDe(mime) === categoria)
}

/**
 * Tipos de creativo que admite el formato: el carrusel solo en su formato; en
 * los demás, imagen o video según sus MIME (un post o una historia, ambos).
 * La BD lo exige al crear y al activar una versión
 * (`private.tipo_creativo_valido`: en un formato solo de video, el creativo
 * es un video).
 */
export function tiposDeCreativo(formato: FormatoOferta): TipoCreativo[] {
  if (esCarrusel(formato)) return ["CARRUSEL"]
  return [
    ...(admite(formato, "imagen") ? (["IMAGEN"] as const) : []),
    ...(admite(formato, "video") ? (["VIDEO"] as const) : []),
  ]
}

/** El tipo con que nace el creativo si nadie elige otro. */
export function tipoInicial(formato: FormatoOferta): TipoCreativo {
  return tiposDeCreativo(formato)[0] ?? "IMAGEN"
}

export function tipoAdmitido(
  formato: FormatoOferta,
  tipo: TipoCreativo
): boolean {
  return tiposDeCreativo(formato).includes(tipo)
}

/** MIME que acepta un tipo dentro del formato (una imagen no recibe videos). */
export function mimesDeTipo(
  formato: FormatoOferta,
  tipo: TipoCreativo
): string[] {
  const { mime } = formato.requisitos
  switch (tipo) {
    case "IMAGEN":
      return mime.filter((m) => categoriaDe(m) === "imagen")
    case "VIDEO":
      return mime.filter((m) => categoriaDe(m) === "video")
    case "CARRUSEL":
      return [...mime]
  }
}

export function minimoArchivos(tipo: TipoCreativo): number {
  return tipo === "CARRUSEL" ? MIN_ARCHIVOS_CARRUSEL : 1
}

export function maximoArchivos(formato: FormatoOferta): number {
  return Math.max(1, formato.requisitos.maxArchivos)
}

/** Peso máximo efectivo: el del formato, la configuración y el bucket. */
export function topeBytes(
  formato: FormatoOferta,
  limites: LimitesCreativo
): number {
  const configuracion =
    limites.maxCreativoMb > 0
      ? Math.floor(limites.maxCreativoMb * MIB)
      : BUCKETS.creativos.maxBytes
  const formatoBytes =
    formato.requisitos.pesoMaxMb === null
      ? Number.POSITIVE_INFINITY
      : Math.floor(formato.requisitos.pesoMaxMb * MIB)
  return Math.min(configuracion, formatoBytes, BUCKETS.creativos.maxBytes)
}

/**
 * Reglas de cada archivo de un creativo: MIME del tipo, peso efectivo,
 * cualquiera de las proporciones del formato, duración máxima y medidas
 * obligatorias (la BD exige ancho, alto y, en video, duración).
 */
export function reglasCreativo(
  formato: FormatoOferta,
  tipo: TipoCreativo,
  limites: LimitesCreativo
): ReglasArchivo {
  return reglasDesdeRequisitos(
    {
      mimes: mimesDeTipo(formato, tipo),
      pesoMaxMb: null,
      duracionMaxSeg: formato.requisitos.duracionMaxSeg,
      relacionesAspecto: formato.requisitos.relacionesAspecto,
    },
    {
      topeBytes: topeBytes(formato, limites),
      tolerancia: limites.toleranciaAspecto,
      pieza: piezaDe(formato),
      medidasObligatorias: true,
    }
  )
}

export type ClaveRequisito =
  "proporcion" | "formatos" | "peso" | "duracion" | "cantidad"

export interface RequisitoVisible {
  clave: ClaveRequisito
  texto: string
}

const listaDisyuntiva = new Intl.ListFormat("es-CO", {
  style: "long",
  type: "disjunction",
})

/** «Video vertical 9:16 (por ejemplo, 1080 × 1920 px)», «Imagen cuadrada 1:1, …». */
function textoProporcion(
  formato: FormatoOferta,
  tipo: TipoCreativo,
  limites: LimitesCreativo
): string {
  const aspectos = reglasAspectoDeTextos(
    formato.requisitos.relacionesAspecto,
    limites.toleranciaAspecto
  )
  if (tipo === "CARRUSEL") {
    // Plural y mezcla de imagen y video: se nombran solo las proporciones.
    const piezas =
      admite(formato, "imagen") && admite(formato, "video")
        ? "Imágenes o videos"
        : admite(formato, "video")
          ? "Videos"
          : "Imágenes"
    return aspectos.length === 0
      ? `${piezas} en cualquier proporción`
      : `${piezas} en proporción ${listaDisyuntiva.format(
          aspectos.map(({ relacion }) => describirRelacion(relacion))
        )}`
  }
  const sustantivo = tipo === "IMAGEN" ? "Imagen" : "Video"
  if (aspectos.length === 0) return `${sustantivo} en cualquier proporción`
  const genero = tipo === "IMAGEN" ? "femenino" : "masculino"
  const ejemplo =
    aspectos.length === 1 ? ejemploMedidas(aspectos[0].relacion) : null
  return (
    `${sustantivo} ${describirAspectos(aspectos, genero)}` +
    (ejemplo ? ` (por ejemplo, ${ejemplo.ancho} × ${ejemplo.alto} px)` : "")
  )
}

function textoCantidad(tipo: TipoCreativo, maximo: number): string {
  const minimo = minimoArchivos(tipo)
  if (maximo <= 1) return "Un solo archivo"
  if (minimo === maximo) return `${maximo} archivos`
  return `De ${minimo} a ${maximo} archivos, en el orden en que se publican`
}

/**
 * Lo que pide el formato, en frases cortas para la ayuda del panel: «Video
 * vertical 9:16 (por ejemplo, 1080 × 1920 px)», «MP4 o MOV», «Hasta 50 MB por
 * archivo»…
 */
export function requisitosVisibles(
  formato: FormatoOferta,
  tipo: TipoCreativo,
  limites: LimitesCreativo
): RequisitoVisible[] {
  const proporcion = textoProporcion(formato, tipo, limites)
  const duracion = formato.requisitos.duracionMaxSeg
  const conVideo = mimesDeTipo(formato, tipo).some(
    (mime) => categoriaDe(mime) === "video"
  )
  return [
    { clave: "proporcion", texto: proporcion },
    { clave: "formatos", texto: describirFormatos(mimesDeTipo(formato, tipo)) },
    {
      clave: "peso",
      texto: `Hasta ${formatearTamano(topeBytes(formato, limites))} por archivo`,
    },
    ...(conVideo && duracion !== null
      ? [
          {
            clave: "duracion" as const,
            texto: `Videos de hasta ${formatearDuracion(duracion)}`,
          },
        ]
      : []),
    {
      clave: "cantidad",
      texto: textoCantidad(tipo, maximoArchivos(formato)),
    },
  ]
}
