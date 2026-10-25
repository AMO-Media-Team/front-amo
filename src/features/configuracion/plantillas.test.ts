import { describe, expect, it } from "vitest"

import {
  agruparPlantillas,
  contarPorCanal,
  DOMINIOS_PLANTILLA,
  dominioPlantilla,
  ejemploDe,
  filtrarPlantillas,
  revisarVariables,
  variablesUsadas,
} from "./plantillas"
import type { CanalNotificacion, Plantilla } from "./tipos"

function plantilla(
  clave: string,
  nombre: string,
  canal: CanalNotificacion = "APP"
): Plantilla {
  return {
    clave,
    canal,
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

describe("filtro por canal", () => {
  const PLANTILLAS = [
    plantilla("oferta.publicada", "Oferta publicada"),
    plantilla("oferta.publicada", "Oferta publicada", "EMAIL"),
    plantilla("titular.solicitud_radicada", "Solicitud radicada", "EMAIL"),
    plantilla("usuario.invitado", "Invitación", "EMAIL"),
    plantilla("seguridad.nuevo_acceso", "Nuevo acceso", "PUSH"),
  ]

  it("cuenta las de aplicación y las de correo (los demás canales no se administran)", () => {
    expect(contarPorCanal(PLANTILLAS)).toEqual({ APP: 1, EMAIL: 3 })
  })

  it("muestra solo las del canal elegido, por nombre sin tildes o por clave", () => {
    expect(
      filtrarPlantillas(PLANTILLAS, { canal: "EMAIL", busqueda: "" }).map(
        (p) => p.clave
      )
    ).toEqual([
      "oferta.publicada",
      "titular.solicitud_radicada",
      "usuario.invitado",
    ])
    expect(
      filtrarPlantillas(PLANTILLAS, { canal: "EMAIL", busqueda: "INVITACION" })
    ).toHaveLength(1)
    expect(
      filtrarPlantillas(PLANTILLAS, { canal: "EMAIL", busqueda: " titular. " })
    ).toHaveLength(1)
    expect(
      filtrarPlantillas(PLANTILLAS, { canal: "APP", busqueda: "invitación" })
    ).toEqual([])
  })

  it("conoce los dominios de las plantillas de la base, con título en español", () => {
    for (const dominio of [
      "medio",
      "documento",
      "anunciante",
      "campana",
      "factura",
      "cola",
      "titular",
    ]) {
      expect(DOMINIOS_PLANTILLA[dominio]).toMatch(/^[A-ZÁÉÍÓÚ]/)
    }
    expect(
      agruparPlantillas([
        plantilla("titular.solicitud_radicada", "Solicitud radicada"),
        plantilla("cola.solicitud_titular", "Solicitud de un titular"),
      ]).map((grupo) => grupo.titulo)
    ).toEqual(["Datos personales", "Colas del equipo AMO"])
  })
})
