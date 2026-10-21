/**
 * Foto de perfil (bucket privado `avatares`, docs/modelo-datos.md §8): ruta
 * `perfil/{perfil_id}/{uuid}.webp`, construida por el servidor; recorte
 * cuadrado y compresión en el navegador (el plan free no transforma imágenes).
 * Módulo puro: geometría del recorte y validación de rutas.
 */

export const BUCKET_AVATARES = "avatares"
/** Formatos que se aceptan al elegir la foto (el resultado siempre es WebP). */
export const TIPOS_IMAGEN_ACEPTADOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const
/** Tope del archivo original; tras recortar y comprimir queda muy por debajo de 2 MB. */
export const TAMANO_MAXIMO_ORIGINAL_MB = 15
/** Lado del avatar final en px (se muestra a ≤ 96 px con pantallas 3x). */
export const LADO_AVATAR = 512
export const ZOOM_MINIMO = 1
export const ZOOM_MAXIMO = 4

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

export function rutaAvatar(perfilId: string, archivoId: string): string {
  return `perfil/${perfilId}/${archivoId}.webp`
}

/** ¿Es exactamente una ruta de avatar de ESTE perfil? (nunca se acepta otra). */
export function esRutaAvatarPropia(ruta: string, perfilId: string): boolean {
  const patron = new RegExp(`^perfil/${UUID}/${UUID}\\.webp$`, "i")
  return patron.test(ruta) && ruta.split("/")[1] === perfilId
}

export function esTipoAceptado(tipo: string): boolean {
  return (TIPOS_IMAGEN_ACEPTADOS as readonly string[]).includes(tipo)
}

// ── Geometría del recorte ────────────────────────────────────────────────────

export interface Dimensiones {
  ancho: number
  alto: number
}

export interface Encuadre {
  /** 1 = la imagen cubre justo el visor por su lado menor. */
  zoom: number
  /** Desplazamiento en px del visor respecto del centro. */
  x: number
  y: number
}

export const ENCUADRE_INICIAL: Encuadre = { zoom: 1, x: 0, y: 0 }

/** Escala imagen → visor para un zoom dado (la imagen siempre cubre el visor). */
export function escalaVisor(
  imagen: Dimensiones,
  ladoVisor: number,
  zoom: number
): number {
  return (ladoVisor / Math.min(imagen.ancho, imagen.alto)) * zoom
}

function limitar(valor: number, maximo: number): number {
  return Math.min(Math.max(valor, -maximo), maximo)
}

/** Ajusta zoom y desplazamiento para que nunca quede un borde vacío en el visor. */
export function limitarEncuadre(
  encuadre: Encuadre,
  imagen: Dimensiones,
  ladoVisor: number
): Encuadre {
  const zoom = Math.min(Math.max(encuadre.zoom, ZOOM_MINIMO), ZOOM_MAXIMO)
  const escala = escalaVisor(imagen, ladoVisor, zoom)
  const holguraX = Math.max(0, (imagen.ancho * escala - ladoVisor) / 2)
  const holguraY = Math.max(0, (imagen.alto * escala - ladoVisor) / 2)
  return {
    zoom,
    x: limitar(encuadre.x, holguraX),
    y: limitar(encuadre.y, holguraY),
  }
}

export interface RegionOrigen {
  x: number
  y: number
  lado: number
}

/** Cuadrado de la imagen original que queda dentro del visor. */
export function regionRecorte(
  encuadre: Encuadre,
  imagen: Dimensiones,
  ladoVisor: number
): RegionOrigen {
  const { zoom, x, y } = limitarEncuadre(encuadre, imagen, ladoVisor)
  const escala = escalaVisor(imagen, ladoVisor, zoom)
  const lado = ladoVisor / escala
  const izquierda = (ladoVisor - imagen.ancho * escala) / 2 + x
  const arriba = (ladoVisor - imagen.alto * escala) / 2 + y
  return {
    x: sinCeroNegativo(-izquierda / escala),
    y: sinCeroNegativo(-arriba / escala),
    lado,
  }
}

/** `-0` → `0` (evita sorpresas al comparar o serializar). */
function sinCeroNegativo(valor: number): number {
  return valor === 0 ? 0 : valor
}
