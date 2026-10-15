/**
 * De filas de `geo_metricas` a valores por polígono y ranking. Módulo puro.
 *
 * Unos pocos municipios no tienen polígono propio (Norosí se dibuja con Río
 * Viejo, docs/geodatos.md): sus filas se funden en el polígono que los
 * representa, sumando conteos y ponderando tasas por `n` (cociente de sumas,
 * nunca promedio de razones; docs/kpis.md §0.4).
 */
import type { FilaMetricaGeo } from "./tipos"

export interface ValorZona {
  /** Código del polígono (`promoteId` del mapa). */
  readonly codigo: string
  readonly nombre: string
  /** Códigos originales representados (más de uno si comparten polígono). */
  readonly codigos: readonly string[]
  /** Valor de la métrica (conteo, monto o tasa). */
  readonly valorBase: number | null
  /** Valor que se muestra y colorea: el base o el de cada 100 mil habitantes. */
  readonly valor: number | null
  readonly n: number | null
  readonly poblacion: number | null
}

export interface OpcionesAgregacion {
  /** Conteos y montos (true) o tasas (false). */
  readonly aditiva: boolean
  readonly por100k: boolean
}

const POR_CIEN_MIL = 100_000

function sumarNoNulos(valores: readonly (number | null)[]): number | null {
  const presentes = valores.filter(
    (valor): valor is number => valor !== null && Number.isFinite(valor)
  )
  return presentes.length === 0
    ? null
    : presentes.reduce((suma, valor) => suma + valor, 0)
}

/** Promedio ponderado por `n` de las tasas con dato; `null` si ninguna tiene. */
export function tasaPonderada(
  pares: readonly { readonly valor: number | null; readonly n: number | null }[]
): number | null {
  let numerador = 0
  let denominador = 0
  for (const { valor, n } of pares) {
    if (valor === null || !Number.isFinite(valor) || !n || n <= 0) continue
    numerador += valor * n
    denominador += n
  }
  return denominador > 0 ? numerador / denominador : null
}

function fundir(
  filas: readonly FilaMetricaGeo[],
  { aditiva, por100k }: OpcionesAgregacion
): ValorZona {
  const [primera] = filas
  const valorBase = aditiva
    ? sumarNoNulos(filas.map((f) => f.valor))
    : tasaPonderada(filas)
  const poblacion = sumarNoNulos(filas.map((f) => f.poblacion))
  // La tasa de la BD manda; si no viene (o se fundieron filas), se recalcula.
  const valorPor100k =
    filas.length === 1 && primera.valorPor100k !== null
      ? primera.valorPor100k
      : valorBase !== null && poblacion
        ? (valorBase / poblacion) * POR_CIEN_MIL
        : null

  return {
    codigo: primera.codigoGeometria,
    nombre: filas.map((f) => f.nombre).join(" y "),
    codigos: filas.map((f) => f.codigo),
    valorBase,
    valor: por100k && aditiva ? valorPor100k : valorBase,
    n: sumarNoNulos(filas.map((f) => f.n)),
    poblacion,
  }
}

/** Un valor por polígono, en el orden de primera aparición. */
export function agruparPorGeometria(
  filas: readonly FilaMetricaGeo[],
  opciones: OpcionesAgregacion
): ValorZona[] {
  const grupos = new Map<string, FilaMetricaGeo[]>()
  for (const fila of filas) {
    const grupo = grupos.get(fila.codigoGeometria)
    if (grupo) grupo.push(fila)
    else grupos.set(fila.codigoGeometria, [fila])
  }
  return [...grupos.values()].map((grupo) => fundir(grupo, opciones))
}

export interface FilaRanking extends ValorZona {
  /** Puesto (1 = mayor valor, empates comparten puesto); `null` sin dato. */
  readonly posicion: number | null
  /** Fracción del total (solo conteos y montos absolutos). */
  readonly participacion: number | null
}

export interface Ranking {
  readonly filas: readonly FilaRanking[]
  /** Total del ámbito: suma, tasa ponderada o tasa por 100 mil del conjunto. */
  readonly total: number | null
  readonly conDatos: number
  /** Mayor valor, para escalar las barras. */
  readonly maximo: number
}

const comparadorNombres = new Intl.Collator("es", { sensitivity: "base" })

function totalDelAmbito(
  zonas: readonly ValorZona[],
  { aditiva, por100k }: OpcionesAgregacion
): number | null {
  if (!aditiva) {
    return tasaPonderada(zonas.map((z) => ({ valor: z.valorBase, n: z.n })))
  }
  const suma = sumarNoNulos(zonas.map((z) => z.valorBase))
  if (!por100k || suma === null) return suma
  const poblacion = sumarNoNulos(
    zonas.filter((z) => z.valorBase !== null).map((z) => z.poblacion)
  )
  return poblacion ? (suma / poblacion) * POR_CIEN_MIL : null
}

/** Ordena de mayor a menor (sin dato al final, por nombre) y calcula puestos y participación. */
export function construirRanking(
  zonas: readonly ValorZona[],
  opciones: OpcionesAgregacion
): Ranking {
  const ordenadas = [...zonas].sort((a, b) => {
    if (a.valor === null && b.valor === null)
      return comparadorNombres.compare(a.nombre, b.nombre)
    if (a.valor === null) return 1
    if (b.valor === null) return -1
    return b.valor - a.valor || comparadorNombres.compare(a.nombre, b.nombre)
  })

  const sumaAbsoluta =
    opciones.aditiva && !opciones.por100k
      ? sumarNoNulos(ordenadas.map((z) => z.valor))
      : null

  let posicionAnterior = 0
  let valorAnterior: number | null = null
  const filas = ordenadas.map((zona, indice): FilaRanking => {
    if (zona.valor === null) {
      return { ...zona, posicion: null, participacion: null }
    }
    const posicion =
      zona.valor === valorAnterior ? posicionAnterior : indice + 1
    posicionAnterior = posicion
    valorAnterior = zona.valor
    return {
      ...zona,
      posicion,
      participacion: sumaAbsoluta ? zona.valor / sumaAbsoluta : null,
    }
  })

  const valores = filas.flatMap((f) => (f.valor === null ? [] : [f.valor]))
  return {
    filas,
    total: totalDelAmbito(zonas, opciones),
    conDatos: valores.length,
    maximo: valores.length ? Math.max(...valores) : 0,
  }
}
