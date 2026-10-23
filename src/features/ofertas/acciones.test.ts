import { describe, expect, it } from "vitest"

import { accionesAnunciante, bloqueoCancelacion } from "./acciones"

const PROPIAS = ["ofertas.gestionar_propias", "campanas.gestionar_propias"]
const SIN_CUPOS = { cuposOcupados: 0 }

function claves(...argumentos: Parameters<typeof accionesAnunciante>) {
  return accionesAnunciante(...argumentos).map((opcion) => opcion.accion)
}

describe("accionesAnunciante", () => {
  it("borrador: enviar, editar y cancelar sin motivo", () => {
    const opciones = accionesAnunciante("BORRADOR", PROPIAS, SIN_CUPOS)
    expect(opciones.map((opcion) => opcion.accion)).toEqual([
      "enviar",
      "editar",
      "cancelar",
    ])
    expect(opciones.find((o) => o.accion === "cancelar")).toEqual({
      accion: "cancelar",
      requiereMotivo: false,
      bloqueo: null,
    })
  })

  it("devuelta: se reenvía (no se «envía») y se edita", () => {
    expect(claves("DEVUELTA", PROPIAS, SIN_CUPOS)).toEqual([
      "reenviar",
      "editar",
      "cancelar",
    ])
  })

  it("en revisión: solo retirarla", () => {
    expect(claves("EN_REVISION", PROPIAS, SIN_CUPOS)).toEqual(["retirar"])
  })

  it("publicada: cancelar exige motivo", () => {
    expect(accionesAnunciante("PUBLICADA", PROPIAS, SIN_CUPOS)).toEqual([
      { accion: "cancelar", requiereMotivo: true, bloqueo: null },
    ])
  })

  it("publicada con cupos tomados: cancelar se explica como bloqueado", () => {
    const [cancelar] = accionesAnunciante("PUBLICADA", PROPIAS, {
      cuposOcupados: 2,
    })
    expect(cancelar.accion).toBe("cancelar")
    expect(cancelar.bloqueo).toBe(
      "La oferta ya generó obligaciones: 2 medios aceptaron cupos y no se puede cancelar. Si necesitas ayuda, escríbele al equipo AMO."
    )
  })

  it("en curso no se ofrece nada", () => {
    for (const estado of ["CUPOS_COMPLETOS", "EN_EJECUCION"] as const) {
      expect(claves(estado, PROPIAS, SIN_CUPOS)).toEqual([])
    }
  })

  it("cancelada o terminada: solo archivarla, sin motivo", () => {
    for (const estado of ["CANCELADA", "VENCIDA", "CERRADA"] as const) {
      expect(accionesAnunciante(estado, PROPIAS, SIN_CUPOS)).toEqual([
        { accion: "archivar", requiereMotivo: false, bloqueo: null },
      ])
    }
  })

  it("archivar nunca se bloquea por cupos tomados", () => {
    // Una vencida no los tiene (con alguno habría pasado a ejecución) y una
    // cerrada ya terminó su ventana aunque los tuviera.
    for (const estado of ["VENCIDA", "CERRADA"] as const) {
      expect(
        accionesAnunciante(estado, PROPIAS, { cuposOcupados: 3 })[0]
      ).toEqual({ accion: "archivar", requiereMotivo: false, bloqueo: null })
    }
  })

  it("sin el permiso no se ofrece nada", () => {
    for (const estado of ["BORRADOR", "CANCELADA"] as const) {
      expect(claves(estado, ["campanas.gestionar_propias"], SIN_CUPOS)).toEqual(
        []
      )
    }
  })
})

describe("bloqueoCancelacion", () => {
  it("sin cupos tomados no bloquea", () => {
    expect(bloqueoCancelacion("PUBLICADA", 0)).toBeNull()
  })

  it("habla en singular con un cupo", () => {
    expect(bloqueoCancelacion("PUBLICADA", 1)).toMatch(/1 medio aceptó un cupo/)
  })
})
