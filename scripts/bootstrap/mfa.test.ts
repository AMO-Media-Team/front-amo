// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { codigoTotpNuevo, marcarTotpUsado } from "./mfa"
import { codigoTotp } from "./totp"

const SECRETO = "JBSWY3DPEHPK3PXP"
/** Un instante con 20 s por delante en su periodo de 30 s. */
const INICIO = Date.UTC(2026, 9, 23, 22, 0, 10)

describe("codigoTotpNuevo", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(INICIO)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("da el código del periodo vigente si ese secreto no lo ha gastado", async () => {
    await expect(codigoTotpNuevo(`${SECRETO}A`)).resolves.toBe(
      codigoTotp(`${SECRETO}A`, INICIO)
    )
  })

  it("no repite un periodo ya gastado con el mismo secreto: espera al siguiente", async () => {
    const secreto = `${SECRETO}B`
    const primero = await codigoTotpNuevo(secreto)
    const segundo = codigoTotpNuevo(secreto)
    await vi.advanceTimersByTimeAsync(25_000)
    const siguiente = await segundo
    expect(siguiente).toBe(codigoTotp(secreto, INICIO + 30_000))
    expect(siguiente).not.toBe(primero)
  })

  it("marcarTotpUsado reserva el periodo (p. ej. tras enrolar el factor)", async () => {
    const secreto = `${SECRETO}C`
    marcarTotpUsado(secreto)
    const codigo = codigoTotpNuevo(secreto)
    await vi.advanceTimersByTimeAsync(25_000)
    await expect(codigo).resolves.toBe(codigoTotp(secreto, INICIO + 30_000))
  })

  it("cada secreto lleva su propia cuenta", async () => {
    await codigoTotpNuevo(`${SECRETO}D`)
    await expect(codigoTotpNuevo(`${SECRETO}E`)).resolves.toBe(
      codigoTotp(`${SECRETO}E`, INICIO)
    )
  })
})
