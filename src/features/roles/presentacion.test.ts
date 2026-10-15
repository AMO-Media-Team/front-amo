import { describe, expect, it } from "vitest"

import { ROLES_SISTEMA } from "@/lib/auth/permisos"

import {
  COLOR_ROL_POR_DEFECTO,
  nombreColor,
  PALETA_ROLES,
  PATRON_COLOR,
} from "./paleta"
import { filtrarRoles, ordenarRoles, pluralizar } from "./presentacion"
import type { TipoRol } from "./tipos"

type RolMinimo = {
  clave: string
  nombre: string
  descripcion: string | null
  tipo: TipoRol
  esSistema: boolean
}

function rol(
  clave: string,
  nombre: string,
  cambios: Partial<RolMinimo> = {}
): RolMinimo {
  return {
    clave,
    nombre,
    descripcion: null,
    tipo: "ADMIN",
    esSistema: false,
    ...cambios,
  }
}

const ROLES: RolMinimo[] = [
  rol("ZETA", "Zeta"),
  rol("MEDIO", "Medio", { esSistema: true, tipo: "MEDIO" }),
  rol("ANALISTA", "analista de campañas", {
    descripcion: "Acompaña a los anunciantes",
  }),
  rol("SUPERADMIN", "Superadministrador", { esSistema: true }),
  rol("LECTOR_ANUNCIANTE", "Lector", { tipo: "ANUNCIANTE" }),
]

describe("ordenarRoles", () => {
  it("pone primero los de sistema en su orden canónico y luego los personalizados por nombre", () => {
    expect(ordenarRoles(ROLES).map((r) => r.clave)).toEqual([
      "SUPERADMIN",
      "MEDIO",
      "ANALISTA",
      "LECTOR_ANUNCIANTE",
      "ZETA",
    ])
  })
})

describe("filtrarRoles", () => {
  it("busca sin tildes en nombre, clave y descripción", () => {
    expect(
      filtrarRoles(ROLES, { q: "CAMPANAS", tipo: "TODOS" }).map((r) => r.clave)
    ).toEqual(["ANALISTA"])
    expect(
      filtrarRoles(ROLES, { q: "anunciantes", tipo: "TODOS" }).map(
        (r) => r.clave
      )
    ).toEqual(["ANALISTA"])
    expect(
      filtrarRoles(ROLES, { q: "lector_anun", tipo: "TODOS" }).map(
        (r) => r.clave
      )
    ).toEqual(["LECTOR_ANUNCIANTE"])
  })

  it("filtra por tipo y combina con la búsqueda", () => {
    expect(
      filtrarRoles(ROLES, { q: "", tipo: "MEDIO" }).map((r) => r.clave)
    ).toEqual(["MEDIO"])
    expect(filtrarRoles(ROLES, { q: "zeta", tipo: "ANUNCIANTE" })).toEqual([])
  })
})

describe("pluralizar", () => {
  it("elige singular o plural y formatea la cifra en es-CO", () => {
    expect(pluralizar(1, "rol", "roles")).toBe("1 rol")
    expect(pluralizar(0, "rol", "roles")).toBe("0 roles")
    expect(pluralizar(1200, "cuenta", "cuentas")).toBe("1.200 cuentas")
  })
})

describe("paleta de roles", () => {
  it("todos los colores cumplen el CHECK de la BD y no se repiten", () => {
    const valores = PALETA_ROLES.map((color) => color.valor.toUpperCase())
    expect(valores.every((valor) => PATRON_COLOR.test(valor))).toBe(true)
    expect(new Set(valores).size).toBe(valores.length)
    expect(valores).toContain(COLOR_ROL_POR_DEFECTO)
  })

  it("incluye el color de cada rol de sistema", () => {
    for (const { color } of Object.values(ROLES_SISTEMA)) {
      expect(nombreColor(color)).not.toBeNull()
    }
  })

  it("nombra un color sin importar mayúsculas y devuelve null fuera de la paleta", () => {
    expect(nombreColor("#8c66ee")).toBe("Lila")
    expect(nombreColor("#000000")).toBeNull()
  })
})
