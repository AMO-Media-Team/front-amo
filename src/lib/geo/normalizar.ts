export interface OpcionesNormalizacion {
  /** Quita un artículo inicial ("el", "la", "los", "las", "lo", "the"): "La Guajira" → "guajira". */
  readonly quitarArticulos?: boolean
}

const MARCAS_DIACRITICAS = /\p{M}/gu
// Signos que se eliminan sin dejar espacio, para que "D.C." y "Côte d’Ivoire" colapsen a "dc" y "cote divoire".
const SIGNOS_PEGADOS = /[.'’‘`´]/g
const SEPARADORES = /[^\p{L}\p{N}]+/gu
const SUFIJOS_DE_CAPITAL = /(^| )(distrito capital|d c|dc)(?= |$)/g
const ARTICULO_INICIAL = /^(el|la|los|las|lo|the) (?=.)/

/**
 * Clave de comparación para nombres geográficos: minúsculas, sin tildes (¥ → ñ → n),
 * sin puntuación, espacios colapsados y sin "D.C." / "Distrito Capital".
 * Es la misma función con la que el pipeline genera `nombreNormalizado` y `alias`.
 *
 * El `¥` aparece en fuentes oficiales exportadas con la página de códigos 850 ("NARI¥O").
 */
export function normalizarNombreGeo(
  texto: string,
  opciones: OpcionesNormalizacion = {}
): string {
  const base = texto
    .replace(/¥/g, "ñ")
    .replace(/&/g, " y ")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(MARCAS_DIACRITICAS, "")
    .replace(SIGNOS_PEGADOS, "")
    .replace(SEPARADORES, " ")
    .trim()

  const sinCapital = quitarSiQuedaTexto(base, SUFIJOS_DE_CAPITAL)
  return opciones.quitarArticulos
    ? quitarSiQuedaTexto(sinCapital, ARTICULO_INICIAL)
    : sinCapital
}

/** Aplica el patrón salvo que deje la cadena vacía: "Distrito Capital" a secas se conserva. */
function quitarSiQuedaTexto(texto: string, patron: RegExp): string {
  const resultado = texto.replace(patron, " ").replace(/\s+/g, " ").trim()
  return resultado === "" ? texto : resultado
}
