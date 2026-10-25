import { describe, expect, it } from "vitest"

import {
  esquemaAportar,
  esquemaEjecutarSupresion,
  esquemaPrepararSoporte,
  esquemaProrrogar,
  esquemaRadicar,
  esquemaRequerir,
  esquemaResponder,
  LIMITES_DESCRIPCION,
  LIMITES_RESPUESTA,
} from "./schemas"

const ID = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"

function mensajes(resultado: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}): Record<string, string> {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((issue) => [
      issue.path.join("."),
      issue.message,
    ])
  )
}

describe("esquemaRadicar", () => {
  it("acepta tipo, descripción recortada y datos afectados", () => {
    const resultado = esquemaRadicar.parse({
      tipo: "SUPRESION",
      descripcion: "   Quiero que borren mis datos.   ",
      datosAfectados: ["CONTACTO", "PAGO"],
    })
    expect(resultado.descripcion).toBe("Quiero que borren mis datos.")
  })

  it("pide el tipo y una descripción de al menos 10 caracteres", () => {
    const errores = mensajes(
      esquemaRadicar.safeParse({ descripcion: "corta", datosAfectados: [] })
    )
    expect(errores.tipo).toBe("Elige qué quieres pedir.")
    expect(errores.descripcion).toBe(
      `Describe tu solicitud con al menos ${LIMITES_DESCRIPCION.minimo} caracteres.`
    )
  })

  it("rechaza datos desconocidos o repetidos", () => {
    expect(
      esquemaRadicar.safeParse({
        tipo: "CONSULTA",
        descripcion: "Quiero saber qué datos tienen.",
        datosAfectados: ["BIOMETRIA"],
      }).success
    ).toBe(false)
    expect(
      esquemaRadicar.safeParse({
        tipo: "CONSULTA",
        descripcion: "Quiero saber qué datos tienen.",
        datosAfectados: ["CONTACTO", "CONTACTO"],
      }).success
    ).toBe(false)
  })

  it("respeta el máximo de la BD", () => {
    expect(
      esquemaRadicar.safeParse({
        tipo: "CONSULTA",
        descripcion: "a".repeat(LIMITES_DESCRIPCION.maximo + 1),
        datosAfectados: [],
      }).success
    ).toBe(false)
  })
})

describe("esquemas del equipo", () => {
  it("el requerimiento y la prórroga piden al menos 10 caracteres", () => {
    expect(
      mensajes(
        esquemaRequerir.safeParse({ solicitudId: ID, requerimiento: "x" })
      ).requerimiento
    ).toContain("al menos 10")
    expect(
      mensajes(esquemaProrrogar.safeParse({ solicitudId: ID, motivo: "corto" }))
        .motivo
    ).toContain("al menos 10")
  })

  it("la respuesta pide decisión y 20 caracteres; el soporte es opcional", () => {
    const errores = mensajes(
      esquemaResponder.safeParse({
        solicitudId: ID,
        respuesta: "Procede.",
        soportePath: null,
      })
    )
    expect(errores.decision).toBe("Elige la decisión.")
    expect(errores.respuesta).toContain(`al menos ${LIMITES_RESPUESTA.minimo}`)
    expect(
      esquemaResponder.safeParse({
        solicitudId: ID,
        decision: "PROCEDE",
        respuesta: "Procede: suprimimos tu cuenta y tus datos.",
        soportePath: null,
      }).success
    ).toBe(true)
  })

  it("el soporte solo puede ser un PDF", () => {
    const descripcion = {
      nombre: "respuesta.png",
      tipo: "image/png",
      tamano: 1000,
      sha256: null,
      dimensiones: null,
      duracionSeg: null,
      conMiniatura: false,
    }
    expect(
      esquemaPrepararSoporte.safeParse({
        solicitudId: ID,
        archivo: descripcion,
      }).success
    ).toBe(false)
    expect(
      esquemaPrepararSoporte.safeParse({
        solicitudId: ID,
        archivo: {
          ...descripcion,
          nombre: "respuesta.pdf",
          tipo: "application/pdf",
        },
      }).success
    ).toBe(true)
  })

  it("ejecutar la supresión exige escribir el radicado en cifras", () => {
    expect(
      esquemaEjecutarSupresion.safeParse({ solicitudId: ID, radicado: " 41 " })
        .data?.radicado
    ).toBe("41")
    expect(
      esquemaEjecutarSupresion.safeParse({
        solicitudId: ID,
        radicado: "N.º 41",
      }).success
    ).toBe(false)
  })
})

describe("esquemaAportar", () => {
  it("pide la información y la recorta", () => {
    expect(
      esquemaAportar.parse({ solicitudId: ID, informacion: "  Soy yo.  " })
        .informacion
    ).toBe("Soy yo.")
    expect(
      mensajes(esquemaAportar.safeParse({ solicitudId: ID, informacion: " " }))
        .informacion
    ).toBe("Escribe la información que te pedimos.")
  })
})
