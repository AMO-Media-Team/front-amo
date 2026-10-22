import { createHash, randomBytes } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

import { aHex, Sha256Incremental, sha256Hex } from "./sha256"

const texto = (valor: string) => new TextEncoder().encode(valor)
const deNode = (datos: Uint8Array) =>
  createHash("sha256").update(datos).digest("hex")

describe("Sha256Incremental", () => {
  it("cumple los vectores de FIPS 180-4", () => {
    expect(aHex(new Sha256Incremental().digerir())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    expect(
      aHex(new Sha256Incremental().actualizar(texto("abc")).digerir())
    ).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(
      aHex(
        new Sha256Incremental()
          .actualizar(
            texto("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
          )
          .digerir()
      )
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1")
  })

  it("da lo mismo que Node para cualquier corte en bloques", () => {
    // Longitudes alrededor del relleno (55, 56, 63, 64) y varios bloques.
    for (const largo of [1, 55, 56, 63, 64, 65, 119, 120, 1000, 70_001]) {
      const datos = new Uint8Array(randomBytes(largo))
      const esperado = deNode(datos)
      for (const corte of [1, 7, 64, 333, largo]) {
        const hash = new Sha256Incremental()
        for (let i = 0; i < largo; i += corte) {
          hash.actualizar(datos.subarray(i, i + corte))
        }
        expect(aHex(hash.digerir()), `largo ${largo}, corte ${corte}`).toBe(
          esperado
        )
      }
    }
  })

  it("no admite seguir después de digerir", () => {
    const hash = new Sha256Incremental()
    hash.digerir()
    expect(() => hash.actualizar(texto("x"))).toThrow()
    expect(() => hash.digerir()).toThrow()
  })
})

describe("sha256Hex", () => {
  const datos = new Uint8Array(randomBytes(9 * 1024 * 1024 + 17))
  const archivo = new Blob([datos])
  const esperado = deNode(datos)

  it("usa Web Crypto en archivos pequeños", async () => {
    const progreso = vi.fn()
    await expect(sha256Hex(archivo, { alProgresar: progreso })).resolves.toBe(
      esperado
    )
    expect(progreso).toHaveBeenLastCalledWith(1)
  })

  it("lee por bloques los archivos grandes y avisa el progreso", async () => {
    const progreso = vi.fn()
    await expect(
      sha256Hex(archivo, { umbralNativoBytes: 0, alProgresar: progreso })
    ).resolves.toBe(esperado)
    // 9 MB en bloques de 4 MB: tres lecturas.
    expect(progreso).toHaveBeenCalledTimes(3)
    expect(progreso).toHaveBeenLastCalledWith(1)
  })

  it("se detiene si se cancela", async () => {
    const controlador = new AbortController()
    controlador.abort()
    await expect(
      sha256Hex(archivo, { umbralNativoBytes: 0, senal: controlador.signal })
    ).rejects.toThrow()
  })
})
