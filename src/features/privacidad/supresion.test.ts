import { describe, expect, it, vi } from "vitest"

import {
  type AlmacenBorrado,
  archivoPermitido,
  borrarPlan,
  enLotes,
  leerResultadoSupresion,
  pendientesReintentables,
  planBorrado,
} from "./supresion"
import type { ArchivoSupresion } from "./tipos"

const PERFIL = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const OTRO_PERFIL = "0192f3a4-5b6c-7d8e-9f01-0000000000a2"
const MEDIO = "e2e00000-0000-4000-8000-00000000b001"
const OTRO_MEDIO = "e2e00000-0000-4000-8000-00000000b002"

const AVATAR: ArchivoSupresion = {
  bucket: "avatares",
  prefijo: `perfil/${PERFIL}/`,
}
const CARPETA: ArchivoSupresion = {
  bucket: "documentos",
  prefijo: `medio/${MEDIO}/`,
}
const VIDA: ArchivoSupresion = {
  bucket: "documentos",
  ruta: `medio/${MEDIO}/PRUEBA_VIDA/0192f3a4-5b6c-7d8e-9f01-0000000000f1.webm`,
}
const BANCARIA: ArchivoSupresion = {
  bucket: "documentos",
  ruta: `medio/${MEDIO}/CERT_BANCARIA/0192f3a4-5b6c-7d8e-9f01-0000000000f2.pdf`,
}
const CEDULA: ArchivoSupresion = {
  bucket: "documentos",
  ruta: `medio/${MEDIO}/CEDULA_FRENTE/0192f3a4-5b6c-7d8e-9f01-0000000000f3.webp`,
}

describe("leerResultadoSupresion", () => {
  it("lee la simulación tal como la devuelve la BD", () => {
    const resultado = leerResultadoSupresion({
      solicitud: 41,
      bloqueos: ["El medio tiene liquidaciones sin pagar."],
      cuenta: "BORRAR",
      medio: "ANONIMIZAR",
      contacto_empresa: "NINGUNO",
      solicitudes_vinculacion: 2,
      archivos: [AVATAR, VIDA],
      se_conserva: ["La bitácora de auditoría, con el correo enmascarado."],
      simulacion: true,
    })
    expect(resultado).toMatchObject({
      solicitud: 41,
      medio: "ANONIMIZAR",
      contactoEmpresa: "NINGUNO",
      solicitudesVinculacion: 2,
      archivosPendientes: null,
      simulacion: true,
    })
    expect(resultado?.archivos).toEqual([AVATAR, VIDA])
  })

  it("el resultado guardado trae los pendientes y no es una simulación", () => {
    expect(
      leerResultadoSupresion({
        solicitud: 41,
        bloqueos: [],
        cuenta: "BORRAR",
        medio: "BORRAR",
        contacto_empresa: "NINGUNO",
        archivos: [AVATAR, CARPETA],
        archivos_pendientes: [CARPETA],
        archivos_revisados_at: "2026-10-24T15:00:00-05:00",
        se_conserva: [],
      })
    ).toMatchObject({
      simulacion: false,
      solicitudesVinculacion: 0,
      archivosPendientes: [CARPETA],
      archivosRevisadosAt: "2026-10-24T15:00:00-05:00",
    })
  })

  it("un resultado anterior (sin archivos ni pendientes) se lee sin registro de Storage", () => {
    expect(
      leerResultadoSupresion({
        solicitud: 41,
        cuenta: "BORRAR",
        medio: "NINGUNA",
        contacto_empresa: "NINGUNO",
        archivos_pendientes: "no es una lista",
      })
    ).toMatchObject({ archivos: [], archivosPendientes: null })
  })

  it("devuelve null con otra forma", () => {
    expect(leerResultadoSupresion({ solicitud: "41" })).toBeNull()
    expect(leerResultadoSupresion(null)).toBeNull()
  })
})

describe("archivoPermitido", () => {
  it("la carpeta completa del medio, solo si la BD decidió borrarlo", () => {
    expect(archivoPermitido(CARPETA, { medio: "BORRAR" })).toBe(true)
    for (const medio of ["ANONIMIZAR", "CONSERVAR", "NINGUNA"] as const) {
      expect(archivoPermitido(CARPETA, { medio })).toBe(false)
    }
  })

  it("el logo del medio, solo si la BD decidió borrarlo", () => {
    const logo = { bucket: "avatares", prefijo: `medio/${MEDIO}/` }
    expect(archivoPermitido(logo, { medio: "BORRAR", medioId: MEDIO })).toBe(
      true
    )
    expect(archivoPermitido(logo, { medio: "ANONIMIZAR" })).toBe(false)
    expect(
      archivoPermitido(logo, { medio: "BORRAR", medioId: OTRO_MEDIO })
    ).toBe(false)
  })

  it("al anonimizar, solo la prueba de vida y las certificaciones de pago", () => {
    const contexto = { medio: "ANONIMIZAR" } as const
    expect(archivoPermitido(VIDA, contexto)).toBe(true)
    expect(archivoPermitido(BANCARIA, contexto)).toBe(true)
    expect(archivoPermitido(CEDULA, contexto)).toBe(false)
    expect(archivoPermitido(VIDA, { medio: "CONSERVAR" })).toBe(false)
  })

  it("con el titular y su medio conocidos, solo los suyos", () => {
    const contexto = {
      medio: "BORRAR",
      perfilId: PERFIL,
      medioId: MEDIO,
    } as const
    expect(archivoPermitido(AVATAR, contexto)).toBe(true)
    expect(archivoPermitido(CARPETA, contexto)).toBe(true)
    expect(
      archivoPermitido(
        { bucket: "avatares", prefijo: `perfil/${OTRO_PERFIL}/` },
        contexto
      )
    ).toBe(false)
    expect(
      archivoPermitido(
        { bucket: "documentos", prefijo: `medio/${OTRO_MEDIO}/` },
        contexto
      )
    ).toBe(false)
  })

  it("rechaza carpetas amplias, otros buckets y rutas con trampas", () => {
    const contexto = { medio: "BORRAR" } as const
    for (const archivo of [
      { bucket: "documentos", prefijo: "medio/" },
      { bucket: "documentos", prefijo: "" },
      { bucket: "soportes", prefijo: `medio/${MEDIO}/` },
      { bucket: "avatares", prefijo: `anunciante/${MEDIO}/` },
      { bucket: "documentos", ruta: `medio/${MEDIO}/../otro/archivo.pdf` },
      { bucket: "documentos", ruta: `anunciante/${MEDIO}/x.pdf` },
      { bucket: "avatares", ruta: `perfil/${PERFIL}/foto.webp` },
    ]) {
      expect(archivoPermitido(archivo, contexto), JSON.stringify(archivo)).toBe(
        false
      )
    }
  })
})

describe("planBorrado", () => {
  it("agrupa por bucket, quita repetidos y cuenta lo rechazado", () => {
    const plan = planBorrado(
      [AVATAR, AVATAR, VIDA, VIDA, BANCARIA, CEDULA, CARPETA],
      { medio: "ANONIMIZAR" }
    )
    expect(plan.prefijos).toEqual([AVATAR])
    expect(plan.rutas.get("documentos")).toEqual([VIDA.ruta, BANCARIA.ruta])
    // La cédula se conserva y la carpeta completa no se borra al anonimizar.
    expect(plan.rechazados).toBe(2)
  })

  it("sin ids en el contexto, nunca mezcla dos personas ni dos medios", () => {
    const plan = planBorrado(
      [
        AVATAR,
        { bucket: "avatares", prefijo: `perfil/${OTRO_PERFIL}/` },
        VIDA,
        {
          bucket: "documentos",
          ruta: `medio/${OTRO_MEDIO}/PRUEBA_VIDA/x.webm`,
        },
      ],
      { medio: "ANONIMIZAR" }
    )
    expect(plan.prefijos).toEqual([AVATAR])
    expect(plan.rutas.get("documentos")).toEqual([VIDA.ruta])
    expect(plan.rechazados).toBe(2)
  })
})

describe("pendientesReintentables", () => {
  it("solo los que la BD pidió borrar al ejecutar", () => {
    expect(
      pendientesReintentables({
        archivos: [AVATAR, CARPETA],
        archivosPendientes: [
          CARPETA,
          { bucket: "documentos", prefijo: `medio/${OTRO_MEDIO}/` },
        ],
      })
    ).toEqual([CARPETA])
    expect(
      pendientesReintentables({ archivos: [AVATAR], archivosPendientes: null })
    ).toEqual([])
  })
})

function almacen(
  cambios: Partial<AlmacenBorrado> = {}
): AlmacenBorrado & { borrados: string[] } {
  const borrados: string[] = []
  return {
    borrados,
    listar: vi.fn(async (_bucket: string, carpeta: string) => [
      `${carpeta}/CEDULA_FRENTE/a.webp`,
      `${carpeta}/RUT/b.pdf`,
    ]),
    borrar: vi.fn(async (bucket: string, rutas: string[]) => {
      borrados.push(...rutas.map((ruta) => `${bucket}:${ruta}`))
      return rutas.length
    }),
    derivadas: (ruta) => [ruta.replace(/\.[a-z]+$/, "-mini.webp")],
    informar: vi.fn(),
    ...cambios,
  }
}

describe("borrarPlan", () => {
  it("lista las carpetas, agrega las miniaturas y cuenta lo borrado", async () => {
    const storage = almacen()
    const resultado = await borrarPlan(
      planBorrado([AVATAR, CARPETA], {
        medio: "BORRAR",
        perfilId: PERFIL,
        medioId: MEDIO,
      }),
      storage
    )
    expect(resultado).toEqual({ borrados: 4, pendientes: [], rechazados: 0 })
    expect(storage.listar).toHaveBeenCalledWith("avatares", `perfil/${PERFIL}`)
    expect(storage.listar).toHaveBeenCalledWith("documentos", `medio/${MEDIO}`)
  })

  it("una carpeta que no se pudo listar queda pendiente completa", async () => {
    const storage = almacen({
      listar: vi.fn(async (bucket: string, carpeta: string) => {
        if (bucket === "documentos") throw new Error("503")
        return [`${carpeta}/foto.webp`]
      }),
    })
    const resultado = await borrarPlan(
      planBorrado([AVATAR, CARPETA], { medio: "BORRAR" }),
      storage
    )
    expect(resultado.borrados).toBe(1)
    expect(resultado.pendientes).toEqual([CARPETA])
    expect(storage.informar).toHaveBeenCalledWith(
      "listar documentos para la supresión",
      expect.any(Error)
    )
  })

  it("un lote fallido deja pendiente el archivo de la BD de donde salió (no su miniatura)", async () => {
    const storage = almacen({
      borrar: vi.fn(async () => {
        throw new Error("500")
      }),
    })
    const resultado = await borrarPlan(
      planBorrado([VIDA, BANCARIA], { medio: "ANONIMIZAR" }),
      storage
    )
    expect(resultado).toEqual({
      borrados: 0,
      pendientes: [VIDA, BANCARIA],
      rechazados: 0,
    })
  })

  it("informa lo rechazado sin tocarlo", async () => {
    const storage = almacen()
    const resultado = await borrarPlan(
      planBorrado([CARPETA], { medio: "ANONIMIZAR", medioId: MEDIO }),
      storage
    )
    expect(resultado).toEqual({ borrados: 0, pendientes: [], rechazados: 1 })
    expect(storage.listar).not.toHaveBeenCalled()
    expect(storage.borrar).not.toHaveBeenCalled()
  })
})

describe("enLotes", () => {
  it("parte la lista en lotes del tamaño pedido", () => {
    expect(enLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(enLotes([], 2)).toEqual([])
  })
})
