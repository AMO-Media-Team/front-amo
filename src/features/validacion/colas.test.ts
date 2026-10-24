import { describe, expect, it } from "vitest"

import {
  accesoValidacion,
  cargarColaPedida,
  cargarParametrosValidacion,
  colaPorDefecto,
  colasVisibles,
  desplazamientoDe,
  descripcionValidacion,
  paginaAcotada,
  rutaCola,
  TAMANO_PAGINA_VALIDACION,
  tieneAccesoCola,
} from "./colas"
import { rutaColaValidacion } from "./rutas"

const OPERACIONES = [
  "asignaciones.ver",
  "evidencias.validar",
  "metricas.validar",
]
const ADMIN = [...OPERACIONES, "metricas.editar_validadas"]

describe("acceso a las colas", () => {
  it("evidencias exige validar evidencias; métricas y verificar, validar métricas", () => {
    const soloEvidencias = accesoValidacion(["evidencias.validar"])
    expect(colasVisibles(soloEvidencias)).toEqual(["evidencias"])
    expect(tieneAccesoCola("metricas", soloEvidencias)).toBe(false)

    const soloMetricas = accesoValidacion(["metricas.validar"])
    expect(colasVisibles(soloMetricas)).toEqual(["metricas", "verificar"])
    expect(tieneAccesoCola("evidencias", soloMetricas)).toBe(false)
  })

  it("la constancia manual es solo de quien corrige métricas validadas", () => {
    expect(accesoValidacion(OPERACIONES).administrar).toBe(false)
    expect(accesoValidacion(ADMIN).administrar).toBe(true)
  })

  it("sin `?cola=`: evidencias; quien solo valida métricas cae en la suya", () => {
    expect(colaPorDefecto(accesoValidacion(OPERACIONES))).toBe("evidencias")
    expect(colaPorDefecto(accesoValidacion(["metricas.validar"]))).toBe(
      "metricas"
    )
  })

  it("la descripción de la página habla de lo que la persona atiende", () => {
    expect(descripcionValidacion(accesoValidacion(OPERACIONES))).toMatch(
      /evidencia y las métricas/
    )
    expect(
      descripcionValidacion(accesoValidacion(["evidencias.validar"]))
    ).not.toMatch(/métricas/)
    expect(
      descripcionValidacion(accesoValidacion(["metricas.validar"]))
    ).toMatch(/^Revisa las métricas/)
  })
})

describe("la cola en la URL", () => {
  it("lee la cola, la página y el filtro de alertas", async () => {
    const parametros = new URLSearchParams(
      "cola=metricas&pagina=3&alertas=true"
    )
    expect(await cargarParametrosValidacion(parametros)).toEqual({
      pagina: 3,
      alertas: true,
    })
    expect(await cargarColaPedida(parametros)).toEqual({ cola: "metricas" })
    expect(await cargarColaPedida(new URLSearchParams("cola=otra"))).toEqual({
      cola: null,
    })
  })

  it("arma la ruta con la cola siempre y lo demás solo si no es lo de por defecto", () => {
    expect(rutaCola("evidencias")).toBe(rutaColaValidacion("evidencias"))
    expect(rutaCola("metricas", { soloAlertas: true, pagina: 2 })).toBe(
      "/operacion/validacion?cola=metricas&alertas=true&pagina=2"
    )
    // El filtro de alertas solo existe en la cola de métricas.
    expect(rutaCola("verificar", { soloAlertas: true })).toBe(
      "/operacion/validacion?cola=verificar"
    )
  })
})

describe("paginación", () => {
  it("acota la página al total", () => {
    expect(paginaAcotada(5, 0)).toBe(1)
    expect(paginaAcotada(5, TAMANO_PAGINA_VALIDACION * 2)).toBe(2)
    expect(paginaAcotada(0, 100)).toBe(1)
    expect(paginaAcotada(Number.NaN, 100)).toBe(1)
  })

  it("calcula el desplazamiento de la RPC", () => {
    expect(desplazamientoDe(1)).toBe(0)
    expect(desplazamientoDe(3)).toBe(TAMANO_PAGINA_VALIDACION * 2)
    expect(desplazamientoDe(-2)).toBe(0)
    expect(desplazamientoDe(Number.NaN)).toBe(0)
  })
})
