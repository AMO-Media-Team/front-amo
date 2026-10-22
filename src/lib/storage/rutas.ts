import "server-only"

/**
 * Rutas de Storage por bucket (docs/modelo-datos.md §8). La ruta la construye
 * SIEMPRE el servidor a partir de ids ya verificados (regla de firma 3): el
 * cliente nunca la propone. El nombre del archivo es un uuid nuevo con la
 * extensión de su MIME, así que reemplazar un archivo es subir otro objeto (no
 * hay políticas UPDATE). Las mismas carpetas sirven para comprobar, al
 * confirmar, que la ruta que devuelve el navegador es una de las nuestras.
 */
import {
  BUCKETS,
  type BucketStorage,
  mimePermitidoEn,
} from "@/lib/archivos/buckets"
import { extensionDeMime } from "@/lib/archivos/mime"
import { Constants, type Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]
export type TipoDocumentoMedio = Enums["documento_medio_tipo"]
export type TipoDocumentoAnunciante = Enums["documento_anunciante_tipo"]
export type TipoEvidencia = "publicacion" | "metrica"
export type TipoSoporte =
  "liquidacion" | "factura" | "pago" | "documento_soporte" | "dispersion"

/** Carpeta de un bucket donde el servidor permite crear objetos. */
export interface Ubicacion {
  bucket: BucketStorage
  carpeta: string
  /** Prefijo del nombre (`logo-` en los logos, §8). */
  prefijoNombre?: string
}

export interface RutaStorage {
  bucket: BucketStorage
  ruta: string
}

export class ErrorRutaStorage extends Error {
  constructor(motivo: string) {
    super(`Ruta de Storage inválida: ${motivo}`)
    this.name = "ErrorRutaStorage"
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const UUID_EN_NOMBRE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const SUFIJO_MINIATURA = "-min"
const EXTENSION_MINIATURA = "webp"
/** Límite de `storage.objects.name`. */
const LARGO_MAXIMO = 1024

/**
 * Lo mismo que exige la restrictiva «storage: ruta segura» (sin `..`, sin `/`
 * inicial, sin `//`) y, además, sin segmentos vacíos ni caracteres de control.
 */
export function esRutaSegura(ruta: string): boolean {
  return (
    ruta.length > 0 &&
    ruta.length <= LARGO_MAXIMO &&
    !ruta.includes("..") &&
    !ruta.startsWith("/") &&
    !ruta.endsWith("/") &&
    !ruta.includes("//") &&
    !ruta.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(ruta)
  )
}

export function asegurarRutaSegura(ruta: string): string {
  if (!esRutaSegura(ruta)) throw new ErrorRutaStorage("no es una ruta segura")
  return ruta
}

function id(valor: string, nombre: string): string {
  const normalizado = valor.toLowerCase()
  if (!UUID.test(normalizado)) {
    throw new ErrorRutaStorage(`${nombre} no es un uuid`)
  }
  return normalizado
}

function deLista<T extends string>(
  valor: string,
  permitidos: readonly T[],
  nombre: string
): T {
  if (!(permitidos as readonly string[]).includes(valor)) {
    throw new ErrorRutaStorage(`${nombre} «${valor}» no existe`)
  }
  return valor as T
}

function ubicacion(
  bucket: BucketStorage,
  segmentos: readonly string[],
  prefijoNombre?: string
): Ubicacion {
  return {
    bucket,
    carpeta: asegurarRutaSegura(segmentos.join("/")),
    ...(prefijoNombre ? { prefijoNombre } : {}),
  }
}

// ── Carpetas por bucket (§8) ─────────────────────────────────────────────────

/** `documentos/medio/{medio}/{tipo}/` (cédula, RUT, prueba de vida…). */
export function carpetaDocumentoMedio(
  medioId: string,
  tipo: TipoDocumentoMedio
): Ubicacion {
  return ubicacion("documentos", [
    "medio",
    id(medioId, "medioId"),
    deLista(tipo, Constants.public.Enums.documento_medio_tipo, "tipo"),
  ])
}

/** `documentos/medio/{medio}/cuenta_social/{cuenta}/` (capturas de verificación). */
export function carpetaCapturaCuentaSocial(
  medioId: string,
  cuentaSocialId: string
): Ubicacion {
  return ubicacion("documentos", [
    "medio",
    id(medioId, "medioId"),
    "cuenta_social",
    id(cuentaSocialId, "cuentaSocialId"),
  ])
}

/** `documentos/anunciante/{anunciante}/{tipo}/` (RUT, cámara de comercio…). */
export function carpetaDocumentoAnunciante(
  anuncianteId: string,
  tipo: TipoDocumentoAnunciante
): Ubicacion {
  return ubicacion("documentos", [
    "anunciante",
    id(anuncianteId, "anuncianteId"),
    deLista(tipo, Constants.public.Enums.documento_anunciante_tipo, "tipo"),
  ])
}

/** `avatares/{anunciante|medio}/{id}/logo-{uuid}.webp`. */
export function carpetaLogo(
  entidad: "anunciante" | "medio",
  entidadId: string
): Ubicacion {
  return ubicacion(
    "avatares",
    [deLista(entidad, ["anunciante", "medio"], "entidad"), id(entidadId, "id")],
    "logo-"
  )
}

/** `creativos/oferta/{oferta}/{creativo}/`. */
export function carpetaCreativo(
  ofertaId: string,
  creativoId: string
): Ubicacion {
  return ubicacion("creativos", [
    "oferta",
    id(ofertaId, "ofertaId"),
    id(creativoId, "creativoId"),
  ])
}

/** `evidencias/asignacion/{asignacion}/{publicacion|metrica}/`. */
export function carpetaEvidencia(
  asignacionId: string,
  tipo: TipoEvidencia
): Ubicacion {
  return ubicacion("evidencias", [
    "asignacion",
    id(asignacionId, "asignacionId"),
    deLista(tipo, ["publicacion", "metrica"], "tipo"),
  ])
}

/** `evidencias/disputa/{disputa}/` o `…/interno/` (solo el equipo AMO lo ve). */
export function carpetaDisputa(
  disputaId: string,
  { interno }: { interno: boolean }
): Ubicacion {
  const base = ["disputa", id(disputaId, "disputaId")]
  return ubicacion("evidencias", interno ? [...base, "interno"] : base)
}

/** `soportes/{liquidacion|factura|pago|documento_soporte|dispersion}/{id}/`. */
export function carpetaSoporte(
  tipo: TipoSoporte,
  entidadId: string
): Ubicacion {
  return ubicacion("soportes", [
    deLista(
      tipo,
      ["liquidacion", "factura", "pago", "documento_soporte", "dispersion"],
      "tipo"
    ),
    id(entidadId, "id"),
  ])
}

// ── Nombres de archivo ───────────────────────────────────────────────────────

/**
 * Ruta nueva en la ubicación: `{carpeta}/{prefijo}{uuid}.{ext}`. El MIME debe
 * estar admitido por el bucket (Storage lo rechazaría igual).
 */
export function nuevaRuta(
  destino: Ubicacion,
  mime: string,
  uuid: string = crypto.randomUUID()
): RutaStorage {
  if (!mimePermitidoEn(destino.bucket, mime)) {
    throw new ErrorRutaStorage(
      `el bucket ${destino.bucket} no admite ${mime} (${BUCKETS[destino.bucket].mimes.join(", ")})`
    )
  }
  const nombre = `${destino.prefijoNombre ?? ""}${id(uuid, "uuid")}.${extensionDeMime(mime)}`
  return {
    bucket: destino.bucket,
    ruta: asegurarRutaSegura(`${destino.carpeta}/${nombre}`),
  }
}

/** Miniatura asociada a una ruta: `{carpeta}/{uuid}-min.webp`. */
export function rutaMiniatura(ruta: string): string {
  const separador = ruta.lastIndexOf("/")
  const nombre = ruta.slice(separador + 1)
  const punto = nombre.lastIndexOf(".")
  const base = punto > 0 ? nombre.slice(0, punto) : ""
  if (separador <= 0 || !base || base.endsWith(SUFIJO_MINIATURA)) {
    throw new ErrorRutaStorage("no admite miniatura")
  }
  return asegurarRutaSegura(
    `${ruta.slice(0, separador)}/${base}${SUFIJO_MINIATURA}.${EXTENSION_MINIATURA}`
  )
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * ¿`ruta` es un archivo generado por `nuevaRuta` DENTRO de esa ubicación?
 * Solo el archivo principal: una miniatura (`-min.webp`) no pasa por
 * principal; se comprueba con `esMiniaturaDe`. La ruta llega del navegador.
 */
export function perteneceA(ruta: string, destino: Ubicacion): boolean {
  if (!esRutaSegura(ruta)) return false
  const extensiones = BUCKETS[destino.bucket].mimes.map(extensionDeMime)
  const patron = new RegExp(
    `^${escaparRegex(destino.carpeta)}/${escaparRegex(destino.prefijoNombre ?? "")}` +
      `${UUID_EN_NOMBRE}\\.(?:${extensiones.join("|")})$`
  )
  return patron.test(ruta)
}

/** ¿`miniatura` es exactamente la que `prepararSubidaFirmada` firmó para `ruta`? */
export function esMiniaturaDe(miniatura: string, ruta: string): boolean {
  try {
    return miniatura === rutaMiniatura(ruta)
  } catch {
    return false
  }
}

/** Lo que devuelve el navegador al confirmar (`ArchivoSubido`). */
export interface ArchivoDeclarado {
  bucket: string
  ruta: string
  rutaMiniatura: string | null
}

/**
 * Comprobación completa al confirmar: el bucket es el de la ubicación, la
 * ruta es un archivo nuestro de esa carpeta y la miniatura, si viene, es la
 * suya. Úsalo antes de `confirmarObjeto` y de escribir la fila.
 */
export function archivoPerteneceA(
  archivo: ArchivoDeclarado,
  destino: Ubicacion
): boolean {
  return (
    archivo.bucket === destino.bucket &&
    perteneceA(archivo.ruta, destino) &&
    (archivo.rutaMiniatura === null ||
      esMiniaturaDe(archivo.rutaMiniatura, archivo.ruta))
  )
}
