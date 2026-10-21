import "server-only"

import { obtenerMunicipio } from "@/lib/geo/catalogo"
import { argumentosRpc } from "@/lib/supabase/rpc"
import type { crearClienteServidor } from "@/lib/supabase/server"

import { NIVEL_RPC, type NivelGeo } from "./metricas"
import {
  type ConsultaMapaGeo,
  ErrorDatosGeo,
  type FilaMetricaGeo,
} from "./tipos"

/**
 * RPC geográficas (docs/modelo-datos.md §5.9) con el cliente del USUARIO:
 * son `security invoker`, validan `analitica.mapa` (y `accesos.ver` para los
 * accesos) y la RLS limita las filas. Aquí se tipan las filas de
 * `geo_metricas` y se traducen los errores a motivos con estado HTTP.
 */

export type ClienteGeo = Awaited<ReturnType<typeof crearClienteServidor>>

export interface ErrorPostgrest {
  code?: string | null
  message?: string | null
  details?: string | null
}

const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"])
const SIN_PERMISO = new Set(["42501"])

export function traducirError(error: ErrorPostgrest): ErrorDatosGeo {
  if (FUNCION_INEXISTENTE.has(error.code ?? "")) {
    return new ErrorDatosGeo(
      "no-disponible",
      "La base de datos aún no expone la analítica geográfica. Intenta de nuevo en unos minutos."
    )
  }
  if (
    error.message === "AMO_NO_AUTORIZADO" ||
    SIN_PERMISO.has(error.code ?? "")
  ) {
    return new ErrorDatosGeo(
      "no-autorizado",
      "No tienes permiso para consultar esta métrica."
    )
  }
  if (
    error.message === "AMO_METRICA_NIVEL_INVALIDO" ||
    error.message === "AMO_CONFIG_INVALIDA"
  ) {
    return new ErrorDatosGeo(
      "consulta-invalida",
      error.details?.trim() ||
        "Esta métrica no está disponible para este nivel del mapa."
    )
  }
  // El texto técnico de Postgres no llega a la interfaz: solo su código.
  return new ErrorDatosGeo(
    "fallo",
    `No se pudieron consultar las métricas geográficas (${error.code ?? "sin código"}).`
  )
}

/**
 * Las SRF se generan con columnas no nulas, pero `valor`, `n`, `poblacion` y
 * `valor_por_100k` llegan `null` (tasas con n insuficiente, países sin
 * población); `numeric` puede llegar como texto.
 */
export function numeroONulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null
  const numero = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}

interface FilaRpc {
  codigo: string
  codigo_geometria: string | null
  nombre: string | null
  valor: unknown
  n: unknown
  poblacion: unknown
  valor_por_100k: unknown
}

function aFila(fila: FilaRpc, nivel: NivelGeo): FilaMetricaGeo {
  const codigo = fila.codigo.trim()
  const geometria =
    fila.codigo_geometria?.trim() ||
    (nivel === "departamental"
      ? obtenerMunicipio(codigo)?.codigoGeometria
      : undefined) ||
    codigo
  return {
    codigo,
    codigoGeometria: geometria,
    nombre: fila.nombre ?? codigo,
    valor: numeroONulo(fila.valor),
    n: numeroONulo(fila.n),
    poblacion: numeroONulo(fila.poblacion),
    valorPor100k: numeroONulo(fila.valor_por_100k),
  }
}

/** Ámbito de la RPC: `departamento` filtra los niveles departamento y municipio. */
export type ConsultaRpcGeo = Pick<
  ConsultaMapaGeo,
  "nivel" | "metrica" | "desde" | "hasta" | "departamento"
>

export async function geoMetricas(
  supabase: ClienteGeo,
  consulta: ConsultaRpcGeo
): Promise<FilaMetricaGeo[]> {
  const { data, error } = await supabase.rpc(
    "geo_metricas",
    argumentosRpc<"geo_metricas">({
      p_nivel: NIVEL_RPC[consulta.nivel],
      p_metrica: consulta.metrica,
      p_desde: consulta.desde,
      p_hasta: consulta.hasta,
      p_departamento: consulta.departamento,
    })
  )
  if (error) throw traducirError(error)
  return ((data ?? []) as FilaRpc[]).map((fila) => aFila(fila, consulta.nivel))
}
