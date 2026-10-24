import { describe, expect, it } from "vitest"

import {
  archivoCargaCsv,
  archivoCargaJson,
  type DatosArchivoCarga,
  FORMATO_ARCHIVO_CARGA,
  itemsDeCarga,
  nombreArchivoCarga,
  repartirEnCentavos,
} from "./archivo-carga"
import type { LineaFactura } from "./tipos"

function linea(cambios: Partial<LineaFactura>): LineaFactura {
  return {
    asignacionId: "0192f3a4-0000-7000-8000-000000000001",
    estado: "VERIFICADA",
    campanaId: "c1",
    campana: "Navidad 2026",
    medioId: "m1",
    medio: "Radio Pasto",
    plataforma: "INSTAGRAM",
    oferta: "Reel de lanzamiento",
    montoBruto: 1_000_000,
    montoComision: 200_000,
    montoMedio: 800_000,
    verificadaAt: "2026-10-20T15:00:00Z",
    ...cambios,
  }
}

const LINEAS = [
  linea({}),
  linea({
    asignacionId: "0192f3a4-0000-7000-8000-000000000002",
    medio: "Pasto Hoy",
    plataforma: "TIKTOK",
    montoBruto: 333_333,
    montoComision: 66_667,
    montoMedio: 266_666,
    verificadaAt: "2026-10-21T03:00:00Z",
  }),
]

function datos(cambios: Partial<DatosArchivoCarga> = {}): DatosArchivoCarga {
  return {
    factura: {
      id: "0192f3a4-5b6c-7d8e-9f01-00000000fa01",
      esquema: "COMPRA_REVENTA",
      porcentajeIva: 0.19,
      periodoDesde: "2026-10-01",
      periodoHasta: "2026-10-22",
      campana: null,
      subtotal: 1_333_333,
      iva: 253_333.27,
      valorTerceros: 0,
      total: 1_586_666.27,
    },
    adquirente: {
      razonSocial: "Tiendas La Catorce S.A.S.",
      nombreComercial: "Tienda La 14",
      nit: "900123456",
      digitoVerificacion: "7",
      identificacionExtranjera: null,
      paisIso2: "CO",
      municipioCodigo: "52001",
      municipio: "Pasto",
      departamento: "Nariño",
      direccion: "Cra. 27 # 18-30",
      correoFacturacion: "facturas@la14.co",
      regimen: "RESPONSABLE_IVA",
      datosFacturacion: { email_facturacion: "facturas@la14.co" },
    },
    lineas: LINEAS,
    generadoAt: "2026-10-23T15:00:00.000Z",
    ...cambios,
  }
}

describe("repartirEnCentavos", () => {
  it("reparte en proporción y las partes suman exactamente el total", () => {
    const partes = repartirEnCentavos([1_000_000, 333_333], 253_333.27)
    expect(partes).toEqual([190_000, 63_333.27])
    const suma = partes.reduce((a, b) => a + Math.round(b * 100), 0)
    expect(suma).toBe(25_333_327)
  })

  it("los centavos sobrantes van a las de mayor residuo", () => {
    expect(repartirEnCentavos([1, 1, 1], 0.1)).toEqual([0.04, 0.03, 0.03])
  })

  it("sin pesos todo va a la primera; sin partes, nada", () => {
    expect(repartirEnCentavos([0, 0], 10)).toEqual([10, 0])
    expect(repartirEnCentavos([], 10)).toEqual([])
  })
})

describe("itemsDeCarga", () => {
  it("compra y reventa: el IVA grava el bruto y no hay ingreso para terceros", () => {
    const { items, cuadra } = itemsDeCarga(datos())
    expect(cuadra).toBe(true)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      numero: 1,
      descripcion:
        "Pauta digital — Radio Pasto · Instagram — Reel de lanzamiento",
      plataforma: "Instagram",
      fechaVerificacion: "2026-10-20",
      baseIva: 1_000_000,
      iva: 190_000,
      ingresoTerceros: 0,
      valor: 1_190_000,
    })
    // 03:00 UTC del 21 aún es el 20 en Bogotá.
    expect(items[1].fechaVerificacion).toBe("2026-10-20")
  })

  it("mandato: el IVA grava la comisión y el valor del medio va para terceros", () => {
    const { items, cuadra } = itemsDeCarga(
      datos({
        factura: {
          ...datos().factura,
          esquema: "MANDATO",
          subtotal: 266_667,
          iva: 50_666.73,
          valorTerceros: 1_066_666,
          total: 1_383_999.73,
        },
      })
    )
    expect(items[0]).toMatchObject({
      descripcion: expect.stringMatching(/^Intermediación de pauta digital/),
      baseIva: 200_000,
      ingresoTerceros: 800_000,
    })
    expect(items[0].iva + items[1].iva).toBeCloseTo(50_666.73, 2)
    expect(cuadra).toBe(true)
  })

  it("no cuadra si las bases no suman el subtotal del borrador o no hay conceptos", () => {
    expect(itemsDeCarga(datos({ lineas: [LINEAS[0]] })).cuadra).toBe(false)
    expect(itemsDeCarga(datos({ lineas: [] })).cuadra).toBe(false)
  })
})

describe("archivoCargaJson", () => {
  it("lleva formato, adquirente con NIT y dirección, ítems y totales", () => {
    const json = JSON.parse(archivoCargaJson(datos()))
    expect(json.formato).toBe(FORMATO_ARCHIVO_CARGA)
    expect(json.factura).toMatchObject({
      tipo: "FACTURA_VENTA",
      moneda: "COP",
      esquema: "COMPRA_REVENTA",
      alcance: "Consolidada",
      periodo: { desde: "2026-10-01", hasta: "2026-10-22" },
    })
    expect(json.adquirente).toMatchObject({
      tipo_identificacion: "NIT",
      nit: "900123456",
      dv: "7",
      razon_social: "Tiendas La Catorce S.A.S.",
      direccion: "Cra. 27 # 18-30",
      municipio_codigo: "52001",
      datos_facturacion: { email_facturacion: "facturas@la14.co" },
    })
    expect(json.items).toHaveLength(2)
    expect(json.totales).toEqual({
      subtotal: 1_333_333,
      iva: 253_333.27,
      ingreso_terceros: 0,
      total: 1_586_666.27,
    })
    expect(json.cuadra).toBe(true)
  })

  it("sin permiso de datos sensibles la dirección va vacía", () => {
    const json = JSON.parse(
      archivoCargaJson(
        datos({ adquirente: { ...datos().adquirente, direccion: null } })
      )
    )
    expect(json.adquirente.direccion).toBeNull()
  })

  it("un adquirente del exterior va con su identificación extranjera", () => {
    const json = JSON.parse(
      archivoCargaJson(
        datos({
          adquirente: {
            ...datos().adquirente,
            paisIso2: "PE",
            nit: null,
            digitoVerificacion: null,
            identificacionExtranjera: "20123456789",
          },
        })
      )
    )
    expect(json.adquirente.tipo_identificacion).toBe("EXTRANJERA")
    expect(json.adquirente.identificacion_extranjera).toBe("20123456789")
  })
})

describe("archivoCargaCsv", () => {
  it("una fila por ítem, separada por punto y coma, con BOM", () => {
    const csv = archivoCargaCsv(datos())
    expect(csv.startsWith("﻿")).toBe(true)
    const lineas = csv.slice(1).split("\r\n")
    expect(lineas).toHaveLength(3)
    expect(lineas[0].split(";")[0]).toBe("Tipo de identificación")
    expect(lineas[1]).toContain("NIT;900123456;7;Tiendas La Catorce S.A.S.")
    expect(lineas[1]).toContain(";1000000;0.19;190000;0;1190000")
  })
})

describe("nombreArchivoCarga", () => {
  it("sin tildes ni espacios, con el final del id", () => {
    expect(nombreArchivoCarga(datos())).toBe(
      "borrador-factura-tienda-la-14-0000fa01"
    )
  })
})
