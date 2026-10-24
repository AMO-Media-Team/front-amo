import { describe, expect, it } from "vitest"

import { esquemaArchivoFactura } from "./schemas"

const ID = "0199f3a0-0000-7000-8000-00000000f001"

describe("esquemaArchivoFactura", () => {
  it("acepta los tres archivos por el id de su fila", () => {
    for (const tipo of ["factura", "pago", "nota_credito"] as const) {
      expect(
        esquemaArchivoFactura.safeParse({ tipo, id: ID, descargar: true })
          .success
      ).toBe(true)
    }
  })

  it("rechaza otro archivo, una ruta en lugar de id o un id inválido", () => {
    expect(
      esquemaArchivoFactura.safeParse({ tipo: "liquidacion", id: ID }).success
    ).toBe(false)
    const ruta = esquemaArchivoFactura.safeParse({
      tipo: "factura",
      id: `factura/${ID}/x.pdf`,
    })
    expect(ruta.success).toBe(false)
    expect(ruta.error?.issues[0]?.message).toBe("El archivo no es válido.")
  })
})
