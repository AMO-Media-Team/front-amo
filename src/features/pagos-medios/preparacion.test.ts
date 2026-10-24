import { describe, expect, it } from "vitest"

import {
  esIncluible,
  estadosPreparacion,
  estaLista,
  filtrarPorPagar,
  ESTADOS_PREPARACION,
  MAXIMO_POR_ARCHIVO,
  nombreTarjetaPreparacion,
  ordenarPorPagar,
  paginar,
  pedidoDeSeleccion,
  ROTULOS_PREPARACION,
  resumirPorPagar,
  sumarNeto,
} from "./preparacion"
import type { LiquidacionPorPagar } from "./tipos"

function fila(
  id: string,
  cambios: Partial<LiquidacionPorPagar> = {}
): LiquidacionPorPagar {
  return {
    id,
    medioId: `medio-${id}`,
    medio: `Medio ${id}`,
    periodoInicio: "2026-10-01",
    periodoFin: "2026-10-15",
    cantidadAsignaciones: 2,
    montoNeto: 100_000,
    creadaAt: "2026-10-16T15:00:00Z",
    aprobadaAt: "2026-10-17T15:00:00Z",
    requiereDocumentoSoporte: true,
    documentoListo: true,
    datosPagoListos: true,
    metodoPago: "BANCARIO",
    dispersionId: null,
    dispersadaAt: null,
    ...cambios,
  }
}

const LISTA = fila("a")
const SIN_DOCUMENTO = fila("b", { documentoListo: false })
const SIN_DATOS = fila("c", { datosPagoListos: false, metodoPago: null })
const SIN_NADA = fila("d", { documentoListo: false, datosPagoListos: false })
const EN_ARCHIVO = fila("e", {
  dispersionId: "disp-1",
  dispersadaAt: "2026-10-18T17:00:00Z",
})

describe("situación de cada liquidación", () => {
  it("lista solo con documento y datos de pago, y sin archivo", () => {
    expect(estaLista(LISTA)).toBe(true)
    expect(estaLista(SIN_DOCUMENTO)).toBe(false)
    expect(estaLista(SIN_DATOS)).toBe(false)
    expect(estaLista(EN_ARCHIVO)).toBe(false)
    expect(esIncluible(EN_ARCHIVO)).toBe(true)
  })

  it("puede faltarle el documento y los datos de pago a la vez", () => {
    expect(estadosPreparacion(LISTA)).toEqual(["lista"])
    expect(estadosPreparacion(SIN_NADA)).toEqual([
      "sin_documento",
      "sin_datos_pago",
    ])
    expect(estadosPreparacion(EN_ARCHIVO)).toEqual(["en_archivo"])
  })
})

describe("pedidoDeSeleccion", () => {
  it("deja por fuera lo que no se puede pagar, con el primer requisito que falta", () => {
    const pedido = pedidoDeSeleccion([
      LISTA,
      SIN_DOCUMENTO,
      SIN_DATOS,
      SIN_NADA,
    ])
    expect(pedido.ids).toEqual(["a"])
    expect(pedido.total).toBe(100_000)
    expect(pedido.medios).toBe(1)
    expect(pedido.excluidas).toEqual([
      { id: "b", medio: "Medio b", motivo: "sin_documento" },
      { id: "c", medio: "Medio c", motivo: "sin_datos_pago" },
      { id: "d", medio: "Medio d", motivo: "sin_documento" },
    ])
    expect(pedido.recortado).toBe(false)
  })

  it("marca las que ya están en otro archivo para pedir confirmación", () => {
    const pedido = pedidoDeSeleccion([LISTA, EN_ARCHIVO])
    expect(pedido.ids).toEqual(["a", "e"])
    expect(pedido.yaEnArchivo).toEqual([
      { id: "e", medio: "Medio e", dispersadaAt: "2026-10-18T17:00:00Z" },
    ])
  })

  it("cuenta medios distintos (un medio puede tener dos periodos)", () => {
    const pedido = pedidoDeSeleccion([
      LISTA,
      fila("a2", { medioId: "medio-a", periodoInicio: "2026-09-16" }),
    ])
    expect(pedido.medios).toBe(1)
    expect(pedido.total).toBe(200_000)
  })

  it("recorta a lo que admite un archivo", () => {
    const muchas = Array.from({ length: MAXIMO_POR_ARCHIVO + 3 }, (_, i) =>
      fila(`x${i}`)
    )
    const pedido = pedidoDeSeleccion(muchas)
    expect(pedido.ids).toHaveLength(MAXIMO_POR_ARCHIVO)
    expect(pedido.recortado).toBe(true)
  })
})

describe("resumirPorPagar", () => {
  it("cuenta cada situación y arma el pedido de todas las listas", () => {
    const resumen = resumirPorPagar([
      LISTA,
      fila("a2", { montoNeto: 50_000.5 }),
      SIN_DOCUMENTO,
      SIN_DATOS,
      SIN_NADA,
      EN_ARCHIVO,
    ])
    expect(resumen).toMatchObject({
      total: 6,
      listas: 2,
      montoListas: 150_000.5,
      sinDocumento: 2,
      sinDatosPago: 2,
      enArchivo: 1,
    })
    expect(resumen.archivoListas.ids).toEqual(["a", "a2"])
    expect(resumen.archivoListas.excluidas).toEqual([])
    expect(resumen.archivoListas.yaEnArchivo).toEqual([])
  })
})

describe("sumarNeto", () => {
  it("suma en centavos sin errores de coma flotante", () => {
    expect(sumarNeto([{ montoNeto: 0.1 }, { montoNeto: 0.2 }])).toBe(0.3)
    expect(sumarNeto([])).toBe(0)
  })
})

describe("filtrarPorPagar", () => {
  const filas = [
    fila("1", { medio: "Radio Pasto Estéreo" }),
    fila("2", { medio: "La Voz de Ñuñoa", metodoPago: "BILLETERA" }),
    SIN_DATOS,
    EN_ARCHIVO,
  ]
  const sinFiltros = { q: "", preparacion: [], metodo: [] } as const

  it("busca por medio sin tildes ni mayúsculas, con las palabras en orden", () => {
    expect(
      filtrarPorPagar(filas, { ...sinFiltros, q: "radio estereo" }).map(
        (f) => f.id
      )
    ).toEqual(["1"])
    expect(
      filtrarPorPagar(filas, { ...sinFiltros, q: "ÑUÑOA" }).map((f) => f.id)
    ).toEqual(["2"])
    expect(
      filtrarPorPagar(filas, { ...sinFiltros, q: "estereo radio" })
    ).toEqual([])
  })

  it("una fila pasa si tiene alguna de las situaciones elegidas", () => {
    expect(
      filtrarPorPagar(filas, {
        ...sinFiltros,
        preparacion: ["sin_datos_pago", "en_archivo"],
      }).map((f) => f.id)
    ).toEqual(["c", "e"])
  })

  it("filtra por método; sin método registrado no pasa el filtro", () => {
    expect(
      filtrarPorPagar(filas, { ...sinFiltros, metodo: ["BILLETERA"] }).map(
        (f) => f.id
      )
    ).toEqual(["2"])
    expect(
      filtrarPorPagar(filas, {
        ...sinFiltros,
        metodo: ["BANCARIO", "BILLETERA"],
      }).map((f) => f.id)
    ).toEqual(["1", "2", "e"])
  })
})

describe("ordenarPorPagar", () => {
  const filas = [
    fila("b", {
      medio: "Beta",
      montoNeto: 300,
      aprobadaAt: "2026-10-03T00:00:00Z",
    }),
    fila("a", {
      medio: "Álamo",
      montoNeto: 100,
      aprobadaAt: "2026-10-02T00:00:00Z",
    }),
    fila("c", {
      medio: "Cauca",
      montoNeto: 300,
      aprobadaAt: "2026-10-01T00:00:00Z",
    }),
  ]

  it("ordena por aprobación, neto, medio (sin tildes) y periodo", () => {
    expect(
      ordenarPorPagar(filas, { campo: "aprobada", descendente: false }).map(
        (f) => f.id
      )
    ).toEqual(["c", "a", "b"])
    expect(
      ordenarPorPagar(filas, { campo: "medio", descendente: false }).map(
        (f) => f.id
      )
    ).toEqual(["a", "b", "c"])
    // Empate en el neto: la aprobada antes va primero.
    expect(
      ordenarPorPagar(filas, { campo: "neto", descendente: true }).map(
        (f) => f.id
      )
    ).toEqual(["c", "b", "a"])
  })

  it("no cambia la lista original", () => {
    const copia = [...filas]
    ordenarPorPagar(filas, { campo: "periodo", descendente: true })
    expect(filas).toEqual(copia)
  })
})

describe("paginar", () => {
  const numeros = Array.from({ length: 25 }, (_, i) => i + 1)

  it("devuelve la página pedida", () => {
    expect(paginar(numeros, 2, 10)).toEqual({
      filas: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      pagina: 2,
    })
  })

  it("si la página ya no existe, devuelve la última", () => {
    expect(paginar(numeros, 9, 10)).toEqual({
      filas: [21, 22, 23, 24, 25],
      pagina: 3,
    })
    expect(paginar([], 3, 10)).toEqual({ filas: [], pagina: 1 })
  })
})

describe("nombreTarjetaPreparacion", () => {
  it("empieza por el rótulo visible y la cifra, y sigue con la etiqueta completa", () => {
    expect(nombreTarjetaPreparacion("sin_documento", 2)).toBe(
      "Sin documento: 2. Falta documento soporte o factura"
    )
    expect(nombreTarjetaPreparacion("sin_datos_pago", 1_234)).toBe(
      "Datos incompletos: 1.234. Datos de pago incompletos"
    )
  })

  it("cada tarjeta contiene su texto visible (WCAG 2.5.3)", () => {
    for (const estado of ESTADOS_PREPARACION) {
      expect(
        nombreTarjetaPreparacion(estado, 3).startsWith(
          `${ROTULOS_PREPARACION[estado]}: 3`
        )
      ).toBe(true)
    }
  })
})
