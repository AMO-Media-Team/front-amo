import { describe, expect, it } from "vitest"

import {
  accesoColas,
  cargarParametrosVerificacion,
  COLAS,
  COLAS_VERIFICACION,
  paginaAcotada,
  paginaTrasFueraDeRango,
  rangoPagina,
  rutaCola,
  rutaRevisionMedio,
  TAMANO_PAGINA,
} from "./colas"

describe("parámetros de la URL", () => {
  it("toma la cola y la página, con medios y 1 por defecto", () => {
    expect(cargarParametrosVerificacion("?cola=documentos&pagina=3")).toEqual({
      cola: "documentos",
      pagina: 3,
    })
    expect(cargarParametrosVerificacion("")).toEqual({
      cola: "medios",
      pagina: 1,
    })
  })

  it("ignora una cola desconocida (contrato de /ir)", () => {
    expect(cargarParametrosVerificacion("?cola=otra").cola).toBe("medios")
    for (const cola of ["documentos", "cuentas", "solicitudes"]) {
      expect(cargarParametrosVerificacion(`?cola=${cola}`).cola).toBe(cola)
    }
  })

  it("cada cola tiene sus textos", () => {
    for (const cola of COLAS) {
      expect(COLAS_VERIFICACION[cola].titulo).not.toBe("")
      expect(COLAS_VERIFICACION[cola].vacia).not.toBe("")
    }
  })
})

describe("accesoColas", () => {
  it("documentos exige además datos sensibles (RLS de documentos_medio)", () => {
    expect(accesoColas(["medios.verificar"])).toEqual({
      verificarMedios: true,
      verDocumentos: false,
    })
    expect(accesoColas(["medios.verificar", "datos_sensibles.ver"])).toEqual({
      verificarMedios: true,
      verDocumentos: true,
    })
    expect(accesoColas(["datos_sensibles.ver"])).toEqual({
      verificarMedios: false,
      verDocumentos: false,
    })
  })
})

describe("paginación", () => {
  it("acota la página al total", () => {
    expect(paginaAcotada(5, 30, 20)).toBe(2)
    expect(paginaAcotada(0, 30, 20)).toBe(1)
    expect(paginaAcotada(-3, 0)).toBe(1)
    expect(paginaAcotada(Number.NaN, 100)).toBe(1)
    expect(paginaAcotada(2.7, 100, 20)).toBe(2)
  })

  it("tras una página fuera de rango cae a la última que existe", () => {
    expect(paginaTrasFueraDeRango(5, 30)).toBe(2)
    expect(paginaTrasFueraDeRango(3, 0)).toBe(1)
  })

  it("el reintento siempre baja de página aunque el total haya crecido", () => {
    // La consulta vio pocas filas y el conteo ya ve muchas: igual baja.
    expect(paginaTrasFueraDeRango(3, 500)).toBe(2)
    expect(paginaTrasFueraDeRango(2, 500)).toBe(1)
    expect(paginaTrasFueraDeRango(1, 500)).toBe(1)
  })

  it("calcula el rango inclusivo de PostgREST", () => {
    expect(rangoPagina(1)).toEqual([0, TAMANO_PAGINA - 1])
    expect(rangoPagina(3, 10)).toEqual([20, 29])
  })
})

describe("rutas", () => {
  it("omite los valores por defecto", () => {
    expect(rutaCola("medios")).toBe("/operacion/verificacion")
    expect(rutaCola("medios", 2)).toBe("/operacion/verificacion?pagina=2")
    expect(rutaCola("documentos")).toBe(
      "/operacion/verificacion?cola=documentos"
    )
    expect(rutaCola("cuentas", 3)).toBe(
      "/operacion/verificacion?cola=cuentas&pagina=3"
    )
  })

  it("la revisión de un medio abre la pestaña de verificación de su ficha", () => {
    expect(rutaRevisionMedio("abc")).toBe(
      "/operacion/medios/abc?pestana=verificacion"
    )
  })
})
