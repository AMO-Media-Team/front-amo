import { describe, expect, it } from "vitest"

import {
  ErrorEnv,
  MAPBOX_ESTILO_POR_DEFECTO,
  SITIO_URL_POR_DEFECTO,
  esClaveCifradoValida,
  validarEnvCliente,
  validarEnvServidor,
} from "./env-esquema"

const CLAVE_VALIDA = `k1:${Buffer.alloc(32, 7).toString("base64")}`
const SECRETO_VALIDO = "s".repeat(32)

const CLIENTE_VALIDO = {
  NEXT_PUBLIC_SUPABASE_URL: "https://proyecto.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  NEXT_PUBLIC_MAPBOX_TOKEN: "pk.token",
}

const SERVIDOR_VALIDO = {
  AMO_CIFRADO_KEY: CLAVE_VALIDA,
  AMO_SERVIDOR_SECRET: SECRETO_VALIDO,
}

function mensajeDeError(accion: () => unknown): string {
  try {
    accion()
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorEnv)
    return (error as ErrorEnv).message
  }
  throw new Error("Se esperaba un ErrorEnv")
}

describe("esClaveCifradoValida", () => {
  it("acepta k<n>:<base64 de 32 bytes>", () => {
    expect(esClaveCifradoValida(CLAVE_VALIDA)).toBe(true)
    expect(
      esClaveCifradoValida(`k12:${Buffer.alloc(32, 1).toString("base64")}`)
    ).toBe(true)
  })

  it.each([
    ["sin prefijo", Buffer.alloc(32).toString("base64")],
    ["prefijo sin número", `k:${Buffer.alloc(32).toString("base64")}`],
    ["16 bytes", `k1:${Buffer.alloc(16).toString("base64")}`],
    ["48 bytes", `k1:${Buffer.alloc(48).toString("base64")}`],
    ["base64 inválido", `k1:${"*".repeat(43)}=`],
  ])("rechaza %s", (_caso, valor) => {
    expect(esClaveCifradoValida(valor)).toBe(false)
  })
})

describe("validarEnvCliente", () => {
  it("aplica valores por defecto a estilo y URL del sitio", () => {
    const env = validarEnvCliente(CLIENTE_VALIDO)
    expect(env.NEXT_PUBLIC_MAPBOX_STYLE).toBe(MAPBOX_ESTILO_POR_DEFECTO)
    expect(env.NEXT_PUBLIC_SITE_URL).toBe(SITIO_URL_POR_DEFECTO)
  })

  it("trata las variables vacías como ausentes", () => {
    const env = validarEnvCliente({
      ...CLIENTE_VALIDO,
      NEXT_PUBLIC_SITE_URL: "  ",
    })
    expect(env.NEXT_PUBLIC_SITE_URL).toBe(SITIO_URL_POR_DEFECTO)
  })

  it("nombra las variables que faltan sin mostrar valores", () => {
    const mensaje = mensajeDeError(() =>
      validarEnvCliente({
        NEXT_PUBLIC_SUPABASE_URL: "no-es-url",
        NEXT_PUBLIC_MAPBOX_TOKEN: "sk.secreto",
      })
    )
    expect(mensaje).toContain("NEXT_PUBLIC_SUPABASE_URL")
    expect(mensaje).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    expect(mensaje).toContain("NEXT_PUBLIC_MAPBOX_TOKEN")
    expect(mensaje).not.toContain("sk.secreto")
    expect(mensaje).not.toContain("no-es-url")
  })

  it.each([
    ["la secret key", "sb_secret_valor"],
    [
      "un JWT antiguo",
      "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x",
    ],
  ])("impide publicar %s como clave publicable", (_caso, valor) => {
    const mensaje = mensajeDeError(() =>
      validarEnvCliente({
        ...CLIENTE_VALIDO,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: valor,
      })
    )
    expect(mensaje).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    expect(mensaje).not.toContain(valor)
  })

  it("rechaza URLs que no son http(s)", () => {
    expect(() =>
      validarEnvCliente({
        ...CLIENTE_VALIDO,
        NEXT_PUBLIC_SUPABASE_URL: "ftp://x.co",
      })
    ).toThrow(ErrorEnv)
  })
})

describe("validarEnvServidor", () => {
  it("acepta la configuración mínima y convierte AMO_SMTP_CONFIGURADO", () => {
    const env = validarEnvServidor(SERVIDOR_VALIDO)
    expect(env.AMO_SMTP_CONFIGURADO).toBe(false)
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined()

    const conSmtp = validarEnvServidor({
      ...SERVIDOR_VALIDO,
      AMO_SMTP_CONFIGURADO: "true",
    })
    expect(conSmtp.AMO_SMTP_CONFIGURADO).toBe(true)
  })

  it("exige AMO_CIFRADO_KEY y AMO_SERVIDOR_SECRET", () => {
    const mensaje = mensajeDeError(() =>
      validarEnvServidor({ AMO_SERVIDOR_SECRET: "corto" })
    )
    expect(mensaje).toContain("AMO_CIFRADO_KEY")
    expect(mensaje).toContain("AMO_SERVIDOR_SECRET")
    expect(mensaje).not.toContain("corto")
  })

  it("exige SUPABASE_SECRET_KEY solo en producción", () => {
    expect(() =>
      validarEnvServidor({ ...SERVIDOR_VALIDO, VERCEL_ENV: "preview" })
    ).not.toThrow()
    expect(
      mensajeDeError(() =>
        validarEnvServidor({ ...SERVIDOR_VALIDO, VERCEL_ENV: "production" })
      )
    ).toContain("SUPABASE_SECRET_KEY")
  })

  it("exige las dos claves de Turnstile juntas", () => {
    expect(() =>
      validarEnvServidor({ ...SERVIDOR_VALIDO, TURNSTILE_SITE_KEY: "0x1" })
    ).toThrow(ErrorEnv)
    expect(
      validarEnvServidor({
        ...SERVIDOR_VALIDO,
        TURNSTILE_SITE_KEY: "0x1",
        TURNSTILE_SECRET_KEY: "0x2",
      }).TURNSTILE_SECRET_KEY
    ).toBe("0x2")
  })

  it("valida el correo del superadmin y AMO_SMTP_CONFIGURADO", () => {
    expect(() =>
      validarEnvServidor({ ...SERVIDOR_VALIDO, SUPERADMIN_EMAIL: "no-correo" })
    ).toThrow(ErrorEnv)
    expect(() =>
      validarEnvServidor({ ...SERVIDOR_VALIDO, AMO_SMTP_CONFIGURADO: "si" })
    ).toThrow(ErrorEnv)
  })
})
