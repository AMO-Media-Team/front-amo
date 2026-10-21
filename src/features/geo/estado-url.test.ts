import { describe, expect, it } from "vitest"

import { rangoDesdePreset, serializarFecha } from "@/lib/fechas"

import {
  cargarEstadoMapa,
  DIAS_MAXIMOS_RANGO,
  parseAsCodigoDepartamento,
  parseAsDia,
  presetCoincidente,
  rangoDelMapa,
  rangoParaUrl,
} from "./estado-url"

/** 20 sept 2026, 10:00 en Bogotá (evita que "este mes" coincida con "últimos 30 días"). */
const AHORA = new Date("2026-09-20T15:00:00Z")

describe("parsers de la URL del explorador", () => {
  it("parseAsDia acepta días de calendario válidos y rechaza el resto", () => {
    expect(parseAsDia.parse("2026-09-01")).toBe("2026-09-01")
    expect(parseAsDia.parse("2026-02-30")).toBeNull()
    expect(parseAsDia.parse("01/09/2026")).toBeNull()
    expect(parseAsDia.serialize("2026-09-01")).toBe("2026-09-01")
  })

  it("parseAsCodigoDepartamento solo acepta códigos DANE existentes", () => {
    expect(parseAsCodigoDepartamento.parse("05")).toBe("05")
    expect(parseAsCodigoDepartamento.parse("5")).toBeNull()
    expect(parseAsCodigoDepartamento.parse("00")).toBeNull()
    expect(parseAsCodigoDepartamento.parse("05001")).toBeNull()
  })

  it("el cargador del servidor aplica valores por defecto y descarta basura", async () => {
    const estado = await cargarEstadoMapa(
      Promise.resolve({
        nivel: "departamental",
        depto: "05",
        metrica: "gmv",
        desde: "2026-09-01",
        hasta: "2026-09-15",
        por100k: "true",
      })
    )
    expect(estado).toMatchObject({
      nivel: "departamental",
      depto: "05",
      metrica: "gmv",
      desde: "2026-09-01",
      hasta: "2026-09-15",
      por100k: true,
      calor: false,
    })

    const invalido = await cargarEstadoMapa(
      Promise.resolve({ nivel: "galaxia", metrica: "likes", depto: "xx" })
    )
    expect(invalido).toMatchObject({
      nivel: "nacional",
      depto: null,
      metrica: null,
    })
  })
})

describe("periodo del mapa", () => {
  it("sin fechas en la URL usa los últimos 30 días", () => {
    const rango = rangoDelMapa(null, null, AHORA)
    expect(rango.preset).toBe("ultimos30")
    expect(serializarFecha(rango.hasta)).toBe("2026-09-20")
  })

  it("un rango de la URL se respeta y se rotula con su preset si coincide", () => {
    const personalizado = rangoDelMapa("2026-08-03", "2026-08-20", AHORA)
    expect(personalizado.preset).toBe("personalizado")
    expect(serializarFecha(personalizado.desde)).toBe("2026-08-03")

    const mes = rangoDelMapa("2026-09-01", "2026-09-20", AHORA)
    expect(mes.preset).toBe("esteMes")
  })

  it("un rango invertido se ordena y uno excesivo vuelve al valor por defecto", () => {
    const invertido = rangoDelMapa("2026-09-18", "2026-09-10", AHORA)
    expect(serializarFecha(invertido.desde)).toBe("2026-09-10")

    const enorme = rangoDelMapa("2020-01-01", "2026-09-20", AHORA)
    expect(enorme.preset).toBe("ultimos30")
    expect(DIAS_MAXIMOS_RANGO).toBeGreaterThan(365)
  })

  it("el rango por defecto se omite de la URL (URL limpia)", () => {
    expect(rangoParaUrl(rangoDesdePreset("ultimos30", AHORA), AHORA)).toEqual({
      desde: null,
      hasta: null,
    })
    expect(rangoParaUrl(rangoDesdePreset("esteMes", AHORA), AHORA)).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-20",
    })
    expect(presetCoincidente(rangoDesdePreset("ultimos7", AHORA), AHORA)).toBe(
      "ultimos7"
    )
  })
})
