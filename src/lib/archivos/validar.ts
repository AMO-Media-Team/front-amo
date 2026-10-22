/**
 * Validación de un archivo antes de subirlo: formato, peso, proporción y
 * duración, con un mensaje en español que explica qué falla y cómo
 * corregirlo. Storage y la BD vuelven a validar; esto ahorra la subida.
 */
import { formatearDuracion, formatearTamano } from "./formato"
import { leerDimensiones, leerDuracionVideo } from "./medios"
import { categoriaDe, mensajeFormatoNoAdmitido, mimeDeArchivo } from "./mime"
import type { Dimensiones } from "./tipos"

export interface ReglaAspecto {
  /** Ancho / alto exigido (9 / 16 para historias y reels). */
  relacion: number
  /** Desviación relativa admitida (0.02 = ±2 %). */
  tolerancia: number
}

export interface ReglasArchivo {
  mimes: readonly string[]
  maxBytes: number
  aspecto?: ReglaAspecto
  duracionMaxSeg?: number
}

/** Lo que se sabe del archivo; dimensiones y duración solo si se leyeron. */
export interface DatosArchivo {
  nombre: string
  tipo: string
  tamano: number
  dimensiones?: Dimensiones | null
  duracionSeg?: number | null
}

export type MotivoRechazo =
  "vacio" | "formato" | "tamano" | "aspecto" | "duracion" | "ilegible"

export type ResultadoValidacion =
  | {
      ok: true
      /** MIME normalizado con el que se debe subir. */
      tipo: string
      dimensiones: Dimensiones | null
      duracionSeg: number | null
    }
  | { ok: false; motivo: MotivoRechazo; mensaje: string }

const RELACIONES_COMUNES: readonly (readonly [number, number])[] = [
  [1, 1],
  [4, 5],
  [5, 4],
  [9, 16],
  [16, 9],
  [3, 4],
  [4, 3],
  [2, 3],
  [3, 2],
  [1, 2],
  [2, 1],
]
const TOLERANCIA_ETIQUETA = 0.01
const LADO_EJEMPLO = 1080

const formatoRelacion = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 2,
})

/** «9:16», «1:1»; si no es una proporción común, «1,91:1». */
export function describirRelacion(relacion: number): string {
  const comun = RELACIONES_COMUNES.find(
    ([ancho, alto]) =>
      Math.abs(ancho / alto / relacion - 1) <= TOLERANCIA_ETIQUETA
  )
  if (comun) return `${comun[0]}:${comun[1]}`
  return relacion >= 1
    ? `${formatoRelacion.format(relacion)}:1`
    : `1:${formatoRelacion.format(1 / relacion)}`
}

function orientacion(relacion: number): string {
  if (Math.abs(relacion - 1) <= TOLERANCIA_ETIQUETA) return "cuadrado"
  return relacion < 1 ? "vertical" : "horizontal"
}

/** Medidas de ejemplo con 1080 px en el lado corto: 9:16 → 1080 × 1920 px. */
export function ejemploMedidas(relacion: number): Dimensiones {
  return relacion < 1
    ? { ancho: LADO_EJEMPLO, alto: Math.round(LADO_EJEMPLO / relacion) }
    : { ancho: Math.round(LADO_EJEMPLO * relacion), alto: LADO_EJEMPLO }
}

function medidas({ ancho, alto }: Dimensiones): string {
  return `${ancho} × ${alto} px`
}

export function cumpleAspecto(
  dimensiones: Dimensiones,
  regla: ReglaAspecto
): boolean {
  if (dimensiones.ancho <= 0 || dimensiones.alto <= 0) return false
  const real = dimensiones.ancho / dimensiones.alto
  return Math.abs(real / regla.relacion - 1) <= regla.tolerancia
}

function rechazo(motivo: MotivoRechazo, mensaje: string): ResultadoValidacion {
  return { ok: false, motivo, mensaje }
}

function mensajeAspecto(dimensiones: Dimensiones, regla: ReglaAspecto): string {
  const etiqueta = describirRelacion(regla.relacion)
  return (
    `Debe ser ${orientacion(regla.relacion)} ${etiqueta} ` +
    `(por ejemplo, ${medidas(ejemploMedidas(regla.relacion))}); ` +
    `este archivo mide ${medidas(dimensiones)}.`
  )
}

/**
 * Evalúa las reglas con lo que se sabe del archivo (puro). La proporción y la
 * duración solo se comprueban si vienen las dimensiones o la duración: quien
 * tiene el `File` usa `validarArchivo`, que las lee cuando hacen falta.
 */
export function evaluarArchivo(
  datos: DatosArchivo,
  reglas: ReglasArchivo
): ResultadoValidacion {
  const tipo = mimeDeArchivo({ name: datos.nombre, type: datos.tipo })
  if (datos.tamano <= 0) {
    return rechazo("vacio", "El archivo está vacío. Elige otro.")
  }
  if (!reglas.mimes.includes(tipo)) {
    return rechazo("formato", mensajeFormatoNoAdmitido(reglas.mimes))
  }
  if (datos.tamano > reglas.maxBytes) {
    return rechazo(
      "tamano",
      `El archivo pesa ${formatearTamano(datos.tamano, "arriba")} y el máximo es ` +
        `${formatearTamano(reglas.maxBytes)}.`
    )
  }
  const categoria = categoriaDe(tipo)
  const visual = categoria === "imagen" || categoria === "video"
  const dimensiones = datos.dimensiones ?? null
  if (
    reglas.aspecto &&
    visual &&
    dimensiones &&
    !cumpleAspecto(dimensiones, reglas.aspecto)
  ) {
    return rechazo("aspecto", mensajeAspecto(dimensiones, reglas.aspecto))
  }
  const duracionSeg = datos.duracionSeg ?? null
  if (
    reglas.duracionMaxSeg !== undefined &&
    categoria === "video" &&
    duracionSeg !== null &&
    duracionSeg > reglas.duracionMaxSeg
  ) {
    return rechazo(
      "duracion",
      `El video dura ${formatearDuracion(duracionSeg)} y el máximo es ` +
        `${formatearDuracion(reglas.duracionMaxSeg)}.`
    )
  }
  return { ok: true, tipo, dimensiones, duracionSeg }
}

export interface LectoresArchivo {
  leerDimensiones: (archivo: Blob) => Promise<Dimensiones>
  leerDuracionVideo: (archivo: Blob) => Promise<number>
}

const LECTORES_NAVEGADOR: LectoresArchivo = {
  leerDimensiones,
  leerDuracionVideo,
}

const MENSAJE_ILEGIBLE =
  "No pudimos leer el archivo. Puede estar dañado o en un formato que este navegador no reconoce."

/**
 * Valida un `File` con las reglas: primero lo barato (formato y peso) y solo
 * si hace falta lee dimensiones (imagen o video) y duración (video).
 */
export async function validarArchivo(
  archivo: File,
  reglas: ReglasArchivo,
  lectores: LectoresArchivo = LECTORES_NAVEGADOR
): Promise<ResultadoValidacion> {
  const datos: DatosArchivo = {
    nombre: archivo.name,
    tipo: archivo.type,
    tamano: archivo.size,
  }
  const basica = evaluarArchivo(datos, reglas)
  if (!basica.ok) return basica

  const categoria = categoriaDe(basica.tipo)
  const necesitaDimensiones =
    reglas.aspecto !== undefined &&
    (categoria === "imagen" || categoria === "video")
  const necesitaDuracion =
    reglas.duracionMaxSeg !== undefined && categoria === "video"
  if (!necesitaDimensiones && !necesitaDuracion) return basica

  try {
    const [dimensiones, duracionSeg] = await Promise.all([
      necesitaDimensiones ? lectores.leerDimensiones(archivo) : null,
      necesitaDuracion ? lectores.leerDuracionVideo(archivo) : null,
    ])
    return evaluarArchivo({ ...datos, dimensiones, duracionSeg }, reglas)
  } catch {
    return rechazo("ilegible", MENSAJE_ILEGIBLE)
  }
}
