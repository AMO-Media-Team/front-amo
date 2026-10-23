import { describe, expect, it } from "vitest"

import {
  rutaOfertaAnunciante,
  rutaOfertaInterna,
  rutaOfertasDeCampana,
  rutaPasoAsistente,
} from "./rutas"

const CAMPANA = "0192f3a4-5b6c-7d8e-9f01-0000000000c1"
const OFERTA = "0192f3a4-5b6c-7d8e-9f01-0000000000f1"

describe("rutas de la oferta (contrato con /ir)", () => {
  it("la del anunciante vive dentro de su campaña", () => {
    expect(rutaOfertaAnunciante(CAMPANA, OFERTA)).toBe(
      `/campanas/${CAMPANA}/ofertas/${OFERTA}`
    )
    expect(rutaOfertasDeCampana(CAMPANA)).toBe(
      `/campanas/${CAMPANA}?pestana=ofertas`
    )
  })

  it("la interna está en la operación", () => {
    expect(rutaOfertaInterna(OFERTA)).toBe(`/operacion/ofertas/${OFERTA}`)
  })

  it("el asistente se abre en el paso que falta", () => {
    expect(rutaPasoAsistente(CAMPANA, OFERTA, "creativo")).toBe(
      `/campanas/${CAMPANA}/ofertas/${OFERTA}/editar?paso=creativo`
    )
  })
})
