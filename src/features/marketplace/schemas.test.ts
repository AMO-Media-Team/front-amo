import { describe, expect, it } from "vitest"

import {
  esquemaAceptarOferta,
  esquemaOfertaMedio,
  esquemaRechazarOferta,
  LONGITUD_MAXIMA_MOTIVO_RECHAZO,
} from "./schemas"

const OFERTA = "01a16693-72fe-713c-a45a-70d759c08120"
const CUENTA = "01a16693-9006-7dcb-9c94-afaf8092c0d9"
const CLAVE = "7d1f9a52-3c4b-4e8f-9a21-6b0c5d8e7f10"

describe("esquemas del marketplace", () => {
  it("la oferta es un uuid", () => {
    expect(esquemaOfertaMedio.safeParse({ ofertaId: OFERTA }).success).toBe(
      true
    )
    expect(esquemaOfertaMedio.safeParse({ ofertaId: "123" }).success).toBe(
      false
    )
  })

  it("aceptar exige la cuenta y la clave de idempotencia", () => {
    expect(
      esquemaAceptarOferta.safeParse({
        ofertaId: OFERTA,
        cuentaSocialId: CUENTA,
        claveIdempotencia: CLAVE,
      }).success
    ).toBe(true)
    const sinCuenta = esquemaAceptarOferta.safeParse({
      ofertaId: OFERTA,
      cuentaSocialId: "",
      claveIdempotencia: CLAVE,
    })
    expect(sinCuenta.success).toBe(false)
    expect(sinCuenta.error?.issues[0]?.message).toBe(
      "Elige con qué cuenta vas a publicar."
    )
  })

  it("el motivo de «No me interesa» es opcional y se recorta", () => {
    expect(esquemaRechazarOferta.parse({ ofertaId: OFERTA })).toEqual({
      ofertaId: OFERTA,
      motivo: null,
    })
    expect(
      esquemaRechazarOferta.parse({ ofertaId: OFERTA, motivo: "   " })
    ).toEqual({ ofertaId: OFERTA, motivo: null })
    expect(
      esquemaRechazarOferta.parse({ ofertaId: OFERTA, motivo: " Caro " }).motivo
    ).toBe("Caro")
    expect(
      esquemaRechazarOferta.safeParse({
        ofertaId: OFERTA,
        motivo: "x".repeat(LONGITUD_MAXIMA_MOTIVO_RECHAZO + 1),
      }).success
    ).toBe(false)
  })
})
