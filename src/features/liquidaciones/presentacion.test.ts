import { describe, expect, it } from "vitest"

import {
  agruparRetenciones,
  avisoAnulacion,
  avisoEstado,
  BLOQUEO_GENERADA_POR_MI,
  BLOQUEO_NO_BORRADOR,
  bloqueoAprobacion,
  diaLargo,
  formatearTarifa,
  leerRetenciones,
  nombreRetencion,
  periodoCompacto,
  porcentajeComision,
  requiereNotaAjuste,
  resumirAprobacion,
  resumirCorte,
  sePuedeAnular,
  situacionSoporte,
  textoDispersion,
  textoSegSocial,
} from "./presentacion"
import type { DocumentoResumen, RetencionAplicada } from "./tipos"

const EMITIDO: DocumentoResumen = {
  id: "d1",
  estado: "EMITIDO",
  numero: "DS-15",
  conCuds: false,
  conNotaAjuste: false,
}

describe("periodo", () => {
  it("compacto para tablas y día largo para la ficha", () => {
    expect(periodoCompacto("2026-10-01", "2026-10-15")).toBe("1 – 15 oct 2026")
    expect(periodoCompacto("2026-12-16", "2027-01-15")).toBe(
      "16 dic 2026 – 15 ene 2027"
    )
    expect(diaLargo("2026-10-15")).toBe("15 de octubre de 2026")
  })
})

describe("situacionSoporte", () => {
  it("documento soporte: emitido (listo), por emitir o anulado", () => {
    const base = { requiereDocumentoSoporte: true, numeroFacturaMedio: null }
    expect(situacionSoporte({ ...base, documento: EMITIDO })).toEqual({
      etiqueta: "Documento soporte DS-15",
      tono: "exito",
      listo: true,
    })
    expect(
      situacionSoporte({
        ...base,
        documento: { ...EMITIDO, estado: "BORRADOR", numero: null },
      })
    ).toMatchObject({ etiqueta: "Documento soporte por emitir", listo: false })
    expect(situacionSoporte({ ...base, documento: null }).listo).toBe(false)
    expect(
      situacionSoporte({
        ...base,
        documento: { ...EMITIDO, estado: "ANULADO" },
      })
    ).toMatchObject({ etiqueta: "Documento soporte anulado", listo: false })
  })

  it("factura del medio: registrada (lista) o faltante", () => {
    const base = { requiereDocumentoSoporte: false, documento: null }
    expect(situacionSoporte({ ...base, numeroFacturaMedio: "FE-12" })).toEqual({
      etiqueta: "Factura FE-12",
      tono: "exito",
      listo: true,
    })
    expect(
      situacionSoporte({ ...base, numeroFacturaMedio: null })
    ).toMatchObject({ etiqueta: "Falta la factura del medio", listo: false })
  })
})

describe("textoDispersion y avisoAnulacion", () => {
  it("dice la fecha del archivo de pagos si se puede leer", () => {
    expect(textoDispersion(null)).toBe("Sin archivo de pagos")
    expect(textoDispersion({ id: "x", fecha: "2026-10-20T15:00:00Z" })).toBe(
      "En el archivo del 20 oct 2026"
    )
    expect(textoDispersion({ id: "x", fecha: null })).toBe(
      "En un archivo de pagos"
    )
  })

  it("advierte al anular una que ya salió al banco (texto del brief)", () => {
    expect(avisoAnulacion(null)).toBeNull()
    expect(avisoAnulacion({ id: "x", fecha: "2026-10-20T15:00:00Z" })).toBe(
      "Ya está en el archivo de pagos del 20 de octubre de 2026: confirma con tesorería que el banco no la pagó."
    )
    expect(avisoAnulacion({ id: "x", fecha: null })).toMatch(
      /^Ya está en un archivo de pagos: confirma con tesorería/
    )
  })
})

describe("bloqueoAprobacion (D17)", () => {
  it("quien la generó no la aprueba, salvo SUPERADMIN", () => {
    const propia = { estado: "BORRADOR" as const, generadaPorMi: true }
    expect(bloqueoAprobacion(propia, false)).toBe(BLOQUEO_GENERADA_POR_MI)
    expect(bloqueoAprobacion(propia, true)).toBeNull()
    expect(
      bloqueoAprobacion({ estado: "BORRADOR", generadaPorMi: false }, false)
    ).toBeNull()
  })

  it("solo se aprueba un borrador", () => {
    expect(
      bloqueoAprobacion({ estado: "APROBADA", generadaPorMi: false }, true)
    ).toBe(BLOQUEO_NO_BORRADOR)
  })
})

describe("anular", () => {
  it("se anula un borrador o una aprobada", () => {
    expect(sePuedeAnular("BORRADOR")).toBe(true)
    expect(sePuedeAnular("APROBADA")).toBe(true)
    expect(sePuedeAnular("PAGADA")).toBe(false)
    expect(sePuedeAnular("ANULADA")).toBe(false)
  })

  it("un documento transmitido sin nota de ajuste lo impide (D38)", () => {
    expect(requiereNotaAjuste(null)).toBe(false)
    expect(requiereNotaAjuste(EMITIDO)).toBe(false)
    expect(requiereNotaAjuste({ ...EMITIDO, conCuds: true })).toBe(true)
    expect(
      requiereNotaAjuste({ ...EMITIDO, conCuds: true, conNotaAjuste: true })
    ).toBe(false)
    expect(
      requiereNotaAjuste({ ...EMITIDO, estado: "ANULADO", conCuds: true })
    ).toBe(false)
  })
})

describe("retenciones (LIQ-002)", () => {
  it("nombre con concepto o municipio", () => {
    expect(
      nombreRetencion({
        tipo: "RETEFUENTE",
        concepto: "SERVICIOS",
        municipio: null,
      })
    ).toBe("Retención en la fuente · servicios")
    expect(
      nombreRetencion({ tipo: "RETEICA", concepto: "ICA", municipio: "Pasto" })
    ).toBe("Retención de ICA · Pasto")
    expect(
      nombreRetencion({ tipo: "RETEIVA", concepto: null, municipio: null })
    ).toBe("Retención de IVA")
  })

  it("tarifa en porcentaje o, la de ICA, por mil", () => {
    expect(formatearTarifa("RETEFUENTE", 0.06)).toBe("6 %")
    expect(formatearTarifa("RETEFUENTE", 0.025)).toBe("2,5 %")
    expect(formatearTarifa("RETEICA", 0.00966)).toBe("9,66 ‰")
    expect(formatearTarifa("RETEICA", 0.0069)).toBe("6,9 ‰")
    expect(formatearTarifa("RETEIVA", Number.NaN)).toBe("—")
  })

  it("lee el jsonb y descarta lo incompleto", () => {
    expect(
      leerRetenciones([
        {
          tipo: "RETEFUENTE",
          concepto: "SERVICIOS",
          tarifa: 0.06,
          base: 96050,
          base_pago: 262450,
          valor: 5763,
          municipio_codigo: null,
        },
        {
          tipo: "RETEICA",
          tarifa: "0.0069",
          valor: "663",
          municipio_codigo: "27660",
        },
        { tipo: "RETEIVA" },
        null,
        "texto",
      ])
    ).toEqual([
      {
        tipo: "RETEFUENTE",
        concepto: "SERVICIOS",
        tarifa: 0.06,
        base: 96050,
        basePago: 262450,
        valor: 5763,
        municipioCodigo: null,
      },
      {
        tipo: "RETEICA",
        concepto: null,
        tarifa: 0.0069,
        base: 0,
        basePago: 0,
        valor: 663,
        municipioCodigo: "27660",
      },
    ])
    expect(leerRetenciones(null)).toEqual([])
  })

  it("suma el prorrateo de cada regla con la base del pago, en orden", () => {
    const fuente = (valor: number): RetencionAplicada => ({
      tipo: "RETEFUENTE",
      concepto: "SERVICIOS",
      tarifa: 0.06,
      base: 0,
      basePago: 262450,
      valor,
      municipioCodigo: null,
    })
    const ica: RetencionAplicada = {
      tipo: "RETEICA",
      concepto: "ICA",
      tarifa: 0.0069,
      base: 0,
      basePago: 262450,
      valor: 1811,
      municipioCodigo: "27660",
    }
    expect(agruparRetenciones([[ica, fuente(5763)], [fuente(9984)]])).toEqual([
      {
        clave: "RETEFUENTE|SERVICIOS||0.06",
        tipo: "RETEFUENTE",
        concepto: "SERVICIOS",
        tarifa: 0.06,
        base: 262450,
        valor: 15747,
        municipioCodigo: null,
      },
      {
        clave: "RETEICA|ICA|27660|0.0069",
        tipo: "RETEICA",
        concepto: "ICA",
        tarifa: 0.0069,
        base: 262450,
        valor: 1811,
        municipioCodigo: "27660",
      },
    ])
    expect(agruparRetenciones([])).toEqual([])
  })
})

describe("textoSegSocial (LIQ-007)", () => {
  it("explica la política vigente y qué hacer", () => {
    const alerta = textoSegSocial("ALERTA")
    expect(alerta.titulo).toBe("Seguridad social pendiente")
    expect(alerta.bloquea).toBe(false)
    expect(alerta.politica).toMatch(/puedes aprobarla/)
    const bloquear = textoSegSocial("BLOQUEAR")
    expect(bloquear.bloquea).toBe(true)
    expect(bloquear.politica).toMatch(/bloquea la aprobación/)
    expect(bloquear.queHacer).toMatch(/Mi medio › Documentos/)
  })
})

describe("resúmenes en lote", () => {
  it("corte: generadas y medios por fuera", () => {
    const creada = {
      medioId: "m1",
      medio: "A",
      liquidacionId: "l1",
      error: null,
    }
    const fallida = {
      ...creada,
      medioId: "m2",
      liquidacionId: null,
      error: "x",
    }
    expect(resumirCorte([creada, creada, fallida]).texto).toBe(
      "Se generaron 2 liquidaciones; 1 medio quedó por fuera."
    )
    expect(resumirCorte([creada]).texto).toBe("Se generó 1 liquidación.")
    expect(resumirCorte([fallida, fallida])).toEqual({
      correctas: 0,
      fallidas: 2,
      texto: "No se generó ninguna liquidación; 2 medios quedaron por fuera.",
    })
    expect(resumirCorte([]).texto).toBe(
      "Ningún medio tenía asignaciones verificadas en ese periodo."
    )
  })

  it("aprobación: aprobadas y las que no se pudieron", () => {
    const ok = { liquidacionId: "a", ok: true, error: null }
    const no = { liquidacionId: "b", ok: false, error: "D17" }
    expect(resumirAprobacion([ok, ok, ok, no]).texto).toBe(
      "Se aprobaron 3 liquidaciones; 1 no se pudo aprobar."
    )
    expect(resumirAprobacion([no, no]).texto).toBe(
      "No se aprobó ninguna liquidación; 2 no se pudieron aprobar."
    )
    expect(resumirAprobacion([ok]).texto).toBe("Se aprobó 1 liquidación.")
  })
})

describe("avisoEstado", () => {
  const base = {
    estado: "BORRADOR" as const,
    generadaPorMi: false,
    aprobadaAt: null,
    anuladaAt: null,
    fechaPago: null,
    requiereDocumentoSoporte: true,
    documento: null,
    numeroFacturaMedio: null,
    dispersion: null,
  }

  it("borrador: qué revisar o por qué no puede aprobarla", () => {
    expect(avisoEstado(base, false).titulo).toBe("En borrador: falta aprobarla")
    expect(avisoEstado({ ...base, generadaPorMi: true }, false).texto).toBe(
      BLOQUEO_GENERADA_POR_MI
    )
    expect(avisoEstado({ ...base, generadaPorMi: true }, true).texto).toMatch(
      /^Revisa los montos/
    )
  })

  it("aprobada: lo que falta para pagarla", () => {
    const aprobada = {
      ...base,
      estado: "APROBADA" as const,
      aprobadaAt: "2026-10-17T15:00:00Z",
    }
    expect(avisoEstado(aprobada, false)).toEqual({
      tono: "info",
      titulo: "Aprobada el 17 de octubre de 2026: pendiente de pago",
      texto: "Documento soporte requerido: emítelo para poder pagarla.",
    })
    expect(
      avisoEstado({ ...aprobada, requiereDocumentoSoporte: false }, false).texto
    ).toBe("Falta la factura del medio para poder pagarla.")
    expect(
      avisoEstado(
        {
          ...aprobada,
          documento: EMITIDO,
          dispersion: { id: "d", fecha: null },
        },
        false
      ).texto
    ).toMatch(/^Ya está en el archivo de pagos/)
    expect(avisoEstado({ ...aprobada, documento: EMITIDO }, false).texto).toBe(
      "Lista para el archivo de pagos y el registro del pago."
    )
  })

  it("pagada y anulada", () => {
    expect(
      avisoEstado({ ...base, estado: "PAGADA", fechaPago: "2026-10-22" }, false)
    ).toMatchObject({
      tono: "exito",
      titulo: "Pagada el 22 de octubre de 2026",
    })
    expect(
      avisoEstado(
        { ...base, estado: "ANULADA", anuladaAt: "2026-10-18T15:00:00Z" },
        false
      )
    ).toMatchObject({
      tono: "neutro",
      titulo: "Anulada el 18 de octubre de 2026",
    })
  })
})

describe("porcentajeComision", () => {
  it("la comisión sobre el bruto, sin decimales de más", () => {
    expect(porcentajeComision(1_000_000, 200_000)).toBe("20 %")
    expect(porcentajeComision(1_000_000, 175_000)).toBe("17,5 %")
    expect(porcentajeComision(0, 0)).toBeNull()
  })
})
