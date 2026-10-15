/**
 * Añade variables a un archivo `.env` sin tocar las que ya existen: nunca
 * reescribe ni reordena líneas, solo agrega al final las claves nuevas.
 */

const NOMBRE_VARIABLE = /^[A-Z][A-Z0-9_]*$/
// Sin comillas ni `#`: el valor queda literal para dotenv y para `--env-file`.
const VALOR_SEGURO = /^[^\s"'`#\\]*$/

/** Claves definidas en el contenido (`CLAVE=valor`, también con `export`). */
export function clavesDefinidas(contenido: string): Set<string> {
  const claves = new Set<string>()
  for (const linea of contenido.split(/\r?\n/)) {
    const coincidencia = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(
      linea
    )
    if (coincidencia) claves.add(coincidencia[1])
  }
  return claves
}

export interface ResultadoAgregarVariables {
  contenido: string
  /** Claves que se agregaron (las existentes se respetan). */
  agregadas: string[]
}

export function agregarVariables(
  contenido: string,
  variables: Readonly<Record<string, string>>,
  comentario?: string
): ResultadoAgregarVariables {
  const existentes = clavesDefinidas(contenido)
  const nuevas = Object.entries(variables).filter(
    ([clave]) => !existentes.has(clave)
  )
  for (const [clave, valor] of nuevas) {
    if (!NOMBRE_VARIABLE.test(clave)) {
      throw new Error(`Nombre de variable inválido: ${clave}`)
    }
    if (!VALOR_SEGURO.test(valor)) {
      throw new Error(`El valor de ${clave} tiene caracteres no admitidos.`)
    }
  }
  if (nuevas.length === 0) return { contenido, agregadas: [] }

  const bloque = [
    ...(comentario ? [`# ${comentario}`] : []),
    ...nuevas.map(([clave, valor]) => `${clave}=${valor}`),
  ].join("\n")
  const separador =
    contenido === "" ? "" : contenido.endsWith("\n") ? "\n" : "\n\n"
  return {
    contenido: `${contenido}${separador}${bloque}\n`,
    agregadas: nuevas.map(([clave]) => clave),
  }
}
