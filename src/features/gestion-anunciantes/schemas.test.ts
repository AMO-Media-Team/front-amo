import { describe, expect, it } from "vitest"

import { valoresFormulario } from "./filas"
import {
  type EntradaAnunciante,
  esquemaAnunciante,
  esquemaEditarAnunciante,
} from "./schemas"

const SECTOR = "0192f0a1-7b2c-7d3e-8f40-123456789abc"
const ID = "0192f0a1-7b2c-7d3e-8f40-cba987654321"

const COLOMBIANO: EntradaAnunciante = {
  ...valoresFormulario(null),
  razonSocial: "  Comercializadora   Andina S.A.S. ",
  nombreComercial: "Andina",
  sectorId: SECTOR,
  nit: "900.123.456",
  digitoVerificacion: "8",
  municipioCodigo: "52001",
}

const EXTRANJERO: EntradaAnunciante = {
  ...valoresFormulario(null),
  razonSocial: "Acme Corporation",
  nombreComercial: "Acme",
  sectorId: SECTOR,
  paisIso2: "US",
  identificacionExtranjera: " EIN 12-3456789 ",
  ciudadExtranjera: "Miami",
}

/** Mensajes por campo de un intento fallido. */
function errores(entrada: unknown, esquema = esquemaAnunciante) {
  const resultado = esquema.safeParse(entrada)
  if (resultado.success) return {}
  return Object.fromEntries(
    resultado.error.issues.map((issue) => [issue.path.join("."), issue.message])
  )
}

describe("esquemaAnunciante · Colombia", () => {
  it("normaliza y deja solo NIT, DV y municipio", () => {
    expect(esquemaAnunciante.parse(COLOMBIANO)).toEqual({
      razonSocial: "Comercializadora Andina S.A.S.",
      nombreComercial: "Andina",
      sectorId: SECTOR,
      paisIso2: "CO",
      identificacion: {
        tipo: "NIT",
        nit: "900123456",
        digitoVerificacion: "8",
        municipioCodigo: "52001",
      },
      emailFacturacion: null,
    })
  })

  it("ignora lo escrito para otro país", () => {
    const datos = esquemaAnunciante.parse({
      ...COLOMBIANO,
      identificacionExtranjera: "EIN 1",
      ciudadExtranjera: "Miami",
    })
    expect(datos.identificacion.tipo).toBe("NIT")
  })

  it("exige el NIT con 6 a 15 dígitos y sin letras", () => {
    expect(errores({ ...COLOMBIANO, nit: "" }).nit).toBe(
      "Escribe el NIT de la empresa."
    )
    expect(errores({ ...COLOMBIANO, nit: "12345" }).nit).toMatch(
      /entre 6 y 15 dígitos/
    )
    expect(errores({ ...COLOMBIANO, nit: "90012345A" }).nit).toMatch(
      /solo los números/
    )
  })

  it("exige el DV y explica cuál corresponde", () => {
    expect(errores({ ...COLOMBIANO, digitoVerificacion: "" })).toEqual({
      digitoVerificacion:
        "Escribe el dígito de verificación (según el NIT es 8).",
    })
    expect(errores({ ...COLOMBIANO, digitoVerificacion: "7" })).toEqual({
      digitoVerificacion:
        "No corresponde al NIT: para 900.123.456 es 8. Revisa ambos en el RUT.",
    })
    expect(errores({ ...COLOMBIANO, digitoVerificacion: "x" })).toEqual({
      digitoVerificacion: "Es un solo dígito, del 0 al 9.",
    })
  })

  it("exige el municipio", () => {
    expect(errores({ ...COLOMBIANO, municipioCodigo: "" })).toEqual({
      municipioCodigo: "Elige el municipio de la sede principal.",
    })
  })

  it("muestra a la vez los errores de la empresa y de la identificación", () => {
    const encontrados = errores({
      ...COLOMBIANO,
      razonSocial: "",
      digitoVerificacion: "1",
    })
    expect(Object.keys(encontrados).sort()).toEqual([
      "digitoVerificacion",
      "razonSocial",
    ])
  })
})

describe("esquemaAnunciante · otro país", () => {
  it("deja solo la identificación tributaria y la ciudad", () => {
    expect(esquemaAnunciante.parse(EXTRANJERO).identificacion).toEqual({
      tipo: "EXTRANJERA",
      identificacion: "EIN 12-3456789",
      ciudad: "Miami",
    })
  })

  it("no pide NIT ni municipio aunque haya restos de Colombia", () => {
    const datos = esquemaAnunciante.parse({
      ...EXTRANJERO,
      nit: "900123456",
      digitoVerificacion: "3",
      municipioCodigo: "52001",
    })
    expect(datos.identificacion.tipo).toBe("EXTRANJERA")
  })

  it("la ciudad es opcional y la identificación obligatoria (2 a 40)", () => {
    expect(
      esquemaAnunciante.parse({ ...EXTRANJERO, ciudadExtranjera: "  " })
        .identificacion
    ).toMatchObject({ ciudad: null })
    expect(errores({ ...EXTRANJERO, identificacionExtranjera: "X" })).toEqual({
      identificacionExtranjera:
        "Escribe su identificación tributaria (al menos 2 caracteres).",
    })
    expect(
      errores({ ...EXTRANJERO, identificacionExtranjera: "9".repeat(41) })
    ).toEqual({ identificacionExtranjera: "Máximo 40 caracteres." })
    expect(
      errores({ ...EXTRANJERO, ciudadExtranjera: "a".repeat(121) })
    ).toEqual({ ciudadExtranjera: "Máximo 120 caracteres." })
  })
})

describe("esquemaAnunciante · campos comunes", () => {
  it("aplica los límites de la tabla", () => {
    expect(errores({ ...COLOMBIANO, razonSocial: "A" }).razonSocial).toMatch(
      /al menos 2/
    )
    expect(
      errores({ ...COLOMBIANO, razonSocial: "a".repeat(201) }).razonSocial
    ).toBe("Máximo 200 caracteres.")
    expect(
      errores({ ...COLOMBIANO, nombreComercial: "a".repeat(121) })
        .nombreComercial
    ).toBe("Máximo 120 caracteres.")
  })

  it("exige sector y país de la lista", () => {
    expect(errores({ ...COLOMBIANO, sectorId: "" }).sectorId).toBe(
      "Elige el sector."
    )
    expect(errores({ ...COLOMBIANO, sectorId: "salud" }).sectorId).toBe(
      "Elige un sector de la lista."
    )
    expect(errores({ ...COLOMBIANO, paisIso2: "co" }).paisIso2).toBe(
      "Elige un país de la lista."
    )
  })

  it("el correo de facturación es opcional y se guarda en minúsculas", () => {
    expect(
      esquemaAnunciante.parse({
        ...COLOMBIANO,
        emailFacturacion: " Facturas@Andina.CO ",
      }).emailFacturacion
    ).toBe("facturas@andina.co")
    expect(errores({ ...COLOMBIANO, emailFacturacion: "facturas@" })).toEqual({
      emailFacturacion: "Escribe un correo válido.",
    })
  })
})

describe("esquemaEditarAnunciante", () => {
  it("añade el id y la versión a los mismos datos", () => {
    const datos = esquemaEditarAnunciante.parse({
      ...EXTRANJERO,
      id: ID,
      actualizadoAt: "2026-10-21T22:13:45.123456+00:00",
    })
    expect(datos).toMatchObject({
      id: ID,
      actualizadoAt: "2026-10-21T22:13:45.123456+00:00",
      identificacion: { tipo: "EXTRANJERA" },
    })
  })

  it("aplica las mismas reglas del NIT", () => {
    expect(
      errores(
        {
          ...COLOMBIANO,
          digitoVerificacion: "1",
          id: ID,
          actualizadoAt: "2026-10-21T22:13:45Z",
        },
        esquemaEditarAnunciante
      )
    ).toHaveProperty("digitoVerificacion")
  })

  it("exige id y versión", () => {
    expect(
      errores(
        { ...COLOMBIANO, id: "1", actualizadoAt: "" },
        esquemaEditarAnunciante
      )
    ).toMatchObject({
      id: "Identificador inválido.",
      actualizadoAt: "Falta la versión del registro.",
    })
  })
})
