// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const cifrado = vi.hoisted(() => ({
  descifrarCuentaPago: vi.fn(),
  descifrarNumeroDocumento: vi.fn(),
}))
vi.mock("@/features/mi-medio/cifrado-pago", () => cifrado)

import { descifrarPagos, type FilaDispersionCifrada } from "./descifrado"

function fila(
  medio: string,
  cambios: Partial<FilaDispersionCifrada> = {}
): FilaDispersionCifrada {
  return {
    liquidacion_id: `liq-${medio}`,
    medio_id: `medio-${medio}`,
    medio,
    periodo_inicio: "2026-10-01",
    periodo_fin: "2026-10-15",
    titular_nombre: " Ana Gómez ",
    tipo_documento: "CC",
    numero_documento_cifrado: "v1:doc",
    metodo_pago: "BANCARIO",
    datos_pago_cifrados: "v1:cuenta",
    monto_neto: 911_002,
    ...cambios,
  }
}

const CUENTA = {
  metodo: "BANCARIO",
  banco: "Bancolombia",
  tipoCuenta: "AHORROS",
  numero: "03012345678",
} as const

beforeEach(() => {
  vi.clearAllMocks()
  cifrado.descifrarCuentaPago.mockReturnValue(CUENTA)
  cifrado.descifrarNumeroDocumento.mockReturnValue("1085123456")
})

describe("descifrarPagos", () => {
  it("descifra con el medio de cada fila como contexto", () => {
    const resultado = descifrarPagos([fila("Radio Pasto")])
    expect(cifrado.descifrarCuentaPago).toHaveBeenCalledWith(
      "medio-Radio Pasto",
      "v1:cuenta"
    )
    expect(cifrado.descifrarNumeroDocumento).toHaveBeenCalledWith(
      "medio-Radio Pasto",
      "v1:doc"
    )
    expect(resultado).toEqual({
      ok: true,
      pagos: [
        {
          liquidacionId: "liq-Radio Pasto",
          medio: "Radio Pasto",
          tipoDocumento: "CC",
          numeroDocumento: "1085123456",
          titular: "Ana Gómez",
          cuenta: CUENTA,
          montoNeto: 911_002,
        },
      ],
    })
  })

  it("si un medio no se puede leer, no devuelve ningún dato: solo los nombres (sin repetir y en orden)", () => {
    cifrado.descifrarCuentaPago.mockImplementation((medioId: string) => {
      if (medioId === "medio-Zeta") throw new Error("ErrorCifrado")
      if (medioId === "medio-Beta") return null
      return CUENTA
    })
    const resultado = descifrarPagos([
      fila("Zeta"),
      fila("Radio Pasto"),
      fila("Beta"),
      fila("Zeta", { liquidacion_id: "otra" }),
    ])
    expect(resultado).toEqual({ ok: false, medios: ["Beta", "Zeta"] })
    expect(JSON.stringify(resultado)).not.toContain("03012345678")
  })

  it("rechaza datos incompletos o un método distinto del de la cuenta cifrada", () => {
    expect(descifrarPagos([fila("A", { titular_nombre: "  " })])).toEqual({
      ok: false,
      medios: ["A"],
    })
    expect(descifrarPagos([fila("B", { metodo_pago: "BILLETERA" })])).toEqual({
      ok: false,
      medios: ["B"],
    })
    cifrado.descifrarNumeroDocumento.mockReturnValue("")
    expect(descifrarPagos([fila("C")])).toEqual({ ok: false, medios: ["C"] })
  })
})
