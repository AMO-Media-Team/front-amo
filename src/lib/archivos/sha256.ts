/**
 * SHA-256 de un archivo (hex en minúsculas, el formato de
 * `creativo_archivos.sha256`). Web Crypto no tiene modo incremental: hasta
 * `UMBRAL_DIGEST_NATIVO` bytes se usa `crypto.subtle.digest` (nativo y fuera
 * del hilo principal); por encima se lee por bloques con una implementación
 * incremental (FIPS 180-4) para no tener 50 MB en memoria a la vez.
 */

/** 16 MiB: por debajo cabe en memoria sin problema incluso en un celular. */
export const UMBRAL_DIGEST_NATIVO = 16 * 1024 * 1024
const BLOQUE_LECTURA = 4 * 1024 * 1024

// prettier-ignore
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

// prettier-ignore
const H_INICIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]

const rotar = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** SHA-256 incremental: `actualizar` tantas veces como bloques, luego `digerir`. */
export class Sha256Incremental {
  private readonly estado = new Uint32Array(H_INICIAL)
  private readonly bloque = new Uint8Array(64)
  private readonly palabras = new Uint32Array(64)
  private ocupados = 0
  private longitudBytes = 0
  private terminado = false

  actualizar(datos: Uint8Array): this {
    if (this.terminado) throw new Error("El hash ya se calculó.")
    let posicion = 0
    this.longitudBytes += datos.length
    while (posicion < datos.length) {
      const copiar = Math.min(64 - this.ocupados, datos.length - posicion)
      this.bloque.set(
        datos.subarray(posicion, posicion + copiar),
        this.ocupados
      )
      this.ocupados += copiar
      posicion += copiar
      if (this.ocupados === 64) {
        this.procesarBloque()
        this.ocupados = 0
      }
    }
    return this
  }

  digerir(): Uint8Array {
    if (this.terminado) throw new Error("El hash ya se calculó.")
    this.terminado = true
    const bits = this.longitudBytes * 8
    this.bloque[this.ocupados++] = 0x80
    if (this.ocupados > 56) {
      this.bloque.fill(0, this.ocupados)
      this.procesarBloque()
      this.ocupados = 0
    }
    this.bloque.fill(0, this.ocupados, 56)
    const vista = new DataView(this.bloque.buffer)
    vista.setUint32(56, Math.floor(bits / 0x100000000))
    vista.setUint32(60, bits >>> 0)
    this.procesarBloque()
    const salida = new Uint8Array(32)
    const vistaSalida = new DataView(salida.buffer)
    this.estado.forEach((valor, i) => vistaSalida.setUint32(i * 4, valor))
    return salida
  }

  private procesarBloque(): void {
    const w = this.palabras
    const vista = new DataView(this.bloque.buffer)
    for (let i = 0; i < 16; i++) w[i] = vista.getUint32(i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotar(w[i - 15], 7) ^ rotar(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotar(w[i - 2], 17) ^ rotar(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = this.estado
    for (let i = 0; i < 64; i++) {
      const S1 = rotar(e, 6) ^ rotar(e, 11) ^ rotar(e, 25)
      const eleccion = (e & f) ^ (~e & g)
      const t1 = (h + S1 + eleccion + K[i] + w[i]) >>> 0
      const S0 = rotar(a, 2) ^ rotar(a, 13) ^ rotar(a, 22)
      const mayoria = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + mayoria) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    const s = this.estado
    s[0] += a
    s[1] += b
    s[2] += c
    s[3] += d
    s[4] += e
    s[5] += f
    s[6] += g
    s[7] += h
  }
}

export function aHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

export interface OpcionesHash {
  senal?: AbortSignal
  /** Fracción leída (0–1) al terminar cada bloque. */
  alProgresar?: (fraccion: number) => void
  /** Solo para pruebas: fuerza el camino por bloques en archivos pequeños. */
  umbralNativoBytes?: number
}

async function porBloques(
  archivo: Blob,
  { senal, alProgresar }: OpcionesHash
): Promise<string> {
  const hash = new Sha256Incremental()
  for (let inicio = 0; inicio < archivo.size; inicio += BLOQUE_LECTURA) {
    senal?.throwIfAborted()
    const fin = Math.min(inicio + BLOQUE_LECTURA, archivo.size)
    hash.actualizar(
      new Uint8Array(await archivo.slice(inicio, fin).arrayBuffer())
    )
    alProgresar?.(fin / archivo.size)
  }
  return aHex(hash.digerir())
}

/** SHA-256 en hex (64 caracteres en minúsculas) de un archivo de hasta 50 MB. */
export async function sha256Hex(
  archivo: Blob,
  opciones: OpcionesHash = {}
): Promise<string> {
  const umbral = opciones.umbralNativoBytes ?? UMBRAL_DIGEST_NATIVO
  if (archivo.size > umbral) return porBloques(archivo, opciones)
  opciones.senal?.throwIfAborted()
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await archivo.arrayBuffer()
  )
  opciones.alProgresar?.(1)
  return aHex(new Uint8Array(digest))
}
