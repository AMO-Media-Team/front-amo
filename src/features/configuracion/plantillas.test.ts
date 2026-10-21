import { describe, expect, it } from "vitest"

import {
  agruparPlantillas,
  dominioPlantilla,
  ejemploDe,
  revisarVariables,
  variablesUsadas,
} from "./plantillas"
import type { Plantilla } from "./tipos"

function plantilla(clave: string, nombre: string): Plantilla {
  return {
    clave,
    canal: "APP",
    nombre,
    asunto: null,
    cuerpo: "",
    variables: [],
    activa: true,
    actualizadoAt: "2026-01-01T00:00:00Z",
  }
}

describe("variablesUsadas", () => {
  it("encuentra variables sin repetir, en orden y sin importar espacios o mayúsculas", () => {
    expect(
      variablesUsadas(
        "Hola {{nombre}}",
        "{{ oferta }} vence el {{FECHA_LIMITE}}. {{nombre}}"
      )
    ).toEqual(["nombre", "oferta", "fecha_limite"])
  })

  it("ignora textos vacíos y llaves que no son variables", () => {
    expect(variablesUsadas(null, undefined, "{{}} {{1x}} {nombre}")).toEqual([])
  })
})

describe("revisarVariables", () => {
  it("avisa de las que el sistema no reemplazaría y de las que no se usan", () => {
    expect(
      revisarVariables(
        ["nombre", "oferta"],
        "Para {{nombre}}",
        "Mira {{ofertta}}"
      )
    ).toEqual({ desconocidas: ["ofertta"], sinUsar: ["oferta"] })
  })

  it("un texto correcto no deja avisos", () => {
    expect(revisarVariables(["nombre"], null, "Hola {{nombre}}")).toEqual({
      desconocidas: [],
      sinUsar: [],
    })
  })
})

describe("ejemploDe", () => {
  it("da un valor verosímil o, si no lo conoce, el nombre legible", () => {
    expect(ejemploDe("anunciante")).toBe("Alimentos del Valle")
    expect(ejemploDe("codigo_reserva")).toBe("codigo reserva")
  })
})

describe("agruparPlantillas", () => {
  it("agrupa por dominio en el orden del catálogo y ordena por nombre", () => {
    const grupos = agruparPlantillas([
      plantilla("zeta.aviso", "Zeta"),
      plantilla("oferta.publicada", "Oferta publicada"),
      plantilla("usuario.invitado", "Invitación"),
      plantilla("oferta.devuelta", "Oferta devuelta"),
    ])
    expect(grupos.map((g) => g.titulo)).toEqual([
      "Cuentas de usuario",
      "Ofertas",
      "Zeta",
    ])
    expect(grupos[1].plantillas.map((p) => p.nombre)).toEqual([
      "Oferta devuelta",
      "Oferta publicada",
    ])
  })

  it("el dominio es el primer tramo de la clave", () => {
    expect(dominioPlantilla("asignacion.recordatorio_metricas")).toBe(
      "asignacion"
    )
    expect(dominioPlantilla("suelta")).toBe("suelta")
  })
})
