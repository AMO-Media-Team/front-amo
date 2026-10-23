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
  /** Una proporción exigida o varias admitidas (basta con cumplir una). */
  aspecto?: ReglaAspecto | readonly ReglaAspecto[]
  duracionMaxSeg?: number
  /**
   * Lee siempre ancho y alto (imagen o video) y duración (video) aunque no
   * haya regla que los use, y rechaza el archivo si no se pueden leer: para
   * quien debe declararlos al guardar (los creativos, docs/modelo-datos.md §3.10).
   */
  medidasObligatorias?: boolean
  /**
   * Cómo se nombra la pieza en el rechazo por proporción («Un reel»): «Un reel
   * necesita video vertical 9:16 (…); el tuyo es horizontal 16:9 (…)».
   */
  pieza?: string
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

/** Género del sustantivo al que acompaña la orientación («video cuadrado», «imagen cuadrada»). */
type Genero = "masculino" | "femenino"

function orientacion(relacion: number, genero: Genero = "masculino"): string {
  if (Math.abs(relacion - 1) <= TOLERANCIA_ETIQUETA) {
    return genero === "femenino" ? "cuadrada" : "cuadrado"
  }
  return relacion < 1 ? "vertical" : "horizontal"
}

/** Las reglas de proporción como lista (una sola o varias admitidas). */
export function reglasDeAspecto(
  aspecto: ReglasArchivo["aspecto"]
): readonly ReglaAspecto[] {
  if (!aspecto) return []
  return "relacion" in aspecto ? [aspecto] : aspecto
}

const listaDisyuntiva = new Intl.ListFormat("es-CO", {
  style: "long",
  type: "disjunction",
})

/** «cuadrado 1:1, vertical 4:5 u horizontal 1,91:1». */
export function describirAspectos(
  reglas: readonly ReglaAspecto[],
  genero: Genero = "masculino"
): string {
  return listaDisyuntiva.format(
    reglas.map(
      ({ relacion }) =>
        `${orientacion(relacion, genero)} ${describirRelacion(relacion)}`
    )
  )
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

/** Cumple alguna de las proporciones admitidas (sin reglas, cualquiera vale). */
export function cumpleAlgunAspecto(
  dimensiones: Dimensiones,
  reglas: readonly ReglaAspecto[]
): boolean {
  return (
    reglas.length === 0 ||
    reglas.some((regla) => cumpleAspecto(dimensiones, regla))
  )
}

/**
 * Duración con dos decimales, como la guarda la BD (`numeric(8,2)`): un video
 * de 60,004 s cumple un máximo de 60 s también aquí.
 */
function centesimas(segundos: number): number {
  return Math.round(segundos * 100) / 100
}

const formatoSegundos = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 1,
})

/**
 * «1 min 32 s»; si redondeado al segundo se vería igual que el máximo («dura 1
 * min y el máximo es 1 min»), con un decimal: «60,4 s».
 */
function describirDuracionExcedida(segundos: number, maximo: number): string {
  const texto = formatearDuracion(segundos)
  return texto === formatearDuracion(maximo)
    ? `${formatoSegundos.format(Math.ceil(segundos * 10) / 10)}\u00a0s`
    : texto
}

function rechazo(motivo: MotivoRechazo, mensaje: string): ResultadoValidacion {
  return { ok: false, motivo, mensaje }
}

/** Ancho / alto de un archivo que se sabe visual (con lados positivos). */
function relacionReal({ ancho, alto }: Dimensiones): number {
  return alto > 0 ? ancho / alto : 0
}

function ejemplo(reglas: readonly ReglaAspecto[]): string {
  return reglas.length === 1
    ? ` (por ejemplo, ${medidas(ejemploMedidas(reglas[0].relacion))})`
    : ""
}

/**
 * Con `pieza`: «Un reel necesita video vertical 9:16 (por ejemplo, 1080 × 1920
 * px); el tuyo es horizontal 16:9 (1920 × 1080 px).» Sin ella, el mensaje
 * genérico con la medida del archivo.
 */
function mensajeAspecto(
  dimensiones: Dimensiones,
  reglas: readonly ReglaAspecto[],
  categoria: "imagen" | "video",
  pieza: string | undefined
): string {
  if (pieza) {
    const genero: Genero = categoria === "imagen" ? "femenino" : "masculino"
    const real = relacionReal(dimensiones)
    const suyo = genero === "femenino" ? "la tuya" : "el tuyo"
    return (
      `${pieza} necesita ${categoria} ${describirAspectos(reglas, genero)}` +
      `${ejemplo(reglas)}; ${suyo} es ${orientacion(real, genero)} ` +
      `${describirRelacion(real)} (${medidas(dimensiones)}).`
    )
  }
  return (
    `Debe ser ${describirAspectos(reglas)}${ejemplo(reglas)}; ` +
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
  const aspectos = reglasDeAspecto(reglas.aspecto)
  const dimensiones = datos.dimensiones ?? null
  if (
    (categoria === "imagen" || categoria === "video") &&
    dimensiones &&
    !cumpleAlgunAspecto(dimensiones, aspectos)
  ) {
    return rechazo(
      "aspecto",
      mensajeAspecto(dimensiones, aspectos, categoria, reglas.pieza)
    )
  }
  const duracionSeg = datos.duracionSeg ?? null
  if (
    reglas.duracionMaxSeg !== undefined &&
    categoria === "video" &&
    duracionSeg !== null &&
    centesimas(duracionSeg) > reglas.duracionMaxSeg
  ) {
    return rechazo(
      "duracion",
      `El video dura ${describirDuracionExcedida(duracionSeg, reglas.duracionMaxSeg)} ` +
        `y el máximo es ${formatearDuracion(reglas.duracionMaxSeg)}.`
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
 * si hace falta (o si `medidasObligatorias`) lee dimensiones (imagen o video)
 * y duración (video).
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
  const obligatorias = reglas.medidasObligatorias === true
  const necesitaDimensiones =
    (obligatorias || reglasDeAspecto(reglas.aspecto).length > 0) &&
    (categoria === "imagen" || categoria === "video")
  const necesitaDuracion =
    (obligatorias || reglas.duracionMaxSeg !== undefined) &&
    categoria === "video"
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
