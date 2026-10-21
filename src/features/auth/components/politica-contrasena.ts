/**
 * Política de contraseñas (docs/modelo-datos.md › seguridad: ≥ 12 caracteres
 * con mayúscula, minúscula, dígito y símbolo). Módulo puro: el medidor la usa
 * en el navegador y el esquema zod de las acciones puede reutilizarla.
 */

export const LONGITUD_MINIMA_CONTRASENA = 12

export type IdRegla =
  "longitud" | "mayuscula" | "minuscula" | "digito" | "simbolo"

export interface ReglaContrasena {
  id: IdRegla
  descripcion: string
  cumple: (valor: string) => boolean
}

export const REGLAS_CONTRASENA: readonly ReglaContrasena[] = [
  {
    id: "longitud",
    descripcion: `Al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`,
    cumple: (valor) => [...valor].length >= LONGITUD_MINIMA_CONTRASENA,
  },
  {
    id: "mayuscula",
    descripcion: "Una letra mayúscula",
    cumple: (valor) => /\p{Lu}/u.test(valor),
  },
  {
    id: "minuscula",
    descripcion: "Una letra minúscula",
    cumple: (valor) => /\p{Ll}/u.test(valor),
  },
  {
    id: "digito",
    descripcion: "Un número",
    cumple: (valor) => /\d/.test(valor),
  },
  {
    id: "simbolo",
    descripcion: "Un símbolo (!, #, $…)",
    cumple: (valor) => /[^\p{L}\p{N}\s]/u.test(valor),
  },
]

export type NivelContrasena =
  "vacia" | "debil" | "aceptable" | "fuerte" | "excelente"

export interface EvaluacionContrasena {
  cumplidas: Readonly<Record<IdRegla, boolean>>
  /** Reglas cumplidas, de 0 a 5. */
  puntaje: number
  nivel: NivelContrasena
  /** Cumple toda la política. */
  valida: boolean
}

// Con la política completa, la longitud extra es lo que más resistencia añade.
const LONGITUD_EXCELENTE = 16

function nivelDe(
  puntaje: number,
  valida: boolean,
  longitud: number
): NivelContrasena {
  if (longitud === 0) return "vacia"
  if (valida) return longitud >= LONGITUD_EXCELENTE ? "excelente" : "fuerte"
  return puntaje >= 3 ? "aceptable" : "debil"
}

export function evaluarContrasena(valor: string): EvaluacionContrasena {
  const cumplidas = Object.fromEntries(
    REGLAS_CONTRASENA.map((regla) => [regla.id, regla.cumple(valor)])
  ) as Record<IdRegla, boolean>
  const puntaje = Object.values(cumplidas).filter(Boolean).length
  const valida = puntaje === REGLAS_CONTRASENA.length
  return {
    cumplidas,
    puntaje,
    nivel: nivelDe(puntaje, valida, [...valor].length),
    valida,
  }
}

export const ETIQUETAS_NIVEL: Readonly<Record<NivelContrasena, string>> = {
  vacia: "Seguridad",
  debil: "Débil",
  aceptable: "Casi lista",
  fuerte: "Segura",
  excelente: "Muy segura",
}
