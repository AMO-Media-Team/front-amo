import { describe, expect, it } from "vitest"

import { aplicarAConteo, aplicarALista, leidaEnBandeja } from "./lecturas"
import type { Notificacion } from "./tipos"

const base: Notificacion = {
  id: 1,
  tipo: "oferta.publicada",
  titulo: "Oferta",
  mensaje: "Mensaje",
  url: null,
  prioridad: "normal",
  leida: false,
  creadaAt: "2026-09-30T15:00:00Z",
}
const lista: Notificacion[] = [
  base,
  { ...base, id: 2, leida: true },
  { ...base, id: 3 },
]

describe("aplicarALista", () => {
  it("marca solo las afectadas y conserva la identidad de las demás", () => {
    const resultado = aplicarALista(lista, { ids: [1], leida: true })
    expect(resultado.map((n) => n.leida)).toEqual([true, true, false])
    expect(resultado[1]).toBe(lista[1])
    expect(resultado[2]).toBe(lista[2])
  })

  it("«todas» deja toda la lista leída", () => {
    expect(aplicarALista(lista, { todas: true }).every((n) => n.leida)).toBe(
      true
    )
  })
})

describe("aplicarAConteo", () => {
  const conteo = { disponible: true, total: 5 }

  it("resta o suma según el cambio", () => {
    expect(aplicarAConteo(conteo, { ids: [7, 8], leida: true }).total).toBe(3)
    expect(aplicarAConteo(conteo, { ids: [7], leida: false }).total).toBe(6)
    expect(aplicarAConteo(conteo, { todas: true }).total).toBe(0)
  })

  it("ignora las que ya estaban en ese estado si la lista las conoce", () => {
    // 2 ya estaba leída: solo 1 cambia.
    expect(
      aplicarAConteo(conteo, { ids: [1, 2], leida: true }, lista).total
    ).toBe(4)
  })

  it("nunca baja de cero", () => {
    expect(
      aplicarAConteo(
        { disponible: true, total: 1 },
        { ids: [4, 5], leida: true }
      ).total
    ).toBe(0)
  })
})

describe("leidaEnBandeja", () => {
  const sinMarcas = new Map<number, boolean>()
  const instante = Date.parse(base.creadaAt)

  it("sin marcas ni «todas», manda el servidor", () => {
    expect(leidaEnBandeja(base, sinMarcas, null)).toBe(false)
    expect(leidaEnBandeja({ ...base, leida: true }, sinMarcas, null)).toBe(true)
  })

  it("«Marcar todas» alcanza solo a las creadas hasta ese instante", () => {
    expect(leidaEnBandeja(base, sinMarcas, instante)).toBe(true)
    expect(leidaEnBandeja(base, sinMarcas, instante - 1)).toBe(false)
  })

  it("la marca de esta visita se impone a todo lo demás", () => {
    const marcas = new Map([[base.id, false]])
    expect(leidaEnBandeja({ ...base, leida: true }, marcas, instante)).toBe(
      false
    )
  })
})
