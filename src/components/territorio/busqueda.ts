/**
 * Búsqueda local en listas de territorio (lógica pura): sin tildes ni
 * mayúsculas, primero lo que empieza por el texto, luego lo que tiene una
 * palabra que empieza por él y al final lo que lo contiene. También por
 * código DANE/DIVIPOLA. Dentro de cada grupo se conserva el orden recibido
 * (capital primero, alfabético).
 */
import { normalizarNombreGeo } from "@/lib/geo/normalizar"

export interface OpcionBuscable {
  readonly codigo: string
}

export function filtrarTerritorio<T extends OpcionBuscable>(
  opciones: readonly T[],
  texto: string,
  nombres: (opcion: T) => readonly string[]
): T[] {
  const consulta = normalizarNombreGeo(texto)
  const codigo = texto.trim()
  if (!consulta && !codigo) return [...opciones]
  const esCodigo = /^\d+$/.test(codigo)

  const puntuadas: { opcion: T; puntaje: number }[] = []
  for (const opcion of opciones) {
    const puntaje = esCodigo
      ? opcion.codigo.startsWith(codigo)
        ? 0
        : -1
      : puntajeNombre(nombres(opcion), consulta)
    if (puntaje >= 0) puntuadas.push({ opcion, puntaje })
  }
  // `sort` es estable: el orden recibido se conserva dentro de cada puntaje.
  return puntuadas
    .sort((a, b) => a.puntaje - b.puntaje)
    .map(({ opcion }) => opcion)
}

function puntajeNombre(nombres: readonly string[], consulta: string): number {
  if (!consulta) return -1
  let mejor = -1
  for (const nombre of nombres) {
    const normalizado = normalizarNombreGeo(nombre)
    const puntaje = normalizado.startsWith(consulta)
      ? 0
      : normalizado.includes(` ${consulta}`)
        ? 1
        : normalizado.includes(consulta)
          ? 2
          : -1
    if (puntaje !== -1 && (mejor === -1 || puntaje < mejor)) mejor = puntaje
  }
  return mejor
}
