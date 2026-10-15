/**
 * Limita cuántas veces el DAL consulta la vigencia de una sesión
 * (`tocar_sesion_srv`): como máximo una vez por intervalo y por sesión en cada
 * instancia del servidor. Entre dos consultas la sesión se da por vigente; la
 * base de datos sigue aplicando la inactividad en cada consulta con RLS.
 */
export class RegistroToques {
  readonly #ultimos = new Map<string, number>()

  constructor(
    private readonly intervaloMs: number,
    private readonly capacidad = 10_000
  ) {}

  debeVerificar(sessionId: string, ahoraMs: number): boolean {
    const ultimo = this.#ultimos.get(sessionId)
    return ultimo === undefined || ahoraMs - ultimo >= this.intervaloMs
  }

  registrar(sessionId: string, ahoraMs: number): void {
    // Reinsertar mantiene el Map en orden de uso (el primero es el más antiguo).
    this.#ultimos.delete(sessionId)
    if (this.#ultimos.size >= this.capacidad) this.#liberar(ahoraMs)
    this.#ultimos.set(sessionId, ahoraMs)
  }

  olvidar(sessionId: string): void {
    this.#ultimos.delete(sessionId)
  }

  get tamano(): number {
    return this.#ultimos.size
  }

  #liberar(ahoraMs: number): void {
    for (const [sessionId, instante] of this.#ultimos) {
      if (ahoraMs - instante >= this.intervaloMs) {
        this.#ultimos.delete(sessionId)
      }
    }
    const masAntigua = this.#ultimos.keys().next()
    if (this.#ultimos.size >= this.capacidad && !masAntigua.done) {
      this.#ultimos.delete(masAntigua.value)
    }
  }
}
