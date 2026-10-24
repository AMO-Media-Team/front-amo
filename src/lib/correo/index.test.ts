import { beforeEach, describe, expect, it, vi } from "vitest"

const estado = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  config: { data: null as unknown, error: null as unknown },
  adminFalla: false,
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/env.server", () => ({ getEnvServidor: () => estado.env }))
vi.mock("@/lib/supabase/admin", () => ({
  crearClienteAdmin: async () => {
    if (estado.adminFalla) throw new Error("sin clave")
    return {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => estado.config }),
        }),
      }),
    }
  },
}))

const { obtenerAdaptadorCorreo } = await import("./index")
const { comoHabilitado, envioCorreoHabilitado } = await import("./estado")

const MENSAJE = {
  para: "persona@ejemplo.co",
  asunto: "Asunto privado",
  html: "<p>Contenido privado</p>",
  texto: "Contenido privado",
  claveIdempotencia: "amo-correo-7",
}

describe("obtenerAdaptadorCorreo", () => {
  it("desactivado (o resend incompleto) → null: el despachador no reclama", () => {
    estado.env = { AMO_CORREO_PROVEEDOR: "desactivado" }
    expect(obtenerAdaptadorCorreo()).toBeNull()
    estado.env = { AMO_CORREO_PROVEEDOR: "resend" }
    expect(obtenerAdaptadorCorreo()).toBeNull()
  })

  it("resend con clave y remitente → adaptador de Resend", () => {
    estado.env = {
      AMO_CORREO_PROVEEDOR: "resend",
      RESEND_API_KEY: "re_x",
      AMO_CORREO_REMITENTE: "avisos@amo.co",
    }
    expect(obtenerAdaptadorCorreo()?.nombre).toBe("resend")
  })

  it("registro simula el envío sin escribir el correo en el log", async () => {
    estado.env = { AMO_CORREO_PROVEEDOR: "registro" }
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const adaptador = obtenerAdaptadorCorreo()
    expect(adaptador?.nombre).toBe("registro")
    expect(await adaptador?.enviar(MENSAJE)).toEqual({
      estado: "enviado",
      proveedorId: "registro:amo-correo-7",
    })
    const escrito = JSON.stringify(info.mock.calls)
    expect(escrito).not.toContain("@ejemplo.co")
    expect(escrito).not.toContain("privado")
  })
})

describe("envioCorreoHabilitado", () => {
  beforeEach(() => {
    estado.adminFalla = false
    estado.config = { data: null, error: null }
  })

  it("comoHabilitado solo acepta true", () => {
    expect(comoHabilitado(true)).toBe(true)
    expect(comoHabilitado("true")).toBe(true)
    expect(comoHabilitado(false)).toBe(false)
    expect(comoHabilitado(1)).toBe(false)
    expect(comoHabilitado(null)).toBe(false)
  })

  it("lee correo.habilitado; null si no se puede leer", async () => {
    estado.config = { data: { valor: true }, error: null }
    expect(await envioCorreoHabilitado()).toBe(true)
    estado.config = { data: { valor: false }, error: null }
    expect(await envioCorreoHabilitado()).toBe(false)
    estado.config = { data: null, error: { code: "42501" } }
    expect(await envioCorreoHabilitado()).toBeNull()
    estado.adminFalla = true
    expect(await envioCorreoHabilitado()).toBeNull()
  })
})
