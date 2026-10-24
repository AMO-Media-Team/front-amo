import { describe, expect, it } from "vitest"

import { estadosDeGrupos, estadoTablaDisputas, rutaBandeja } from "./bandeja"

describe("bandeja de disputas", () => {
  it("traduce los grupos de la URL a estados de la BD (vacío: todos)", () => {
    expect(estadosDeGrupos([])).toEqual([])
    expect(estadosDeGrupos(["cerradas", "abiertas"])).toEqual([
      "ABIERTA",
      "RESUELTA",
      "DESCARTADA",
    ])
    expect(estadosDeGrupos(["en_revision"])).toEqual(["EN_REVISION"])
  })

  it("por defecto ordena por estado: abiertas primero", async () => {
    const estado = await estadoTablaDisputas.cargar(Promise.resolve({}))
    expect(estado.orden).toEqual({ campo: "estado", descendente: false })
    expect(estado.estado).toEqual([])
  })

  it("lee los filtros de la URL e ignora valores desconocidos", async () => {
    const estado = await estadoTablaDisputas.cargar(
      Promise.resolve({
        estado: "abiertas,inventado",
        motivo: "METRICAS,OTRO",
        parte: "MEDIO",
        orden: "abierta.desc",
      })
    )
    expect(estado.estado).toEqual(["abiertas"])
    expect(estado.motivo).toEqual(["METRICAS", "OTRO"])
    expect(estado.parte).toEqual(["MEDIO"])
    expect(estado.orden).toEqual({ campo: "abierta", descendente: true })
  })

  it("construye enlaces a la bandeja filtrada", () => {
    expect(rutaBandeja()).toBe("/operacion/disputas")
    expect(rutaBandeja(["abiertas", "en_revision"])).toBe(
      "/operacion/disputas?estado=abiertas,en_revision"
    )
  })
})
