// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import { crearCifrador } from "@/lib/cifrado"

import { datosRpcPago, huellaDocumento } from "./cifrado-pago"
import { contextoCifrado, leerCuentaPago } from "./datos-pago"
import type { DatosPagoMedio } from "./schemas"

vi.mock("server-only", () => ({}))

const LLAVE = `k1:${Buffer.alloc(32, 7).toString("base64")}`
const cifrador = crearCifrador({ actual: LLAVE })
const MEDIO = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
const OTRO_MEDIO = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c"

/** CHECK de `medios_privado` (cifrados) y de la huella. */
const CHECK_CIFRADO =
  /^v[0-9]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+$/
const CHECK_HUELLA = /^[0-9a-f]{64}$/

function datos(parcial: Partial<DatosPagoMedio> = {}): DatosPagoMedio {
  return {
    titularNombre: "Ana María Pérez",
    tipoDocumento: "CC",
    numeroDocumento: "1023456789",
    cuenta: {
      metodo: "BILLETERA",
      proveedor: "Nequi",
      numero: "3001234821",
    },
    esDeclarante: false,
    obligadoFacturar: true,
    responsableIva: false,
    ...parcial,
  }
}

describe("huellaDocumento", () => {
  it("el mismo número con dos tipos no choca", () => {
    const cc = huellaDocumento("CC", "1023456789", cifrador)
    const ce = huellaDocumento("CE", "1023456789", cifrador)
    expect(cc).toMatch(CHECK_HUELLA)
    expect(cc).not.toBe(ce)
  })

  it("es estable: la unicidad la compara la BD", () => {
    expect(huellaDocumento("CC", "1023456789", cifrador)).toBe(
      cifrador.huella("CC:1023456789")
    )
  })
})

describe("datosRpcPago", () => {
  it("cifra el número y la cuenta con el contexto de su fila y columna", () => {
    const p = datosRpcPago(MEDIO, datos(), cifrador)
    expect(p).toMatchObject({
      titular_nombre: "Ana María Pérez",
      tipo_documento: "CC",
      numero_documento_resumen: "•••• 6789",
      metodo_pago: "BILLETERA",
      datos_pago_resumen: "Nequi •••• 4821",
      es_declarante: false,
      obligado_facturar: true,
      responsable_iva: false,
    })
    expect(p.numero_documento_cifrado).toMatch(CHECK_CIFRADO)
    expect(p.datos_pago_cifrados).toMatch(CHECK_CIFRADO)
    expect(p.numero_documento_hash).toBe(
      huellaDocumento("CC", "1023456789", cifrador)
    )

    const documento = String(p.numero_documento_cifrado)
    const cuenta = String(p.datos_pago_cifrados)
    expect(
      cifrador.descifrar(
        documento,
        contextoCifrado(MEDIO, "numero_documento_cifrado")
      )
    ).toBe("1023456789")
    expect(
      leerCuentaPago(
        cifrador.descifrar(
          cuenta,
          contextoCifrado(MEDIO, "datos_pago_cifrados")
        )
      )
    ).toEqual(datos().cuenta)
  })

  it("lo cifrado no sirve copiado en otra fila ni en otra columna", () => {
    const p = datosRpcPago(MEDIO, datos(), cifrador)
    const cuenta = String(p.datos_pago_cifrados)
    expect(() =>
      cifrador.descifrar(
        cuenta,
        contextoCifrado(OTRO_MEDIO, "datos_pago_cifrados")
      )
    ).toThrow()
    expect(() =>
      cifrador.descifrar(
        cuenta,
        contextoCifrado(MEDIO, "numero_documento_cifrado")
      )
    ).toThrow()
  })

  it("nunca pone valores en claro en la carga de la RPC", () => {
    const texto = JSON.stringify(datosRpcPago(MEDIO, datos(), cifrador))
    expect(texto).not.toContain("1023456789")
    expect(texto).not.toContain("3001234821")
  })

  it("lo que no se escribió de nuevo no viaja: la BD lo conserva", () => {
    const p = datosRpcPago(
      MEDIO,
      datos({ numeroDocumento: null, cuenta: null }),
      cifrador
    )
    expect(Object.keys(p).sort()).toEqual([
      "es_declarante",
      "obligado_facturar",
      "responsable_iva",
      "tipo_documento",
      "titular_nombre",
    ])
  })

  it("una cuenta bancaria lleva el banco en el resumen, sin pasar de 60", () => {
    const p = datosRpcPago(
      MEDIO,
      datos({
        cuenta: {
          metodo: "BANCARIO",
          banco:
            "Banco Cooperativo de Ahorro y Crédito del Suroccidente Colombiano",
          tipoCuenta: "CORRIENTE",
          numero: "000123456789",
        },
      }),
      cifrador
    )
    expect(p.metodo_pago).toBe("BANCARIO")
    expect(String(p.datos_pago_resumen)).toMatch(/… •••• 6789$/)
    expect(String(p.datos_pago_resumen).length).toBeLessThanOrEqual(60)
  })
})
