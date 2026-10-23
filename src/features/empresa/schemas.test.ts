import { describe, expect, it } from "vitest"

import {
  esquemaConfirmarLogo,
  esquemaContactoEmpresa,
  esquemaMiEmpresa,
  esquemaPrepararLogo,
} from "./schemas"

const EMPRESA = {
  razonSocial: "Comercializadora  Andina S.A.S. ",
  nombreComercial: "Andina",
  sectorId: "0192f1c2-5b6a-7d00-8000-0000000000c1",
  paisIso2: "CO",
  nit: "900.123.456",
  digitoVerificacion: "8",
  municipioCodigo: "11001",
  identificacionExtranjera: "",
  ciudadExtranjera: "",
  emailFacturacion: "Facturas@Andina.co",
  regimen: "RESPONSABLE_IVA",
  granContribuyente: false,
  autorretenedor: true,
  actualizadoAt: "2026-10-22T15:00:00Z",
}

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

describe("esquemaMiEmpresa", () => {
  it("resuelve la identificación como el registro interno y conserva lo tributario", () => {
    const resultado = esquemaMiEmpresa.safeParse(EMPRESA)
    expect(resultado.success).toBe(true)
    expect(resultado.data).toMatchObject({
      razonSocial: "Comercializadora Andina S.A.S.",
      identificacion: {
        tipo: "NIT",
        nit: "900123456",
        digitoVerificacion: "8",
        municipioCodigo: "11001",
      },
      emailFacturacion: "facturas@andina.co",
      regimen: "RESPONSABLE_IVA",
      autorretenedor: true,
      actualizadoAt: EMPRESA.actualizadoAt,
    })
  })

  it("un DV incorrecto se rechaza en su campo (ANU-001)", () => {
    expect(
      errores(
        esquemaMiEmpresa.safeParse({ ...EMPRESA, digitoVerificacion: "7" })
      )
    ).toEqual({
      digitoVerificacion:
        "No corresponde al NIT: para 900.123.456 es 8. Revisa ambos en el RUT.",
    })
  })

  it("exige la versión del registro y un régimen corto", () => {
    expect(
      errores(
        esquemaMiEmpresa.safeParse({
          ...EMPRESA,
          actualizadoAt: "",
          regimen: "x".repeat(41),
        })
      )
    ).toEqual({
      actualizadoAt: "Falta la versión del registro.",
      regimen: "Elige un régimen de la lista.",
    })
  })
})

describe("esquemaContactoEmpresa", () => {
  const CONTACTO = {
    nombre: "  Laura   Gómez ",
    correo: " Laura@Andina.CO ",
    celular: "(300) 123-4567",
    direccion: "  Calle 93 # 11-20 ",
    version: "",
  }

  it("normaliza nombre, correo, celular y dirección", () => {
    expect(esquemaContactoEmpresa.parse(CONTACTO)).toEqual({
      nombre: "Laura Gómez",
      correo: "laura@andina.co",
      celular: "+57 300 123 4567",
      direccion: "Calle 93 # 11-20",
      version: null,
    })
  })

  it("celular y dirección son opcionales; nombre y correo, no", () => {
    expect(
      esquemaContactoEmpresa.parse({
        ...CONTACTO,
        celular: "",
        direccion: "",
        version: "v1",
      })
    ).toMatchObject({ celular: null, direccion: null, version: "v1" })
    expect(
      errores(
        esquemaContactoEmpresa.safeParse({
          ...CONTACTO,
          nombre: "",
          correo: "",
        })
      )
    ).toEqual({
      nombre:
        "Escribe el nombre de la persona de contacto (al menos 2 caracteres).",
      correo: "Escribe el correo de la persona de contacto.",
    })
  })

  it("rechaza un correo o un celular mal escritos con mensajes claros", () => {
    expect(
      errores(
        esquemaContactoEmpresa.safeParse({
          ...CONTACTO,
          correo: "laura@",
          celular: "123",
        })
      )
    ).toEqual({
      correo: "Escribe un correo válido.",
      celular:
        "Escribe un celular colombiano de 10 dígitos que empiece por 3, o uno de otro país con su indicativo (+1 305…).",
    })
  })

  it("acepta el celular de otro país con su indicativo", () => {
    expect(
      esquemaContactoEmpresa.parse({ ...CONTACTO, celular: "+1 305 555 0100" })
        .celular
    ).toBe("+13055550100")
  })
})

describe("esquemas del logo", () => {
  const LOGO = {
    nombre: "logo.webp",
    tipo: "image/webp",
    tamano: 80_000,
    sha256: null,
    dimensiones: { ancho: 512, alto: 512 },
    duracionSeg: null,
    conMiniatura: false,
  }

  it("admite imágenes de hasta 2 MB sin miniatura", () => {
    expect(esquemaPrepararLogo.safeParse(LOGO).success).toBe(true)
    expect(
      esquemaPrepararLogo.safeParse({ ...LOGO, tamano: 3 * 1024 * 1024 })
        .success
    ).toBe(false)
    expect(
      esquemaPrepararLogo.safeParse({ ...LOGO, tipo: "application/pdf" })
        .success
    ).toBe(false)
    expect(
      esquemaPrepararLogo.safeParse({ ...LOGO, conMiniatura: true }).success
    ).toBe(false)
  })

  it("al confirmar exige la ruta en el bucket de avatares", () => {
    expect(
      esquemaConfirmarLogo.safeParse({
        ...LOGO,
        bucket: "avatares",
        ruta: "anunciante/a/logo-b.webp",
        rutaMiniatura: null,
      }).success
    ).toBe(true)
  })
})
