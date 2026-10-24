import { describe, expect, it } from "vitest"

import { estadoTablaFacturas } from "./estado-tabla"
import {
  RUTA_FACTURAS_ANUNCIANTE,
  rutaFacturaAnunciante,
  rutaFacturasDeCampana,
  rutaFacturasEn,
} from "./rutas"

const ID = "0199f3a0-0000-7000-8000-00000000f001"

describe("rutas de las facturas del anunciante", () => {
  it("listado, ficha (contrato con /ir) y filtros", () => {
    expect(RUTA_FACTURAS_ANUNCIANTE).toBe("/facturas")
    expect(rutaFacturaAnunciante(ID)).toBe(`/facturas/${ID}`)
    expect(rutaFacturasDeCampana(ID)).toBe(`/facturas?campana=${ID}`)
    expect(rutaFacturasEn("VENCIDA")).toBe("/facturas?estado=VENCIDA")
  })

  it("la tabla lee los mismos parámetros que escriben las rutas", async () => {
    const estado = await estadoTablaFacturas.cargar(
      Promise.resolve({ campana: ID, estado: "VENCIDA,PAGADA" })
    )
    expect(estado.campana).toEqual([ID])
    expect(estado.estado).toEqual(["VENCIDA", "PAGADA"])
    expect(estado.orden).toEqual({ campo: "emision", descendente: true })
  })

  it("un borrador o un id inválido en la URL se ignoran", async () => {
    const estado = await estadoTablaFacturas.cargar(
      Promise.resolve({ campana: "x", estado: "BORRADOR" })
    )
    expect(estado.campana).toEqual([])
    expect(estado.estado).toEqual([])
  })
})
