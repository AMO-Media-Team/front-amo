/**
 * Adaptadores de las filas de las RPC de analítica (docs/modelo-datos.md §5.9)
 * a la entrada del motor. Las formas se declaran aquí según la especificación
 * porque la migración 9 (analítica) aún no genera sus tipos; cuando exista,
 * se reemplazan por `Database["public"]["Functions"][…]["Returns"]`.
 * PostgREST entrega `numeric` como número o como texto: todo pasa por `numero`.
 */
import type { FilaMezcla, MediosEnRiesgo, Plataforma } from "./tipos"

type Numerico = number | string | null | undefined

/** `mezcla_plataformas(p_desde, p_hasta)`. */
export interface FilaMezclaRpc {
  plataforma: Plataforma
  formato_clave: string
  formato_nombre: string
  asignaciones: Numerico
  gmv: Numerico
  alcance?: Numerico
  participacion_gmv?: Numerico
  cpm_efectivo: Numerico
}

/** `salud_medios(p_desde, p_hasta)`. */
export interface FilaSaludMediosRpc {
  segmento: string
  cantidad: Numerico
  gmv_en_juego: Numerico
  porcentaje?: Numerico
}

/** `medios_en_riesgo(p_limite)`. */
export interface FilaMedioEnRiesgoRpc {
  medio_id: string
  nombre: string
  departamento: string | null
  gmv_90d: Numerico
}

/** Número finito o `null` (texto numérico incluido). */
export function numero(valor: Numerico): number | null {
  if (valor === null || valor === undefined || valor === "") return null
  const convertido = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(convertido) ? convertido : null
}

export function mezclaDesdeRpc(filas: readonly FilaMezclaRpc[]): FilaMezcla[] {
  return filas.map((fila) => ({
    plataforma: fila.plataforma,
    formatoClave: fila.formato_clave,
    formatoNombre: fila.formato_nombre,
    asignaciones: numero(fila.asignaciones) ?? 0,
    gmv: numero(fila.gmv) ?? 0,
    cpmEfectivo: numero(fila.cpm_efectivo),
  }))
}

// El desglose por zona de la regla 1 NO se adapta desde `top_zonas`: su
// `valor_anterior` compara siempre con los N días previos, y el panel compara
// con el periodo alineado (docs/kpis.md §0.1). Se arma con dos lecturas, una
// por periodo: `desgloseDeZonas` (dashboard/admin/datos.ts).

export const SEGMENTO_EN_RIESGO = "en_riesgo"

/**
 * Regla 3: cantidad y GMV en juego del segmento `en_riesgo`, los medios de
 * mayor GMV y el GMV verificado de 90 días que da la proporción (si se tiene).
 */
export function mediosEnRiesgoDesdeRpc(
  salud: readonly FilaSaludMediosRpc[],
  medios: readonly FilaMedioEnRiesgoRpc[],
  gmvVerificado90d: number | null = null
): MediosEnRiesgo | undefined {
  const segmento = salud.find((fila) => fila.segmento === SEGMENTO_EN_RIESGO)
  if (!segmento) return undefined
  return {
    cantidad: numero(segmento.cantidad) ?? 0,
    gmvEnJuego: numero(segmento.gmv_en_juego) ?? 0,
    gmvVerificado90d,
    top: medios.map((medio) => ({
      id: medio.medio_id,
      nombre: medio.nombre,
      departamento: medio.departamento,
      gmv90d: numero(medio.gmv_90d) ?? 0,
    })),
  }
}
