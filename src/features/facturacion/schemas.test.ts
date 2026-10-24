import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  esquemaAnularBorrador,
  esquemaConfirmarArchivo,
  esquemaFacturaExpedida,
  esquemaFirmarArchivo,
  esquemaFormularioExpedida,
  esquemaFormularioNota,
  esquemaFormularioPago,
  esquemaGenerarFactura,
  esquemaPrepararArchivo,
  esquemaRegistrarNotaCredito,
  esquemaRegistrarPago,
  hoyEnBogota,
} from "./schemas"

/** 23 de oct de 2026, 22:00 en Bogotá (ya es 24 en UTC). */
const AHORA = new Date("2026-10-24T03:00:00Z")
const FACTURA = "0192f3a4-5b6c-7d8e-9f01-00000000fa01"
const ANUNCIANTE = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const CUFE = "AB12".repeat(24)
const RUTA_FACTURA = `factura/${FACTURA}/0192f3a4-5b6c-7d8e-9f01-0000000000f1.pdf`

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
})

afterAll(() => {
  vi.useRealTimers()
})

function errores(resultado: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((issue) => [
      issue.path.join("."),
      issue.message,
    ])
  )
}

describe("hoy en Bogotá", () => {
  it("usa el día de Colombia aunque en UTC ya sea mañana", () => {
    expect(hoyEnBogota()).toBe("2026-10-23")
  })
})

describe("esquemaGenerarFactura", () => {
  const base = {
    anuncianteId: ANUNCIANTE,
    campanaId: null,
    desde: "2026-10-01",
    hasta: "2026-10-23",
  }

  it("acepta una consolidada con corte de hoy", () => {
    expect(esquemaGenerarFactura.safeParse(base).success).toBe(true)
  })

  it("rechaza un corte futuro, un periodo invertido y la falta de anunciante", () => {
    expect(
      errores(esquemaGenerarFactura.safeParse({ ...base, hasta: "2026-10-24" }))
    ).toHaveProperty("hasta")
    expect(
      errores(
        esquemaGenerarFactura.safeParse({
          ...base,
          desde: "2026-10-23",
          hasta: "2026-10-01",
        })
      ).desde
    ).toBe("«Desde» no puede ser posterior a «Hasta».")
    expect(
      errores(esquemaGenerarFactura.safeParse({ ...base, anuncianteId: "" }))
        .anuncianteId
    ).toBe("Elige el anunciante.")
  })
})

describe("factura expedida", () => {
  const base = {
    facturaId: FACTURA,
    prefijo: " fe ",
    consecutivo: "1.234",
    fechaEmision: "2026-10-23",
    fechaVencimiento: "",
    cufe: `${CUFE.slice(0, 50)}\n${CUFE.slice(50)}`,
    total: "4.760.000,50",
    archivoPath: RUTA_FACTURA,
  }

  it("normaliza prefijo, número, CUFE y total como los escribe la persona", () => {
    const lectura = esquemaFacturaExpedida.safeParse(base)
    expect(lectura.success).toBe(true)
    expect(lectura.data).toEqual({
      facturaId: FACTURA,
      prefijo: "FE",
      consecutivo: 1234,
      fechaEmision: "2026-10-23",
      fechaVencimiento: null,
      cufe: CUFE.toLowerCase(),
      total: 4_760_000.5,
      archivoPath: RUTA_FACTURA,
    })
  })

  it("explica cada error en su campo", () => {
    const lectura = errores(
      esquemaFacturaExpedida.safeParse({
        ...base,
        prefijo: "FE-1",
        consecutivo: "FE1234",
        fechaEmision: "2026-10-24",
        cufe: "123",
        total: "",
        archivoPath: "",
      })
    )
    expect(lectura.prefijo).toMatch(/hasta 4 letras o números/)
    expect(lectura.consecutivo).toBe(
      "Escribe solo el número, sin el prefijo; por ejemplo 1234."
    )
    expect(lectura.fechaEmision).toBe(
      "La fecha de emisión no puede ser futura."
    )
    expect(lectura.cufe).toMatch(/96 caracteres/)
    expect(lectura.total).toBe("Escribe el total de la factura expedida.")
    expect(lectura.archivoPath).toBe("Carga el PDF de la factura expedida.")
  })

  it("el vencimiento no puede ser anterior a la emisión", () => {
    expect(
      errores(
        esquemaFacturaExpedida.safeParse({
          ...base,
          fechaVencimiento: "2026-10-01",
        })
      ).fechaVencimiento
    ).toBe("El vencimiento no puede ser anterior a la emisión.")
  })

  it("el formulario exige el total del borrador (sin el PDF, que se sube aparte)", () => {
    const { archivoPath: _, ...formulario } = base
    const esquema = esquemaFormularioExpedida(4_760_000.5)
    expect(esquema.safeParse(formulario).success).toBe(true)
    expect(
      errores(esquema.safeParse({ ...formulario, total: "4.760.000" })).total
    ).toMatch(/^No coincide con el total del borrador/)
  })
})

describe("pagos del anunciante", () => {
  const base = {
    facturaId: FACTURA,
    fecha: "2026-10-23",
    monto: "4.000.000",
    retenciones: "",
    medioPago: "TRANSFERENCIA",
    referencia: "  ",
    soportePath: `pago/${FACTURA}/0192f3a4-5b6c-7d8e-9f01-0000000000f2.png`,
  }

  it("las retenciones vacías son cero y la referencia vacía no se guarda", () => {
    const lectura = esquemaRegistrarPago.safeParse(base)
    expect(lectura.data).toMatchObject({
      monto: 4_000_000,
      retenciones: 0,
      referencia: null,
    })
  })

  it("un pago solo con retenciones vale; sin nada, no", () => {
    expect(
      esquemaRegistrarPago.safeParse({
        ...base,
        monto: "0",
        retenciones: "160.000",
      }).success
    ).toBe(true)
    expect(
      errores(esquemaRegistrarPago.safeParse({ ...base, monto: "0" })).monto
    ).toBe("El pago más las retenciones debe ser mayor que cero.")
  })

  it("exige medio de pago del catálogo, fecha no futura y soporte", () => {
    const lectura = errores(
      esquemaRegistrarPago.safeParse({
        ...base,
        medioPago: "EFECTIVO",
        fecha: "2026-10-24",
        soportePath: "",
      })
    )
    expect(lectura.medioPago).toBe("Elige cómo pagó el anunciante.")
    expect(lectura.fecha).toBe("La fecha del pago no puede ser futura.")
    expect(lectura.soportePath).toBe("Carga el soporte del pago.")
  })

  it("el formulario no deja pagar más que el saldo ni antes de la emisión", () => {
    const { soportePath: _, ...formulario } = base
    const esquema = esquemaFormularioPago({
      saldo: 6_000_000,
      fechaEmision: "2026-10-10",
    })
    expect(
      esquema.safeParse({ ...formulario, monto: "6.000.000" }).success
    ).toBe(true)
    const lectura = errores(
      esquema.safeParse({
        ...formulario,
        monto: "5.900.000",
        retenciones: "200.000",
        fecha: "2026-10-09",
      })
    )
    expect(lectura.monto).toMatch(/no puede superar el saldo/)
    expect(lectura.fecha).toBe(
      "La fecha del pago no puede ser anterior a la emisión de la factura."
    )
  })
})

describe("notas crédito", () => {
  const base = {
    facturaId: FACTURA,
    numero: " nc 125 ",
    cude: CUFE,
    fechaEmision: "2026-10-23",
    valor: "1.190.000",
    motivo: "La asignación se canceló por incumplimiento.",
    archivoPath: RUTA_FACTURA,
  }

  it("normaliza el número y el CUDE; sin asignaciones, lista vacía", () => {
    const lectura = esquemaRegistrarNotaCredito.safeParse(base)
    expect(lectura.data).toMatchObject({
      numero: "NC 125",
      cude: CUFE.toLowerCase(),
      valor: 1_190_000,
      asignacionIds: [],
    })
  })

  it("exige motivo de al menos 10 caracteres y número válido", () => {
    const lectura = errores(
      esquemaRegistrarNotaCredito.safeParse({
        ...base,
        numero: "-NC",
        motivo: "corto",
      })
    )
    expect(lectura.numero).toMatch(/letras, números, espacios o guiones/)
    expect(lectura.motivo).toBe("Cuenta el motivo (al menos 10 caracteres).")
  })

  it("el formulario no deja pasar del saldo ni antes de la factura", () => {
    const { archivoPath: _, ...formulario } = base
    const esquema = esquemaFormularioNota({
      saldo: 1_000_000,
      fechaEmision: "2026-10-23",
    })
    const lectura = errores(
      esquema.safeParse({ ...formulario, fechaEmision: "2026-10-22" })
    )
    expect(lectura.valor).toMatch(/no puede superar el saldo/)
    expect(lectura.fechaEmision).toBe(
      "La nota crédito no puede ser anterior a la emisión de la factura."
    )
  })
})

describe("archivos y descargas", () => {
  const pdf = {
    nombre: "FE1234.pdf",
    tipo: "application/pdf",
    tamano: 120_000,
    sha256: null,
    dimensiones: null,
    duracionSeg: null,
    conMiniatura: false,
  }

  it("la factura y la nota solo admiten PDF; el soporte del pago, también fotos", () => {
    const foto = { ...pdf, nombre: "soporte.png", tipo: "image/png" }
    expect(
      esquemaPrepararArchivo.safeParse({
        facturaId: FACTURA,
        destino: "factura",
        descripcion: foto,
      }).success
    ).toBe(false)
    expect(
      esquemaPrepararArchivo.safeParse({
        facturaId: FACTURA,
        destino: "pago",
        descripcion: foto,
      }).success
    ).toBe(true)
    expect(
      esquemaPrepararArchivo.safeParse({
        facturaId: FACTURA,
        destino: "pago",
        descripcion: { ...foto, tipo: "image/webp" },
      }).success
    ).toBe(false)
  })

  it("rechaza un archivo de más de 10 MB al confirmar", () => {
    expect(
      esquemaConfirmarArchivo.safeParse({
        facturaId: FACTURA,
        destino: "factura",
        archivo: {
          ...pdf,
          tamano: 11 * 1024 * 1024,
          bucket: "soportes",
          ruta: RUTA_FACTURA,
          rutaMiniatura: null,
        },
      }).success
    ).toBe(false)
  })

  it("cada descarga pide el id de su registro", () => {
    expect(
      esquemaFirmarArchivo.safeParse({ tipo: "pago", facturaId: FACTURA })
        .success
    ).toBe(false)
    expect(
      esquemaFirmarArchivo.safeParse({ tipo: "factura", facturaId: FACTURA })
        .data
    ).toEqual({ tipo: "factura", facturaId: FACTURA, descargar: true })
  })

  it("anular un borrador exige motivo", () => {
    expect(
      esquemaAnularBorrador.safeParse({ facturaId: FACTURA, motivo: " no " })
        .success
    ).toBe(false)
  })
})
