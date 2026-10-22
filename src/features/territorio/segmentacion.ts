/**
 * Reglas de la segmentación geográfica (lógica pura, cliente y servidor).
 *
 * Un medio es elegible si su municipio está en `municipios` o su departamento
 * en `departamentos` (`private.medio_elegible`). Por eso elegir un
 * departamento completo hace redundantes sus municipios: se quitan, y un
 * municipio de un departamento ya completo no se agrega aparte.
 */
import type { Segmentacion } from "./tipos"

export const SEGMENTACION_VACIA: Segmentacion = {
  departamentos: [],
  municipios: [],
}

/** El código DIVIPOLA empieza por el del departamento («05001» → «05»). */
export function departamentoDeMunicipio(municipio: string): string {
  return municipio.slice(0, 2)
}

function sinRepetidos(codigos: readonly string[]): string[] {
  return [...new Set(codigos.map((codigo) => codigo.trim()))]
}

/** Sin repetidos ni municipios cubiertos por su departamento; conserva el orden. */
export function normalizarSegmentacion(valor: Segmentacion): Segmentacion {
  const departamentos = sinRepetidos(valor.departamentos)
  const completos = new Set(departamentos)
  const municipios = sinRepetidos(valor.municipios).filter(
    (municipio) => !completos.has(departamentoDeMunicipio(municipio))
  )
  return { departamentos, municipios }
}

export function esSegmentacionVacia(valor: Segmentacion): boolean {
  return valor.departamentos.length === 0 && valor.municipios.length === 0
}

export function departamentoCompleto(
  valor: Segmentacion,
  departamento: string
): boolean {
  return valor.departamentos.includes(departamento)
}

/** El municipio llega a la oferta: elegido o cubierto por su departamento. */
export function municipioIncluido(
  valor: Segmentacion,
  municipio: string
): boolean {
  return (
    valor.municipios.includes(municipio) ||
    departamentoCompleto(valor, departamentoDeMunicipio(municipio))
  )
}

/** Municipios elegidos uno a uno dentro de un departamento. */
export function municipiosElegidosDe(
  valor: Segmentacion,
  departamento: string
): string[] {
  return valor.municipios.filter(
    (municipio) => departamentoDeMunicipio(municipio) === departamento
  )
}

/** Marca o desmarca el departamento completo (al marcarlo absorbe sus municipios). */
export function alternarDepartamento(
  valor: Segmentacion,
  departamento: string
): Segmentacion {
  if (departamentoCompleto(valor, departamento)) {
    return {
      ...valor,
      departamentos: valor.departamentos.filter((d) => d !== departamento),
    }
  }
  return normalizarSegmentacion({
    ...valor,
    departamentos: [...valor.departamentos, departamento],
  })
}

/**
 * Marca o desmarca un municipio. Si su departamento ya está completo no
 * cambia nada: para elegir municipios sueltos primero se desmarca el
 * departamento (la interfaz lo muestra incluido y deshabilitado).
 */
export function alternarMunicipio(
  valor: Segmentacion,
  municipio: string
): Segmentacion {
  if (departamentoCompleto(valor, departamentoDeMunicipio(municipio))) {
    return valor
  }
  return valor.municipios.includes(municipio)
    ? {
        ...valor,
        municipios: valor.municipios.filter((m) => m !== municipio),
      }
    : { ...valor, municipios: [...valor.municipios, municipio] }
}

export function quitarDepartamento(
  valor: Segmentacion,
  departamento: string
): Segmentacion {
  return {
    ...valor,
    departamentos: valor.departamentos.filter((d) => d !== departamento),
  }
}

export function quitarMunicipio(
  valor: Segmentacion,
  municipio: string
): Segmentacion {
  return {
    ...valor,
    municipios: valor.municipios.filter((m) => m !== municipio),
  }
}

/** Departamentos cuyos nombres de municipio hacen falta para pintar las fichas. */
export function departamentosConMunicipios(valor: Segmentacion): string[] {
  return sinRepetidos(valor.municipios.map(departamentoDeMunicipio))
}

function plural(cantidad: number, singular: string, plural: string): string {
  return `${cantidad.toLocaleString("es-CO")} ${cantidad === 1 ? singular : plural}`
}

/**
 * Resumen en una línea: «Todo el país», «2 departamentos completos»,
 * «5 municipios», «1 departamento completo y 3 municipios».
 */
export function resumenSegmentacion(
  valor: Segmentacion,
  textoVacio = "Todo el país"
): string {
  const { departamentos, municipios } = valor
  if (departamentos.length === 0 && municipios.length === 0) return textoVacio
  const partes: string[] = []
  if (departamentos.length > 0) {
    partes.push(
      plural(
        departamentos.length,
        "departamento completo",
        "departamentos completos"
      )
    )
  }
  if (municipios.length > 0) {
    partes.push(plural(municipios.length, "municipio", "municipios"))
  }
  return partes.join(" y ")
}
