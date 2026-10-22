import { createHash } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

import type { ClienteSupabase } from "./supabase"
import {
  aceptarTerminosVigentes,
  AGENTE_ACEPTACION_E2E,
  huellaCorreo,
  TERMINOS_POR_ROL,
  tipoRolExterno,
  type VersionPublicada,
  versionesPorAceptar,
  vigentesPorTipo,
} from "./terminos-e2e"

const AHORA = new Date("2026-10-22T15:00:00Z")

function version(
  id: string,
  tipo: VersionPublicada["tipo"],
  vigenteDesde: string | null,
  creada = "2026-10-01T00:00:00Z"
): VersionPublicada {
  return { id, tipo, vigente_desde: vigenteDesde, created_at: creada }
}

describe("tipoRolExterno", () => {
  it("solo anunciantes y medios aceptan términos", () => {
    expect(tipoRolExterno("MEDIO")).toBe("MEDIO")
    expect(tipoRolExterno("ANUNCIANTE")).toBe("ANUNCIANTE")
    expect(tipoRolExterno("ADMIN")).toBeNull()
    expect(tipoRolExterno("SUPERADMIN")).toBeNull()
  })
})

describe("TERMINOS_POR_ROL", () => {
  it("coincide con lo que exige terminos_pendientes()", () => {
    expect(TERMINOS_POR_ROL.MEDIO).toEqual([
      "TERMINOS_MEDIO",
      "POLITICA_DATOS",
      "CONDICIONES_COMERCIALES",
    ])
    expect(TERMINOS_POR_ROL.ANUNCIANTE).toEqual([
      "TERMINOS_ANUNCIANTE",
      "POLITICA_DATOS",
      "CONDICIONES_COMERCIALES",
    ])
  })
})

describe("vigentesPorTipo", () => {
  it("elige por tipo la versión con la vigencia más reciente ya alcanzada", () => {
    const vigentes = vigentesPorTipo(
      [
        version("vieja", "POLITICA_DATOS", "2026-01-01T00:00:00Z"),
        version("actual", "POLITICA_DATOS", "2026-09-01T00:00:00Z"),
        version("futura", "POLITICA_DATOS", "2026-12-01T00:00:00Z"),
        version("medio", "TERMINOS_MEDIO", "2026-10-22T15:00:00Z"),
      ],
      AHORA
    )
    expect(vigentes.map((v) => v.id).sort()).toEqual(["actual", "medio"])
  })

  it("con la misma vigencia gana la creada después", () => {
    const vigentes = vigentesPorTipo(
      [
        version(
          "a",
          "POLITICA_DATOS",
          "2026-09-01T00:00:00Z",
          "2026-09-01T10:00:00Z"
        ),
        version(
          "b",
          "POLITICA_DATOS",
          "2026-09-01T00:00:00Z",
          "2026-09-02T10:00:00Z"
        ),
      ],
      AHORA
    )
    expect(vigentes.map((v) => v.id)).toEqual(["b"])
  })

  it("ignora las versiones sin fecha de vigencia y las que aún no rigen", () => {
    expect(
      vigentesPorTipo(
        [
          version("sin-fecha", "TERMINOS_MEDIO", null),
          version("futura", "TERMINOS_MEDIO", "2026-10-22T15:00:01Z"),
        ],
        AHORA
      )
    ).toEqual([])
  })
})

describe("versionesPorAceptar", () => {
  const vigentes = [
    version("tm", "TERMINOS_MEDIO", "2026-09-01T00:00:00Z"),
    version("ta", "TERMINOS_ANUNCIANTE", "2026-09-01T00:00:00Z"),
    version("pd", "POLITICA_DATOS", "2026-09-01T00:00:00Z"),
  ]

  it("solo las que exige el rol y aún no aceptó", () => {
    expect(versionesPorAceptar("MEDIO", vigentes, new Set())).toEqual([
      "tm",
      "pd",
    ])
    expect(
      versionesPorAceptar("ANUNCIANTE", vigentes, new Set(["pd"]))
    ).toEqual(["ta"])
  })

  it("nada si ya aceptó todo o no hay textos publicados", () => {
    expect(
      versionesPorAceptar("MEDIO", vigentes, new Set(["tm", "pd"]))
    ).toEqual([])
    expect(versionesPorAceptar("MEDIO", [], new Set())).toEqual([])
  })
})

describe("huellaCorreo", () => {
  it("es el sha256 del correo en minúsculas, como el trigger de sellado", () => {
    const esperado = createHash("sha256")
      .update("e2e.medio@amo.test", "utf8")
      .digest("hex")
    expect(huellaCorreo("E2E.Medio@AMO.test")).toBe(esperado)
    expect(huellaCorreo("e2e.medio@amo.test")).toMatch(/^[0-9a-f]{64}$/)
  })
})

/** Cliente de servicio falso: lecturas fijas y registro de lo insertado. */
function clienteFalso(
  versiones: VersionPublicada[],
  aceptadas: string[],
  errorInsercion: { message: string } | null = null
) {
  const insertar = vi.fn(async (_filas: unknown) => ({ error: errorInsercion }))
  const from = (tabla: string) => {
    if (tabla === "terminos_versiones") {
      return {
        select: () => ({
          eq: async () => ({ data: versiones, error: null }),
        }),
      }
    }
    return {
      select: () => ({
        eq: async () => ({
          data: aceptadas.map((id) => ({ termino_version_id: id })),
          error: null,
        }),
      }),
      insert: insertar,
    }
  }
  return { cliente: { from } as unknown as ClienteSupabase, insertar }
}

const CUENTA = {
  id: "e2e00000-0000-4000-8000-00000000c001",
  email: "e2e.medio@amo.test",
  tipoRol: "MEDIO" as const,
}

describe("aceptarTerminosVigentes", () => {
  it("acepta lo vigente que falta, con la huella del correo y la marca del aprovisionamiento", async () => {
    const { cliente, insertar } = clienteFalso(
      [
        version("tm", "TERMINOS_MEDIO", "2026-09-01T00:00:00Z"),
        version("pd", "POLITICA_DATOS", "2026-09-01T00:00:00Z"),
        version("ta", "TERMINOS_ANUNCIANTE", "2026-09-01T00:00:00Z"),
      ],
      ["pd"]
    )
    await expect(aceptarTerminosVigentes(cliente, CUENTA)).resolves.toBe(1)
    expect(insertar).toHaveBeenCalledWith([
      {
        perfil_id: CUENTA.id,
        termino_version_id: "tm",
        email_sha256: huellaCorreo(CUENTA.email),
        user_agent: AGENTE_ACEPTACION_E2E,
      },
    ])
  })

  it("no escribe nada si no hay textos publicados o ya estaban aceptados", async () => {
    const vacio = clienteFalso([], [])
    await expect(aceptarTerminosVigentes(vacio.cliente, CUENTA)).resolves.toBe(
      0
    )
    expect(vacio.insertar).not.toHaveBeenCalled()

    const aceptado = clienteFalso(
      [version("tm", "TERMINOS_MEDIO", "2026-09-01T00:00:00Z")],
      ["tm"]
    )
    await expect(
      aceptarTerminosVigentes(aceptado.cliente, CUENTA)
    ).resolves.toBe(0)
    expect(aceptado.insertar).not.toHaveBeenCalled()
  })

  it("informa el error de la base con el correo de la cuenta", async () => {
    const { cliente } = clienteFalso(
      [version("tm", "TERMINOS_MEDIO", "2026-09-01T00:00:00Z")],
      [],
      { message: "permiso denegado" }
    )
    await expect(aceptarTerminosVigentes(cliente, CUENTA)).rejects.toThrow(
      /e2e\.medio@amo\.test: permiso denegado/
    )
  })
})
