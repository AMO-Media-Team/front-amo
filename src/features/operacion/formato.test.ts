import { describe, expect, it } from "vitest"

import {
  cerrarFrase,
  contar,
  contarCumplidas,
  diasDeVigencia,
  faseVigencia,
  formatearCalificacion,
  formatearDiaMes,
  formatearFechaCompacta,
  formatearFechaHoraFija,
  formatearHandle,
  formatearMultiplicador,
  formatearNit,
  formatearRangoCompacto,
  formatearVigencia,
  instanteDeDia,
  normalizarBusqueda,
  patronContiene,
  textoParaFiltro,
  unirUbicacion,
} from "./formato"

describe("NIT", () => {
  it("agrupa miles y agrega el dígito de verificación", () => {
    expect(formatearNit("900123456", "7")).toBe("900.123.456-7")
    expect(formatearNit("900123456", null)).toBe("900.123.456")
    expect(formatearNit(null, "7")).toBeNull()
  })

  it("deja tal cual una identificación que no es solo dígitos", () => {
    expect(formatearNit("EIN-12-3456789", null)).toBe("EIN-12-3456789")
  })
})

describe("búsqueda", () => {
  it("normaliza como la BD: minúsculas, sin tildes ni puntuación", () => {
    expect(normalizarBusqueda("  Noticias  del Sur, S.A.S. ")).toBe(
      "noticias del sur sas"
    )
    expect(normalizarBusqueda("Ñapa & Café")).toBe("napa y cafe")
    expect(normalizarBusqueda("¿%_*?")).toBe("")
  })

  it("arma el patrón ilike sin comodines del usuario", () => {
    expect(patronContiene("noticias del sur")).toBe("%noticias%del%sur%")
    expect(patronContiene("")).toBeNull()
  })

  it("limpia el texto que va dentro de un or() de PostgREST", () => {
    expect(textoParaFiltro("Café, (promo) 50%_x.y:z")).toBe(
      "Café promo 50 x y z"
    )
  })
})

describe("presentación", () => {
  it("formatea multiplicadores, handles y calificaciones", () => {
    expect(formatearMultiplicador(1.15)).toBe("1,15 ×")
    expect(formatearMultiplicador(null)).toBe("—")
    expect(formatearHandle("noticias.pasto")).toBe("@noticias.pasto")
    expect(formatearHandle("@ya")).toBe("@ya")
    expect(formatearCalificacion(4.25)).toBe("4,3")
    expect(formatearCalificacion(null)).toBe("—")
  })

  it("no duplica el punto final tras una abreviatura", () => {
    expect(cerrarFrase("Publicada el 12 de sept de 2026, 9:09 a. m.")).toBe(
      "Publicada el 12 de sept de 2026, 9:09 a. m."
    )
    expect(cerrarFrase("Sin motivo registrado")).toBe("Sin motivo registrado.")
  })

  it("muestra día y mes cortos en hora de Bogotá", () => {
    // 02:00 UTC del 1-oct = 21:00 del 30-sep en Bogotá.
    expect(formatearDiaMes("2026-10-01T02:00:00Z")).toBe("30 sept")
    expect(formatearDiaMes("no es fecha")).toBe("—")
  })

  it("compacta fechas sin «de» para columnas angostas", () => {
    expect(formatearFechaCompacta("2026-10-01T02:00:00Z")).toBe("30 sept 2026")
    expect(formatearFechaCompacta(null)).toBe("—")
    expect(formatearFechaCompacta("no es fecha")).toBe("—")
  })

  it("no repite el mes ni el año que comparten los extremos de un rango", () => {
    const dia = (texto: string) => `${texto}T12:00:00-05:00`
    expect(formatearRangoCompacto(dia("2026-10-07"), dia("2026-10-21"))).toBe(
      "7 – 21 oct 2026"
    )
    expect(formatearRangoCompacto(dia("2026-09-14"), dia("2026-11-14"))).toBe(
      "14 sept – 14 nov 2026"
    )
    expect(formatearRangoCompacto(dia("2026-12-23"), dia("2027-01-08"))).toBe(
      "23 dic 2026 – 8 ene 2027"
    )
    expect(formatearRangoCompacto(dia("2026-10-07"), dia("2026-10-07"))).toBe(
      "7 oct 2026"
    )
    expect(formatearRangoCompacto("x", dia("2026-10-07"))).toBe("—")
  })

  it("mantiene la hora unida a «p. m.» con espacios fijos", () => {
    const texto = formatearFechaHoraFija("2026-09-15T17:02:00Z")
    expect(texto).toMatch(/12:02\u00a0p\.\u00a0m\.$/)
    expect(formatearFechaHoraFija(null)).toBe("—")
  })

  it("une municipio y departamento con lo que haya", () => {
    expect(unirUbicacion("Pasto", "Nariño")).toBe("Pasto, Nariño")
    expect(unirUbicacion("Arauca", "Arauca")).toBe("Arauca, Arauca")
    expect(unirUbicacion("Miami", null)).toBe("Miami")
    expect(unirUbicacion(" ", "Meta")).toBe("Meta")
    expect(unirUbicacion(null, null)).toBeNull()
  })
})

describe("vigencias (columnas date)", () => {
  it("lleva un día de calendario al mediodía de Bogotá", () => {
    expect(instanteDeDia("2026-09-01")).toBe("2026-09-01T12:00:00-05:00")
  })

  it("etiqueta la vigencia como el selector de periodo", () => {
    expect(formatearVigencia("2026-09-01", "2026-11-30")).toMatch(
      /^1 .*sept.* – 30 .*nov.* 2026$/
    )
    expect(formatearVigencia("x", "2026-11-30")).toBe("x – 2026-11-30")
  })

  it("cuenta los días con ambos extremos", () => {
    expect(diasDeVigencia("2026-09-01", "2026-09-30")).toBe(30)
    expect(diasDeVigencia("2026-09-01", "2026-09-01")).toBe(1)
    expect(diasDeVigencia("2026-09-30", "2026-09-01")).toBe(0)
  })

  it("ubica hoy antes, dentro o después de la vigencia", () => {
    expect(faseVigencia("2026-10-05", "2026-10-31", "2026-10-02")).toBe(
      "por_iniciar"
    )
    expect(faseVigencia("2026-10-01", "2026-10-31", "2026-10-31")).toBe(
      "en_curso"
    )
    expect(faseVigencia("2026-09-01", "2026-09-30", "2026-10-02")).toBe(
      "terminada"
    )
  })
})

describe("contar", () => {
  it("concuerda el sustantivo con la cifra", () => {
    expect(contar(1, "día", "días")).toBe("1 día")
    expect(contar(0, "día", "días")).toBe("0 días")
    expect(contar(2500, "asignación", "asignaciones")).toBe(
      "2.500 asignaciones"
    )
  })
})

describe("contarCumplidas", () => {
  it("no escribe «0 asignaciones» ni «1 asignaciones»", () => {
    expect(contarCumplidas(0)).toBe("Sin asignaciones cumplidas")
    expect(contarCumplidas(1)).toBe("1 asignación cumplida")
    expect(contarCumplidas(1234)).toBe("1.234 asignaciones cumplidas")
  })
})
