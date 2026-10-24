// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  baseRestablecible,
  CLAVES_MEDIOS_FINANZAS,
  codigoDianE2E,
  csvDispersionE2E,
  describirRestablecimientoFinanzas,
  esMedioFinanzas,
  estadoTrasEtapa,
  ETAPAS_LIQUIDACION,
  finanzasSinCambios,
  FORMATO_CODIGO_DIAN,
  FORMATO_NUMERO_FACTURA_MEDIO,
  inicioPeriodo,
  leerPeriodicidad,
  llegaLiquidacion,
  MEDIOS_FINANZAS,
  numeroFacturaMedioE2E,
  periodoParaLiquidar,
  PREFIJO_FINANZAS,
  referenciaDispersionE2E,
  referenciaPagoE2E,
  siguienteConsecutivo,
  sumarDias,
} from "./finanzas-e2e"
import {
  MEDIO_E2E_ID,
  MEDIO_FACTURA_E2E_ID,
  MEDIO_FINANZAS_E2E_ID,
  MEDIO_SUSPENSION_E2E_ID,
} from "./medios-e2e"
import { PREFIJO_VALIDACION } from "./validacion-e2e"

describe("medios de Finanzas", () => {
  it("son los dos medios fijos, uno que lleva documento soporte y otro que factura", () => {
    expect(MEDIOS_FINANZAS.MEDIO_FINANZAS).toMatchObject({
      id: MEDIO_FINANZAS_E2E_ID,
      cuenta: "MEDIO_FINANZAS",
      factura: false,
    })
    expect(MEDIOS_FINANZAS.MEDIO_FACTURA).toMatchObject({
      id: MEDIO_FACTURA_E2E_ID,
      cuenta: "MEDIO_FACTURA",
      factura: true,
    })
    const ids = CLAVES_MEDIOS_FINANZAS.map((clave) => MEDIOS_FINANZAS[clave].id)
    expect(ids).not.toContain(MEDIO_E2E_ID)
    expect(ids).not.toContain(MEDIO_SUSPENSION_E2E_ID)
  })

  it("reconoce solo sus claves", () => {
    expect(esMedioFinanzas("MEDIO_FACTURA")).toBe(true)
    expect(esMedioFinanzas("MEDIO")).toBe(false)
    expect(esMedioFinanzas("toString")).toBe(false)
  })

  it("sus campañas tienen un prefijo propio que ninguna otra limpieza usa", () => {
    expect(PREFIJO_FINANZAS).toBe("Finanzas E2E")
    expect(PREFIJO_FINANZAS.startsWith(PREFIJO_VALIDACION)).toBe(false)
  })
})

describe("etapas de la liquidación", () => {
  it("cada etapa incluye las anteriores", () => {
    expect(ETAPAS_LIQUIDACION).toEqual([
      "BORRADOR",
      "APROBADA",
      "EMITIDA",
      "PAGADA",
    ])
    expect(llegaLiquidacion("PAGADA", "EMITIDA")).toBe(true)
    expect(llegaLiquidacion("EMITIDA", "APROBADA")).toBe(true)
    expect(llegaLiquidacion("APROBADA", "EMITIDA")).toBe(false)
    expect(llegaLiquidacion("BORRADOR", "BORRADOR")).toBe(true)
  })

  it("EMITIDA deja la liquidación APROBADA (el documento o la factura no la cambian de estado)", () => {
    expect(ETAPAS_LIQUIDACION.map(estadoTrasEtapa)).toEqual([
      "BORRADOR",
      "APROBADA",
      "APROBADA",
      "PAGADA",
    ])
  })
})

describe("fechas y periodo", () => {
  it("suma días cruzando meses y años, y rechaza fechas que no existen", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01")
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31")
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29")
    expect(() => sumarDias("2026-02-30", 1)).toThrow(RangeError)
    expect(() => sumarDias("23/10/2026", 1)).toThrow(RangeError)
  })

  it("lee la periodicidad como la BD (cualquier otro valor es quincenal)", () => {
    expect(leerPeriodicidad("SEMANAL")).toBe("SEMANAL")
    expect(leerPeriodicidad("MENSUAL")).toBe("MENSUAL")
    expect(leerPeriodicidad("QUINCENAL")).toBe("QUINCENAL")
    expect(leerPeriodicidad(null)).toBe("QUINCENAL")
  })

  it("el periodo vigente empieza el 1 o el 16, el lunes o el 1 del mes", () => {
    expect(inicioPeriodo("2026-10-15", "QUINCENAL")).toBe("2026-10-01")
    expect(inicioPeriodo("2026-10-16", "QUINCENAL")).toBe("2026-10-16")
    expect(inicioPeriodo("2026-10-31", "QUINCENAL")).toBe("2026-10-16")
    expect(inicioPeriodo("2026-10-23", "MENSUAL")).toBe("2026-10-01")
    // 23 de octubre de 2026 es viernes; 19, lunes.
    expect(inicioPeriodo("2026-10-23", "SEMANAL")).toBe("2026-10-19")
    expect(inicioPeriodo("2026-10-19", "SEMANAL")).toBe("2026-10-19")
    expect(inicioPeriodo("2026-11-01", "SEMANAL")).toBe("2026-10-26")
  })

  it("liquida desde el inicio del periodo vigente hasta hoy (lo verificado hoy entra)", () => {
    expect(
      periodoParaLiquidar({
        hoy: "2026-10-23",
        periodicidad: "QUINCENAL",
        ultimaFin: null,
      })
    ).toEqual({ inicio: "2026-10-16", fin: "2026-10-23" })
    expect(
      periodoParaLiquidar({
        hoy: "2026-10-23",
        periodicidad: "QUINCENAL",
        ultimaFin: "2026-10-15",
      })
    ).toEqual({ inicio: "2026-10-16", fin: "2026-10-23" })
  })

  it("empieza después de la última liquidación vigente para no traslaparse", () => {
    expect(
      periodoParaLiquidar({
        hoy: "2026-10-23",
        periodicidad: "QUINCENAL",
        ultimaFin: "2026-10-20",
      })
    ).toEqual({ inicio: "2026-10-21", fin: "2026-10-23" })
    expect(
      periodoParaLiquidar({
        hoy: "2026-10-23",
        periodicidad: "MENSUAL",
        ultimaFin: "2026-10-22",
      })
    ).toEqual({ inicio: "2026-10-23", fin: "2026-10-23" })
  })

  it("no hay periodo si una liquidación vigente ya cubre hoy", () => {
    for (const ultimaFin of ["2026-10-23", "2026-10-31"]) {
      expect(
        periodoParaLiquidar({
          hoy: "2026-10-23",
          periodicidad: "QUINCENAL",
          ultimaFin,
        })
      ).toBeNull()
    }
  })
})

describe("numeración", () => {
  it("toma el siguiente número después del consecutivo y de los ya registrados", () => {
    expect(
      siguienteConsecutivo({
        consecutivoActual: 161,
        usados: [],
        rangoDesde: 1,
        rangoHasta: 50_000,
      })
    ).toBe(162)
    expect(
      siguienteConsecutivo({
        consecutivoActual: 161,
        usados: [170, 165],
        rangoDesde: 1,
        rangoHasta: 50_000,
      })
    ).toBe(171)
  })

  it("en una resolución sin usar empieza en el inicio del rango y avisa si se agotó", () => {
    expect(
      siguienteConsecutivo({
        consecutivoActual: 0,
        usados: [],
        rangoDesde: 1000,
        rangoHasta: 5000,
      })
    ).toBe(1000)
    expect(
      siguienteConsecutivo({
        consecutivoActual: 5000,
        usados: [],
        rangoDesde: 1,
        rangoHasta: 5000,
      })
    ).toBeNull()
  })

  it("el CUFE/CUDS son 96 hexadecimales en minúscula", () => {
    expect(codigoDianE2E()).toMatch(FORMATO_CODIGO_DIAN)
    expect(codigoDianE2E(() => Buffer.alloc(48, 0xab))).toBe("ab".repeat(48))
    expect(codigoDianE2E()).not.toBe(codigoDianE2E())
  })

  it("el número de la factura del medio cumple el patrón de la BD", () => {
    const numero = numeroFacturaMedioE2E("mvlu7k2#x")
    expect(numero).toBe("FE E2E-MVLU7K2X")
    expect(numero).toMatch(FORMATO_NUMERO_FACTURA_MEDIO)
    expect(numeroFacturaMedioE2E("a".repeat(80)).length).toBeLessThanOrEqual(60)
  })

  it("las referencias identifican el pago y la liquidación en el archivo", () => {
    expect(referenciaPagoE2E("abc1")).toBe("PAGO-E2E-ABC1")
    expect(
      referenciaDispersionE2E(
        "01a16bff-fc1a-70c4-bfa4-120100244a5c",
        "2026-10-23"
      )
    ).toBe("LIQ-20261023-120100244a5c")
  })
})

describe("csvDispersionE2E", () => {
  const fila = {
    tipoDocumento: "CC",
    numeroDocumento: "1099000004",
    titular: "Titular Medio Finanzas E2E",
    metodo: "BANCARIO",
    entidad: "Banco de Bogotá",
    tipoCuenta: "AHORROS",
    numeroCuenta: "40900012348",
    valor: 372_136.4,
    referencia: "LIQ-20261023-01a16bff",
    medio: "Medio Finanzas E2E",
  }

  it("una fila por liquidación con el valor en pesos sin decimales", () => {
    const csv = csvDispersionE2E([fila])
    const [encabezado, linea, fin] = csv.split("\n")
    expect(encabezado).toBe(
      "tipo_documento,numero_documento,titular,metodo,entidad,tipo_cuenta,numero_cuenta,valor,referencia,medio"
    )
    expect(linea).toBe(
      "CC,1099000004,Titular Medio Finanzas E2E,BANCARIO,Banco de Bogotá,AHORROS,40900012348,372136,LIQ-20261023-01a16bff,Medio Finanzas E2E"
    )
    expect(fin).toBe("")
  })

  it("entrecomilla lo que lleva separadores y neutraliza fórmulas", () => {
    const linea = csvDispersionE2E([
      { ...fila, titular: 'Pérez, "Ana"', medio: "=HYPERLINK(1)" },
    ]).split("\n")[1]
    expect(linea).toContain('"Pérez, ""Ana"""')
    expect(linea).toContain("'=HYPERLINK(1)")
  })
})

describe("baseRestablecible", () => {
  it("solo la base local o develop", () => {
    expect(baseRestablecible("http://127.0.0.1:54321")).toBe("local")
    expect(baseRestablecible("http://localhost:54321")).toBe("local")
    expect(baseRestablecible("https://depbmnlpfnrcsbqlwxxd.supabase.co")).toBe(
      "develop"
    )
  })

  it("nunca producción ni otro proyecto", () => {
    expect(() =>
      baseRestablecible("https://oriuuuaczpncmtglfgpv.supabase.co")
    ).toThrow(/nunca corre contra producción/)
    expect(() =>
      baseRestablecible("https://zygfqfvqwfvhbirmjojp.supabase.co")
    ).toThrow(/solo corre contra la base local o develop/)
    expect(() => baseRestablecible(undefined)).toThrow(RangeError)
  })
})

describe("describirRestablecimientoFinanzas", () => {
  it("resume lo borrado sin ceros", () => {
    expect(
      describirRestablecimientoFinanzas({
        ...finanzasSinCambios(),
        campanas: 2,
        liquidaciones: 1,
        archivos: 7,
      })
    ).toBe(
      "borrados: 2 campaña(s) «Finanzas E2E», 1 liquidación(es), 7 archivo(s) en Storage"
    )
  })

  it("dice cuándo no había nada", () => {
    expect(describirRestablecimientoFinanzas(finanzasSinCambios())).toBe(
      "sin pruebas de Finanzas anteriores"
    )
  })
})
