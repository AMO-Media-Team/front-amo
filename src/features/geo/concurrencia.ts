/**
 * Limitador de concurrencia: como mucho `limite` tareas en vuelo; el resto
 * espera turno en orden de llegada. El detalle de una zona compone decenas de
 * lecturas de la BD: así no satura el pool de conexiones de PostgREST ni
 * compite con el resto de la aplicación.
 */
export type Limitador = <T>(tarea: () => Promise<T>) => Promise<T>

export function crearLimitador(limite: number): Limitador {
  const maximo = Math.max(1, Math.floor(limite))
  const espera: (() => void)[] = []
  let enVuelo = 0

  const liberar = () => {
    enVuelo--
    espera.shift()?.()
  }

  return async <T>(tarea: () => Promise<T>): Promise<T> => {
    if (enVuelo >= maximo) {
      await new Promise<void>((turno) => espera.push(turno))
    }
    enVuelo++
    try {
      return await tarea()
    } finally {
      liberar()
    }
  }
}
