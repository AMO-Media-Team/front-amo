/**
 * Escritor de bits MSB primero (módulo puro), base de los archivos de prueba
 * que se construyen sin binarios de terceros: los códigos Exp-Golomb del
 * H.264 (`video-prueba.ts`) y el código Huffman del JPEG (`jpeg-prueba.ts`).
 * Crece solo: un cuadro I_PCM de 1080 × 1920 son unos 3 MB.
 */

const CAPACIDAD_INICIAL = 1024

export class EscritorBits {
  private datos = new Uint8Array(CAPACIDAD_INICIAL)
  private largo = 0
  /** Bits ya ocupados del byte en curso (0 = alineado). */
  private ocupados = 0
  private enCurso = 0

  /**
   * @param alCerrarByte Se llama con cada byte completo; devuelve los bytes a
   *   escribir en su lugar (el JPEG agrega un 0x00 tras cada 0xFF).
   */
  constructor(
    private readonly alCerrarByte: (byte: number) => readonly number[] = (
      byte
    ) => [byte]
  ) {}

  private asegurar(adicionales: number): void {
    if (this.largo + adicionales <= this.datos.length) return
    let capacidad = this.datos.length * 2
    while (capacidad < this.largo + adicionales) capacidad *= 2
    const mayor = new Uint8Array(capacidad)
    mayor.set(this.datos.subarray(0, this.largo))
    this.datos = mayor
  }

  private empujar(byte: number): void {
    const salida = this.alCerrarByte(byte)
    this.asegurar(salida.length)
    for (const valor of salida) this.datos[this.largo++] = valor
  }

  get alineado(): boolean {
    return this.ocupados === 0
  }

  bit(valor: number | boolean): this {
    this.enCurso = (this.enCurso << 1) | (valor ? 1 : 0)
    this.ocupados += 1
    if (this.ocupados === 8) {
      this.empujar(this.enCurso)
      this.enCurso = 0
      this.ocupados = 0
    }
    return this
  }

  /** Los `cantidad` bits menos significativos de `valor` (hasta 32). */
  bits(valor: number, cantidad: number): this {
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 32) {
      throw new RangeError("Se escriben de 0 a 32 bits a la vez.")
    }
    for (let i = cantidad - 1; i >= 0; i -= 1) {
      this.bit(Math.floor(valor / 2 ** i) % 2)
    }
    return this
  }

  /** Exp-Golomb sin signo `ue(v)` (H.264 §9.1). */
  ue(valor: number): this {
    if (!Number.isInteger(valor) || valor < 0 || valor > 0xfffffffe) {
      throw new RangeError("ue(v) admite enteros de 0 a 2³² − 2.")
    }
    const codigo = valor + 1
    const largo = Math.floor(Math.log2(codigo)) + 1
    return this.bits(0, largo - 1).bits(codigo, largo)
  }

  /** Exp-Golomb con signo `se(v)`: 0, 1, −1, 2, −2… (H.264 §9.1.1). */
  se(valor: number): this {
    if (!Number.isInteger(valor)) throw new RangeError("se(v) admite enteros.")
    return this.ue(valor > 0 ? 2 * valor - 1 : -2 * valor)
  }

  /** Completa el byte en curso con `relleno` (0 en H.264, 1 en JPEG). */
  alinear(relleno: 0 | 1 = 0): this {
    while (!this.alineado) this.bit(relleno)
    return this
  }

  /** Bytes completos; exige estar alineado. No pasan por `alCerrarByte`. */
  bytes(valores: ArrayLike<number>): this {
    if (!this.alineado) {
      throw new Error("Los bytes se escriben con el escritor alineado.")
    }
    this.asegurar(valores.length)
    for (let i = 0; i < valores.length; i += 1) {
      this.datos[this.largo++] = valores[i]
    }
    return this
  }

  /** `rbsp_trailing_bits()`: un 1 y ceros hasta el byte (H.264 §7.3.2.11). */
  cerrarRbsp(): this {
    return this.bit(1).alinear(0)
  }

  /** Contenido escrito; exige estar alineado. */
  aBuffer(): Buffer {
    if (!this.alineado) {
      throw new Error("Alinea el escritor antes de leer su contenido.")
    }
    return Buffer.from(this.datos.subarray(0, this.largo))
  }
}
