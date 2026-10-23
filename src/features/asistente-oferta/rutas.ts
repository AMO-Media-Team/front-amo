import type { Route } from "next"

import type { PasoOferta } from "./pasos"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Formatos activos posibles (una oferta por formato): ninguna URL legítima trae más. */
const MAXIMO_OFERTAS = 9

/** Parámetro de la URL con los borradores que ya creó el asistente nuevo. */
export const PARAMETRO_OFERTAS = "ofertas"

/**
 * Asistente para una oferta nueva de la campaña o para editar una existente
 * (BORRADOR o DEVUELTA). Contrato: lo usan la campaña y la ficha de la oferta.
 * Las fichas de la campaña y de la oferta tienen sus rutas en
 * `campanas/rutas` y `ofertas/rutas`.
 */
export function rutaAsistente(campanaId: string, ofertaId?: string): Route {
  return (
    ofertaId
      ? `/campanas/${campanaId}/ofertas/${ofertaId}/editar`
      : `/campanas/${campanaId}/ofertas/nueva`
  ) as Route
}

/**
 * El asistente nuevo con sus borradores ya creados (una oferta por formato):
 * al recargar continúa donde iba.
 */
export function rutaContinuarAsistente(
  campanaId: string,
  ofertaIds: readonly string[],
  paso?: PasoOferta
): Route {
  const parametros = new URLSearchParams()
  if (ofertaIds.length > 0) {
    parametros.set(PARAMETRO_OFERTAS, ofertaIds.join(","))
  }
  if (paso && paso !== "que") parametros.set("paso", paso)
  const consulta = parametros.toString().replaceAll("%2C", ",")
  return `${rutaAsistente(campanaId)}${consulta ? `?${consulta}` : ""}` as Route
}

/** `?ofertas=a,b` → ids válidos, sin repetir y con tope (lo demás se ignora). */
export function parsearIdsOfertas(
  valor: string | string[] | null | undefined
): string[] {
  const texto = Array.isArray(valor) ? valor.join(",") : (valor ?? "")
  const ids = texto
    .split(",")
    .map((parte) => parte.trim().toLowerCase())
    .filter((parte) => UUID.test(parte))
  return [...new Set(ids)].slice(0, MAXIMO_OFERTAS)
}

export function esIdValido(valor: string): boolean {
  return UUID.test(valor)
}
