/**
 * Datos de prueba del paquete creativo (solo los usan las pruebas): los
 * formatos con los requisitos que siembra la migración y constructores de
 * versiones y archivos.
 */
import { aFormatoOferta, LIMITES_POR_DEFECTO } from "./formatos"
import type {
  ArchivoCreativo,
  DatosCreativo,
  FormatoOferta,
  VersionCreativo,
} from "./tipos"

export const OFERTA_ID = "01a16525-58de-707e-a365-2362638c6104"
export const CREATIVO_ID = "01a16525-58df-7261-945f-fdec04e83e70"

export const FORMATOS_PRUEBA = {
  reel: aFormatoOferta({
    id: "01a16525-06d7-78ea-9a80-38d5c4b6941a",
    plataforma: "INSTAGRAM",
    clave: "REEL",
    nombre: "Reel",
    requisitos: {
      mime: ["video/mp4", "video/quicktime"],
      peso_max_mb: 50,
      duracion_max_s: 90,
      relaciones_aspecto: ["9:16"],
    },
  }),
  postFeed: aFormatoOferta({
    id: "01a16525-06d7-753f-9a18-3d5373ba3aca",
    plataforma: "INSTAGRAM",
    clave: "POST_FEED",
    nombre: "Post de feed",
    requisitos: {
      mime: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
      peso_max_mb: 50,
      duracion_max_s: 60,
      relaciones_aspecto: ["1:1", "4:5", "1.91:1"],
    },
  }),
  carrusel: aFormatoOferta({
    id: "01a16525-06d7-7b11-ad28-a9852c43a62b",
    plataforma: "INSTAGRAM",
    clave: "CARRUSEL",
    nombre: "Carrusel",
    requisitos: {
      mime: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
      peso_max_mb: 50,
      max_archivos: 10,
      relaciones_aspecto: ["1:1", "4:5"],
    },
  }),
  videoTiktok: aFormatoOferta({
    id: "01a16525-06d7-7e0f-b872-615b609df3c4",
    plataforma: "TIKTOK",
    clave: "VIDEO",
    nombre: "Video",
    requisitos: {
      mime: ["video/mp4", "video/quicktime"],
      peso_max_mb: 50,
      duracion_max_s: 600,
      relaciones_aspecto: ["9:16"],
    },
  }),
} satisfies Record<string, FormatoOferta>

let secuencia = 0

/** Uuid determinista por prueba (`…0001`, `…0002`). */
export function idPrueba(prefijo = "01a16525-0000-7000-8000"): string {
  secuencia += 1
  return `${prefijo}-${String(secuencia).padStart(12, "0")}`
}

export function archivoPrueba(
  cambios: Partial<ArchivoCreativo> = {}
): ArchivoCreativo {
  const id = cambios.id ?? idPrueba()
  return {
    id,
    ruta: `oferta/${OFERTA_ID}/${CREATIVO_ID}/${id}.mp4`,
    mime: "video/mp4",
    tamanoBytes: 12 * 1024 * 1024,
    ancho: 1080,
    alto: 1920,
    duracionSegundos: 45,
    orden: 0,
    sha256: "a".repeat(64),
    ...cambios,
  }
}

export function versionPrueba(
  cambios: Partial<VersionCreativo> = {}
): VersionCreativo {
  return {
    id: CREATIVO_ID,
    version: 1,
    tipo: "VIDEO",
    vigente: true,
    pendiente: false,
    activadoAt: "2026-10-20T15:00:00+00:00",
    copySugerido: "Conoce la promoción de temporada.",
    hashtags: ["#Publicidad", "#MiMarca"],
    menciones: ["@mimarca"],
    enlaceDestino: "https://mimarca.co/promo",
    archivos: [],
    createdAt: "2026-10-20T14:00:00+00:00",
    ...cambios,
  }
}

export function datosPrueba(
  cambios: Partial<DatosCreativo> = {}
): DatosCreativo {
  return {
    ofertaId: OFERTA_ID,
    estadoOferta: "BORRADOR",
    formato: FORMATOS_PRUEBA.reel,
    limites: LIMITES_POR_DEFECTO,
    editable: null,
    vigente: null,
    bloqueo: null,
    admiteVersionNueva: false,
    bloqueoActivacion: null,
    ...cambios,
  }
}
