/**
 * Contraseña temporal para el alta con contraseña: fuerte (≥ 90 bits) y fácil
 * de dictar o copiar: 4 grupos de 4 caracteres sin ambiguos (0/O, 1/l/I),
 * separados por guiones, p. ej. `Kp7x-Qm3v-Rt9w-Hb2n`. Cumple la política de
 * AMO (mayúscula, minúscula, número y símbolo; ≥ 12). Se muestra una sola vez
 * y la persona debe cambiarla al primer ingreso (`debe_cambiar_password`).
 */

const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz"
const DIGITOS = "23456789"
const TODOS = MAYUSCULAS + MINUSCULAS + DIGITOS
const GRUPOS = 4
const POR_GRUPO = 4
const SEPARADOR = "-"

/** Entero uniforme en [0, maximo). */
export type FuenteAleatoria = (maximo: number) => number

/** Web Crypto con muestreo por rechazo (sin sesgo de módulo). */
export const aleatorioSeguro: FuenteAleatoria = (maximo) => {
  const limite = Math.floor(0x1_0000_0000 / maximo) * maximo
  const buffer = new Uint32Array(1)
  do {
    crypto.getRandomValues(buffer)
  } while (buffer[0] >= limite)
  return buffer[0] % maximo
}

function elegir(conjunto: string, aleatorio: FuenteAleatoria): string {
  return conjunto[aleatorio(conjunto.length)]
}

export function generarContrasenaTemporal(
  aleatorio: FuenteAleatoria = aleatorioSeguro
): string {
  const caracteres = [
    elegir(MAYUSCULAS, aleatorio),
    elegir(MINUSCULAS, aleatorio),
    elegir(DIGITOS, aleatorio),
  ]
  while (caracteres.length < GRUPOS * POR_GRUPO) {
    caracteres.push(elegir(TODOS, aleatorio))
  }
  // Fisher-Yates: las clases obligatorias no quedan siempre al inicio.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1)
    ;[caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]]
  }
  return Array.from({ length: GRUPOS }, (_, grupo) =>
    caracteres.slice(grupo * POR_GRUPO, (grupo + 1) * POR_GRUPO).join("")
  ).join(SEPARADOR)
}
