// @vitest-environment node
import { describe, expect, it } from "vitest"

import { claveConexion, expandirIpv6, huellaConexion } from "./ip"

describe("expandirIpv6", () => {
  it("rellena los grupos omitidos con «::»", () => {
    expect(expandirIpv6("2001:db8::1")).toEqual([
      "2001",
      "0db8",
      "0000",
      "0000",
      "0000",
      "0000",
      "0000",
      "0001",
    ])
    expect(expandirIpv6("::1")).toHaveLength(8)
    expect(expandirIpv6("FE80:0:0:0:0:0:0:1")[0]).toBe("fe80")
  })

  it("convierte la IPv4 incrustada al final", () => {
    expect(expandirIpv6("::ffff:192.0.2.128").slice(5)).toEqual([
      "ffff",
      "c000",
      "0280",
    ])
  })
})

describe("claveConexion", () => {
  it("usa la IPv4 tal cual", () => {
    expect(claveConexion("198.51.100.7")).toBe("198.51.100.7")
    expect(claveConexion(" 198.51.100.7 ")).toBe("198.51.100.7")
  })

  it("trata la IPv6 mapeada como su IPv4", () => {
    expect(claveConexion("::ffff:198.51.100.7")).toBe("198.51.100.7")
    expect(claveConexion("::ffff:c633:6407")).toBe("198.51.100.7")
  })

  it("agrupa una IPv6 por su red /64", () => {
    const a = claveConexion("2001:db8:85a3:8d3:1319:8a2e:370:7348")
    const b = claveConexion("2001:db8:85a3:8d3::1")
    expect(a).toBe("2001:0db8:85a3:08d3::/64")
    expect(b).toBe(a)
    expect(claveConexion("2001:db8:85a3:8d4::1")).not.toBe(a)
  })

  it("ignora el índice de zona", () => {
    expect(claveConexion("fe80::1%en0")).toBe("fe80:0000:0000:0000::/64")
  })

  it("devuelve null sin una IP válida", () => {
    expect(claveConexion(null)).toBeNull()
    expect(claveConexion("")).toBeNull()
    expect(claveConexion("no-es-ip")).toBeNull()
    expect(claveConexion("999.1.1.1")).toBeNull()
  })
})

describe("huellaConexion", () => {
  const SECRETO = "secreto-de-prueba-con-longitud-suficiente"

  it("es un hex de 64 caracteres (CHECK de la BD) y estable", () => {
    const huella = huellaConexion("198.51.100.7", SECRETO)
    expect(huella).toMatch(/^[0-9a-f]{64}$/)
    expect(huellaConexion("198.51.100.7", SECRETO)).toBe(huella)
  })

  it("no revela la IP y depende del secreto", () => {
    const huella = huellaConexion("198.51.100.7", SECRETO)
    expect(huella).not.toContain("198")
    expect(huellaConexion("198.51.100.7", `${SECRETO}-otro`)).not.toBe(huella)
    expect(huellaConexion("198.51.100.8", SECRETO)).not.toBe(huella)
  })

  it("es la misma para dos direcciones de la misma red IPv6", () => {
    expect(huellaConexion("2001:db8:1:2::a", SECRETO)).toBe(
      huellaConexion("2001:db8:1:2::b", SECRETO)
    )
  })

  it("sin IP no hay huella (y la BD no aplica el límite)", () => {
    expect(huellaConexion(null, SECRETO)).toBeNull()
  })
})
