import { describe, expect, it } from "vitest"

import {
  conArchivo,
  conEditable,
  conOrden,
  moverId,
  ordenesSiguientes,
  sinArchivo,
} from "./actualizaciones"
import { archivoPrueba, datosPrueba, versionPrueba } from "./fixtures"

const A = archivoPrueba({ id: "a", orden: 0 })
const B = archivoPrueba({ id: "b", orden: 1 })
const C = archivoPrueba({ id: "c", orden: 2 })

describe("cambios locales del panel", () => {
  it("la editable sin publicar también es la vigente; la pendiente no", () => {
    const vigente = versionPrueba({ id: "v1" })
    const datos = conEditable(datosPrueba(), vigente)
    expect(datos.editable).toBe(vigente)
    expect(datos.vigente).toBe(vigente)

    const pendiente = versionPrueba({
      id: "v2",
      vigente: false,
      pendiente: true,
    })
    const publicada = conEditable(datos, pendiente)
    expect(publicada.editable).toBe(pendiente)
    expect(publicada.vigente).toBe(vigente)
  })

  it("agrega un archivo en su orden y sin duplicarlo", () => {
    const datos = datosPrueba({ editable: versionPrueba({ archivos: [A, C] }) })
    const con = conArchivo(datos, B)
    expect(con.editable?.archivos.map((archivo) => archivo.id)).toEqual([
      "a",
      "b",
      "c",
    ])
    expect(conArchivo(con, B).editable?.archivos).toHaveLength(3)
    expect(conArchivo(datosPrueba(), B).editable).toBeNull()
  })

  it("quita y reordena", () => {
    const datos = datosPrueba({
      editable: versionPrueba({ archivos: [A, B, C] }),
    })
    expect(
      sinArchivo(datos, "b").editable?.archivos.map((archivo) => archivo.id)
    ).toEqual(["a", "c"])
    expect(
      conOrden(datos, ["c", "a", "b"]).editable?.archivos.map((archivo) => [
        archivo.id,
        archivo.orden,
      ])
    ).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ])
  })
})

describe("moverId", () => {
  it("mueve dentro de los límites y deja igual lo imposible", () => {
    expect(moverId(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"])
    expect(moverId(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"])
    expect(moverId(["a", "b"], 0, -1)).toEqual(["a", "b"])
    expect(moverId(["a", "b"], 1, 2)).toEqual(["a", "b"])
  })
})

describe("ordenesSiguientes", () => {
  it("continúa tras los cargados y los que siguen en cola", () => {
    expect(ordenesSiguientes([A, B], 1, 3, 50)).toEqual([3, 4, 5])
    expect(ordenesSiguientes([], 0, 2, 50)).toEqual([0, 1])
    expect(ordenesSiguientes([archivoPrueba({ orden: 49 })], 0, 2, 50)).toEqual(
      [50, 50]
    )
  })
})
