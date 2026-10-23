/**
 * Configuración pública que usa el asistente de oferta (módulo puro): las
 * claves de `configuracion` con `es_publica` y su lectura tolerante (una clave
 * ausente o ilegible usa el valor de la migración inicial).
 */
import type { Json } from "@/types/database.types"

import { CORTES_OFERTA } from "./schemas"
import type { ConfiguracionAsistente, CorteOferta } from "./tipos"

const CLAVES = {
  anticipacionHoras: "ofertas.anticipacion_minima_horas",
  minimoMedios: "ofertas.minimo_medios",
  estimadorMinimo: "ofertas.estimador_n_minimo",
  topePorcentaje: "campanas.tope_porcentaje_por_medio",
  recargoExclusividad: "precios.recargo_exclusividad",
  cortesPorDefecto: "metricas.cortes_requeridos",
  umbralSeguidores: "medios.umbral_seguidores",
  maximoCreativoMb: "archivos.max_creativo_mb",
} as const satisfies Record<keyof ConfiguracionAsistente, string>

export const CLAVES_CONFIGURACION: string[] = Object.values(CLAVES)

/** Valores de la migración inicial, por si una clave no se pudiera leer. */
export const CONFIGURACION_POR_DEFECTO: ConfiguracionAsistente = {
  anticipacionHoras: 24,
  minimoMedios: 1,
  estimadorMinimo: 5,
  topePorcentaje: 0.15,
  recargoExclusividad: 1.25,
  cortesPorDefecto: ["H24", "H72", "D7"],
  umbralSeguidores: 30_000,
  maximoCreativoMb: 50,
}

function numeroConfig(valor: Json | undefined, respaldo: number): number {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" && Number.isFinite(numero) && numero >= 0
    ? numero
    : respaldo
}

/** `metricas.cortes_requeridos` → cortes válidos para una oferta, en orden. */
export function cortesConfig(
  valor: Json | undefined,
  respaldo: readonly CorteOferta[]
): CorteOferta[] {
  const lista = Array.isArray(valor) ? valor : []
  const cortes = CORTES_OFERTA.filter((corte) => lista.includes(corte))
  return cortes.length > 0 ? cortes : [...respaldo]
}

/** Filas `clave, valor` de `configuracion` → configuración del asistente. */
export function configuracionDesdeFilas(
  filas: readonly { clave: string; valor: Json }[]
): ConfiguracionAsistente {
  const valores = new Map(filas.map((fila) => [fila.clave, fila.valor]))
  const d = CONFIGURACION_POR_DEFECTO
  const numero = (campo: Exclude<keyof typeof CLAVES, "cortesPorDefecto">) =>
    numeroConfig(valores.get(CLAVES[campo]), d[campo])
  return {
    anticipacionHoras: numero("anticipacionHoras"),
    minimoMedios: numero("minimoMedios"),
    estimadorMinimo: numero("estimadorMinimo"),
    topePorcentaje: numero("topePorcentaje"),
    recargoExclusividad: numero("recargoExclusividad"),
    cortesPorDefecto: cortesConfig(
      valores.get(CLAVES.cortesPorDefecto),
      d.cortesPorDefecto
    ),
    umbralSeguidores: numero("umbralSeguidores"),
    maximoCreativoMb: numero("maximoCreativoMb"),
  }
}
