/**
 * Filas de la BD → contratos del paquete creativo, y qué versión se puede
 * editar según el estado de la oferta (módulo puro). Es la misma regla que
 * aplican las políticas de `creativos` y `creativo_archivos`
 * (docs/modelo-datos.md §3.10): la vigente de una oferta sin publicar o la
 * pendiente de una publicada; nunca la que ya ven los medios. La BD la vuelve
 * a imponer en cada escritura.
 */
import type { Database } from "@/types/database.types"

import { MENSAJES_CREATIVO } from "./errores"
import type {
  ArchivoCreativo,
  EstadoEmpresa,
  EstadoOferta,
  LimitesCreativo,
  VersionCreativo,
} from "./tipos"

type Tablas = Database["public"]["Tables"]

export type FilaArchivo = Pick<
  Tablas["creativo_archivos"]["Row"],
  | "id"
  | "archivo_path"
  | "mime"
  | "tamano_bytes"
  | "ancho"
  | "alto"
  | "duracion_segundos"
  | "orden"
  | "sha256"
  | "created_at"
>

export type FilaCreativo = Pick<
  Tablas["creativos"]["Row"],
  | "id"
  | "oferta_id"
  | "version"
  | "tipo"
  | "vigente"
  | "activado_at"
  | "copy_sugerido"
  | "hashtags"
  | "menciones"
  | "enlace_destino"
  | "created_at"
> & { archivos: FilaArchivo[] | null }

export const COLUMNAS_ARCHIVO =
  "id, archivo_path, mime, tamano_bytes, ancho, alto, duracion_segundos, orden, sha256, created_at"

export const COLUMNAS_CREATIVO =
  `id, oferta_id, version, tipo, vigente, activado_at, copy_sugerido, hashtags, menciones, enlace_destino, created_at, archivos:creativo_archivos ( ${COLUMNAS_ARCHIVO} )` as const

/** Por orden y, a igual orden, por llegada (dos subidas simultáneas). */
export function compararArchivos(a: FilaArchivo, b: FilaArchivo): number {
  return a.orden - b.orden || a.created_at.localeCompare(b.created_at)
}

export function aArchivoCreativo(fila: FilaArchivo): ArchivoCreativo {
  return {
    id: fila.id,
    ruta: fila.archivo_path,
    mime: fila.mime,
    tamanoBytes: fila.tamano_bytes,
    ancho: fila.ancho,
    alto: fila.alto,
    duracionSegundos:
      fila.duracion_segundos === null ? null : Number(fila.duracion_segundos),
    orden: fila.orden,
    sha256: fila.sha256,
  }
}

export function aVersionCreativo(fila: FilaCreativo): VersionCreativo {
  return {
    id: fila.id,
    version: fila.version,
    tipo: fila.tipo,
    vigente: fila.vigente,
    pendiente: fila.activado_at === null,
    activadoAt: fila.activado_at,
    copySugerido: fila.copy_sugerido,
    hashtags: fila.hashtags,
    menciones: fila.menciones,
    enlaceDestino: fila.enlace_destino,
    archivos: [...(fila.archivos ?? [])]
      .sort(compararArchivos)
      .map(aArchivoCreativo),
    createdAt: fila.created_at,
  }
}

/** De la más nueva a la más vieja. */
export function ordenarVersiones(
  versiones: readonly VersionCreativo[]
): VersionCreativo[] {
  return [...versiones].sort((a, b) => b.version - a.version)
}

const SIN_PUBLICAR: ReadonlySet<EstadoOferta> = new Set([
  "BORRADOR",
  "DEVUELTA",
])
const PUBLICADAS: ReadonlySet<EstadoOferta> = new Set([
  "PUBLICADA",
  "CUPOS_COMPLETOS",
  "EN_EJECUCION",
])

export function esSinPublicar(estado: EstadoOferta): boolean {
  return SIN_PUBLICAR.has(estado)
}

export function esPublicada(estado: EstadoOferta): boolean {
  return PUBLICADAS.has(estado)
}

/** ¿Esta versión se puede editar con la oferta en este estado? */
export function versionEditable(
  version: Pick<VersionCreativo, "vigente" | "pendiente">,
  estado: EstadoOferta
): boolean {
  return (
    (version.vigente && esSinPublicar(estado)) ||
    (version.pendiente && esPublicada(estado))
  )
}

export interface Edicion {
  editable: VersionCreativo | null
  vigente: VersionCreativo | null
  bloqueo: string | null
  admiteVersionNueva: boolean
  bloqueoActivacion: string | null
}

/**
 * Por qué el anunciante no puede activar una versión (la misma condición que
 * `activar_creativo_srv`: empresa VERIFICADA); `null` si puede. Sin estado
 * (la RLS no deja ver la empresa) tampoco puede.
 */
export function motivoSinActivar(estado: EstadoEmpresa | null): string | null {
  if (estado === "VERIFICADO") return null
  return estado === "SUSPENDIDO"
    ? MENSAJES_CREATIVO.empresaSuspendida
    : MENSAJES_CREATIVO.empresaSinVerificar
}

/**
 * Qué versión edita el panel y, si no hay ninguna editable, por qué. Sin
 * versión todavía, una oferta sin publicar la crea al cargar el primer archivo.
 * `estadoEmpresa` se pasa cuando quien edita es el anunciante (al equipo AMO,
 * en modo asistido, la BD no le exige la empresa verificada para activar).
 */
export function resolverEdicion(
  versiones: readonly VersionCreativo[],
  estado: EstadoOferta,
  {
    puedeGestionar,
    archivada = false,
    estadoEmpresa,
  }: {
    puedeGestionar: boolean
    archivada?: boolean
    estadoEmpresa?: EstadoEmpresa | null
  }
): Edicion {
  const vigente = versiones.find((version) => version.vigente) ?? null
  const pendiente = versiones.find((version) => version.pendiente) ?? null
  const base = { vigente, admiteVersionNueva: false, bloqueoActivacion: null }
  if (archivada) {
    return { ...base, editable: null, bloqueo: MENSAJES_CREATIVO.cerrada }
  }
  if (!puedeGestionar) {
    return { ...base, editable: null, bloqueo: MENSAJES_CREATIVO.soloLectura }
  }
  if (esSinPublicar(estado)) {
    return { ...base, editable: vigente, bloqueo: null }
  }
  if (esPublicada(estado)) {
    const bloqueoActivacion =
      estadoEmpresa === undefined ? null : motivoSinActivar(estadoEmpresa)
    return pendiente
      ? { ...base, editable: pendiente, bloqueo: null, bloqueoActivacion }
      : {
          vigente,
          editable: null,
          bloqueo: MENSAJES_CREATIVO.publicada,
          admiteVersionNueva: true,
          bloqueoActivacion,
        }
  }
  return {
    ...base,
    editable: null,
    bloqueo:
      estado === "EN_REVISION"
        ? MENSAJES_CREATIVO.enRevision
        : MENSAJES_CREATIVO.cerrada,
  }
}

/** Valor de `configuracion` (número o texto numérico) dentro de un rango. */
function numeroConfigurado(
  valor: unknown,
  minimo: number,
  maximo: number
): number | null {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" &&
    Number.isFinite(numero) &&
    numero >= minimo &&
    numero <= maximo
    ? numero
    : null
}

export const CLAVES_LIMITES = {
  maxCreativoMb: "archivos.max_creativo_mb",
  toleranciaAspecto: "archivos.tolerancia_aspecto",
} as const

/** Topes desde las filas de `configuracion`; lo ilegible toma el de la semilla. */
export function limitesDeConfiguracion(
  filas: readonly { clave: string; valor: unknown }[],
  porDefecto: LimitesCreativo
): LimitesCreativo {
  const valor = (clave: string) =>
    filas.find((fila) => fila.clave === clave)?.valor
  return {
    maxCreativoMb:
      numeroConfigurado(valor(CLAVES_LIMITES.maxCreativoMb), 1, 50) ??
      porDefecto.maxCreativoMb,
    toleranciaAspecto:
      numeroConfigurado(valor(CLAVES_LIMITES.toleranciaAspecto), 0, 0.2) ??
      porDefecto.toleranciaAspecto,
  }
}
