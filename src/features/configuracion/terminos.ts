/**
 * Versiones de términos y política de datos (módulo puro): estado de cada
 * versión, versión vigente por documento y sugerencia de la siguiente.
 */
import type { TipoTerminos, VersionTerminos } from "./tipos"

export type EstadoVersion = "BORRADOR" | "PROGRAMADA" | "VIGENTE" | "ANTERIOR"

export const ETIQUETAS_ESTADO_VERSION: Readonly<Record<EstadoVersion, string>> =
  {
    BORRADOR: "Borrador",
    PROGRAMADA: "Programada",
    VIGENTE: "Vigente",
    ANTERIOR: "Anterior",
  }

type VersionBase = Pick<
  VersionTerminos,
  "id" | "publicada" | "vigenteDesde" | "version" | "creadaAt"
>

/** La publicada más reciente que ya entró en vigor; `null` si no hay. */
export function versionVigente<T extends VersionBase>(
  versiones: readonly T[],
  ahora: Date = new Date()
): T | null {
  return (
    versiones
      .filter(
        (v) =>
          v.publicada &&
          v.vigenteDesde !== null &&
          new Date(v.vigenteDesde).getTime() <= ahora.getTime()
      )
      .sort((a, b) =>
        (b.vigenteDesde ?? "").localeCompare(a.vigenteDesde ?? "")
      )[0] ?? null
  )
}

export function estadoVersion<T extends VersionBase>(
  version: T,
  versiones: readonly T[],
  ahora: Date = new Date()
): EstadoVersion {
  if (!version.publicada) return "BORRADOR"
  if (
    version.vigenteDesde !== null &&
    new Date(version.vigenteDesde).getTime() > ahora.getTime()
  ) {
    return "PROGRAMADA"
  }
  return versionVigente(versiones, ahora)?.id === version.id
    ? "VIGENTE"
    : "ANTERIOR"
}

const ORDEN_ESTADO: Readonly<Record<EstadoVersion, number>> = {
  BORRADOR: 0,
  PROGRAMADA: 1,
  VIGENTE: 2,
  ANTERIOR: 3,
}

/** Borradores y programadas arriba; luego la vigente y el historial. */
export function ordenarVersiones<T extends VersionBase>(
  versiones: readonly T[],
  ahora: Date = new Date()
): (T & { estado: EstadoVersion })[] {
  return versiones
    .map((v) => ({ ...v, estado: estadoVersion(v, versiones, ahora) }))
    .sort(
      (a, b) =>
        ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
        (b.vigenteDesde ?? b.creadaAt).localeCompare(
          a.vigenteDesde ?? a.creadaAt
        )
    )
}

/** "1.2" → "1.3" · "2" → "3" · "v1" → "v2"; sin versiones → "1.0". */
export function siguienteVersion(
  versiones: readonly { version: string }[]
): string {
  const ultima = [...versiones]
    .map((v) => v.version)
    .sort((a, b) => b.localeCompare(a, "es-CO", { numeric: true }))[0]
  if (!ultima) return "1.0"
  const coincidencia = /^(.*?)(\d+)$/.exec(ultima)
  if (!coincidencia) return `${ultima}.1`.slice(0, 20)
  const [, prefijo, numero] = coincidencia
  return `${prefijo}${Number(numero) + 1}`.slice(0, 20)
}

export function versionesPorTipo<T extends { tipo: TipoTerminos }>(
  versiones: readonly T[],
  tipo: TipoTerminos
): T[] {
  return versiones.filter((v) => v.tipo === tipo)
}
