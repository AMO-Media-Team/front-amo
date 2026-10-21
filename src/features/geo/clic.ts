/**
 * Distingue clic de doble clic sobre el mapa sin sacrificar el tacto:
 * - Ratón o lápiz: el clic selecciona tras `retardoMs` (250 ms) salvo que
 *   llegue un doble clic, que explora (atajo de escritorio).
 * - Tacto: el toque selecciona al instante y el doble toque se ignora (en
 *   pantallas táctiles se explora con el botón "Explorar").
 */

export const RETARDO_DOBLE_CLIC_MS = 250

export type TipoPuntero = "mouse" | "pen" | "touch"

export interface Temporizador {
  programar(accion: () => void, ms: number): unknown
  cancelar(id: unknown): void
}

const TEMPORIZADOR_NAVEGADOR: Temporizador = {
  programar: (accion, ms) => setTimeout(accion, ms),
  cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}

export interface OpcionesDiscriminador<T> {
  alSeleccionar(dato: T): void
  alExplorar(dato: T): void
  retardoMs?: number
  temporizador?: Temporizador
}

export interface DiscriminadorClic<T> {
  clic(dato: T, puntero: TipoPuntero): void
  dobleClic(dato: T, puntero: TipoPuntero): void
  /** Descarta un clic pendiente (al desmontar o al cambiar de nivel). */
  limpiar(): void
}

export function crearDiscriminadorClic<T>({
  alSeleccionar,
  alExplorar,
  retardoMs = RETARDO_DOBLE_CLIC_MS,
  temporizador = TEMPORIZADOR_NAVEGADOR,
}: OpcionesDiscriminador<T>): DiscriminadorClic<T> {
  let pendiente: unknown = null

  const limpiar = () => {
    if (pendiente !== null) temporizador.cancelar(pendiente)
    pendiente = null
  }

  return {
    clic(dato, puntero) {
      limpiar()
      if (puntero === "touch") {
        alSeleccionar(dato)
        return
      }
      pendiente = temporizador.programar(() => {
        pendiente = null
        alSeleccionar(dato)
      }, retardoMs)
    },
    dobleClic(dato, puntero) {
      if (puntero === "touch") return
      limpiar()
      alExplorar(dato)
    },
    limpiar,
  }
}

/** Normaliza `PointerEvent.pointerType` (vacío o desconocido cuenta como ratón). */
export function tipoPuntero(valor: string | null | undefined): TipoPuntero {
  return valor === "touch" || valor === "pen" ? valor : "mouse"
}
