import { describe, expect, it } from "vitest"

import {
  cambiosAnunciante,
  columnasAnunciante,
  conCorreoFacturacion,
  correoFacturacionDe,
  type FilaAnuncianteEditable,
  hayCambiosAnunciante,
  valoresFormulario,
} from "./filas"
import type { DatosAnunciante } from "./schemas"
import type { AnuncianteEditable } from "./tipos"

const BASE = {
  razonSocial: "Comercializadora Andina S.A.S.",
  nombreComercial: "Andina",
  sectorId: "0192f0a1-7b2c-7d3e-8f40-123456789abc",
  emailFacturacion: null,
} as const

describe("columnasAnunciante", () => {
  it("un anunciante colombiano no lleva identificación extranjera ni ciudad libre", () => {
    const datos: DatosAnunciante = {
      ...BASE,
      paisIso2: "CO",
      identificacion: {
        tipo: "NIT",
        nit: "900123456",
        digitoVerificacion: "8",
        municipioCodigo: "52001",
      },
    }
    expect(columnasAnunciante(datos)).toEqual({
      razon_social: "Comercializadora Andina S.A.S.",
      nombre_comercial: "Andina",
      sector_id: BASE.sectorId,
      pais_iso2: "CO",
      nit: "900123456",
      digito_verificacion: "8",
      municipio_codigo: "52001",
      identificacion_extranjera: null,
      ciudad_extranjera: null,
    })
  })

  it("uno de otro país no lleva NIT, DV ni municipio (los borra al cambiar de país)", () => {
    const datos: DatosAnunciante = {
      ...BASE,
      paisIso2: "US",
      identificacion: {
        tipo: "EXTRANJERA",
        identificacion: "EIN 12-3456789",
        ciudad: null,
      },
    }
    expect(columnasAnunciante(datos)).toMatchObject({
      pais_iso2: "US",
      nit: null,
      digito_verificacion: null,
      municipio_codigo: null,
      identificacion_extranjera: "EIN 12-3456789",
      ciudad_extranjera: null,
    })
  })
})

describe("conCorreoFacturacion", () => {
  it("conserva el resto de los datos de facturación", () => {
    expect(
      conCorreoFacturacion(
        {
          regimen: "COMUN",
          es_autorretenedor: true,
          email_facturacion: "a@b.co",
        },
        "nuevo@b.co"
      )
    ).toEqual({
      regimen: "COMUN",
      es_autorretenedor: true,
      email_facturacion: "nuevo@b.co",
    })
  })

  it("sin correo quita la clave en lugar de dejarla vacía", () => {
    expect(
      conCorreoFacturacion(
        { regimen: "COMUN", email_facturacion: "a@b.co" },
        null
      )
    ).toEqual({ regimen: "COMUN" })
  })

  it("parte de un objeto vacío si lo guardado no es un objeto", () => {
    expect(conCorreoFacturacion(null, "a@b.co")).toEqual({
      email_facturacion: "a@b.co",
    })
    expect(conCorreoFacturacion(["x"], null)).toEqual({})
  })
})

describe("cambiosAnunciante", () => {
  const FILA: FilaAnuncianteEditable = {
    razon_social: BASE.razonSocial,
    nombre_comercial: BASE.nombreComercial,
    sector_id: BASE.sectorId,
    pais_iso2: "CO",
    nit: "900123456",
    digito_verificacion: "8",
    municipio_codigo: "52001",
    identificacion_extranjera: null,
    ciudad_extranjera: null,
    datos_facturacion: { regimen: "COMUN", email_facturacion: "a@b.co" },
  }
  const MISMOS: DatosAnunciante = {
    ...BASE,
    paisIso2: "CO",
    identificacion: {
      tipo: "NIT",
      nit: "900123456",
      digitoVerificacion: "8",
      municipioCodigo: "52001",
    },
    emailFacturacion: "a@b.co",
  }

  it("sin diferencias no hay nada que escribir", () => {
    const cambios = cambiosAnunciante(FILA, MISMOS)
    expect(cambios).toEqual({})
    expect(hayCambiosAnunciante(cambios)).toBe(false)
  })

  it("corregir el nombre no reescribe la identificación tributaria", () => {
    expect(
      cambiosAnunciante(FILA, { ...MISMOS, nombreComercial: "Andina Food" })
    ).toEqual({ nombre_comercial: "Andina Food" })
  })

  it("corregir el NIT lleva también su DV si cambia", () => {
    expect(
      cambiosAnunciante(FILA, {
        ...MISMOS,
        identificacion: {
          tipo: "NIT",
          nit: "860002183",
          digitoVerificacion: "9",
          municipioCodigo: "52001",
        },
      })
    ).toEqual({ nit: "860002183", digito_verificacion: "9" })
  })

  it("al pasar a otro país vacía NIT, DV y municipio", () => {
    expect(
      cambiosAnunciante(FILA, {
        ...MISMOS,
        paisIso2: "US",
        identificacion: {
          tipo: "EXTRANJERA",
          identificacion: "EIN 12-3456789",
          ciudad: null,
        },
      })
    ).toEqual({
      pais_iso2: "US",
      nit: null,
      digito_verificacion: null,
      municipio_codigo: null,
      identificacion_extranjera: "EIN 12-3456789",
    })
  })

  it("el correo cambia sin perder el resto de los datos de facturación", () => {
    expect(
      cambiosAnunciante(FILA, { ...MISMOS, emailFacturacion: null })
    ).toEqual({ datos_facturacion: { regimen: "COMUN" } })
    expect(
      cambiosAnunciante(FILA, { ...MISMOS, emailFacturacion: "c@d.co" })
    ).toEqual({
      datos_facturacion: { regimen: "COMUN", email_facturacion: "c@d.co" },
    })
  })
})

describe("correoFacturacionDe", () => {
  it("lee el correo si es un texto no vacío", () => {
    expect(correoFacturacionDe({ email_facturacion: "a@b.co" })).toBe("a@b.co")
    expect(correoFacturacionDe({ email_facturacion: " " })).toBeNull()
    expect(correoFacturacionDe({ email_facturacion: 1 })).toBeNull()
    expect(correoFacturacionDe("a@b.co")).toBeNull()
  })
})

describe("valoresFormulario", () => {
  it("para registrar: vacío y en Colombia", () => {
    expect(valoresFormulario(null)).toMatchObject({
      paisIso2: "CO",
      nit: "",
      digitoVerificacion: "",
      sectorId: "",
    })
  })

  it("para editar: los datos actuales, con el NIT agrupado como en el RUT", () => {
    const anunciante: AnuncianteEditable = {
      id: "0192f0a1-7b2c-7d3e-8f40-cba987654321",
      razonSocial: "Comercializadora Andina S.A.S.",
      nombreComercial: "Andina",
      sector: { id: BASE.sectorId, nombre: "Comercio" },
      paisIso2: "CO",
      nit: "900123456",
      digitoVerificacion: "8",
      municipioCodigo: "52001",
      identificacionExtranjera: null,
      ciudadExtranjera: null,
      emailFacturacion: null,
      actualizadoAt: "2026-10-21T22:13:45.123456+00:00",
    }
    expect(valoresFormulario(anunciante)).toEqual({
      razonSocial: "Comercializadora Andina S.A.S.",
      nombreComercial: "Andina",
      sectorId: BASE.sectorId,
      paisIso2: "CO",
      nit: "900.123.456",
      digitoVerificacion: "8",
      municipioCodigo: "52001",
      identificacionExtranjera: "",
      ciudadExtranjera: "",
      emailFacturacion: "",
    })
  })
})
