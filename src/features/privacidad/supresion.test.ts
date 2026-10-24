import { describe, expect, it } from "vitest"

import {
  archivoPermitido,
  enLotes,
  leerResultadoSupresion,
  planBorrado,
} from "./supresion"

const PERFIL = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const MEDIO = "e2e00000-0000-4000-8000-00000000b001"

describe("leerResultadoSupresion", () => {
  it("lee la simulación tal como la devuelve la BD", () => {
    const resultado = leerResultadoSupresion({
      solicitud: 41,
      bloqueos: ["El medio tiene liquidaciones sin pagar."],
      cuenta: "BORRAR",
      medio: "ANONIMIZAR",
      contacto_empresa: "NINGUNO",
      archivos: [
        { bucket: "avatares", prefijo: `perfil/${PERFIL}/` },
        { bucket: "documentos", ruta: `medio/${MEDIO}/PRUEBA_VIDA/x.webp` },
      ],
      se_conserva: ["La bitácora de auditoría, con el correo enmascarado."],
      simulacion: true,
    })
    expect(resultado).toMatchObject({
      solicitud: 41,
      medio: "ANONIMIZAR",
      contactoEmpresa: "NINGUNO",
      simulacion: true,
    })
    expect(resultado?.archivos).toHaveLength(2)
  })

  it("el resultado guardado (sin archivos) no es una simulación", () => {
    expect(
      leerResultadoSupresion({
        solicitud: 41,
        bloqueos: [],
        cuenta: "BORRAR",
        medio: "BORRAR",
        contacto_empresa: "NINGUNO",
        se_conserva: [],
      })
    ).toMatchObject({ simulacion: false, archivos: [] })
  })

  it("devuelve null con otra forma", () => {
    expect(leerResultadoSupresion({ solicitud: "41" })).toBeNull()
    expect(leerResultadoSupresion(null)).toBeNull()
  })
})

describe("archivoPermitido", () => {
  it("acepta el avatar del perfil y la carpeta o un documento del medio", () => {
    expect(
      archivoPermitido({ bucket: "avatares", prefijo: `perfil/${PERFIL}/` })
    ).toBe(true)
    expect(
      archivoPermitido({ bucket: "documentos", prefijo: `medio/${MEDIO}/` })
    ).toBe(true)
    expect(
      archivoPermitido({
        bucket: "documentos",
        ruta: `medio/${MEDIO}/CERT_BANCARIA/0192f3a4-5b6c-7d8e-9f01-0000000000f1.pdf`,
      })
    ).toBe(true)
  })

  it("rechaza carpetas amplias, otros buckets y rutas con trampas", () => {
    expect(archivoPermitido({ bucket: "documentos", prefijo: "medio/" })).toBe(
      false
    )
    expect(archivoPermitido({ bucket: "documentos", prefijo: "" })).toBe(false)
    expect(
      archivoPermitido({ bucket: "soportes", prefijo: `medio/${MEDIO}/` })
    ).toBe(false)
    expect(
      archivoPermitido({ bucket: "avatares", prefijo: `medio/${MEDIO}/` })
    ).toBe(false)
    expect(
      archivoPermitido({
        bucket: "documentos",
        ruta: `medio/${MEDIO}/../otro/archivo.pdf`,
      })
    ).toBe(false)
    expect(
      archivoPermitido({
        bucket: "documentos",
        ruta: `anunciante/${MEDIO}/x.pdf`,
      })
    ).toBe(false)
  })
})

describe("planBorrado", () => {
  it("agrupa por bucket, quita repetidos y cuenta lo rechazado", () => {
    const plan = planBorrado([
      { bucket: "avatares", prefijo: `perfil/${PERFIL}/` },
      { bucket: "avatares", prefijo: `perfil/${PERFIL}/` },
      { bucket: "documentos", ruta: `medio/${MEDIO}/PRUEBA_VIDA/a.webp` },
      { bucket: "documentos", ruta: `medio/${MEDIO}/PRUEBA_VIDA/a.webp` },
      { bucket: "documentos", ruta: `medio/${MEDIO}/CERT_BANCARIA/b.pdf` },
      { bucket: "documentos", prefijo: "medio/" },
    ])
    expect(plan.prefijos).toEqual([
      { bucket: "avatares", prefijo: `perfil/${PERFIL}/` },
    ])
    expect(plan.rutas.get("documentos")).toEqual([
      `medio/${MEDIO}/PRUEBA_VIDA/a.webp`,
      `medio/${MEDIO}/CERT_BANCARIA/b.pdf`,
    ])
    expect(plan.rechazados).toBe(1)
  })
})

describe("enLotes", () => {
  it("parte la lista en lotes del tamaño pedido", () => {
    expect(enLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(enLotes([], 2)).toEqual([])
  })
})
