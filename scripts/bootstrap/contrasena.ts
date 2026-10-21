/**
 * Contraseñas aleatorias para cuentas de prueba: cumplen la política de AMO
 * (≥ 12 caracteres con mayúscula, minúscula, dígito y símbolo) y solo usan
 * caracteres que se pueden guardar tal cual en `.env.local` (sin `$`, `#`,
 * comillas ni espacios: Next expande `$VAR` al cargar el archivo).
 */
import { randomInt } from "node:crypto"

const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz"
const DIGITOS = "23456789"
const SIMBOLOS = "!%^&*()-_=+[]{}.,:;?~@"
const TODOS = MAYUSCULAS + MINUSCULAS + DIGITOS + SIMBOLOS

/** Entero uniforme en [0, maximo). */
export type FuenteAleatoria = (maximo: number) => number

const LONGITUD_POR_DEFECTO = 24

function elegir(conjunto: string, aleatorio: FuenteAleatoria): string {
  return conjunto[aleatorio(conjunto.length)]
}

export function generarContrasena(
  longitud = LONGITUD_POR_DEFECTO,
  aleatorio: FuenteAleatoria = randomInt
): string {
  if (longitud < 12) {
    throw new Error("La contraseña debe tener ≥ 12 caracteres.")
  }
  const caracteres = [MAYUSCULAS, MINUSCULAS, DIGITOS, SIMBOLOS].map(
    (conjunto) => elegir(conjunto, aleatorio)
  )
  while (caracteres.length < longitud) caracteres.push(elegir(TODOS, aleatorio))
  // Fisher-Yates: las clases obligatorias no quedan siempre al inicio.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1)
    ;[caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]]
  }
  return caracteres.join("")
}
