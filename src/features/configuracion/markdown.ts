/**
 * Markdown mínimo para las vistas previas de términos y plantillas (módulo
 * puro): títulos `#`, listas `-`/`1.`, párrafos y énfasis `**negrita**` y
 * `*cursiva*`, más las variables `{{nombre}}` de las plantillas. Devuelve una
 * estructura que la interfaz pinta con elementos de React (nunca HTML crudo).
 */

export type Segmento =
  | { tipo: "texto"; texto: string }
  | { tipo: "negrita"; texto: string }
  | { tipo: "cursiva"; texto: string }
  | { tipo: "variable"; nombre: string }

export type Bloque =
  | { tipo: "titulo"; nivel: 1 | 2 | 3; segmentos: Segmento[] }
  | { tipo: "parrafo"; lineas: Segmento[][] }
  | { tipo: "lista"; ordenada: boolean; elementos: Segmento[][] }

const PATRON_EN_LINEA =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\{\{\s*[a-z_][a-z0-9_]*\s*\}\})/gi

/** Segmentos de una línea: texto, énfasis y variables. */
export function segmentosEnLinea(linea: string): Segmento[] {
  const segmentos: Segmento[] = []
  let ultimo = 0
  for (const coincidencia of linea.matchAll(PATRON_EN_LINEA)) {
    const indice = coincidencia.index ?? 0
    if (indice > ultimo) {
      segmentos.push({ tipo: "texto", texto: linea.slice(ultimo, indice) })
    }
    const token = coincidencia[0]
    if (token.startsWith("{{")) {
      segmentos.push({
        tipo: "variable",
        nombre: token.slice(2, -2).trim(),
      })
    } else if (token.startsWith("**")) {
      segmentos.push({ tipo: "negrita", texto: token.slice(2, -2) })
    } else {
      segmentos.push({ tipo: "cursiva", texto: token.slice(1, -1) })
    }
    ultimo = indice + token.length
  }
  if (ultimo < linea.length) {
    segmentos.push({ tipo: "texto", texto: linea.slice(ultimo) })
  }
  return segmentos
}

const TITULO = /^(#{1,3})\s+(.*)$/
const VINETA = /^[-*]\s+(.*)$/
const NUMERADA = /^\d+[.)]\s+(.*)$/

/** Texto Markdown → bloques. Las líneas vacías separan párrafos. */
export function analizarMarkdown(texto: string): Bloque[] {
  const bloques: Bloque[] = []
  let parrafo: Segmento[][] = []
  let lista: { ordenada: boolean; elementos: Segmento[][] } | null = null

  const cerrar = () => {
    if (parrafo.length) bloques.push({ tipo: "parrafo", lineas: parrafo })
    if (lista) bloques.push({ tipo: "lista", ...lista })
    parrafo = []
    lista = null
  }

  for (const cruda of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const linea = cruda.trim()
    if (!linea) {
      cerrar()
      continue
    }
    const titulo = TITULO.exec(linea)
    if (titulo) {
      cerrar()
      bloques.push({
        tipo: "titulo",
        nivel: titulo[1].length as 1 | 2 | 3,
        segmentos: segmentosEnLinea(titulo[2]),
      })
      continue
    }
    const vineta = VINETA.exec(linea)
    const numerada = vineta ? null : NUMERADA.exec(linea)
    const elemento = vineta ?? numerada
    if (elemento) {
      const ordenada = numerada !== null
      if (parrafo.length || (lista && lista.ordenada !== ordenada)) cerrar()
      lista ??= { ordenada, elementos: [] }
      lista.elementos.push(segmentosEnLinea(elemento[1]))
      continue
    }
    if (lista) cerrar()
    parrafo.push(segmentosEnLinea(linea))
  }
  cerrar()
  return bloques
}
