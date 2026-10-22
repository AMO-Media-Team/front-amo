import { describe, expect, it } from "vitest"

import { BUCKETS } from "./buckets"
import { esquemaArchivoSubido, esquemaDescripcionArchivo } from "./esquemas"

const descripcion = {
  nombre: "captura.webp",
  tipo: "image/webp",
  tamano: 1234,
  sha256: "a".repeat(64),
  dimensiones: { ancho: 1080, alto: 1920 },
  duracionSeg: null,
  conMiniatura: true,
}

describe("esquemaDescripcionArchivo", () => {
  const esquema = esquemaDescripcionArchivo(BUCKETS.evidencias)

  it("acepta una descripción válida", () => {
    expect(esquema.parse(descripcion)).toEqual(descripcion)
  })

  it("rechaza formato, peso y huella inválidos", () => {
    expect(
      esquema.safeParse({ ...descripcion, tipo: "video/mp4" }).success
    ).toBe(false)
    expect(
      esquema.safeParse({
        ...descripcion,
        tamano: BUCKETS.evidencias.maxBytes + 1,
      }).success
    ).toBe(false)
    expect(esquema.safeParse({ ...descripcion, tamano: 0 }).success).toBe(false)
    expect(
      esquema.safeParse({ ...descripcion, sha256: "A".repeat(64) }).success
    ).toBe(false)
    expect(
      esquema.safeParse({ ...descripcion, dimensiones: { ancho: 0, alto: 1 } })
        .success
    ).toBe(false)
  })
})

describe("esquemaArchivoSubido", () => {
  const esquema = esquemaArchivoSubido(BUCKETS.evidencias)

  it("exige bucket conocido y ruta", () => {
    const subido = {
      ...descripcion,
      bucket: "evidencias",
      ruta: "asignacion/x/publicacion/y.webp",
      rutaMiniatura: null,
    }
    expect(esquema.safeParse(subido).success).toBe(true)
    expect(esquema.safeParse({ ...subido, bucket: "publico" }).success).toBe(
      false
    )
    expect(esquema.safeParse({ ...subido, ruta: "" }).success).toBe(false)
  })
})
