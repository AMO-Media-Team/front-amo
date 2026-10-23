import { describe, expect, it } from "vitest"

import {
  CAMPOS_PASO,
  esPasoOferta,
  PASOS_OFERTA,
  pasoDeCampo,
  pasoDeHint,
  pasosConError,
  primerRechazo,
  rutasConError,
  textoFaltaCompletar,
  TITULOS_PASO,
} from "./pasos"

describe("pasos del asistente de oferta", () => {
  it("son seis, en el orden del brief, y cada uno tiene título", () => {
    expect(PASOS_OFERTA).toEqual([
      "que",
      "quien",
      "cuando",
      "cuanto",
      "creativo",
      "envio",
    ])
    for (const paso of PASOS_OFERTA) expect(TITULOS_PASO[paso]).toBeTruthy()
  })

  it("cada paso valida su grupo de valores; el creativo no tiene campos", () => {
    expect(CAMPOS_PASO.cuanto).toEqual(["cuanto"])
    expect(CAMPOS_PASO.creativo).toEqual([])
  })

  it("reconoce los ids válidos", () => {
    expect(esPasoOferta("cuando")).toBe(true)
    expect(esPasoOferta("revision")).toBe(false)
    expect(esPasoOferta(null)).toBe(false)
  })
})

describe("pasoDeHint", () => {
  it("traduce la pista de la BD al paso del asistente", () => {
    expect(pasoDeHint("envio_oferta:creativo")).toBe("creativo")
    expect(pasoDeHint(" envio_oferta:cuanto ")).toBe("cuanto")
    expect(pasoDeHint("envio_oferta:envio")).toBe("envio")
  })

  it("ignora otras pistas o pasos desconocidos", () => {
    expect(pasoDeHint("campanas")).toBeNull()
    expect(pasoDeHint("envio_oferta:pago")).toBeNull()
    expect(pasoDeHint(null)).toBeNull()
    expect(pasoDeHint(undefined)).toBeNull()
  })
})

describe("pasoDeCampo y errores por paso", () => {
  it("ubica cada campo en su paso por la raíz de la ruta", () => {
    expect(pasoDeCampo("que.titulo")).toBe("que")
    expect(pasoDeCampo("cuanto.formatos.1.presupuestoMaximo")).toBe("cuanto")
    expect(pasoDeCampo("cuando.fechaLimite")).toBe("cuando")
    // Lo que no es de un paso (errores generales) va al envío.
    expect(pasoDeCampo("root.servidor")).toBe("envio")
    expect(pasoDeCampo("")).toBe("envio")
  })

  it("lista los pasos con error en el orden del asistente", () => {
    expect(
      pasosConError([
        "cuanto.formatos.0.presupuestoMaximo",
        "que.titulo",
        "cuanto.topePorcentaje",
      ])
    ).toEqual(["que", "cuanto"])
  })

  it("recorre el objeto anidado de errores de react-hook-form", () => {
    const errores = {
      que: { titulo: { message: "Escribe un título", type: "too_small" } },
      cuanto: {
        formatos: [
          undefined,
          { presupuestoMaximo: { message: "Supera", type: "custom" } },
        ],
      },
      root: { servidor: { message: "Algo pasó", type: "server" } },
    }
    expect(rutasConError(errores)).toEqual([
      "que.titulo",
      "cuanto.formatos.1.presupuestoMaximo",
    ])
  })
})

describe("mensajes y rechazos", () => {
  it("dice qué falta completar con el nombre del paso", () => {
    expect(textoFaltaCompletar("creativo")).toBe(
      "Falta completar: Paquete creativo"
    )
  })

  it("elige el rechazo del paso más temprano", () => {
    expect(
      primerRechazo([
        { ofertaId: "b", paso: "creativo" as const, mensaje: "x" },
        { ofertaId: "a", paso: "cuando" as const, mensaje: "y" },
      ])
    ).toEqual({ ofertaId: "a", paso: "cuando", mensaje: "y" })
    expect(primerRechazo([])).toBeNull()
  })
})
