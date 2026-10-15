import { describe, expect, it } from "vitest"

import { RegistroToques } from "./registro-toques"

describe("RegistroToques", () => {
  it("pide verificar la primera vez y luego una vez por intervalo", () => {
    const registro = new RegistroToques(60_000)
    expect(registro.debeVerificar("s1", 0)).toBe(true)
    registro.registrar("s1", 0)
    expect(registro.debeVerificar("s1", 59_999)).toBe(false)
    expect(registro.debeVerificar("s1", 60_000)).toBe(true)
    expect(registro.debeVerificar("s2", 1)).toBe(true)
  })

  it("olvidar obliga a verificar de nuevo", () => {
    const registro = new RegistroToques(60_000)
    registro.registrar("s1", 0)
    registro.olvidar("s1")
    expect(registro.debeVerificar("s1", 1)).toBe(true)
  })

  it("no crece más allá de su capacidad", () => {
    const registro = new RegistroToques(60_000, 3)
    registro.registrar("a", 0)
    registro.registrar("b", 1)
    registro.registrar("c", 2)
    registro.registrar("d", 3)
    expect(registro.tamano).toBe(3)
    // Se descarta la más antigua; las recientes se conservan.
    expect(registro.debeVerificar("a", 4)).toBe(true)
    expect(registro.debeVerificar("d", 4)).toBe(false)
  })

  it("al llenarse descarta primero las entradas vencidas", () => {
    const registro = new RegistroToques(10, 3)
    registro.registrar("a", 0)
    registro.registrar("b", 1)
    registro.registrar("c", 20)
    registro.registrar("d", 21)
    expect(registro.tamano).toBe(2)
    expect(registro.debeVerificar("c", 22)).toBe(false)
  })
})
