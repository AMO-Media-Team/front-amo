/**
 * Utilidades comunes de `pnpm demo:generar` y `pnpm demo:purgar`: argumentos,
 * la guarda que impide tocar un entorno que no sea local sin `--forzar` y la
 * ejecución en paralelo con tope de trabajos.
 */
import { type EntornoBootstrap, ErrorBootstrap } from "../bootstrap/supabase"

const CONCURRENCIA_POR_DEFECTO = 6

/** Valor que sigue a `nombre` en la línea de comandos (`--desde 2025-07`). */
export function opcion(nombre: string): string | undefined {
  const indice = process.argv.indexOf(nombre)
  return indice === -1 ? undefined : process.argv[indice + 1]
}

export function esSitioLocal(sitioUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(sitioUrl)
}

/** Los datos demo no van a producción: fuera de un sitio local hay que pedirlo con `--forzar`. */
export function exigirEntornoLocal(entorno: EntornoBootstrap): void {
  if (!esSitioLocal(entorno.sitioUrl) && !process.argv.includes("--forzar")) {
    throw new ErrorBootstrap(
      `NEXT_PUBLIC_SITE_URL (${entorno.sitioUrl}) no es local: los datos demo no van a producción. Usa --forzar si de verdad es un entorno de demostración.`
    )
  }
}

/** Ejecuta `tarea` sobre cada elemento con un máximo de trabajos a la vez. */
export async function enParalelo<T>(
  elementos: readonly T[],
  tarea: (elemento: T) => Promise<void>,
  concurrencia = CONCURRENCIA_POR_DEFECTO
): Promise<void> {
  let siguiente = 0
  const trabajadores = Array.from({ length: concurrencia }, async () => {
    while (siguiente < elementos.length) {
      const indice = siguiente++
      await tarea(elementos[indice])
    }
  })
  await Promise.all(trabajadores)
}
