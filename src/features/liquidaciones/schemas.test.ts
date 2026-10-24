import { describe, expect, it } from "vitest"

import {
  esquemaAnular,
  esquemaAprobar,
  esquemaArchivoLiquidacion,
  esquemaFormularioFactura,
  esquemaGenerarCorte,
  esquemaGenerarLiquidacion,
  esquemaPrepararFactura,
  MAXIMO_APROBACION,
  MENSAJES_PERIODO,
} from "./schemas"

const HOY = "2026-10-23"
const ID = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const ID_2 = "0192f3a4-5b6c-7d8e-9f01-0000000000a2"

function errores(resultado: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return (resultado.error?.issues ?? []).map((issue) => ({
    campo: issue.path.join("."),
    mensaje: issue.message,
  }))
}

describe("esquemaGenerarCorte (periodo cerrado)", () => {
  const esquema = esquemaGenerarCorte(HOY)

  it("acepta un periodo cerrado, también el que termina hoy", () => {
    expect(
      esquema.safeParse({ inicio: "2026-10-01", fin: "2026-10-15" }).success
    ).toBe(true)
    expect(esquema.safeParse({ inicio: "2026-10-16", fin: HOY }).success).toBe(
      true
    )
  })

  it("rechaza un periodo abierto con el error en el último día", () => {
    expect(
      errores(esquema.safeParse({ inicio: "2026-10-16", fin: "2026-10-31" }))
    ).toEqual([{ campo: "fin", mensaje: MENSAJES_PERIODO.abierto }])
  })

  it("el último día no va antes del primero", () => {
    expect(
      errores(esquema.safeParse({ inicio: "2026-10-15", fin: "2026-10-01" }))
    ).toEqual([{ campo: "fin", mensaje: MENSAJES_PERIODO.orden }])
  })

  it("fechas vacías o imposibles, cada una en su campo", () => {
    expect(
      errores(esquema.safeParse({ inicio: "", fin: "2026-02-30" }))
    ).toEqual([
      { campo: "inicio", mensaje: MENSAJES_PERIODO.inicio },
      { campo: "fin", mensaje: MENSAJES_PERIODO.fin },
    ])
  })
})

describe("esquemaGenerarLiquidacion", () => {
  it("exige el medio y el mismo periodo cerrado", () => {
    const esquema = esquemaGenerarLiquidacion(HOY)
    expect(
      esquema.safeParse({
        medioId: ID,
        inicio: "2026-10-01",
        fin: "2026-10-15",
      }).success
    ).toBe(true)
    expect(
      errores(
        esquema.safeParse({
          medioId: "x",
          inicio: "2026-10-01",
          fin: "2026-11-15",
        })
      ).map((e) => e.campo)
    ).toEqual(["medioId", "fin"])
  })
})

describe("esquemaAprobar", () => {
  it("al menos una, sin repetir y con tope", () => {
    expect(
      esquemaAprobar.safeParse({ liquidacionIds: [ID, ID_2] }).success
    ).toBe(true)
    expect(errores(esquemaAprobar.safeParse({ liquidacionIds: [] }))).toEqual([
      { campo: "liquidacionIds", mensaje: "Elige al menos una liquidación." },
    ])
    expect(
      errores(esquemaAprobar.safeParse({ liquidacionIds: [ID, ID] }))[0]
        ?.mensaje
    ).toBe("Hay liquidaciones repetidas en la selección.")
    const muchas = Array.from(
      { length: MAXIMO_APROBACION + 1 },
      (_, indice) =>
        `0192f3a4-5b6c-7d8e-9f01-${String(indice).padStart(12, "0")}`
    )
    expect(esquemaAprobar.safeParse({ liquidacionIds: muchas }).success).toBe(
      false
    )
  })
})

describe("esquemaAnular", () => {
  it("exige un motivo de al menos 5 caracteres (sin espacios sobrantes)", () => {
    expect(
      esquemaAnular.safeParse({
        liquidacionId: ID,
        motivo: "  Error en el corte  ",
      }).data?.motivo
    ).toBe("Error en el corte")
    expect(
      errores(esquemaAnular.safeParse({ liquidacionId: ID, motivo: " ab " }))
    ).toEqual([
      {
        campo: "motivo",
        mensaje: "Describe el motivo (al menos 5 caracteres).",
      },
    ])
  })
})

describe("factura del medio", () => {
  it("el número va en mayúsculas y con los caracteres que admite la BD", () => {
    expect(
      esquemaFormularioFactura.safeParse({
        liquidacionId: ID,
        numero: " fe-1234 ",
      }).data?.numero
    ).toBe("FE-1234")
    expect(
      esquemaFormularioFactura.safeParse({
        liquidacionId: ID,
        numero: "SETP 990001",
      }).success
    ).toBe(true)
    expect(
      errores(
        esquemaFormularioFactura.safeParse({
          liquidacionId: ID,
          numero: "FE#12",
        })
      )[0]?.campo
    ).toBe("numero")
    expect(
      errores(
        esquemaFormularioFactura.safeParse({ liquidacionId: ID, numero: "  " })
      )[0]?.mensaje
    ).toBe("Escribe el número de la factura.")
  })

  it("solo un PDF de hasta 10 MB", () => {
    const archivo = {
      nombre: "factura.pdf",
      tipo: "application/pdf",
      tamano: 1024,
      sha256: null,
      dimensiones: null,
      duracionSeg: null,
      conMiniatura: false,
    }
    expect(
      esquemaPrepararFactura.safeParse({ liquidacionId: ID, archivo }).success
    ).toBe(true)
    expect(
      esquemaPrepararFactura.safeParse({
        liquidacionId: ID,
        archivo: { ...archivo, tipo: "image/png" },
      }).success
    ).toBe(false)
    expect(
      esquemaPrepararFactura.safeParse({
        liquidacionId: ID,
        archivo: { ...archivo, tamano: 11 * 1024 * 1024 },
      }).success
    ).toBe(false)
  })
})

describe("esquemaArchivoLiquidacion", () => {
  it("solo el soporte del pago o la factura del medio", () => {
    expect(
      esquemaArchivoLiquidacion.safeParse({
        liquidacionId: ID,
        archivo: "soporte_pago",
      }).success
    ).toBe(true)
    expect(
      esquemaArchivoLiquidacion.safeParse({
        liquidacionId: ID,
        archivo: "documento",
      }).success
    ).toBe(false)
  })
})
