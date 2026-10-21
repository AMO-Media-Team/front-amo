// Preposiciones y conjunciones: siempre en minúscula dentro del topónimo.
const ENLACES = new Set(["de", "del", "y", "e"])
// Artículos: en minúscula solo tras una preposición ("San José de la Montaña");
// si forman parte del nombre van en mayúscula ("María La Baja", "Castilla La Nueva").
const ARTICULOS = new Set(["el", "la", "los", "las"])
const SIGLAS = new Map([["d.c.", "D.C."]])

/**
 * Convierte un topónimo en mayúsculas (DIVIPOLA) a su forma de título en español:
 * "SAN JOSÉ DE CÚCUTA" → "San José de Cúcuta", "BOGOTÁ, D.C." → "Bogotá, D.C.".
 */
export function aTituloEspanol(texto: string): string {
  const palabras = texto.trim().toLocaleLowerCase("es").split(/\s+/)
  return palabras
    .map((palabra, i) => formatearPalabra(palabra, palabras[i - 1]))
    .join(" ")
}

function formatearPalabra(
  palabra: string,
  anterior: string | undefined
): string {
  const sigla = SIGLAS.get(palabra)
  if (sigla) return sigla
  if (anterior !== undefined && ENLACES.has(palabra)) return palabra
  if (
    anterior !== undefined &&
    ENLACES.has(anterior) &&
    ARTICULOS.has(palabra)
  ) {
    return palabra
  }
  // Los compuestos con guion ("Miritú-Paraná") llevan mayúscula en cada parte.
  return palabra
    .split("-")
    .map((parte) => parte.charAt(0).toLocaleUpperCase("es") + parte.slice(1))
    .join("-")
}

/** "-75,581775" → -75.581775 (datos.gov.co publica los decimales con coma). */
export function parsearDecimalConComa(texto: string): number {
  const valor = Number(texto.replace(",", "."))
  if (!Number.isFinite(valor)) throw new Error(`Decimal inválido: "${texto}"`)
  return valor
}

export function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales
  return Math.round(valor * factor) / factor
}
