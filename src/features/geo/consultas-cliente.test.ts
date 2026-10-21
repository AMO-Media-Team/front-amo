import { describe, expect, it } from "vitest"

import {
  clavesGeo,
  errorDeRespuesta,
  esSesionVencida,
  parametrosConsulta,
} from "./consultas-cliente"
import type { ConsultaMapaGeo, ErrorApiGeo } from "./tipos"

const CONSULTA: ConsultaMapaGeo = {
  nivel: "departamental",
  metrica: "gmv",
  desde: "2026-09-01",
  hasta: "2026-09-30",
  departamento: "05",
}

describe("parámetros de la API del explorador", () => {
  it("el mapa envía nivel, métrica, periodo y departamento (sin `vista`)", () => {
    expect(parametrosConsulta(CONSULTA).toString()).toBe(
      "nivel=departamental&metrica=gmv&desde=2026-09-01&hasta=2026-09-30&depto=05"
    )
  })

  it("fuera del nivel departamental no viaja el departamento", () => {
    const parametros = parametrosConsulta({
      ...CONSULTA,
      nivel: "nacional",
      departamento: null,
    })
    expect(parametros.has("depto")).toBe(false)
  })

  it("puntos y detalle se piden con su vista; el detalle, con su zona", () => {
    expect(parametrosConsulta(CONSULTA, { vista: "puntos" }).get("vista")).toBe(
      "puntos"
    )
    const detalle = parametrosConsulta(CONSULTA, {
      vista: "detalle",
      zona: "05001",
    })
    expect(detalle.get("vista")).toBe("detalle")
    expect(detalle.get("zona")).toBe("05001")
  })

  it("cada vista tiene su propia clave de caché", () => {
    const claves = [
      clavesGeo.mapa(CONSULTA),
      clavesGeo.puntos(CONSULTA),
      clavesGeo.detalle(CONSULTA, "05001"),
      clavesGeo.detalle(CONSULTA, "05002"),
    ].map((clave) => clave.join("|"))
    expect(new Set(claves).size).toBe(claves.length)
  })
})

describe("errores de la API del explorador", () => {
  it("usa el motivo, el mensaje y la pista que envía la ruta", () => {
    const cuerpo: ErrorApiGeo = {
      error: {
        motivo: "no-disponible",
        mensaje: "La base de datos aún no expone la analítica geográfica.",
        pista: "AMO_GEO_MOCK=1",
      },
    }
    const error = errorDeRespuesta(503, cuerpo)
    expect(error).toMatchObject({
      estado: 503,
      motivo: "no-disponible",
      message: cuerpo.error.mensaje,
      pista: "AMO_GEO_MOCK=1",
    })
    expect(esSesionVencida(error)).toBe(false)
  })

  it("el 401 del proxy (cuerpo ajeno a la ruta) es una sesión vencida", () => {
    const error = errorDeRespuesta(401, { error: "No autenticado" })
    expect(error.motivo).toBe("sin-sesion")
    expect(error.message).toMatch(/Vuelve a ingresar/)
    expect(esSesionVencida(error)).toBe(true)
  })

  it("el 401 de la ruta conserva su mensaje y también pide reingresar", () => {
    const error = errorDeRespuesta(401, {
      error: { motivo: "sin-sesion", mensaje: "Tu sesión terminó." },
    })
    expect(error.message).toBe("Tu sesión terminó.")
    expect(esSesionVencida(error)).toBe(true)
  })

  it("un cuerpo ilegible es un fallo genérico, sin texto técnico", () => {
    for (const cuerpo of [null, "<html>502</html>", { error: 42 }]) {
      const error = errorDeRespuesta(502, cuerpo)
      expect(error.motivo).toBe("fallo")
      expect(error.message).toBe(
        "No pudimos cargar el mapa. Intenta de nuevo en unos segundos."
      )
    }
  })

  it("un error que no viene de la API no es una sesión vencida", () => {
    expect(esSesionVencida(new Error("red"))).toBe(false)
    expect(esSesionVencida(null)).toBe(false)
  })
})
