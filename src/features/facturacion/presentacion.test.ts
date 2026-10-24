import { describe, expect, it } from "vitest"

import {
  abreviarCodigo,
  admiteCobro,
  agruparPendientes,
  alcanceFactura,
  contarAsignaciones,
  describirPeriodo,
  diaDeInstante,
  diasEntre,
  efectoNotaCredito,
  efectoPago,
  enCentavos,
  esEsquema,
  etiquetaMedioPago,
  formatearDia,
  normalizarCodigoDian,
  PATRON_CODIGO_DIAN,
  seleccionPorFacturar,
  sigueFacturable,
  situacionVencimiento,
  sugerenciaNumeracion,
  sumarDias,
  tituloFactura,
  vencimientoSugerido,
} from "./presentacion"
import type { PendienteFacturacion, ResolucionActiva } from "./tipos"

/** 23 de oct de 2026, 10:00 en Bogotá. */
const AHORA = new Date("2026-10-23T15:00:00Z")

describe("catálogos y estados", () => {
  it("reconoce los esquemas y nombra los medios de pago", () => {
    expect(esEsquema("MANDATO")).toBe(true)
    expect(esEsquema("OTRO")).toBe(false)
    expect(etiquetaMedioPago("CONSIGNACION")).toBe("Consignación")
    expect(etiquetaMedioPago("DESCONOCIDO")).toBe("DESCONOCIDO")
  })

  it("solo las verificadas, liquidadas o pagadas siguen siendo facturables", () => {
    expect(sigueFacturable("VERIFICADA")).toBe(true)
    expect(sigueFacturable("PAGADA")).toBe(true)
    expect(sigueFacturable("EN_DISPUTA")).toBe(false)
    expect(sigueFacturable("CANCELADA")).toBe(false)
  })

  it("solo las expedidas con saldo admiten pagos y notas crédito", () => {
    expect(admiteCobro("EMITIDA")).toBe(true)
    expect(admiteCobro("PAGADA_PARCIAL")).toBe(true)
    expect(admiteCobro("VENCIDA")).toBe(true)
    expect(admiteCobro("BORRADOR")).toBe(false)
    expect(admiteCobro("PAGADA")).toBe(false)
    expect(admiteCobro("ANULADA")).toBe(false)
  })

  it("nombra el alcance, el título y las cantidades", () => {
    expect(alcanceFactura(null)).toBe("Consolidada")
    expect(alcanceFactura("Navidad 2026")).toBe("Navidad 2026")
    expect(tituloFactura(null)).toBe("Borrador")
    expect(tituloFactura("FE1234")).toBe("FE1234")
    expect(contarAsignaciones(1)).toBe("1 asignación")
    expect(contarAsignaciones(1200)).toBe("1.200 asignaciones")
  })
})

describe("fechas de calendario", () => {
  it("suma días y cuenta la distancia sin correrse por la zona horaria", () => {
    expect(sumarDias("2026-10-23", 30)).toBe("2026-11-22")
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01")
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29")
    expect(sumarDias("no-es-fecha", 3)).toBe("no-es-fecha")
    expect(diasEntre("2026-10-01", "2026-10-23")).toBe(22)
    expect(diasEntre("2026-10-23", "2026-10-01")).toBe(-22)
  })

  it("sugiere el vencimiento con los días configurados", () => {
    expect(vencimientoSugerido("2026-10-23", 30)).toBe("2026-11-22")
    expect(vencimientoSugerido("2026-10-23", null)).toBeNull()
    expect(vencimientoSugerido("", 30)).toBeNull()
  })

  it("muestra una columna `date` en el día correcto y el periodo", () => {
    expect(formatearDia("2026-10-01", "largo")).toBe("1 de octubre de 2026")
    expect(formatearDia(null)).toBe("—")
    expect(describirPeriodo("2026-10-01", "2026-10-15")).toMatch(/1.*15.*oct/)
    expect(describirPeriodo(null, "2026-10-15")).toBe("—")
  })

  it("toma el día de Bogotá de un instante (la medianoche UTC aún es el día anterior)", () => {
    expect(diaDeInstante("2026-10-23T03:00:00Z")).toBe("2026-10-22")
    expect(diaDeInstante("2026-10-23T15:00:00Z")).toBe("2026-10-23")
  })
})

describe("situacionVencimiento", () => {
  const base = { estado: "EMITIDA" as const, saldo: 1_000_000 }

  it("habla en días de Bogotá: falta, hoy, mañana, ayer y hace", () => {
    expect(
      situacionVencimiento({ ...base, fechaVencimiento: "2026-11-22" }, AHORA)
    ).toEqual({ texto: "Vence en 30 días", tono: "neutro", vencida: false })
    expect(
      situacionVencimiento({ ...base, fechaVencimiento: "2026-10-27" }, AHORA)
    ).toEqual({ texto: "Vence en 4 días", tono: "aviso", vencida: false })
    expect(
      situacionVencimiento({ ...base, fechaVencimiento: "2026-10-24" }, AHORA)
        ?.texto
    ).toBe("Vence mañana")
    expect(
      situacionVencimiento({ ...base, fechaVencimiento: "2026-10-23" }, AHORA)
        ?.texto
    ).toBe("Vence hoy")
    expect(
      situacionVencimiento({ ...base, fechaVencimiento: "2026-10-22" }, AHORA)
    ).toEqual({ texto: "Venció ayer", tono: "peligro", vencida: true })
    expect(
      situacionVencimiento(
        { ...base, estado: "VENCIDA", fechaVencimiento: "2026-10-11" },
        AHORA
      )?.texto
    ).toBe("Venció hace 12 días")
  })

  it("no dice nada sin saldo, sin fecha o fuera de cobro", () => {
    expect(
      situacionVencimiento(
        { ...base, saldo: 0, fechaVencimiento: "2026-10-01" },
        AHORA
      )
    ).toBeNull()
    expect(
      situacionVencimiento({ ...base, fechaVencimiento: null }, AHORA)
    ).toBeNull()
    expect(
      situacionVencimiento(
        { ...base, estado: "ANULADA", fechaVencimiento: "2026-10-01" },
        AHORA
      )
    ).toBeNull()
  })
})

describe("códigos DIAN", () => {
  const cufe = "AB12".repeat(24)

  it("normaliza lo que se pega (espacios, saltos y mayúsculas)", () => {
    const pegado = `${cufe.slice(0, 40)}\n ${cufe.slice(40)}  `
    const normalizado = normalizarCodigoDian(pegado)
    expect(normalizado).toBe(cufe.toLowerCase())
    expect(PATRON_CODIGO_DIAN.test(normalizado)).toBe(true)
    expect(PATRON_CODIGO_DIAN.test(normalizado.slice(1))).toBe(false)
  })

  it("abrevia para una línea sin perder el principio ni el final", () => {
    expect(abreviarCodigo(cufe.toLowerCase())).toBe("ab12ab12…12ab12")
    expect(abreviarCodigo("corto")).toBe("corto")
  })
})

describe("sugerenciaNumeracion", () => {
  const resolucion: ResolucionActiva = {
    numero: "18764000000001",
    prefijo: "FE",
    rangoDesde: 1,
    rangoHasta: 5000,
    consecutivoActual: 161,
    vigenteDesde: "2025-06-01",
    vigenteHasta: "2027-06-01",
  }

  it("propone el siguiente número de la resolución activa", () => {
    expect(sugerenciaNumeracion(resolucion)).toEqual({
      prefijo: "FE",
      consecutivo: 162,
      agotada: false,
      quedan: 4839,
    })
  })

  it("arranca en el inicio del rango si aún no se usa", () => {
    expect(
      sugerenciaNumeracion({
        ...resolucion,
        rangoDesde: 1001,
        consecutivoActual: 1000,
      })?.consecutivo
    ).toBe(1001)
  })

  it("avisa cuando el rango se agotó y no sugiere sin resolución", () => {
    expect(
      sugerenciaNumeracion({ ...resolucion, consecutivoActual: 5000 })
    ).toEqual({ prefijo: "FE", consecutivo: null, agotada: true, quedan: 0 })
    expect(sugerenciaNumeracion(null)).toBeNull()
  })
})

describe("efecto de un pago (LIQ-008 c2)", () => {
  it("un pago de $4.000.000 a una de $10.000.000 deja saldo de $6.000.000", () => {
    expect(
      efectoPago({ monto: 4_000_000, retenciones: 0, saldo: 10_000_000 })
    ).toEqual({ efecto: "parcial", saldoRestante: 6_000_000 })
  })

  it("las retenciones del anunciante cuentan para saldar", () => {
    expect(
      efectoPago({ monto: 5_840_000, retenciones: 160_000, saldo: 6_000_000 })
    ).toEqual({ efecto: "total", saldoRestante: 0 })
  })

  it("compara en centavos (sin errores de coma flotante)", () => {
    expect(
      efectoPago({ monto: 0.1, retenciones: 0.2, saldo: 0.3 }).efecto
    ).toBe("total")
    expect(enCentavos(1234.565)).toBe(123457)
  })

  it("no acepta más que el saldo ni un pago vacío", () => {
    expect(
      efectoPago({ monto: 6_000_001, retenciones: 0, saldo: 6_000_000 }).efecto
    ).toBe("excede")
    expect(efectoPago({ monto: 0, retenciones: 0, saldo: 100 }).efecto).toBe(
      "vacio"
    )
  })
})

describe("efecto de una nota crédito (D38, LIQ-008 c4)", () => {
  it("todo el saldo de una factura sin pagos la anula", () => {
    expect(
      efectoNotaCredito({ valor: 1_190_000, saldo: 1_190_000, pagado: 0 })
    ).toBe("anula")
  })

  it("todo el saldo de una con pagos la deja pagada; menos, rebaja", () => {
    expect(
      efectoNotaCredito({ valor: 500_000, saldo: 500_000, pagado: 690_000 })
    ).toBe("salda")
    expect(
      efectoNotaCredito({ valor: 100_000, saldo: 500_000, pagado: 0 })
    ).toBe("rebaja")
    expect(
      efectoNotaCredito({ valor: 600_000, saldo: 500_000, pagado: 0 })
    ).toBe("excede")
  })
})

describe("lo por facturar", () => {
  const fila = (
    cambios: Partial<PendienteFacturacion>
  ): PendienteFacturacion => ({
    anuncianteId: "a1",
    anunciante: "Tienda La 14",
    campanaId: "c1",
    campana: "Navidad",
    asignaciones: 2,
    montoBruto: 1_000_000,
    primeraVerificada: "2026-10-05T15:00:00Z",
    ultimaVerificada: "2026-10-20T15:00:00Z",
    ...cambios,
  })
  const filas = [
    fila({}),
    fila({
      campanaId: "c2",
      campana: "Aniversario",
      asignaciones: 3,
      montoBruto: 2_500_000.5,
      primeraVerificada: "2026-09-30T04:00:00Z",
    }),
    fila({
      anuncianteId: "a2",
      anunciante: "Almacenes Éxito",
      campanaId: "c3",
      campana: "Regreso a clases",
      asignaciones: 1,
      montoBruto: 300_000,
    }),
  ]

  it("agrupa por anunciante (mayor valor primero) con sus campañas", () => {
    const grupos = agruparPendientes(filas)
    expect(grupos.map((g) => g.anunciante)).toEqual([
      "Tienda La 14",
      "Almacenes Éxito",
    ])
    expect(grupos[0]).toMatchObject({
      asignaciones: 5,
      montoBruto: 3_500_000.5,
      // 04:00 UTC del 30 de sept aún es el 29 en Bogotá.
      primeraVerificada: "2026-09-29",
    })
    expect(grupos[0].campanas.map((c) => c.campana)).toEqual([
      "Aniversario",
      "Navidad",
    ])
  })

  it("calcula lo que entra: consolidada o una campaña", () => {
    const [grupo] = agruparPendientes(filas)
    expect(seleccionPorFacturar(grupo, null)).toEqual({
      asignaciones: 5,
      montoBruto: 3_500_000.5,
      primeraVerificada: "2026-09-29",
    })
    expect(seleccionPorFacturar(grupo, "c1")).toEqual({
      asignaciones: 2,
      montoBruto: 1_000_000,
      primeraVerificada: "2026-10-05",
    })
    expect(seleccionPorFacturar(grupo, "otra")).toBeNull()
  })
})
