import {
  listarDepartamentos,
  listarMunicipios,
  listarPaises,
  obtenerDepartamento,
  obtenerMunicipio,
  obtenerPais,
} from "./catalogo"
import {
  ALIAS_MUNICIPIOS,
  CODIGOS_MUNICIPIO_HISTORICOS,
} from "./diccionarios/municipios"
import { ADM0_A3_A_ISO2 } from "./diccionarios/paises"
import { normalizarNombreGeo } from "./normalizar"
import type { Departamento, Municipio, Pais } from "./tipos"

// ---------------------------------------------------------------------------
// Índice de nombres por niveles: nombre oficial > alias > sin artículo inicial.
// Para resolver gana el primer nivel con coincidencias; si en ese nivel hay
// varias, el nombre es ambiguo y no se adivina.
// ---------------------------------------------------------------------------

interface ClavesNombre {
  readonly nombre: string
  readonly alias: readonly string[]
}

/** Coincidencias agrupadas por nivel, del más al menos confiable. */
type Busqueda<T> = (
  consulta: string,
  filtro?: (elemento: T) => boolean
) => T[][]

function crearIndiceNombres<T>(
  elementos: readonly T[],
  claves: (elemento: T) => ClavesNombre
): Busqueda<T> {
  let niveles: Map<string, T[]>[] | undefined

  const construir = () => {
    const porNombre = new Map<string, T[]>()
    const porAlias = new Map<string, T[]>()
    const sinArticulo = new Map<string, T[]>()
    for (const elemento of elementos) {
      const { nombre, alias } = claves(elemento)
      agregar(porNombre, nombre, elemento)
      for (const variante of alias) agregar(porAlias, variante, elemento)
      for (const variante of [nombre, ...alias]) {
        agregar(
          sinArticulo,
          normalizarNombreGeo(variante, { quitarArticulos: true }),
          elemento
        )
      }
    }
    return [porNombre, porAlias, sinArticulo]
  }

  return (consulta, filtro = () => true) => {
    niveles ??= construir()
    const normalizada = normalizarNombreGeo(consulta)
    const consultas = [
      normalizada,
      normalizada,
      normalizarNombreGeo(consulta, { quitarArticulos: true }),
    ]
    return niveles.map((nivel, indice) =>
      (nivel.get(consultas[indice]) ?? []).filter(filtro)
    )
  }
}

function agregar<T>(mapa: Map<string, T[]>, clave: string, elemento: T): void {
  if (!clave) return
  const lista = mapa.get(clave)
  if (!lista) mapa.set(clave, [elemento])
  else if (!lista.includes(elemento)) lista.push(elemento)
}

/** El único candidato del primer nivel con coincidencias, o `null` si no hay o es ambiguo. */
function unico<T>(niveles: readonly T[][]): T | null {
  const candidatos = niveles.find((nivel) => nivel.length > 0) ?? []
  return candidatos.length === 1 ? candidatos[0] : null
}

// ---------------------------------------------------------------------------
// Países
// ---------------------------------------------------------------------------

const buscarPaisPorNombre = crearIndiceNombres(listarPaises(), (p) => ({
  nombre: p.nombreNormalizado,
  alias: p.alias,
}))

let paisesPorCodigoLargo: Map<string, Pais> | undefined
function paisPorCodigoLargo(codigo: string): Pais | undefined {
  paisesPorCodigoLargo ??= new Map(
    listarPaises().flatMap((p) => [
      [p.iso3, p] as const,
      ...(p.numerico ? [[p.numerico, p] as const] : []),
    ])
  )
  return (
    paisesPorCodigoLargo.get(codigo) ??
    obtenerPais(ADM0_A3_A_ISO2[codigo] ?? "")
  )
}

/**
 * Resuelve ISO2 ("co"), ISO3 ("COL"), numérico ("170"), ADM0_A3 de Natural Earth
 * ("KOS", "SDS"), nombre en español o alias ("EE. UU.", "Holanda", "UK").
 * Devuelve `null` si no hay coincidencia o si el nombre es ambiguo.
 */
export function resolverPais(entrada: string): Pais | null {
  const texto = entrada.trim()
  if (/^[A-Za-z]{2}$/.test(texto)) {
    const pais = obtenerPais(texto.toUpperCase())
    if (pais) return pais
  }
  if (/^[A-Za-z]{3}$/.test(texto) || /^\d{1,3}$/.test(texto)) {
    const codigo = /^\d+$/.test(texto)
      ? texto.padStart(3, "0")
      : texto.toUpperCase()
    const pais = paisPorCodigoLargo(codigo)
    if (pais) return pais
  }
  return unico(buscarPaisPorNombre(texto))
}

// ---------------------------------------------------------------------------
// Departamentos
// ---------------------------------------------------------------------------

const buscarDepartamentoPorNombre = crearIndiceNombres(
  listarDepartamentos(),
  (d) => ({
    nombre: d.nombreNormalizado,
    alias: d.alias,
  })
)

/**
 * Resuelve código DANE ("5", "05", 5), ISO 3166-2 ("CO-ANT", o el sufijo "ANT"
 * que envía `x-vercel-ip-country-region`), nombre oficial o alias
 * ("Bogotá", "SANTAFE DE BOGOTA D.C", "NARI¥O", "Valle").
 */
export function resolverDepartamento(
  entrada: string | number
): Departamento | null {
  const texto = String(entrada).trim()
  if (/^\d{1,2}$/.test(texto))
    return obtenerDepartamento(texto.padStart(2, "0")) ?? null

  const iso = /^(?:CO-)?([A-Z]{2,3})$/i.exec(texto)
  if (iso) {
    const codigoIso = `CO-${iso[1].toUpperCase()}`
    const departamento = listarDepartamentos().find(
      (d) => d.iso31662 === codigoIso
    )
    if (departamento) return departamento
  }
  return unico(buscarDepartamentoPorNombre(texto))
}

// ---------------------------------------------------------------------------
// Municipios
// ---------------------------------------------------------------------------

const buscarMunicipioPorNombre = crearIndiceNombres(
  listarMunicipios(),
  (m) => ({
    nombre: m.nombreNormalizado,
    alias: ALIAS_MUNICIPIOS[m.codigo] ?? [],
  })
)

export interface ConsultaMunicipio {
  readonly departamento: string | number
  readonly nombre: string
}

/**
 * Código DIVIPOLA canónico: completa el cero inicial que quitan las hojas de cálculo
 * (5001 → "05001") y traduce códigos históricos (27086 → "27493").
 */
export function codigoMunicipioCanonico(
  codigo: string | number
): string | null {
  const texto = String(codigo).trim()
  if (!/^\d{4,5}$/.test(texto)) return null
  const completo = texto.padStart(5, "0")
  const vigente = CODIGOS_MUNICIPIO_HISTORICOS[completo] ?? completo
  return obtenerMunicipio(vigente) ? vigente : null
}

/**
 * Resuelve un código DIVIPOLA, un nombre único en el país ("Medellín") o un par
 * `{ departamento, nombre }` para los nombres repetidos ("El Peñol", "San Andrés").
 */
export function resolverMunicipio(
  entrada: string | number | ConsultaMunicipio
): Municipio | null {
  if (typeof entrada === "object") {
    const departamento = resolverDepartamento(entrada.departamento)
    if (!departamento) return null
    return unico(
      buscarMunicipioPorNombre(
        entrada.nombre,
        (m) => m.departamentoCodigo === departamento.codigo
      )
    )
  }
  const codigo = codigoMunicipioCanonico(entrada)
  if (codigo) return obtenerMunicipio(codigo) ?? null
  return typeof entrada === "string"
    ? unico(buscarMunicipioPorNombre(entrada))
    : null
}

/**
 * Todos los municipios que coinciden con un nombre en cualquier nivel (oficial,
 * alias, sin artículo), ordenados por confianza: para desambiguar en la interfaz.
 */
export function buscarMunicipiosPorNombre(
  nombre: string
): readonly Municipio[] {
  return [...new Set(buscarMunicipioPorNombre(nombre).flat())]
}

// ---------------------------------------------------------------------------
// Agregación por polígono
// ---------------------------------------------------------------------------

export type OpcionesAgregacion =
  | { readonly modo: "suma" }
  /**
   * Promedio ponderado para tasas: Σ(valor·peso) / Σ(peso). Sin `pesos`, cada
   * municipio pesa 1; con `pesos`, el municipio sin peso cuenta como 0.
   */
  | {
      readonly modo: "promedio"
      readonly pesos?: Readonly<Record<string, number>>
    }

export interface ResultadoAgregacion {
  /** Valor por `codigoGeometria`, listo para `feature-state` con `promoteId: 'codigo'`. */
  readonly valores: Record<string, number>
  /** Claves de entrada que no corresponden a ningún municipio DIVIPOLA. */
  readonly sinResolver: string[]
}

/**
 * Lleva valores por municipio al polígono que los dibuja: los municipios sin
 * polígono propio (Norosí, Guachené, San José de Uré, Tuchín) se suman o
 * promedian con el municipio que los contiene.
 */
export function agregarPorGeometria(
  valores: Readonly<Record<string, number>>,
  opciones: OpcionesAgregacion = { modo: "suma" }
): ResultadoAgregacion {
  const acumulado = new Map<string, { suma: number; pesos: number }>()
  const sinResolver: string[] = []

  for (const [clave, valor] of Object.entries(valores)) {
    if (!Number.isFinite(valor)) continue
    const codigo = codigoMunicipioCanonico(clave)
    const municipio = codigo ? obtenerMunicipio(codigo) : undefined
    if (!municipio) {
      sinResolver.push(clave)
      continue
    }
    const peso =
      opciones.modo === "promedio"
        ? pesoDe(clave, municipio.codigo, opciones.pesos)
        : 1
    const actual = acumulado.get(municipio.codigoGeometria) ?? {
      suma: 0,
      pesos: 0,
    }
    acumulado.set(municipio.codigoGeometria, {
      suma: actual.suma + valor * peso,
      pesos: actual.pesos + peso,
    })
  }

  const resultado: Record<string, number> = {}
  for (const [codigoGeometria, { suma, pesos }] of acumulado) {
    if (opciones.modo === "suma") resultado[codigoGeometria] = suma
    else if (pesos > 0) resultado[codigoGeometria] = suma / pesos
  }
  return { valores: resultado, sinResolver }
}

function pesoDe(
  clave: string,
  codigo: string,
  pesos: Readonly<Record<string, number>> | undefined
): number {
  if (!pesos) return 1
  const peso = pesos[clave] ?? pesos[codigo]
  return peso !== undefined && Number.isFinite(peso) && peso > 0 ? peso : 0
}
