/**
 * Tarifario versionado (módulo puro): estado de cada versión, matriz
 * plataforma × formato × franja con la tarifa vigente y la próxima programada,
 * historial de una celda y resumen para el encabezado de la sección.
 */
import type { Formato, Franja, Plataforma, Tarifa } from "./tipos"
import {
  type EstadoVigencia,
  estadoVigencia,
  inicioPreset,
  type PresetInicio,
} from "./vigencias"

export const ORDEN_PLATAFORMAS: readonly Plataforma[] = [
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
]

export function estadoTarifa(
  tarifa: Pick<Tarifa, "vigenteDesde" | "vigenteHasta">,
  ahora: Date = new Date()
): EstadoVigencia {
  return estadoVigencia(tarifa.vigenteDesde, tarifa.vigenteHasta, ahora)
}

export interface CeldaTarifa {
  formatoId: string
  franjaId: string
  vigente: Tarifa | null
  /** Primera versión programada (la que entrará en vigor después). */
  programada: Tarifa | null
  /** Variación de la programada frente a la vigente (fracción); `null` sin ambas. */
  variacion: number | null
}

export interface FilaMatriz {
  formato: Formato
  celdas: CeldaTarifa[]
}

export interface GrupoMatriz {
  plataforma: Plataforma
  filas: FilaMatriz[]
}

function claveCelda(formatoId: string, franjaId: string): string {
  return `${formatoId}:${franjaId}`
}

/** Versiones agrupadas por celda, de la más reciente a la más antigua. */
export function versionesPorCelda(
  tarifas: readonly Tarifa[]
): Map<string, Tarifa[]> {
  const mapa = new Map<string, Tarifa[]>()
  for (const tarifa of tarifas) {
    const clave = claveCelda(tarifa.formatoId, tarifa.franjaId)
    const lista = mapa.get(clave)
    if (lista) lista.push(tarifa)
    else mapa.set(clave, [tarifa])
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))
  }
  return mapa
}

export function celdaDe(
  versiones: readonly Tarifa[],
  formatoId: string,
  franjaId: string,
  ahora: Date = new Date()
): CeldaTarifa {
  const vigente =
    versiones.find((t) => estadoTarifa(t, ahora) === "VIGENTE") ?? null
  const programadas = versiones
    .filter((t) => estadoTarifa(t, ahora) === "PROGRAMADA")
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
  const programada = programadas[0] ?? null
  const variacion =
    vigente && programada && vigente.valorBase > 0
      ? (programada.valorBase - vigente.valorBase) / vigente.valorBase
      : null
  return { formatoId, franjaId, vigente, programada, variacion }
}

/** Franjas que se muestran como columnas: las activas y las que tienen tarifas. */
export function franjasVisibles(
  franjas: readonly Franja[],
  tarifas: readonly Tarifa[]
): Franja[] {
  const conTarifa = new Set(tarifas.map((t) => t.franjaId))
  return franjas
    .filter((f) => f.activa || conTarifa.has(f.id))
    .sort((a, b) => a.orden - b.orden || a.seguidoresMin - b.seguidoresMin)
}

/** Matriz por plataforma (en el orden de `ORDEN_PLATAFORMAS`) y formato. */
export function construirMatriz(
  formatos: readonly Formato[],
  franjas: readonly Franja[],
  tarifas: readonly Tarifa[],
  ahora: Date = new Date()
): GrupoMatriz[] {
  const columnas = franjasVisibles(franjas, tarifas)
  const versiones = versionesPorCelda(tarifas)
  return ORDEN_PLATAFORMAS.map((plataforma) => ({
    plataforma,
    filas: formatos
      .filter((f) => f.plataforma === plataforma)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .map((formato) => ({
        formato,
        celdas: columnas.map((franja) =>
          celdaDe(
            versiones.get(claveCelda(formato.id, franja.id)) ?? [],
            formato.id,
            franja.id,
            ahora
          )
        ),
      })),
  })).filter((grupo) => grupo.filas.length > 0)
}

/** Historial de una celda (más reciente primero), con el estado de cada versión. */
export function historialCelda(
  tarifas: readonly Tarifa[],
  formatoId: string,
  franjaId: string,
  ahora: Date = new Date()
): (Tarifa & { estado: EstadoVigencia })[] {
  return (
    versionesPorCelda(tarifas).get(claveCelda(formatoId, franjaId)) ?? []
  ).map((tarifa) => ({ ...tarifa, estado: estadoTarifa(tarifa, ahora) }))
}

/**
 * Versiones para la lista «Todas las versiones»: la más reciente primero y, a
 * igual fecha de inicio (la semilla empieza toda el mismo día), en el mismo
 * orden de la matriz: plataforma, formato y franja.
 */
export function ordenarVersiones(
  tarifas: readonly Tarifa[],
  formatos: readonly Formato[],
  franjas: readonly Franja[]
): Tarifa[] {
  const ordenFormato = new Map(formatos.map((f) => [f.id, f.orden]))
  const ordenFranja = new Map(franjas.map((f) => [f.id, f.orden]))
  const posicion = (mapa: Map<string, number>, id: string) =>
    mapa.get(id) ?? Number.MAX_SAFE_INTEGER
  return [...tarifas].sort(
    (a, b) =>
      b.vigenteDesde.localeCompare(a.vigenteDesde) ||
      ORDEN_PLATAFORMAS.indexOf(a.plataforma) -
        ORDEN_PLATAFORMAS.indexOf(b.plataforma) ||
      posicion(ordenFormato, a.formatoId) -
        posicion(ordenFormato, b.formatoId) ||
      posicion(ordenFranja, a.franjaId) - posicion(ordenFranja, b.franjaId)
  )
}

export interface ResumenTarifas {
  vigentes: number
  /** Celdas activas (formato activo × franja activa) sin tarifa vigente. */
  sinTarifa: number
  programadas: number
  pendientes: number
  /** Próxima entrada en vigor de una tarifa programada. */
  proximoCambio: string | null
}

export function resumirTarifas(
  formatos: readonly Formato[],
  franjas: readonly Franja[],
  tarifas: readonly Tarifa[],
  ahora: Date = new Date()
): ResumenTarifas {
  const conEstado = tarifas.map((t) => ({ t, estado: estadoTarifa(t, ahora) }))
  const vigentes = conEstado.filter(({ estado }) => estado === "VIGENTE")
  const programadas = conEstado
    .filter(({ estado }) => estado === "PROGRAMADA")
    .map(({ t }) => t.vigenteDesde)
    .sort()
  const celdasConVigente = new Set(
    vigentes.map(({ t }) => claveCelda(t.formatoId, t.franjaId))
  )
  let sinTarifa = 0
  for (const formato of formatos.filter((f) => f.activo)) {
    for (const franja of franjas.filter((f) => f.activa)) {
      if (!celdasConVigente.has(claveCelda(formato.id, franja.id))) sinTarifa++
    }
  }
  return {
    vigentes: vigentes.length,
    sinTarifa,
    programadas: programadas.length,
    pendientes: conEstado.filter(
      ({ t, estado }) => t.pendienteValidacion && estado !== "FINALIZADA"
    ).length,
    proximoCambio: programadas[0] ?? null,
  }
}

/** Ids de las tarifas vigentes o programadas aún pendientes de validación. */
export function tarifasPendientes(
  tarifas: readonly Tarifa[],
  ahora: Date = new Date()
): string[] {
  return tarifas
    .filter(
      (t) => t.pendienteValidacion && estadoTarifa(t, ahora) !== "FINALIZADA"
    )
    .map((t) => t.id)
}

/**
 * Inicio de la última versión programada de una celda: una nueva vigencia
 * debe empezar DESPUÉS (`programar_tarifa` rechaza una que empiece en esa
 * fecha o antes; para reemplazarla hay que cancelarla). `null` sin programadas.
 */
export function inicioUltimaProgramada(
  versiones: readonly Tarifa[],
  ahora: Date = new Date()
): string | null {
  return (
    versiones
      .filter((t) => estadoTarifa(t, ahora) === "PROGRAMADA")
      .map((t) => t.vigenteDesde)
      .sort()
      .at(-1) ?? null
  )
}

/** ¿Una vigencia que empiece en `desde` es programable en esta celda? */
export function inicioProgramable(
  desde: Date,
  versiones: readonly Tarifa[],
  ahora: Date = new Date()
): boolean {
  if (desde.getTime() <= ahora.getTime()) return false
  const ultima = inicioUltimaProgramada(versiones, ahora)
  return ultima === null || desde.getTime() > new Date(ultima).getTime()
}

const PRESETS_SUGERIDOS: readonly PresetInicio[] = ["manana", "lunes", "mes"]

/**
 * Inicio con el que abre el formulario: el primer preset que la celda admite
 * (con una tarifa ya programada, los anteriores a ella no sirven) o, si
 * ninguno sirve, una fecha elegida a mano.
 */
export function inicioSugerido(
  versiones: readonly Tarifa[],
  ahora: Date = new Date()
): PresetInicio | "fecha" {
  return (
    PRESETS_SUGERIDOS.find((preset) =>
      inicioProgramable(inicioPreset(preset, ahora), versiones, ahora)
    ) ?? "fecha"
  )
}
