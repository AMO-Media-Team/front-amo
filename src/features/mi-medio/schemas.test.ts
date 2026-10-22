import { describe, expect, it } from "vitest"

import { digitoVerificacion } from "@/lib/colombia/nit"

import {
  type EntradaDatosPago,
  type EntradaPerfilMedio,
  escribeCuenta,
  esquemaDatosPago,
  esquemaPerfilMedio,
  type PagoGuardado,
  problemaNumeroDocumento,
  SIN_PAGO_GUARDADO,
} from "./schemas"

const CATEGORIA = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"

function perfil(parcial: Partial<EntradaPerfilMedio> = {}): EntradaPerfilMedio {
  return {
    actualizadoAt: "2026-10-22T12:00:00.000000+00:00",
    nombre: "  Noticias   del Sur ",
    tipo: "PAGINA_NOTICIAS",
    municipioCodigo: "76001",
    descripcionAudiencia: "Jóvenes de Cali.\n\n\n\nInteresados en deporte.",
    categoriaIds: [CATEGORIA],
    audiencia: [],
    ...parcial,
  }
}

function mensajes(
  resultado: ReturnType<ReturnType<typeof esquemaPerfilMedio>["safeParse"]>
) {
  return resultado.success
    ? []
    : resultado.error.issues.map((i) => [i.path.join("."), i.message])
}

describe("esquemaPerfilMedio", () => {
  it("normaliza nombre y párrafos y convierte los porcentajes", () => {
    const resultado = esquemaPerfilMedio().parse(
      perfil({
        audiencia: [
          { paisIso2: "CO", porcentaje: "87,5" },
          { paisIso2: "US", porcentaje: " 10 " },
        ],
      })
    )
    expect(resultado).toMatchObject({
      nombre: "Noticias del Sur",
      descripcionAudiencia: "Jóvenes de Cali.\n\nInteresados en deporte.",
      audiencia: [
        { paisIso2: "CO", porcentaje: 87.5 },
        { paisIso2: "US", porcentaje: 10 },
      ],
    })
  })

  it("una descripción vacía se guarda como null", () => {
    expect(
      esquemaPerfilMedio().parse(perfil({ descripcionAudiencia: "   " }))
        .descripcionAudiencia
    ).toBeNull()
  })

  it("exige la versión del registro (bloqueo optimista)", () => {
    expect(
      mensajes(esquemaPerfilMedio().safeParse(perfil({ actualizadoAt: "" })))
    ).toContainEqual(["actualizadoAt", "Falta la versión del registro."])
  })

  it("valida cada fila de la audiencia", () => {
    const resultado = esquemaPerfilMedio().safeParse(
      perfil({
        audiencia: [
          { paisIso2: "", porcentaje: "10" },
          { paisIso2: "CO", porcentaje: "" },
          { paisIso2: "PE", porcentaje: "diez" },
          { paisIso2: "EC", porcentaje: "0" },
          { paisIso2: "VE", porcentaje: "1,234" },
        ],
      })
    )
    expect(mensajes(resultado)).toEqual(
      expect.arrayContaining([
        ["audiencia.0.paisIso2", "Elige el país."],
        ["audiencia.1.porcentaje", "Escribe el porcentaje."],
        ["audiencia.2.porcentaje", "Escribe un número, por ejemplo 35 o 12,5."],
        ["audiencia.3.porcentaje", "Debe ser mayor que 0 %."],
        ["audiencia.4.porcentaje", "Usa como máximo dos decimales."],
      ])
    )
  })

  it("no admite países repetidos", () => {
    const resultado = esquemaPerfilMedio().safeParse(
      perfil({
        audiencia: [
          { paisIso2: "CO", porcentaje: "50" },
          { paisIso2: "CO", porcentaje: "10" },
        ],
      })
    )
    expect(mensajes(resultado)).toEqual([
      ["audiencia.1.paisIso2", "Este país ya está en la lista."],
    ])
  })

  it("la suma, con lo verificado por AMO, no pasa de 100 %", () => {
    const fija = { paises: ["CO"], porcentaje: 70.25 }
    const exacta = esquemaPerfilMedio(fija).safeParse(
      perfil({ audiencia: [{ paisIso2: "US", porcentaje: "29,75" }] })
    )
    expect(exacta.success).toBe(true)

    const excede = esquemaPerfilMedio(fija).safeParse(
      perfil({ audiencia: [{ paisIso2: "US", porcentaje: "29,76" }] })
    )
    expect(mensajes(excede)).toEqual([
      ["audiencia", "La suma no puede pasar de 100 % (hoy da 100,01 %)."],
    ])
  })

  it("no deja declarar un país que ya verificó AMO", () => {
    const resultado = esquemaPerfilMedio({
      paises: ["CO"],
      porcentaje: 60,
    }).safeParse(perfil({ audiencia: [{ paisIso2: "CO", porcentaje: "5" }] }))
    expect(mensajes(resultado)).toEqual([
      ["audiencia.0.paisIso2", "Este país ya lo verificó el equipo de AMO."],
    ])
  })

  it("admite como máximo 10 países", () => {
    const paises = [
      "AR",
      "BR",
      "CL",
      "CO",
      "EC",
      "ES",
      "MX",
      "PA",
      "PE",
      "US",
      "VE",
    ]
    const resultado = esquemaPerfilMedio().safeParse(
      perfil({
        audiencia: paises.map((paisIso2) => ({ paisIso2, porcentaje: "1" })),
      })
    )
    expect(mensajes(resultado)).toContainEqual([
      "audiencia",
      "Indica como máximo 10 países.",
    ])
  })
})

// ── Pago ─────────────────────────────────────────────────────────────────────

function pago(parcial: Partial<EntradaDatosPago> = {}): EntradaDatosPago {
  return {
    titularNombre: "  Ana   María Pérez ",
    tipoDocumento: "CC",
    numeroDocumento: "1.023.456.789",
    cambiarCuenta: false,
    metodoPago: "BANCARIO",
    banco: "Bancolombia",
    bancoOtro: "",
    tipoCuenta: "AHORROS",
    numeroCuenta: "030-1234 5678",
    billetera: "",
    billeteraOtra: "",
    numeroBilletera: "",
    esDeclarante: false,
    obligadoFacturar: false,
    responsableIva: false,
    ...parcial,
  }
}

const GUARDADO: PagoGuardado = {
  tipoDocumento: "CC",
  documentoRegistrado: true,
  cuentaRegistrada: true,
}

function erroresPago(
  entrada: EntradaDatosPago,
  guardado: PagoGuardado = SIN_PAGO_GUARDADO
) {
  const resultado = esquemaDatosPago(guardado).safeParse(entrada)
  return resultado.success
    ? []
    : resultado.error.issues.map((i) => [i.path.join("."), i.message])
}

describe("problemaNumeroDocumento", () => {
  it("acepta separadores y valida el largo por tipo", () => {
    expect(problemaNumeroDocumento("CC", "1.023.456.789")).toBeNull()
    expect(problemaNumeroDocumento("CC", "1234")).toBe(
      "La cédula tiene entre 5 y 10 dígitos."
    )
    expect(problemaNumeroDocumento("CC", "12345678901")).not.toBeNull()
    expect(problemaNumeroDocumento("CE", "123")).toBeNull()
    expect(problemaNumeroDocumento("PPT", "1234567")).toBeNull()
    expect(problemaNumeroDocumento("PASAPORTE", "ab123456")).toBeNull()
    expect(problemaNumeroDocumento("PASAPORTE", "AB12")).not.toBeNull()
  })

  it("rechaza letras en una cédula y símbolos en cualquiera", () => {
    expect(problemaNumeroDocumento("CC", "12A456")).toBe(
      "La cédula tiene entre 5 y 10 dígitos."
    )
    expect(problemaNumeroDocumento("PASAPORTE", "AB/123456")).toBe(
      "Escribe solo números y letras (puedes separarlos con puntos o guiones)."
    )
  })

  it("comprueba el dígito de verificación del NIT", () => {
    const nit = "900123456"
    const dv = digitoVerificacion(nit)
    const otro = String((Number(dv) + 1) % 10)
    expect(problemaNumeroDocumento("NIT", `900.123.456-${dv}`)).toBeNull()
    expect(problemaNumeroDocumento("NIT", `${nit}-${otro}`)).toBe(
      "El dígito de verificación no corresponde al NIT. Revísalo en tu RUT."
    )
  })
})

describe("esquemaDatosPago · primera vez", () => {
  it("resuelve documento, cuenta bancaria y banderas", () => {
    expect(esquemaDatosPago().parse(pago({ esDeclarante: true }))).toEqual({
      titularNombre: "Ana María Pérez",
      tipoDocumento: "CC",
      numeroDocumento: "1023456789",
      cuenta: {
        metodo: "BANCARIO",
        banco: "Bancolombia",
        tipoCuenta: "AHORROS",
        numero: "03012345678",
      },
      esDeclarante: true,
      obligadoFacturar: false,
      responsableIva: false,
    })
  })

  it("resuelve una billetera con otro proveedor escrito a mano", () => {
    const datos = esquemaDatosPago().parse(
      pago({
        metodoPago: "BILLETERA",
        billetera: "OTRA",
        billeteraOtra: "  Mi   Billetera ",
        numeroBilletera: "300 123 4821",
      })
    )
    expect(datos.cuenta).toEqual({
      metodo: "BILLETERA",
      proveedor: "Mi Billetera",
      numero: "3001234821",
    })
  })

  it("exige titular, tipo, número y cuenta", () => {
    expect(
      erroresPago(
        pago({
          titularNombre: " ",
          tipoDocumento: "",
          metodoPago: "",
        })
      )
    ).toEqual([
      ["titularNombre", "Escribe el nombre del titular."],
      ["tipoDocumento", "Elige el tipo de documento."],
      ["metodoPago", "Elige cómo quieres recibir tus pagos."],
    ])
    expect(erroresPago(pago({ numeroDocumento: "" }))).toEqual([
      ["numeroDocumento", "Escribe el número de documento."],
    ])
  })

  it("valida los campos de la cuenta bancaria", () => {
    expect(
      erroresPago(pago({ banco: "", tipoCuenta: "CDT", numeroCuenta: "12A45" }))
    ).toEqual([
      ["banco", "Elige el banco."],
      ["tipoCuenta", "Elige si es de ahorros o corriente."],
      ["numeroCuenta", "Escribe solo números."],
    ])
    expect(erroresPago(pago({ numeroCuenta: "1234" }))).toEqual([
      ["numeroCuenta", "El número tiene entre 5 y 20 dígitos."],
    ])
    expect(erroresPago(pago({ banco: "OTRA", bancoOtro: "X" }))).toEqual([
      ["bancoOtro", "Escribe el nombre del banco."],
    ])
    expect(
      erroresPago(
        pago({
          metodoPago: "BILLETERA",
          billetera: "OTRA",
          numeroBilletera: "3001234567",
        })
      )
    ).toEqual([["billeteraOtra", "Escribe el nombre de la billetera."]])
  })

  it("la billetera es el celular: 10 dígitos que empiezan por 3", () => {
    const base = { metodoPago: "BILLETERA", billetera: "Nequi" }
    expect(erroresPago(pago({ ...base, numeroBilletera: "" }))).toEqual([
      ["numeroBilletera", "Escribe el celular de la billetera."],
    ])
    expect(
      erroresPago(pago({ ...base, numeroBilletera: "6012345678" }))
    ).toEqual([
      [
        "numeroBilletera",
        "Es el celular de la billetera: 10 dígitos que empiezan por 3.",
      ],
    ])
    expect(erroresPago(pago({ ...base, billetera: "Paypal" }))).toContainEqual([
      "billetera",
      "Elige la billetera.",
    ])
  })

  it("limita el largo del titular y del nombre de la entidad", () => {
    expect(erroresPago(pago({ titularNombre: "A".repeat(121) }))).toEqual([
      ["titularNombre", "Máximo 120 caracteres."],
    ])
    expect(
      erroresPago(pago({ banco: "OTRA", bancoOtro: "B".repeat(41) }))
    ).toEqual([["bancoOtro", "Máximo 40 caracteres."]])
  })
})

describe("esquemaDatosPago · con datos guardados", () => {
  it("número vacío con el mismo tipo conserva el registrado", () => {
    const datos = esquemaDatosPago(GUARDADO).parse(
      pago({ numeroDocumento: "", metodoPago: "", banco: "" })
    )
    expect(datos.numeroDocumento).toBeNull()
    expect(datos.cuenta).toBeNull()
  })

  it("si cambia el tipo, hay que escribir el número otra vez", () => {
    expect(
      erroresPago(
        pago({
          tipoDocumento: "CE",
          numeroDocumento: "",
          cambiarCuenta: false,
        }),
        GUARDADO
      )
    ).toEqual([
      [
        "numeroDocumento",
        "Cambiaste el tipo de documento: escribe de nuevo el número.",
      ],
    ])
  })

  it("escribir un número nuevo lo reemplaza", () => {
    expect(
      esquemaDatosPago(GUARDADO).parse(pago({ numeroDocumento: "98765432" }))
        .numeroDocumento
    ).toBe("98765432")
  })

  it("la cuenta guardada se conserva salvo que se pida cambiarla", () => {
    expect(escribeCuenta({ cambiarCuenta: false }, GUARDADO)).toBe(false)
    expect(escribeCuenta({ cambiarCuenta: true }, GUARDADO)).toBe(true)
    expect(escribeCuenta({ cambiarCuenta: false }, SIN_PAGO_GUARDADO)).toBe(
      true
    )

    const conCambio = esquemaDatosPago(GUARDADO).safeParse(
      pago({ cambiarCuenta: true, numeroCuenta: "" })
    )
    expect(conCambio.success).toBe(false)
  })

  it("una cuenta nueva se escribe completa, nunca mezclada con la guardada", () => {
    const datos = esquemaDatosPago(GUARDADO).parse(
      pago({
        numeroDocumento: "",
        cambiarCuenta: true,
        metodoPago: "BILLETERA",
        billetera: "Daviplata",
        numeroBilletera: "3109876543",
      })
    )
    expect(datos.cuenta).toEqual({
      metodo: "BILLETERA",
      proveedor: "Daviplata",
      numero: "3109876543",
    })
  })
})
