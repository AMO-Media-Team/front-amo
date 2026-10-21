import "server-only"

import { cache } from "react"

import {
  CONFIG_INSIGHTS_POR_DEFECTO,
  type ConfigInsights,
} from "@/features/dashboard/insights/tipos"
import { crearClienteServidor } from "@/lib/supabase/server"

/**
 * Utilidades de servidor de los paneles de Inicio. Las lecturas usan el
 * cliente del USUARIO: la RLS y el permiso que exige cada RPC deciden qué ve.
 */

export { fallar } from "@/features/auditoria/servidor"

/** Un cliente por solicitud, compartido por todos los bloques del panel. */
export const clientePanel = cache(crearClienteServidor)

const CLAVES_CONFIG = {
  "analitica.umbral_variacion": "umbralVariacion",
  "analitica.n_minimo_tasas": "nMinimo",
  "medios.dias_riesgo_sin_aceptar": "diasRiesgoSinAceptar",
  "medios.dias_actividad": "diasActividad",
} as const satisfies Record<string, keyof ConfigInsights>

type ClaveConfig = keyof typeof CLAVES_CONFIG

function esClaveConfig(valor: string): valor is ClaveConfig {
  return Object.hasOwn(CLAVES_CONFIG, valor)
}

/**
 * Umbrales de analítica (`configuracion`, docs/modelo-datos.md §7).
 * `analitica.n_minimo_tasas` es pública: anunciantes y medios rotulan la
 * «muestra insuficiente» con el mismo umbral que aplican las RPC. Las demás
 * exigen `configuracion.ver`; sin él, o ante un fallo, rigen los valores por
 * defecto (los que siembra la migración): el panel no debe caer por esto.
 */
export const configAnalitica = cache(async (): Promise<ConfigInsights> => {
  const supabase = await clientePanel()
  const { data, error } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", Object.keys(CLAVES_CONFIG))
  if (error || !data) return CONFIG_INSIGHTS_POR_DEFECTO
  const config: ConfigInsights = { ...CONFIG_INSIGHTS_POR_DEFECTO }
  for (const { clave, valor } of data) {
    const numero = typeof valor === "number" ? valor : Number(valor)
    if (esClaveConfig(clave) && Number.isFinite(numero)) {
      config[CLAVES_CONFIG[clave]] = numero
    }
  }
  return config
})
