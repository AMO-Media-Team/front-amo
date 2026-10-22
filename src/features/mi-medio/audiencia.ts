/**
 * Origen geográfico de la audiencia del medio (módulo puro, MED-002):
 * `medio_audiencia_paises` con fuente DECLARADA. La suma de un medio no puede
 * pasar de 100 % (`trg_medio_audiencia_paises_z_suma`, diferido al final de
 * cada transacción); las filas que verificó AMO no las toca el medio.
 *
 * Cada solicitud a la API es su propia transacción, así que el orden de
 * escritura importa: primero lo que baja (borrar y reducir) y después lo que
 * sube (aumentar e insertar). Así ningún paso intermedio supera la suma final,
 * que el esquema ya validó ≤ 100 %.
 */

export const LIMITES_AUDIENCIA = { paisesMax: 10 } as const

/** Porcentaje en centésimas enteras (la columna es `numeric(5,2)`): sumas sin error de coma flotante. */
export function enCentesimas(porcentaje: number): number {
  return Math.round(porcentaje * 100)
}

export function sumaPorcentajes(porcentajes: readonly number[]): number {
  return (
    porcentajes.reduce((suma, valor) => suma + enCentesimas(valor), 0) / 100
  )
}

export interface PorcentajePais {
  paisIso2: string
  porcentaje: number
}

export interface CambiosAudiencia {
  borrar: string[]
  /** Bajan: se escriben antes que lo que sube. */
  reducir: PorcentajePais[]
  aumentar: PorcentajePais[]
  insertar: PorcentajePais[]
}

/** Qué escribir para pasar de las filas declaradas `actuales` a `nuevas`. */
export function cambiosAudiencia(
  actuales: readonly PorcentajePais[],
  nuevas: readonly PorcentajePais[]
): CambiosAudiencia {
  const antes = new Map(
    actuales.map((fila) => [fila.paisIso2, enCentesimas(fila.porcentaje)])
  )
  const despues = new Set(nuevas.map((fila) => fila.paisIso2))
  const cambios: CambiosAudiencia = {
    borrar: actuales
      .map((fila) => fila.paisIso2)
      .filter((pais) => !despues.has(pais)),
    reducir: [],
    aumentar: [],
    insertar: [],
  }
  for (const fila of nuevas) {
    const previo = antes.get(fila.paisIso2)
    const nuevo = enCentesimas(fila.porcentaje)
    if (previo === undefined) cambios.insertar.push(fila)
    else if (nuevo < previo) cambios.reducir.push(fila)
    else if (nuevo > previo) cambios.aumentar.push(fila)
  }
  return cambios
}

export function hayCambiosAudiencia(cambios: CambiosAudiencia): boolean {
  return (
    cambios.borrar.length > 0 ||
    cambios.reducir.length > 0 ||
    cambios.aumentar.length > 0 ||
    cambios.insertar.length > 0
  )
}

/** Mayor porcentaje primero; a igualdad, por nombre de país. */
export function ordenarAudiencia<T extends PorcentajePais & { nombre: string }>(
  filas: readonly T[]
): T[] {
  return [...filas].sort(
    (a, b) =>
      b.porcentaje - a.porcentaje || a.nombre.localeCompare(b.nombre, "es")
  )
}
