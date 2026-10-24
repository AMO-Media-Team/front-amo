import { describe, expect, it } from "vitest"

import { liquidacion, liquidacionPorFacturar } from "./fixtures"
import {
  archivosDescargables,
  avisoSegSocial,
  contarPublicaciones,
  detalleRetencion,
  documentoParaMedio,
  estadoParaMedio,
  fechaDia,
  fechaEstimada,
  formatearTarifa,
  lineasCondicion,
  nombreArchivoLiquidacion,
  nombreRetencion,
  PENDIENTE_DIAN,
  puedeCargarFactura,
  rutaCargarFactura,
  TEXTO_ANULADA,
  textoCuds,
  textoPeriodo,
  textoRegla,
} from "./presentacion"

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string) => texto.replace(/[  ]/g, " ")

describe("fechas de calendario", () => {
  it("una columna date no se corre al día anterior (el servidor está en UTC)", () => {
    expect(fechaDia("2026-10-01")).toBe("1 oct 2026")
    expect(fechaDia(null)).toBe("—")
  })

  it("el periodo no repite lo que comparten sus extremos", () => {
    expect(textoPeriodo("2026-10-01", "2026-10-15")).toBe("1 – 15 oct 2026")
    expect(textoPeriodo("2026-09-16", "2026-10-15")).toBe(
      "16 sept – 15 oct 2026"
    )
  })
})

describe("estadoParaMedio", () => {
  it("cuenta cada estado en voz de quien cobra", () => {
    expect(estadoParaMedio(liquidacion({ estado: "BORRADOR" }))).toMatchObject({
      etiqueta: "En revisión",
      tono: "aviso",
    })
    expect(
      estadoParaMedio(liquidacion({ estado: "APROBADA", enviadaBancoAt: null }))
        .etiqueta
    ).toBe("Aprobada · por pagar")
    const enProceso = estadoParaMedio(
      liquidacion({
        estado: "APROBADA",
        enviadaBancoAt: "2026-10-20T14:00:00+00:00",
      })
    )
    expect(enProceso.etiqueta).toBe("En proceso de pago")
    expect(enProceso.descripcion).toContain("20 oct 2026")
    expect(estadoParaMedio(liquidacion())).toMatchObject({
      etiqueta: "Pagada el 21 oct 2026",
      tono: "exito",
    })
    expect(estadoParaMedio(liquidacion({ fechaPago: null })).etiqueta).toBe(
      "Pagada"
    )
    expect(estadoParaMedio(liquidacion({ estado: "ANULADA" }))).toEqual({
      etiqueta: "Anulada",
      tono: "neutro",
      descripcion:
        "Se anuló: sus publicaciones volvieron a Por liquidar y entrarán en el próximo corte.",
    })
  })

  it("la anulada explica adónde volvieron sus publicaciones", () => {
    expect(TEXTO_ANULADA).toEqual({
      titulo: "Esta liquidación se anuló",
      descripcion:
        "Sus publicaciones volvieron a Por liquidar y entrarán en el próximo corte.",
    })
  })
})

describe("avisoSegSocial", () => {
  it("solo mientras espera aprobarse o pagarse", () => {
    for (const estado of ["BORRADOR", "APROBADA"] as const) {
      expect(
        avisoSegSocial(liquidacion({ estado, alertaSegSocial: true }))
      ).not.toBeNull()
    }
    // Ya pagada o anulada, la alerta con que se generó no pide nada.
    for (const estado of ["PAGADA", "ANULADA"] as const) {
      expect(
        avisoSegSocial(
          liquidacion({ estado, alertaSegSocial: true, bloqueaSegSocial: true })
        )
      ).toBeNull()
    }
    expect(avisoSegSocial(liquidacion({ estado: "BORRADOR" }))).toBeNull()
  })

  it("el texto depende de si la política bloquea", () => {
    expect(
      avisoSegSocial(
        liquidacion({
          estado: "BORRADOR",
          alertaSegSocial: true,
          bloqueaSegSocial: true,
        })
      )
    ).toEqual({
      bloquea: true,
      texto:
        "Seguridad social pendiente: cárgala para que podamos aprobar y pagar tu liquidación.",
    })
    expect(
      avisoSegSocial(liquidacion({ estado: "APROBADA", alertaSegSocial: true }))
    ).toEqual({
      bloquea: false,
      texto: "Seguridad social pendiente: cárgala para respaldar tus pagos.",
    })
  })
})

describe("fechaEstimada", () => {
  const aprobada = liquidacionPorFacturar({ fechaPagoEstimada: "2026-10-23" })

  it("mientras no se paga dice hasta cuándo, y si ya pasó, que va con retraso", () => {
    expect(fechaEstimada(aprobada, "2026-10-22")).toEqual({
      texto: "Pago previsto hasta el 23 oct 2026",
      atrasada: false,
    })
    expect(fechaEstimada(aprobada, "2026-10-23")?.atrasada).toBe(false)
    expect(fechaEstimada(aprobada, "2026-10-24")).toEqual({
      texto: "Pago previsto hasta el 23 oct 2026: va con retraso",
      atrasada: true,
    })
  })

  it("una pagada o sin fecha no tiene estimado", () => {
    expect(fechaEstimada(liquidacion(), "2026-10-24")).toBeNull()
    expect(
      fechaEstimada({ ...aprobada, fechaPagoEstimada: null }, "2026-10-24")
    ).toBeNull()
  })
})

describe("textoRegla", () => {
  it("«Liquidamos cada quincena y pagamos en hasta 8 días.»", () => {
    expect(textoRegla("QUINCENAL", 8)).toBe(
      "Liquidamos cada quincena y pagamos en hasta 8 días."
    )
    expect(textoRegla("MENSUAL", 1)).toBe(
      "Liquidamos cada mes y pagamos en hasta 1 día."
    )
    expect(textoRegla("SEMANAL", null)).toBe("Liquidamos cada semana.")
    expect(textoRegla(null, 8)).toBe(
      "Liquidamos al cierre de cada periodo y pagamos en hasta 8 días."
    )
  })
})

describe("documentoParaMedio", () => {
  it("documento soporte emitido, con o sin PDF", () => {
    expect(documentoParaMedio(liquidacion())).toEqual({
      tipo: "documento",
      numero: "DSF2",
      fecha: "2026-10-17",
      cuds: null,
      descargable: true,
    })
  })

  it("en borrador, anulado o sin documento: en preparación", () => {
    expect(
      documentoParaMedio(
        liquidacion({
          documento: {
            numero: null,
            fecha: null,
            estado: "BORRADOR",
            cuds: null,
            conArchivo: false,
          },
        })
      ).tipo
    ).toBe("documento-en-preparacion")
    expect(documentoParaMedio(liquidacion({ documento: null })).tipo).toBe(
      "documento-en-preparacion"
    )
  })

  it("el medio que factura: «Carga tu factura» mientras se pueda", () => {
    const pendiente = liquidacionPorFacturar()
    expect(puedeCargarFactura(pendiente)).toBe(true)
    expect(documentoParaMedio(pendiente).tipo).toBe("factura-pendiente")
    expect(
      documentoParaMedio(
        liquidacionPorFacturar({
          factura: { numero: "FE-1", conArchivo: true },
        })
      )
    ).toEqual({ tipo: "factura", numero: "FE-1", descargable: true })
    const pagada = liquidacionPorFacturar({ estado: "PAGADA" })
    expect(puedeCargarFactura(pagada)).toBe(false)
    expect(documentoParaMedio(pagada).tipo).toBe("factura-sin-registrar")
    expect(puedeCargarFactura(liquidacion({ estado: "BORRADOR" }))).toBe(false)
  })

  it("sin CUDS: «Pendiente de transmisión a la DIAN»", () => {
    expect(textoCuds(null)).toBe(PENDIENTE_DIAN)
    expect(textoCuds("  ")).toBe("Pendiente de transmisión a la DIAN")
    expect(textoCuds("ab12")).toBe("ab12")
  })

  it("«Carga tu factura» lleva a la sección del detalle", () => {
    expect(rutaCargarFactura("l1")).toBe("/ganancias/l1#factura")
  })
})

describe("retenciones", () => {
  it("ReteICA por mil, las demás en porcentaje", () => {
    expect(plano(formatearTarifa("RETEICA", 0.00966))).toBe("9,66 ‰")
    expect(plano(formatearTarifa("RETEFUENTE", 0.04))).toBe("4 %")
    expect(plano(formatearTarifa("RETEFUENTE", 0.035))).toBe("3,5 %")
  })

  it("nombre y detalle: concepto o municipio, y tarifa", () => {
    expect(nombreRetencion("RETEFUENTE")).toBe("Retención en la fuente")
    expect(nombreRetencion("OTRA")).toBe("OTRA")
    expect(
      plano(
        detalleRetencion({
          tipo: "RETEFUENTE",
          concepto: "SERVICIOS",
          tarifa: 0.06,
          municipio: null,
          municipioCodigo: null,
        })
      )
    ).toBe("Servicios · 6 %")
    expect(
      plano(
        detalleRetencion({
          tipo: "RETEICA",
          concepto: "ICA",
          tarifa: 0.00966,
          municipio: "Medellín",
          municipioCodigo: "05001",
        })
      )
    ).toBe("Medellín · 9,66 ‰")
    expect(
      plano(
        detalleRetencion({
          tipo: "RETEICA",
          concepto: null,
          tarifa: 0.01,
          municipio: null,
          municipioCodigo: "99999",
        })
      )
    ).toBe("99999 · 10 ‰")
  })
})

describe("archivos", () => {
  it("nombres legibles con la extensión del archivo guardado", () => {
    const pagada = liquidacion()
    expect(
      nombreArchivoLiquidacion(
        "soporte_pago",
        pagada,
        "liquidacion/x/pago/a.PNG"
      )
    ).toBe("Soporte de pago 2026-10-01 a 2026-10-15.png")
    expect(
      nombreArchivoLiquidacion(
        "documento_soporte",
        pagada,
        "documento_soporte/x/d.pdf"
      )
    ).toBe("Documento soporte DSF2.pdf")
    expect(
      nombreArchivoLiquidacion(
        "factura",
        { ...pagada, factura: { numero: "FE-9", conArchivo: true } },
        "sin-extension"
      )
    ).toBe("Factura FE-9.pdf")
  })

  it("una pagada deja descargar el soporte y el documento soporte (MED-015 c1)", () => {
    expect(archivosDescargables(liquidacion())).toEqual([
      "soporte_pago",
      "documento_soporte",
    ])
    expect(
      archivosDescargables(liquidacion({ conSoportePago: false }))
    ).toEqual(["documento_soporte"])
    expect(
      archivosDescargables(
        liquidacionPorFacturar({
          factura: { numero: "FE-1", conArchivo: true },
        })
      )
    ).toEqual(["factura"])
    expect(archivosDescargables(liquidacionPorFacturar())).toEqual([])
  })

  it("una anulada no deja descargar nada", () => {
    expect(
      archivosDescargables(
        liquidacionPorFacturar({
          estado: "ANULADA",
          factura: { numero: "FE-1", conArchivo: true },
        })
      )
    ).toEqual([])
    expect(archivosDescargables(liquidacion({ estado: "ANULADA" }))).toEqual([])
  })
})

describe("condición tributaria y conteos", () => {
  it("cada condición en su voz", () => {
    const lineas = lineasCondicion({
      esDeclarante: true,
      obligadoFacturar: false,
      responsableIva: false,
    })
    expect(lineas.map((l) => l.titulo)).toEqual([
      "Declaras renta",
      "No estás obligado a facturar",
      "No eres responsable de IVA",
    ])
    expect(lineas[1].detalle).toContain("documento soporte")
    expect(
      lineasCondicion({
        esDeclarante: false,
        obligadoFacturar: true,
        responsableIva: true,
      })[1].detalle
    ).toContain("Carga tu factura")
  })

  it("publicaciones en singular o plural", () => {
    expect(contarPublicaciones(1)).toBe("1 publicación")
    expect(contarPublicaciones(1200)).toBe("1.200 publicaciones")
  })
})
