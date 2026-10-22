// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import type { Database } from "@/types/database.types"

vi.mock("server-only", () => ({}))

import { leerTerminosPendientes } from "./perfil-sesion"

const FILA = {
  id: "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
  tipo: "TERMINOS_MEDIO" as const,
  version: "1.0",
  vigente_desde: "2026-10-22T05:00:00+00:00",
  hash_sha256: "cd".repeat(32),
  contenido_md: "# Términos",
}

/** Cliente mínimo: solo la RPC que usa la compuerta. */
function clienteCon(respuesta: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(respuesta)
  return {
    rpc,
    cliente: { rpc } as unknown as SupabaseClient<Database>,
  }
}

describe("leerTerminosPendientes", () => {
  it("un rol interno no acepta términos: ni consulta la BD", async () => {
    const { cliente, rpc } = clienteCon({ data: [FILA], error: null })
    await expect(leerTerminosPendientes(cliente, "ADMIN")).resolves.toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(["MEDIO", "ANUNCIANTE"] as const)(
    "un rol %s recibe sus versiones pendientes",
    async (tipoRol) => {
      const { cliente, rpc } = clienteCon({ data: [FILA], error: null })
      await expect(leerTerminosPendientes(cliente, tipoRol)).resolves.toEqual([
        {
          id: FILA.id,
          tipo: "TERMINOS_MEDIO",
          version: "1.0",
          vigenteDesde: FILA.vigente_desde,
          hashSha256: FILA.hash_sha256,
          contenidoMd: "# Términos",
        },
      ])
      expect(rpc).toHaveBeenCalledWith("terminos_pendientes")
    }
  )

  it("sin versiones publicadas no hay nada pendiente", async () => {
    const { cliente } = clienteCon({ data: [], error: null })
    await expect(leerTerminosPendientes(cliente, "MEDIO")).resolves.toEqual([])
  })

  it("un fallo de la BD se propaga: la compuerta no se salta en silencio", async () => {
    const { cliente } = clienteCon({
      data: null,
      error: { code: "57014", message: "timeout" },
    })
    await expect(leerTerminosPendientes(cliente, "MEDIO")).rejects.toThrow(
      "No se pudieron consultar los términos (57014)."
    )
  })
})
