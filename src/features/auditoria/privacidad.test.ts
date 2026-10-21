import { describe, expect, it } from "vitest"

import { enmascararIp, ipVisible } from "./privacidad"

describe("enmascararIp", () => {
  it("IPv4 conserva los dos primeros octetos", () => {
    expect(enmascararIp("181.52.10.200")).toBe("181.52.•••.•••")
    expect(enmascararIp("10.0.0.1/32")).toBe("10.0.•••.•••")
  })

  it("IPv6 conserva los dos primeros grupos", () => {
    expect(enmascararIp("2800:e2:1a80:3c::1")).toBe("2800:e2:•••")
  })

  it("lo que no se reconoce se oculta del todo", () => {
    expect(enmascararIp("::1")).toBe("•••")
    expect(enmascararIp("999.1.1.1")).toBe("•••")
    expect(enmascararIp(null)).toBeNull()
  })
})

describe("ipVisible", () => {
  it("completa (sin la máscara de red) solo con permiso", () => {
    expect(ipVisible("181.52.10.200/32", true)).toBe("181.52.10.200")
    expect(ipVisible("181.52.10.200", false)).toBe("181.52.•••.•••")
  })

  it("sin IP o con un valor que no es texto, nada", () => {
    expect(ipVisible(null, true)).toBeNull()
    expect(ipVisible("  ", false)).toBeNull()
    expect(ipVisible({ ip: "1.1.1.1" }, true)).toBeNull()
  })
})
