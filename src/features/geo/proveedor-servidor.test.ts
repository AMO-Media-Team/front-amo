import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }))

const { obtenerProveedorGeo, usarDatosSimulados } =
  await import("./proveedor-servidor")

describe("elección del proveedor de datos geográficos", () => {
  it("usa datos simulados solo con AMO_GEO_MOCK=1 fuera de producción", () => {
    expect(
      usarDatosSimulados({ AMO_GEO_MOCK: "1", NODE_ENV: "development" })
    ).toBe(true)
    expect(usarDatosSimulados({ NODE_ENV: "development" })).toBe(false)
    expect(
      usarDatosSimulados({ AMO_GEO_MOCK: "true", NODE_ENV: "development" })
    ).toBe(false)
  })

  it("nunca en producción, aunque la variable exista", () => {
    expect(
      usarDatosSimulados({ AMO_GEO_MOCK: "1", NODE_ENV: "production" })
    ).toBe(false)
    expect(
      usarDatosSimulados({
        AMO_GEO_MOCK: "1",
        NODE_ENV: "development",
        VERCEL_ENV: "production",
      })
    ).toBe(false)
  })

  it("sin la variable, el proveedor es el de la base de datos", async () => {
    const proveedor = await obtenerProveedorGeo({ NODE_ENV: "test" })
    expect(Object.keys(proveedor).sort()).toEqual(["detalle", "mapa", "puntos"])
  })

  it("el simulado responde con origen «simulado»", async () => {
    const proveedor = await obtenerProveedorGeo({
      AMO_GEO_MOCK: "1",
      NODE_ENV: "test",
    })
    const respuesta = await proveedor.mapa({
      nivel: "nacional",
      metrica: "medios",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      departamento: null,
    })
    expect(respuesta.origen).toBe("simulado")
  })
})
