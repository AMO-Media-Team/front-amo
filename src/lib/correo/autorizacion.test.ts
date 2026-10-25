import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { despachadorAutorizado } = await import("./autorizacion")

const SECRETO = "d".repeat(48)

describe("despachadorAutorizado", () => {
  it("acepta el Bearer exacto (sin distinguir mayúsculas en el esquema)", () => {
    expect(despachadorAutorizado(`Bearer ${SECRETO}`, SECRETO)).toBe(true)
    expect(despachadorAutorizado(`bearer ${SECRETO}`, SECRETO)).toBe(true)
  })

  it.each([
    ["sin cabecera", null],
    ["vacía", ""],
    ["otro esquema", `Basic ${SECRETO}`],
    ["sin esquema", SECRETO],
    ["otro secreto", `Bearer ${"e".repeat(48)}`],
    ["un prefijo del secreto", `Bearer ${SECRETO.slice(0, 20)}`],
    ["el secreto con algo más", `Bearer ${SECRETO}x`],
    ["dos valores", `Bearer ${SECRETO} ${SECRETO}`],
  ])("rechaza %s", (_caso, cabecera) => {
    expect(despachadorAutorizado(cabecera, SECRETO)).toBe(false)
  })
})
