import { describe, expect, it } from "vitest"

import {
  esFilaTransicion,
  type FilaTransicion,
  generarModuloTransiciones,
  ordenarTransiciones,
} from "./transiciones-ts"

function fila(cambios: Partial<FilaTransicion> = {}): FilaTransicion {
  return {
    entidad: "perfiles",
    desde: "ACTIVO",
    hacia: "SUSPENDIDO",
    actor: "ADMIN",
    permiso: "usuarios.suspender",
    requiere_motivo: true,
    descripcion: "Suspender la cuenta",
    ...cambios,
  }
}

describe("ordenarTransiciones", () => {
  it("ordena por entidad, origen, destino y actor sin depender de la intercalación", () => {
    const filas = [
      fila({ entidad: "perfiles", desde: "INVITADO", actor: "SISTEMA" }),
      fila({ entidad: "medios" }),
      fila({ entidad: "perfiles", desde: "INVITADO", actor: "ADMIN" }),
      fila({ entidad: "perfiles", desde: "ACTIVO", hacia: "DESACTIVADO" }),
    ]
    expect(
      ordenarTransiciones(filas).map((f) =>
        [f.entidad, f.desde, f.hacia, f.actor].join(" ")
      )
    ).toEqual([
      "medios ACTIVO SUSPENDIDO ADMIN",
      "perfiles ACTIVO DESACTIVADO ADMIN",
      "perfiles INVITADO SUSPENDIDO ADMIN",
      "perfiles INVITADO SUSPENDIDO SISTEMA",
    ])
  })

  it("no modifica el arreglo recibido", () => {
    const filas = [fila({ entidad: "z" }), fila({ entidad: "a" })]
    ordenarTransiciones(filas)
    expect(filas[0].entidad).toBe("z")
  })
})

describe("generarModuloTransiciones", () => {
  it("escribe la cabecera de generado, el import de tipos y claves en camelCase", () => {
    const fuente = generarModuloTransiciones([
      fila(),
      fila({
        entidad: "campanas",
        desde: "NUEVO",
        hacia: "BORRADOR",
        actor: "SISTEMA",
        permiso: null,
        requiere_motivo: false,
        descripcion: 'Crear "borrador"',
      }),
    ])
    expect(fuente).toContain("GENERADO por `pnpm db:transiciones <entorno>`")
    expect(fuente).toContain("2 transiciones")
    expect(fuente).toContain('import type { TransicionEstado } from "./tipos"')
    expect(fuente).toContain(
      "export const TRANSICIONES: readonly TransicionEstado[] = ["
    )
    expect(fuente).toContain('"requiereMotivo":true')
    expect(fuente).not.toContain("requiere_motivo")
    expect(fuente).toContain('"descripcion":"Crear \\"borrador\\""')
    expect(fuente.indexOf('"campanas"')).toBeLessThan(
      fuente.indexOf('"perfiles"')
    )
  })

  it("no sobrescribe el módulo con una tabla vacía", () => {
    expect(() => generarModuloTransiciones([])).toThrow(/vacía/)
  })

  it("rechaza filas con otra forma", () => {
    expect(() =>
      generarModuloTransiciones([fila(), { ...fila(), requiere_motivo: "no" }])
    ).toThrow(/fila 2/)
  })
})

describe("esFilaTransicion", () => {
  it("valida tipos y textos no vacíos", () => {
    expect(esFilaTransicion(fila())).toBe(true)
    expect(esFilaTransicion(fila({ permiso: null }))).toBe(true)
    expect(esFilaTransicion(fila({ descripcion: "" }))).toBe(false)
    expect(esFilaTransicion(null)).toBe(false)
    expect(esFilaTransicion({ entidad: "perfiles" })).toBe(false)
  })
})
