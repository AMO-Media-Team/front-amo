import { describe, expect, it } from "vitest"

import {
  humanizarClave,
  ordenarEquipo,
  resumenEquipo,
  rolDeMiembro,
} from "./equipo"
import type { MiembroEquipo } from "./tipos"

const PROPIO = { clave: "ANUNCIANTE", nombre: "Anunciante", color: "#3FB8AF" }

function miembro(cambios: Partial<MiembroEquipo> = {}): MiembroEquipo {
  return {
    id: "u1",
    nombre: "Ana",
    email: "ana@andina.co",
    rolClave: "ANUNCIANTE",
    estado: "ACTIVO",
    ultimoAccesoAt: null,
    ...cambios,
  }
}

describe("equipo", () => {
  it("nombra el rol propio con su color y otro por su clave", () => {
    expect(rolDeMiembro("ANUNCIANTE", PROPIO)).toEqual({
      nombre: "Anunciante",
      color: "#3FB8AF",
    })
    expect(rolDeMiembro("ANUNCIANTE_COMPRAS", PROPIO)).toEqual({
      nombre: "Anunciante compras",
      color: "#8C66EE",
    })
    expect(rolDeMiembro(null, PROPIO)).toBeNull()
    expect(humanizarClave("MERCADEO-DIGITAL")).toBe("Mercadeo digital")
  })

  it("pone primero a la persona de la sesión y respeta el orden de la BD", () => {
    const lista = [
      miembro({ id: "a", nombre: "Ana" }),
      miembro({ id: "b", nombre: "Beto" }),
      miembro({ id: "c", nombre: "Carla" }),
    ]
    expect(ordenarEquipo(lista, "b").map((m) => m.id)).toEqual(["b", "a", "c"])
    expect(ordenarEquipo(lista, "zz").map((m) => m.id)).toEqual(["a", "b", "c"])
  })

  it("resume personas, invitaciones pendientes y suspendidas", () => {
    expect(resumenEquipo([miembro()])).toBe("1 persona")
    expect(
      resumenEquipo([
        miembro(),
        miembro({ estado: "INVITADO" }),
        miembro({ estado: "INVITADO" }),
        miembro({ estado: "SUSPENDIDO" }),
      ])
    ).toBe("4 personas · 2 invitaciones pendientes · 1 suspendida")
  })
})
