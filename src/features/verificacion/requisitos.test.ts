import { describe, expect, it } from "vitest"

import {
  type DocumentoRequisito,
  filasDocumentos,
  type NivelRequisitos,
  nivelMaximoListo,
  nivelPropuesto,
  requisitosDelNivel,
  resumirRequisitos,
  situacionRequisito,
  tienePruebaDeVida,
  vigenteEn,
} from "./requisitos"

const HOY = "2026-10-22"

let secuencia = 0
function documento(
  tipo: DocumentoRequisito["tipo"],
  estado: DocumentoRequisito["estado"],
  extra: Partial<DocumentoRequisito> = {}
): DocumentoRequisito {
  secuencia += 1
  return {
    id: `doc-${secuencia}`,
    tipo,
    estado,
    metodo: "ARCHIVO",
    venceAt: null,
    // Cada documento nuevo es posterior al anterior.
    subidoAt: new Date(Date.UTC(2026, 9, 1) + secuencia * 60_000).toISOString(),
    ...extra,
  }
}

const NIVELES: NivelRequisitos[] = [
  {
    nivel: 1,
    nombre: "Persona natural informal",
    documentosRequeridos: ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA"],
  },
  {
    nivel: 2,
    nombre: "Persona natural con RUT",
    documentosRequeridos: [
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "RUT",
    ],
  },
  {
    nivel: 3,
    nombre: "Persona jurídica",
    documentosRequeridos: [
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "RUT",
      "CAMARA_COMERCIO",
      "RUT_SOCIEDAD",
    ],
  },
]

const NIVEL_1 = NIVELES[0]

function nivelUnoCompleto(): DocumentoRequisito[] {
  return [
    documento("CEDULA_FRENTE", "APROBADO"),
    documento("CEDULA_REVERSO", "APROBADO"),
    documento("PRUEBA_VIDA", "APROBADO", { metodo: "VIDEOLLAMADA" }),
    documento("CERT_BILLETERA", "APROBADO", { venceAt: "2027-01-31" }),
  ]
}

describe("vigenteEn", () => {
  it("aprobado sin vencimiento o con vencimiento desde hoy", () => {
    expect(vigenteEn(documento("RUT", "APROBADO"), HOY)).toBe(true)
    expect(vigenteEn(documento("RUT", "APROBADO", { venceAt: HOY }), HOY)).toBe(
      true
    )
    expect(
      vigenteEn(documento("RUT", "APROBADO", { venceAt: "2026-10-21" }), HOY)
    ).toBe(false)
    expect(vigenteEn(documento("RUT", "PENDIENTE"), HOY)).toBe(false)
  })
})

describe("situacionRequisito", () => {
  it("sin documentos del tipo, falta", () => {
    expect(situacionRequisito(["RUT"], [], HOY)).toEqual({
      situacion: "falta",
      documento: null,
    })
  })

  it("un aprobado vigente gana aunque haya uno por revisar", () => {
    const aprobado = documento("RUT", "APROBADO")
    const pendiente = documento("RUT", "PENDIENTE")
    expect(situacionRequisito(["RUT"], [pendiente, aprobado], HOY)).toEqual({
      situacion: "aprobado",
      documento: aprobado,
    })
  })

  it("un reemplazo por revisar gana sobre un rechazo anterior", () => {
    const rechazado = documento("RUT", "RECHAZADO")
    const pendiente = documento("RUT", "PENDIENTE")
    expect(situacionRequisito(["RUT"], [rechazado, pendiente], HOY)).toEqual({
      situacion: "por_revisar",
      documento: pendiente,
    })
  })

  it("el último documento decide entre rechazado y vencido", () => {
    const vencido = documento("RUT", "APROBADO", { venceAt: "2026-01-01" })
    expect(situacionRequisito(["RUT"], [vencido], HOY).situacion).toBe(
      "vencido"
    )
    expect(
      situacionRequisito(["RUT"], [documento("RUT", "VENCIDO")], HOY).situacion
    ).toBe("vencido")
    const rechazado = documento("RUT", "RECHAZADO")
    expect(
      situacionRequisito(["RUT"], [vencido, rechazado], HOY).situacion
    ).toBe("rechazado")
  })

  it("cualquiera de los tipos cumple el requisito", () => {
    const bancaria = documento("CERT_BANCARIA", "APROBADO")
    expect(
      situacionRequisito(["CERT_BANCARIA", "CERT_BILLETERA"], [bancaria], HOY)
        .situacion
    ).toBe("aprobado")
  })
})

describe("requisitosDelNivel", () => {
  it("suma el certificado del medio de pago a los documentos del nivel", () => {
    const requisitos = requisitosDelNivel(NIVEL_1, [], HOY)
    expect(requisitos.map((r) => r.clave)).toEqual([
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "CERT_PAGO",
    ])
    expect(requisitos.every((r) => r.situacion === "falta")).toBe(true)
  })

  it("con todo aprobado y vigente, los documentos están listos", () => {
    const resumen = resumirRequisitos(
      requisitosDelNivel(NIVEL_1, nivelUnoCompleto(), HOY)
    )
    expect(resumen).toMatchObject({
      cumplidos: 4,
      total: 4,
      documentosListos: true,
    })
    expect(resumen.pendientes).toEqual([])
  })

  it("lista lo pendiente", () => {
    const documentos = nivelUnoCompleto().filter(
      (d) => d.tipo !== "PRUEBA_VIDA"
    )
    const resumen = resumirRequisitos(
      requisitosDelNivel(NIVEL_1, documentos, HOY)
    )
    expect(resumen.documentosListos).toBe(false)
    expect(resumen.pendientes.map((r) => r.clave)).toEqual(["PRUEBA_VIDA"])
  })
})

describe("nivel máximo y propuesto", () => {
  it("el nivel más alto con los documentos al día", () => {
    expect(nivelMaximoListo(NIVELES, [], HOY)).toBeNull()
    expect(nivelMaximoListo(NIVELES, nivelUnoCompleto(), HOY)).toBe(1)
    expect(
      nivelMaximoListo(
        NIVELES,
        [...nivelUnoCompleto(), documento("RUT", "APROBADO")],
        HOY
      )
    ).toBe(2)
  })

  it("propone el listo, o el 1 si ninguno lo está", () => {
    expect(nivelPropuesto(NIVELES, [], HOY, 0)).toBe(1)
    expect(
      nivelPropuesto(
        NIVELES,
        [...nivelUnoCompleto(), documento("RUT", "APROBADO")],
        HOY,
        0
      )
    ).toBe(2)
  })

  it("con el medio ya verificado propone subir: al listo o al siguiente", () => {
    const conRut = [...nivelUnoCompleto(), documento("RUT", "APROBADO")]
    expect(nivelPropuesto(NIVELES, conRut, HOY, 1)).toBe(2)
    expect(nivelPropuesto(NIVELES, conRut, HOY, 2)).toBe(3)
    expect(nivelPropuesto(NIVELES, nivelUnoCompleto(), HOY, 1)).toBe(2)
  })

  it("en el nivel más alto propone quedarse en él", () => {
    expect(nivelPropuesto(NIVELES, nivelUnoCompleto(), HOY, 3)).toBe(3)
  })
})

describe("tienePruebaDeVida", () => {
  it("cuenta la videollamada aprobada", () => {
    expect(tienePruebaDeVida(nivelUnoCompleto(), HOY)).toBe(true)
    expect(
      tienePruebaDeVida([documento("PRUEBA_VIDA", "PENDIENTE")], HOY)
    ).toBe(false)
  })
})

describe("filasDocumentos", () => {
  const ORDEN: DocumentoRequisito["tipo"][] = [
    "CEDULA_FRENTE",
    "CEDULA_REVERSO",
    "PRUEBA_VIDA",
    "RUT",
    "RUT_SOCIEDAD",
    "CAMARA_COMERCIO",
    "CERT_BANCARIA",
    "CERT_BILLETERA",
    "SEG_SOCIAL",
  ]

  it("primero lo exigido por el nivel y el certificado de pago, luego lo demás cargado", () => {
    const filas = filasDocumentos(
      NIVEL_1,
      [documento("SEG_SOCIAL", "PENDIENTE"), documento("RUT", "APROBADO")],
      HOY,
      ORDEN
    )
    expect(filas.map((fila) => [fila.clave, fila.exigido])).toEqual([
      ["CEDULA_FRENTE", true],
      ["CEDULA_REVERSO", true],
      ["PRUEBA_VIDA", true],
      ["CERT_PAGO", true],
      ["RUT", false],
      ["SEG_SOCIAL", false],
    ])
  })

  it("un reemplazo por revisar no tapa el aprobado vigente, pero queda a mano", () => {
    const aprobado = documento("CEDULA_FRENTE", "APROBADO")
    const reemplazo = documento("CEDULA_FRENTE", "PENDIENTE")
    const [fila] = filasDocumentos(NIVEL_1, [aprobado, reemplazo], HOY, ORDEN)
    expect(fila).toMatchObject({
      situacion: "aprobado",
      principal: aprobado,
      porRevisar: reemplazo,
      historial: [],
    })
  })

  it("el historial va del más reciente al más antiguo, sin el principal", () => {
    const primero = documento("PRUEBA_VIDA", "RECHAZADO")
    const segundo = documento("PRUEBA_VIDA", "RECHAZADO")
    const tercero = documento("PRUEBA_VIDA", "PENDIENTE")
    const fila = filasDocumentos(
      NIVEL_1,
      [primero, tercero, segundo],
      HOY,
      ORDEN
    ).find((f) => f.clave === "PRUEBA_VIDA")
    expect(fila?.principal).toBe(tercero)
    expect(fila?.historial).toEqual([segundo, primero])
  })

  it("el certificado de pago agrupa la bancaria y la de billetera", () => {
    const bancaria = documento("CERT_BANCARIA", "RECHAZADO")
    const billetera = documento("CERT_BILLETERA", "APROBADO")
    const fila = filasDocumentos(
      NIVEL_1,
      [bancaria, billetera],
      HOY,
      ORDEN
    ).find((f) => f.clave === "CERT_PAGO")
    expect(fila).toMatchObject({
      situacion: "aprobado",
      principal: billetera,
      porRevisar: null,
      historial: [bancaria],
    })
  })
})
