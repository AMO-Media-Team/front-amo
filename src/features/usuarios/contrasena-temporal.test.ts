import { describe, expect, it } from "vitest"

import { evaluarContrasena } from "@/features/auth/components/politica-contrasena"

import {
  aleatorioSeguro,
  type FuenteAleatoria,
  generarContrasenaTemporal,
} from "./contrasena-temporal"

const FORMATO = /^[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){3}$/

describe("generarContrasenaTemporal", () => {
  it("usa 4 grupos de 4 caracteres sin ambiguos", () => {
    for (let i = 0; i < 50; i++) {
      expect(generarContrasenaTemporal()).toMatch(FORMATO)
    }
  })

  it("siempre cumple la política de contraseñas de AMO", () => {
    for (let i = 0; i < 200; i++) {
      expect(evaluarContrasena(generarContrasenaTemporal()).valida).toBe(true)
    }
  })

  it("incluye las tres clases aun con la fuente más desfavorable", () => {
    const siempreCero: FuenteAleatoria = () => 0
    const contrasena = generarContrasenaTemporal(siempreCero)
    expect(contrasena).toMatch(/[A-Z]/)
    expect(contrasena).toMatch(/[a-z]/)
    expect(contrasena).toMatch(/[2-9]/)
  })

  it("no se repite entre llamadas", () => {
    const vistas = new Set(
      Array.from({ length: 100 }, () => generarContrasenaTemporal())
    )
    expect(vistas.size).toBe(100)
  })
})

describe("aleatorioSeguro", () => {
  it("devuelve enteros dentro del rango", () => {
    for (let i = 0; i < 500; i++) {
      const valor = aleatorioSeguro(7)
      expect(Number.isInteger(valor) && valor >= 0 && valor < 7).toBe(true)
    }
  })
})
