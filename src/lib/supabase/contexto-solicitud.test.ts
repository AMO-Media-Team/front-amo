import { describe, expect, it } from "vitest"

import {
  construirCabecerasContexto,
  CONTEXTO_VACIO as VACIO,
  extraerContextoSolicitud,
  ipCliente,
  valorCabeceraUtf8,
} from "./contexto-solicitud"

describe("ipCliente", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    const cabeceras = new Headers({
      "x-forwarded-for": " 190.24.1.8 , 10.0.0.1",
      "x-real-ip": "10.0.0.2",
    })
    expect(ipCliente(cabeceras)).toBe("190.24.1.8")
  })

  it("usa x-real-ip si x-forwarded-for falta o no es una IP", () => {
    expect(ipCliente(new Headers({ "x-real-ip": "2800:e2:1::5" }))).toBe(
      "2800:e2:1::5"
    )
    expect(
      ipCliente(
        new Headers({
          "x-forwarded-for": "desconocido",
          "x-real-ip": "1.2.3.4",
        })
      )
    ).toBe("1.2.3.4")
  })

  it("devuelve null si ninguna es válida", () => {
    expect(
      ipCliente(new Headers({ "x-forwarded-for": "999.1.1.1" }))
    ).toBeNull()
    expect(ipCliente(new Headers())).toBeNull()
  })
})

describe("extraerContextoSolicitud", () => {
  it("lee país, región, ciudad decodificada, coordenadas y navegador", () => {
    const contexto = extraerContextoSolicitud(
      new Headers({
        "x-forwarded-for": "181.49.2.10",
        "x-vercel-ip-country": "co",
        "x-vercel-ip-country-region": "dc",
        "x-vercel-ip-city": "Bogot%C3%A1",
        "x-vercel-ip-latitude": "4.6097",
        "x-vercel-ip-longitude": "-74.0817",
        "user-agent": "Mozilla/5.0 (Macintosh)",
      })
    )
    expect(contexto).toEqual({
      ip: "181.49.2.10",
      pais: "CO",
      region: "DC",
      ciudad: "Bogotá",
      latitud: 4.6097,
      longitud: -74.0817,
      userAgent: "Mozilla/5.0 (Macintosh)",
    })
  })

  it("descarta valores inválidos en lugar de propagarlos", () => {
    const contexto = extraerContextoSolicitud(
      new Headers({
        "x-vercel-ip-country": "Colombia",
        "x-vercel-ip-country-region": "CO-ANT",
        "x-vercel-ip-city": "%E0%A4%A",
        "x-vercel-ip-latitude": "123",
        "x-vercel-ip-longitude": "abc",
      })
    )
    expect(contexto.pais).toBeNull()
    expect(contexto.region).toBeNull()
    expect(contexto.ciudad).toBe("%E0%A4%A")
    expect(contexto.latitud).toBeNull()
    expect(contexto.longitud).toBeNull()
  })

  it("trunca el user-agent a 400 caracteres", () => {
    const contexto = extraerContextoSolicitud(
      new Headers({ "user-agent": "a".repeat(600) })
    )
    expect(contexto.userAgent).toHaveLength(400)
  })
})

describe("valorCabeceraUtf8", () => {
  it("representa los bytes UTF-8 como caracteres Latin-1", () => {
    const valor = valorCabeceraUtf8("Medellín")
    expect([...valor].every((c) => c.charCodeAt(0) <= 0xff)).toBe(true)
    expect(
      new TextDecoder().decode(Uint8Array.from(valor, (c) => c.charCodeAt(0)))
    ).toBe("Medellín")
    // fetch rechaza caracteres > U+00FF: el valor codificado debe ser aceptado.
    expect(() => new Headers({ "x-amo-ciudad": valor })).not.toThrow()
  })
})

describe("construirCabecerasContexto", () => {
  const secreto = "s".repeat(40)

  it("siempre incluye el secreto y solo los datos conocidos", () => {
    expect(construirCabecerasContexto(VACIO, { secreto })).toEqual({
      "x-amo-srv": secreto,
    })
  })

  it("añade actor, IP, país, ciudad y navegador", () => {
    const actorId = "0192f3a4-5b6c-7d8e-9f01-23456789abcd"
    const cabeceras = construirCabecerasContexto(
      {
        ...VACIO,
        ip: "181.49.2.10",
        pais: "CO",
        ciudad: "Cali",
        userAgent: "Mozilla/5.0",
      },
      { secreto, actorId }
    )
    expect(cabeceras).toEqual({
      "x-amo-srv": secreto,
      "x-amo-actor": actorId,
      "x-amo-ip": "181.49.2.10",
      "x-amo-pais": "CO",
      "x-amo-ciudad": "Cali",
      "x-amo-ua": "Mozilla/5.0",
    })
  })

  it("rechaza un actor que no es UUID", () => {
    expect(() =>
      construirCabecerasContexto(VACIO, { secreto, actorId: "admin" })
    ).toThrow(/UUID/)
  })
})
