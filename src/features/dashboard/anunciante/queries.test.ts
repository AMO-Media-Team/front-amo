// @vitest-environment node
/**
 * `facturasPendientes` con Supabase simulado: el número de la factura ya
 * trae el prefijo (`numero` es la columna generada `prefijo || consecutivo`),
 * así que no se repite («DEMODEMO1»), y solo pasan los estados con saldo.
 */
import { describe, expect, it, vi } from "vitest"

const respuesta = vi.hoisted(() => ({
  data: [
    {
      id: "f1",
      numero: "DEMO1",
      total: 1000,
      saldo: "400.50",
      estado: "PAGADA_PARCIAL",
      fecha_vencimiento: "2026-10-30",
    },
    {
      id: "f2",
      numero: "DEMO2",
      total: 500,
      saldo: 0,
      estado: "PAGADA",
      fecha_vencimiento: "2026-10-01",
    },
  ],
  error: null,
}))
const seleccion = vi.hoisted(() => ({ columnas: "" }))

vi.mock("server-only", () => ({}))
vi.mock("../servidor", () => ({
  fallar: (operacion: string) => {
    throw new Error(operacion)
  },
  clientePanel: async () => ({
    from: () => {
      const cadena = {
        select: (columnas: string) => {
          seleccion.columnas = columnas
          return cadena
        },
        in: () => cadena,
        order: () => cadena,
        limit: async () => respuesta,
      }
      return cadena
    },
  }),
}))

const { facturasPendientes } = await import("./queries")

describe("facturasPendientes", () => {
  it("usa el número tal cual (ya trae el prefijo) y deja solo las que tienen saldo", async () => {
    expect(await facturasPendientes()).toEqual([
      {
        id: "f1",
        numero: "DEMO1",
        total: 1000,
        saldo: 400.5,
        estado: "PAGADA_PARCIAL",
        fechaVencimiento: "2026-10-30",
      },
    ])
    expect(seleccion.columnas).not.toContain("prefijo")
  })
})
