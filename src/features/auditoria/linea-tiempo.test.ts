import { describe, expect, it } from "vitest"

import {
  agruparPorDia,
  compactarSimilares,
  type EventoCompactable,
  formatearHora,
  MINIMO_RAFAGA,
  tituloDia,
  VENTANA_RAFAGA_MS,
} from "./linea-tiempo"

// 15:00 del miércoles 30-sep en Bogotá.
const AHORA = new Date("2026-09-30T20:00:00Z")
const espacios = (texto: string) => texto.replace(/\s/g, " ")

describe("tituloDia", () => {
  it("hoy, ayer y el resto con día de la semana (y año si no es el actual)", () => {
    expect(tituloDia("2026-09-30", AHORA)).toBe("Hoy")
    expect(tituloDia("2026-09-29", AHORA)).toBe("Ayer")
    expect(tituloDia("2026-09-28", AHORA)).toBe("Lunes, 28 de septiembre")
    expect(tituloDia("2025-09-28", AHORA)).toBe(
      "Domingo, 28 de septiembre de 2025"
    )
    expect(tituloDia("no-es-fecha", AHORA)).toBe("no-es-fecha")
  })
})

describe("agruparPorDia", () => {
  it("agrupa por día de Bogotá (la medianoche local es las 05:00 UTC)", () => {
    const grupos = agruparPorDia(
      [
        { at: "2026-09-30T05:00:00Z" }, // 00:00 del 30 en Bogotá
        { at: "2026-09-30T04:59:59Z" }, // 23:59 del 29
        { at: "2026-09-29T12:00:00Z" },
      ],
      AHORA
    )
    expect(grupos.map((g) => [g.clave, g.titulo, g.eventos.length])).toEqual([
      ["2026-09-30", "Hoy", 1],
      ["2026-09-29", "Ayer", 2],
    ])
  })
})

describe("formatearHora", () => {
  it("hora de Bogotá con a. m./p. m.; inválida, raya", () => {
    expect(espacios(formatearHora("2026-09-30T20:05:00Z"))).toBe("3:05 p. m.")
    expect(formatearHora("nada")).toBe("—")
  })
})

describe("compactarSimilares", () => {
  const evento = (
    id: number,
    segundos: number,
    parcial: Partial<EventoCompactable> = {}
  ): EventoCompactable => ({
    id,
    at: new Date(
      Date.parse("2026-09-30T22:30:00Z") - segundos * 1000
    ).toISOString(),
    titulo: "Otorgó un permiso a un rol",
    entidad: "rol_permisos",
    actor: { id: "a" },
    ...parcial,
  })

  it("pliega una ráfaga de eventos iguales y seguidos", () => {
    const elementos = compactarSimilares([
      evento(5, 0),
      evento(4, 1),
      evento(3, 2),
      evento(2, 3),
    ])
    expect(elementos).toHaveLength(1)
    expect(elementos[0]).toMatchObject({ tipo: "grupo", clave: "rafaga-5" })
  })

  it("menos del mínimo quedan sueltos", () => {
    const pocos = Array.from({ length: MINIMO_RAFAGA - 1 }, (_, i) =>
      evento(10 - i, i)
    )
    expect(compactarSimilares(pocos).every((e) => e.tipo === "evento")).toBe(
      true
    )
  })

  it("cortan la ráfaga otro actor, otro título o una pausa larga", () => {
    const pausa = VENTANA_RAFAGA_MS / 1000 + 1
    const elementos = compactarSimilares([
      evento(9, 0),
      evento(8, 1),
      evento(7, 2),
      evento(6, 3, { actor: { id: "b" } }),
      evento(5, 4, { titulo: "Editó un rol" }),
      evento(4, 4 + pausa),
      evento(3, 5 + pausa),
      evento(2, 6 + pausa),
    ])
    expect(
      elementos.map((e) =>
        e.tipo === "grupo" ? `g${e.eventos.length}` : `e${e.evento.id}`
      )
    ).toEqual(["g3", "e6", "e5", "g3"])
  })
})
