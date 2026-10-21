import { describe, expect, it } from "vitest"

import {
  CARPETAS_STORAGE,
  enLotes,
  esUuid,
  MUESTRAS_DEMO,
  sqlPurga,
} from "./purga"

describe("sqlPurga", () => {
  const lineas = sqlPurga().trim().split("\n")

  it("es una sola transacción con los dos interruptores antes de purgar", () => {
    expect(lineas[0]).toBe("begin;")
    expect(lineas.at(-1)).toBe("commit;")
    const purga = lineas.indexOf("select private.purgar_demo();")
    expect(lineas.indexOf("set local amo.modo_carga = 'on';")).toBeLessThan(
      purga
    )
    expect(lineas.indexOf("set local amo.purga = 'on';")).toBeLessThan(purga)
    expect(lineas.indexOf("set local amo.modo_carga = 'on';")).toBeGreaterThan(
      0
    )
  })

  it("solo usa `set local`: los interruptores no sobreviven a la transacción", () => {
    const ajustes = lineas.filter((linea) => linea.startsWith("set "))
    expect(ajustes.length).toBeGreaterThan(0)
    expect(ajustes.every((linea) => linea.startsWith("set local "))).toBe(true)
  })
})

describe("CARPETAS_STORAGE", () => {
  it("cubre los cinco buckets privados", () => {
    expect(Object.keys(CARPETAS_STORAGE).sort()).toEqual([
      "avatares",
      "creativos",
      "documentos",
      "evidencias",
      "soportes",
    ])
  })

  it("los soportes de pago del anunciante cuelgan del id de la factura", () => {
    expect(CARPETAS_STORAGE.soportes.pago).toBe("factura")
    expect(CARPETAS_STORAGE.soportes.factura).toBe("factura")
  })

  it("las muestras compartidas no se tratan como carpeta con dueño", () => {
    expect(CARPETAS_STORAGE[MUESTRAS_DEMO.bucket]).not.toHaveProperty(
      MUESTRAS_DEMO.carpeta
    )
  })
})

describe("esUuid", () => {
  it("acepta un uuid y rechaza cualquier otro nombre de carpeta", () => {
    expect(esUuid("01a10e25-2747-7f83-a554-575643ab26dc")).toBe(true)
    expect(esUuid("01A10E25-2747-7F83-A554-575643AB26DC")).toBe(true)
    expect(esUuid("muestras")).toBe(false)
    expect(esUuid("01a10e25-2747-7f83-a554-575643ab26dc/..")).toBe(false)
    expect(esUuid("")).toBe(false)
  })
})

describe("enLotes", () => {
  it("parte la lista sin perder ni repetir elementos", () => {
    expect(enLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(enLotes([], 3)).toEqual([])
  })

  it("rechaza un tamaño que no sea un entero positivo", () => {
    expect(() => enLotes([1], 0)).toThrow("inválido")
    expect(() => enLotes([1], 1.5)).toThrow("inválido")
  })
})
