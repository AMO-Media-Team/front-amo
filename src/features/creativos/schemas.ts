/**
 * Esquemas zod del paquete creativo (módulo puro): los MISMOS en el navegador
 * y en las Server Actions. El navegador nunca propone una ruta: declara la
 * oferta, el creativo y el archivo (con su SHA-256 y sus medidas); el servidor
 * construye `creativos/oferta/{oferta}/{creativo}/{uuid}.{ext}` y, al
 * confirmar, comprueba que lo subido cae exactamente ahí.
 */
import { z } from "zod"

import { BUCKETS } from "@/lib/archivos/buckets"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import { categoriaDe } from "@/lib/archivos/mime"
import { formatearNumero } from "@/lib/format"
import { Constants } from "@/types/database.types"

import {
  agregarEtiquetas,
  contarCaracteres,
  MAX_COPY,
  MAX_HASHTAGS,
  MAX_MENCIONES,
  MENSAJES_ENLACE,
  mensajeEtiquetaInvalida,
  normalizarEnlace,
  normalizarHashtag,
  normalizarMencion,
  problemaEnlace,
} from "./textos"

/** Lo que admite el bucket; el formato y la configuración se revalidan en la acción. */
export const LIMITES_ARCHIVO_CREATIVO: LimitesArchivo = {
  mimes: BUCKETS.creativos.mimes,
  maxBytes: BUCKETS.creativos.maxBytes,
}

/** Tope de `creativo_archivos.orden` (`creativo_archivos_orden_chk`). */
export const MAX_ORDEN = 50

const id = z.uuid({ error: "Identificador inválido." })

export const esquemaTipoCreativo = z.enum(
  Constants.public.Enums.creativo_tipo,
  {
    error: "Ese tipo de creativo no existe.",
  }
)

// ── Textos ───────────────────────────────────────────────────────────────────

const copySugerido = z
  .string()
  .trim()
  .refine((texto) => contarCaracteres(texto) <= MAX_COPY, {
    error: `El copy sugerido admite hasta ${formatearNumero(MAX_COPY)} caracteres.`,
  })
  .transform((texto) => texto || null)

function listaEtiquetas(
  normalizar: (texto: string) => string | null,
  clase: "hashtag" | "mencion",
  maximo: number,
  nombre: string
) {
  return z
    .array(z.string())
    .transform((textos, contexto) => {
      const validas: string[] = []
      for (const texto of textos) {
        const normalizada = normalizar(texto)
        if (normalizada) validas.push(normalizada)
        else {
          contexto.addIssue({
            code: "custom",
            message: mensajeEtiquetaInvalida(clase, texto.trim()),
          })
        }
      }
      return agregarEtiquetas([], validas)
    })
    .refine((etiquetas) => etiquetas.length <= maximo, {
      error: `Puedes agregar hasta ${maximo} ${nombre}.`,
    })
}

const enlaceDestino = z
  .string()
  .transform(normalizarEnlace)
  .superRefine((enlace, contexto) => {
    if (!enlace) return
    const problema = problemaEnlace(enlace)
    if (problema) {
      contexto.addIssue({ code: "custom", message: MENSAJES_ENLACE[problema] })
    }
  })
  .transform((enlace) => enlace || null)

/** Formulario de textos del creativo (entrada: lo que se escribió). */
export const esquemaTextosCreativo = z.object({
  copySugerido,
  hashtags: listaEtiquetas(
    normalizarHashtag,
    "hashtag",
    MAX_HASHTAGS,
    "hashtags"
  ),
  menciones: listaEtiquetas(
    normalizarMencion,
    "mencion",
    MAX_MENCIONES,
    "menciones"
  ),
  enlaceDestino,
})

export type EntradaTextosCreativo = z.input<typeof esquemaTextosCreativo>

export const TEXTOS_VACIOS: EntradaTextosCreativo = {
  copySugerido: "",
  hashtags: [],
  menciones: [],
  enlaceDestino: "",
}

/**
 * Crea la versión editable si falta (con su tipo) y, si vienen, guarda los
 * textos. Cambiar el tipo de una versión sin archivos de una oferta sin
 * publicar crea otra versión con el tipo nuevo.
 */
export const esquemaGuardarCreativo = z.object({
  ofertaId: id,
  tipo: esquemaTipoCreativo,
  textos: esquemaTextosCreativo.optional(),
})

export type EntradaGuardarCreativo = z.input<typeof esquemaGuardarCreativo>

// ── Archivos ─────────────────────────────────────────────────────────────────

interface DatosMedidos {
  tipo: string
  sha256: string | null
  dimensiones: { ancho: number; alto: number } | null
  duracionSeg: number | null
}

/** La BD exige huella, medidas y, en video, duración: el navegador debe traerlas. */
function exigirMedidas(archivo: DatosMedidos, contexto: z.RefinementCtx) {
  if (archivo.sha256 === null) {
    contexto.addIssue({
      code: "custom",
      message: "Falta la huella SHA-256 del archivo. Elígelo de nuevo.",
    })
  }
  if (archivo.dimensiones === null) {
    contexto.addIssue({
      code: "custom",
      message:
        "No pudimos leer las medidas del archivo. Prueba con otro navegador o expórtalo de nuevo.",
    })
  }
  if (categoriaDe(archivo.tipo) === "video" && archivo.duracionSeg === null) {
    contexto.addIssue({
      code: "custom",
      message:
        "No pudimos leer la duración del video. Prueba con otro navegador o expórtalo de nuevo como MP4.",
    })
  }
}

export const esquemaPrepararArchivo = z.object({
  ofertaId: id,
  creativoId: id,
  archivo: esquemaDescripcionArchivo(LIMITES_ARCHIVO_CREATIVO).superRefine(
    exigirMedidas
  ),
})

export const esquemaConfirmarArchivo = z.object({
  ofertaId: id,
  creativoId: id,
  /** Posición deseada (orden en que se eligieron); si falta, va al final. */
  orden: z.number().int().min(0).max(MAX_ORDEN).optional(),
  archivo: esquemaArchivoSubido(LIMITES_ARCHIVO_CREATIVO).superRefine(
    exigirMedidas
  ),
})

export const esquemaQuitarArchivo = z.object({ archivoId: id })

export const esquemaOrdenarArchivos = z.object({
  creativoId: id,
  ids: z
    .array(id)
    .min(1, "No hay archivos que ordenar.")
    .max(MAX_ORDEN, "Hay demasiados archivos.")
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "La lista repite un archivo.",
    }),
})

// ── Versiones ────────────────────────────────────────────────────────────────

export const esquemaCrearVersion = z.object({
  ofertaId: id,
  /** Si no se conservan los archivos, el tipo de la versión nueva. */
  tipo: esquemaTipoCreativo.optional(),
  /** Copia archivos y textos de la vigente (luego se cambian los que hagan falta). */
  conservar: z.boolean(),
})

export const esquemaActivarVersion = z.object({ creativoId: id })

/** Descartar la versión en preparación (aún sin activar). */
export const esquemaDescartarVersion = z.object({ creativoId: id })

// ── Lecturas ─────────────────────────────────────────────────────────────────

export const esquemaLeerCreativo = z.object({ ofertaId: id })

export const esquemaFirmarArchivo = z.object({
  archivoId: id,
  /** Firma como adjunto (`Content-Disposition`) para el botón «Descargar». */
  descargar: z.boolean().optional(),
})

export const esquemaFirmarVersion = z.object({ creativoId: id })

export type EntradaPrepararArchivo = z.input<typeof esquemaPrepararArchivo>
export type EntradaConfirmarArchivo = z.input<typeof esquemaConfirmarArchivo>
export type EntradaQuitarArchivo = z.input<typeof esquemaQuitarArchivo>
export type EntradaOrdenarArchivos = z.input<typeof esquemaOrdenarArchivos>
export type EntradaCrearVersion = z.input<typeof esquemaCrearVersion>
export type EntradaActivarVersion = z.input<typeof esquemaActivarVersion>
export type EntradaDescartarVersion = z.input<typeof esquemaDescartarVersion>
export type EntradaLeerCreativo = z.input<typeof esquemaLeerCreativo>
export type EntradaFirmarArchivo = z.input<typeof esquemaFirmarArchivo>
export type EntradaFirmarVersion = z.input<typeof esquemaFirmarVersion>
