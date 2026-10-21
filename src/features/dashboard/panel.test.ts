import { describe, expect, it } from "vitest"

import type { ClavePermiso } from "@/lib/auth/permisos"
import type { TipoRol } from "@/lib/auth/tipos"

import {
  fechaDeHoy,
  panelPara,
  primerNombre,
  saludar,
  saludoSegunHora,
} from "./panel"

const usuario = (tipo: TipoRol, permisos: ClavePermiso[]) => ({
  rol: { tipo },
  permisos,
})

const TODOS: ClavePermiso[] = [
  "inicio.admin",
  "inicio.anunciante",
  "inicio.medio",
]

describe("panelPara", () => {
  it("elige el panel por el tipo de rol", () => {
    expect(panelPara(usuario("ADMIN", ["inicio.admin"]))).toBe("admin")
    expect(panelPara(usuario("ANUNCIANTE", ["inicio.anunciante"]))).toBe(
      "anunciante"
    )
    expect(panelPara(usuario("MEDIO", ["inicio.medio"]))).toBe("medio")
  })

  it("un SUPERADMIN tiene los tres permisos pero es interno", () => {
    expect(panelPara(usuario("ADMIN", TODOS))).toBe("admin")
  })

  it("sin el permiso de su panel no le corresponde ninguno", () => {
    expect(panelPara(usuario("MEDIO", ["inicio.admin"]))).toBeNull()
    expect(panelPara(usuario("ADMIN", []))).toBeNull()
  })
})

describe("saludo (hora de Bogotá, UTC−5)", () => {
  it.each([
    ["2026-10-01T09:59:00Z", "Buenas noches"], // 04:59
    ["2026-10-01T10:00:00Z", "Buenos días"], // 05:00
    ["2026-10-01T16:59:00Z", "Buenos días"], // 11:59
    ["2026-10-01T17:00:00Z", "Buenas tardes"], // 12:00
    ["2026-10-01T23:59:00Z", "Buenas tardes"], // 18:59
    ["2026-10-02T00:00:00Z", "Buenas noches"], // 19:00
  ])("%s → %s", (instante, saludo) => {
    expect(saludoSegunHora(new Date(instante))).toBe(saludo)
  })

  it("saluda por el primer nombre o solo con el saludo", () => {
    const ahora = new Date("2026-10-01T13:00:00Z")
    expect(primerNombre("  Ana María Pérez ")).toBe("Ana")
    expect(saludar("Ana María Pérez", ahora)).toBe("Buenos días, Ana")
    expect(saludar("", ahora)).toBe("Buenos días")
    expect(saludar(null, ahora)).toBe("Buenos días")
  })

  it("la fecha de hoy es la de Bogotá, con mayúscula inicial", () => {
    // 02:00 UTC del 2 de octubre: en Bogotá aún es el 1.
    expect(fechaDeHoy(new Date("2026-10-02T02:00:00Z"))).toBe(
      "Jueves, 1 de octubre"
    )
  })
})
