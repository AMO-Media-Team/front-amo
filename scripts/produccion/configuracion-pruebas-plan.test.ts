import { describe, expect, it } from "vitest"

import {
  contenidoTerminosPrueba,
  leerArgumentos,
  mismoValor,
  olvidarParametro,
  PARAMETROS_PRUEBA,
  planAplicar,
  planRevertir,
  planTerminos,
  registrarCambio,
  respaldoVacio,
  TIPOS_TERMINOS,
  VERSION_TERMINOS_PRUEBA,
} from "./configuracion-pruebas-plan"

const MARCA = "2026-10-21T06:07:15.228176+00:00"

function fila(clave: string, valor: unknown) {
  return { clave, valor: valor as never, updated_at: MARCA }
}

const ORIGINALES = [
  fila("ofertas.anticipacion_minima_horas", 24),
  fila("metricas.cortes_requeridos", ["H24", "H72", "D7"]),
  fila("archivos.max_creativo_mb", 50),
]

describe("mismoValor", () => {
  it("compara estructura sin importar el orden de las claves", () => {
    expect(mismoValor({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
    expect(mismoValor(["H24"], ["H24", "D7"])).toBe(false)
    expect(mismoValor(0, "0")).toBe(false)
  })
})

describe("planAplicar", () => {
  it("cambia los tres parámetros desde los valores de fábrica", () => {
    const plan = planAplicar(ORIGINALES)
    expect(plan.map((paso) => paso.tipo)).toEqual([
      "cambiar",
      "cambiar",
      "cambiar",
    ])
    expect(plan[1]).toMatchObject({
      clave: "metricas.cortes_requeridos",
      desde: ["H24", "H72", "D7"],
      hacia: ["H24"],
      marca: MARCA,
    })
  })

  it("es idempotente y avisa si falta una clave", () => {
    const yaAplicados = Object.entries(PARAMETROS_PRUEBA)
      .slice(0, 2)
      .map(([clave, valor]) => fila(clave, valor))
    expect(planAplicar(yaAplicados).map((paso) => paso.tipo)).toEqual([
      "igual",
      "igual",
      "falta",
    ])
  })
})

describe("respaldo y reversión", () => {
  it("conserva el valor original aunque se reaplique", () => {
    let respaldo = respaldoVacio("ref", new Date("2026-10-22T00:00:00Z"))
    respaldo = registrarCambio(respaldo, "archivos.max_creativo_mb", 50, 25)
    respaldo = registrarCambio(respaldo, "archivos.max_creativo_mb", 30, 25)
    expect(respaldo.parametros["archivos.max_creativo_mb"]).toEqual({
      anterior: 50,
      aplicado: 25,
    })
    expect(
      olvidarParametro(respaldo, "archivos.max_creativo_mb").parametros
    ).toEqual({})
  })

  it("restaura solo lo que sigue con el valor de prueba", () => {
    let respaldo = respaldoVacio("ref", new Date())
    respaldo = registrarCambio(
      respaldo,
      "ofertas.anticipacion_minima_horas",
      24,
      0
    )
    respaldo = registrarCambio(respaldo, "archivos.max_creativo_mb", 50, 25)
    respaldo = registrarCambio(
      respaldo,
      "metricas.cortes_requeridos",
      ["H24", "H72", "D7"],
      ["H24"]
    )
    const plan = planRevertir(respaldo, [
      fila("ofertas.anticipacion_minima_horas", 0),
      fila("archivos.max_creativo_mb", 40),
      fila("metricas.cortes_requeridos", ["H24", "H72", "D7"]),
    ])
    expect(plan).toEqual([
      {
        tipo: "cambiar",
        clave: "ofertas.anticipacion_minima_horas",
        desde: 0,
        hacia: 24,
        marca: MARCA,
      },
      {
        tipo: "ajeno",
        clave: "archivos.max_creativo_mb",
        actual: 40,
        esperado: 25,
      },
      {
        tipo: "igual",
        clave: "metricas.cortes_requeridos",
        valor: ["H24", "H72", "D7"],
      },
    ])
  })
})

describe("planTerminos", () => {
  it("crea y publica los cuatro tipos en una base sin textos", () => {
    expect(planTerminos([])).toEqual(
      TIPOS_TERMINOS.map((termino) => ({ tipo: "crear", termino }))
    )
  })

  it("respeta los textos del cliente y retoma un borrador de prueba", () => {
    const plan = planTerminos([
      { id: "1", tipo: "TERMINOS_MEDIO", version: "1.0", publicada: true },
      {
        id: "2",
        tipo: "POLITICA_DATOS",
        version: VERSION_TERMINOS_PRUEBA,
        publicada: false,
      },
      {
        id: "3",
        tipo: "TERMINOS_ANUNCIANTE",
        version: VERSION_TERMINOS_PRUEBA,
        publicada: true,
      },
      // Un borrador del cliente no impide la versión de prueba.
      {
        id: "4",
        tipo: "CONDICIONES_COMERCIALES",
        version: "1.0",
        publicada: false,
      },
    ])
    expect(plan).toEqual([
      { tipo: "hay-texto-real", termino: "TERMINOS_MEDIO", version: "1.0" },
      { tipo: "ya-publicada", termino: "TERMINOS_ANUNCIANTE" },
      { tipo: "publicar", termino: "POLITICA_DATOS", id: "2" },
      { tipo: "crear", termino: "CONDICIONES_COMERCIALES" },
    ])
  })

  it("rotula el texto como versión de prueba sin valor legal", () => {
    const texto = contenidoTerminosPrueba("POLITICA_DATOS")
    expect(texto).toMatch(
      /^# Política de tratamiento de datos personales — VERSIÓN DE PRUEBA/
    )
    expect(texto).toContain("No tiene valor legal")
    expect(VERSION_TERMINOS_PRUEBA).toMatch(/^[0-9A-Za-z._-]{1,20}$/)
  })
})

describe("leerArgumentos", () => {
  it("simula por defecto y exige un solo modo", () => {
    expect(leerArgumentos([])).toEqual({
      modo: "simular",
      confirmarProduccion: false,
    })
    expect(leerArgumentos(["--aplicar", "--confirmar-produccion"])).toEqual({
      modo: "aplicar",
      confirmarProduccion: true,
    })
    expect(() => leerArgumentos(["--aplicar", "--revertir"])).toThrow()
    expect(() => leerArgumentos(["--forzar"])).toThrow(/desconocido/)
  })
})
