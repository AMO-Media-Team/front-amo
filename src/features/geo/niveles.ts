/**
 * Máquina de niveles del explorador: Mundo (internacional) → Colombia
 * (nacional, departamentos) → un departamento (departamental, municipios).
 * Módulo puro: la URL guarda `nivel` y `depto`; aquí se normalizan y se
 * calculan las transiciones permitidas.
 */
import { departamentoPorCodigo } from "./departamentos"
import type { NivelGeo } from "./metricas"

export interface EstadoNivel {
  readonly nivel: NivelGeo
  /** Código DANE del departamento abierto; solo en el nivel departamental. */
  readonly departamento: string | null
}

export const CODIGO_COLOMBIA = "CO"

/**
 * Bogotá (un solo municipio) y el archipiélago de San Andrés (dos islas
 * lejanas) no tienen un nivel municipal útil: seleccionarlos abre su detalle.
 */
export const DEPARTAMENTOS_SIN_DESCENSO: ReadonlySet<string> = new Set([
  "11",
  "88",
])

export const ESTADO_INICIAL: EstadoNivel = {
  nivel: "nacional",
  departamento: null,
}

/** Estado coherente a partir de la URL: un nivel departamental sin departamento válido vuelve a Colombia. */
export function normalizarEstadoNivel(
  nivel: NivelGeo,
  departamento: string | null | undefined
): EstadoNivel {
  if (nivel !== "departamental") return { nivel, departamento: null }
  if (!departamento || !departamentoPorCodigo(departamento))
    return ESTADO_INICIAL
  if (DEPARTAMENTOS_SIN_DESCENSO.has(departamento)) return ESTADO_INICIAL
  return { nivel, departamento }
}

/** Estado al que lleva "Explorar" sobre una zona; `null` si no hay nivel inferior. */
export function explorar(
  estado: EstadoNivel,
  codigo: string
): EstadoNivel | null {
  switch (estado.nivel) {
    case "internacional":
      return codigo === CODIGO_COLOMBIA ? ESTADO_INICIAL : null
    case "nacional":
      return departamentoPorCodigo(codigo) &&
        !DEPARTAMENTOS_SIN_DESCENSO.has(codigo)
        ? { nivel: "departamental", departamento: codigo }
        : null
    case "departamental":
      return null
  }
}

export function puedeExplorar(estado: EstadoNivel, codigo: string): boolean {
  return explorar(estado, codigo) !== null
}

/** Nivel superior; `null` en el nivel más alto. */
export function subirNivel(estado: EstadoNivel): EstadoNivel | null {
  switch (estado.nivel) {
    case "internacional":
      return null
    case "nacional":
      return { nivel: "internacional", departamento: null }
    case "departamental":
      return ESTADO_INICIAL
  }
}

export interface MigaMapa {
  readonly etiqueta: string
  /** Estado al que lleva la miga; `null` en la miga actual. */
  readonly destino: EstadoNivel | null
}

/** "Mundo › Colombia › Antioquia": la última miga es la posición actual. */
export function migasMapa(estado: EstadoNivel): MigaMapa[] {
  const mundo: EstadoNivel = { nivel: "internacional", departamento: null }
  const migas: MigaMapa[] = [{ etiqueta: "Mundo", destino: mundo }]
  if (estado.nivel !== "internacional") {
    migas.push({ etiqueta: "Colombia", destino: ESTADO_INICIAL })
  }
  const departamento =
    estado.departamento && departamentoPorCodigo(estado.departamento)
  if (estado.nivel === "departamental" && departamento) {
    migas.push({ etiqueta: departamento.nombreCorto, destino: null })
  }
  const ultima = migas.length - 1
  return migas.map((miga, indice) =>
    indice === ultima ? { ...miga, destino: null } : miga
  )
}

export const TIPO_ZONA: Readonly<
  Record<NivelGeo, { singular: string; plural: string }>
> = {
  internacional: { singular: "País", plural: "países" },
  nacional: { singular: "Departamento", plural: "departamentos" },
  departamental: { singular: "Municipio", plural: "municipios" },
}

export function mismoEstado(a: EstadoNivel, b: EstadoNivel): boolean {
  return a.nivel === b.nivel && a.departamento === b.departamento
}
