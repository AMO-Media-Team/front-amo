import { describe, expect, it } from "vitest"

import {
  aprobadoAntesDelCambio,
  CLAVE_EXISTENCIA,
  type DocumentoRequisito,
  filasDocumentos,
  requisitosAnunciante,
  resumirRequisitos,
  situacionRequisito,
  tipoSugerido,
  tituloRequisito,
  TITULO_EXISTENCIA,
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
    venceAt: null,
    subidoAt: new Date(Date.UTC(2026, 9, 1) + secuencia * 60_000).toISOString(),
    ...extra,
  }
}

describe("vigenteEn", () => {
  it("aprobado y sin vencer (el día de vencimiento todavía vale)", () => {
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
  it("el vigente manda aunque haya un reemplazo por revisar", () => {
    const aprobado = documento("RUT", "APROBADO")
    const reemplazo = documento("RUT", "PENDIENTE")
    expect(situacionRequisito(["RUT"], [aprobado, reemplazo], HOY)).toEqual({
      situacion: "aprobado",
      documento: aprobado,
    })
  })

  it("sin vigente: el pendiente; si no, el último rechazado o vencido", () => {
    const rechazado = documento("RUT", "RECHAZADO")
    const pendiente = documento("RUT", "PENDIENTE")
    expect(situacionRequisito(["RUT"], [rechazado, pendiente], HOY)).toEqual({
      situacion: "por_revisar",
      documento: pendiente,
    })
    expect(situacionRequisito(["RUT"], [rechazado], HOY).situacion).toBe(
      "rechazado"
    )
    expect(
      situacionRequisito(["RUT"], [documento("RUT", "VENCIDO")], HOY).situacion
    ).toBe("vencido")
    expect(situacionRequisito(["RUT"], [], HOY)).toEqual({
      situacion: "falta",
      documento: null,
    })
  })
})

describe("requisitosAnunciante", () => {
  it("en Colombia exige RUT y Cámara de Comercio", () => {
    const requisitos = requisitosAnunciante(
      "CO",
      [documento("RUT", "APROBADO"), documento("CERT_BANCARIA", "APROBADO")],
      HOY
    )
    expect(requisitos.map((r) => [r.clave, r.situacion])).toEqual([
      ["RUT", "aprobado"],
      ["CAMARA_COMERCIO", "falta"],
    ])
    expect(resumirRequisitos(requisitos)).toMatchObject({
      cumplidos: 1,
      total: 2,
      listos: false,
      faltan: ["CAMARA_COMERCIO"],
      porRevisar: [],
    })
  })

  it("en el exterior basta la Cámara u «Otro» (un certificado bancario no cuenta)", () => {
    const soloBancario = requisitosAnunciante(
      "US",
      [documento("CERT_BANCARIA", "APROBADO")],
      HOY
    )
    expect(soloBancario).toHaveLength(1)
    expect(soloBancario[0]).toMatchObject({
      clave: CLAVE_EXISTENCIA,
      situacion: "falta",
    })

    const conOtro = requisitosAnunciante(
      "US",
      [documento("OTRO", "APROBADO")],
      HOY
    )
    expect(resumirRequisitos(conOtro).listos).toBe(true)
  })

  it("separa lo que falta de lo que espera revisión", () => {
    const resumen = resumirRequisitos(
      requisitosAnunciante(
        "CO",
        [
          documento("RUT", "PENDIENTE"),
          documento("CAMARA_COMERCIO", "RECHAZADO"),
        ],
        HOY
      )
    )
    expect(resumen.porRevisar).toEqual(["RUT"])
    expect(resumen.faltan).toEqual(["CAMARA_COMERCIO"])
  })

  it("un documento vencido ya no cumple", () => {
    const resumen = resumirRequisitos(
      requisitosAnunciante(
        "CO",
        [
          documento("RUT", "APROBADO"),
          documento("CAMARA_COMERCIO", "APROBADO", { venceAt: "2026-10-01" }),
        ],
        HOY
      )
    )
    expect(resumen).toMatchObject({ cumplidos: 1, listos: false })
  })
})

describe("cambio de identificación (identificacion_cambiada_at)", () => {
  const CAMBIO = "2026-10-15T12:00:00.000Z"
  const antes = { validadoAt: "2026-10-10T15:00:00.000Z" }
  const despues = { validadoAt: "2026-10-16T15:00:00.000Z" }

  it("lo aprobado antes del cambio (o sin fecha de aprobación) ya no respalda", () => {
    expect(
      aprobadoAntesDelCambio(documento("RUT", "APROBADO", antes), CAMBIO)
    ).toBe(true)
    expect(aprobadoAntesDelCambio(documento("RUT", "APROBADO"), CAMBIO)).toBe(
      true
    )
    expect(
      aprobadoAntesDelCambio(documento("RUT", "APROBADO", despues), CAMBIO)
    ).toBe(false)
    expect(
      aprobadoAntesDelCambio(documento("RUT", "APROBADO", antes), null)
    ).toBe(false)
    expect(vigenteEn(documento("RUT", "APROBADO", antes), HOY, CAMBIO)).toBe(
      false
    )
  })

  it("desactualizado no cumple, falta y lo dice aparte; un reemplazo pendiente manda", () => {
    const rut = documento("RUT", "APROBADO", antes)
    const camara = documento("CAMARA_COMERCIO", "APROBADO", despues)
    const requisitos = requisitosAnunciante("CO", [rut, camara], HOY, CAMBIO)
    expect(requisitos.map((r) => [r.clave, r.situacion])).toEqual([
      ["RUT", "desactualizado"],
      ["CAMARA_COMERCIO", "aprobado"],
    ])
    expect(resumirRequisitos(requisitos)).toEqual({
      cumplidos: 1,
      total: 2,
      listos: false,
      faltan: ["RUT"],
      porRevisar: [],
      desactualizados: ["RUT"],
    })
    expect(tipoSugerido("CO", [rut, camara], HOY, CAMBIO)).toBe("RUT")
    const nuevo = documento("RUT", "PENDIENTE")
    expect(situacionRequisito(["RUT"], [rut, nuevo], HOY, CAMBIO)).toEqual({
      situacion: "por_revisar",
      documento: nuevo,
    })
    // Sin cambio, los dos cumplen.
    expect(
      resumirRequisitos(requisitosAnunciante("CO", [rut, camara], HOY)).listos
    ).toBe(true)
  })
})

describe("tituloRequisito", () => {
  it("nombra los tipos con el catálogo y el requisito del exterior aparte", () => {
    expect(tituloRequisito("RUT")).toBe("RUT")
    expect(tituloRequisito(CLAVE_EXISTENCIA)).toBe(TITULO_EXISTENCIA)
  })
})

describe("filasDocumentos", () => {
  it("lo exigido primero (aunque falte) y después lo adicional que cargó", () => {
    const filas = filasDocumentos(
      "CO",
      [
        documento("OTRO", "PENDIENTE"),
        documento("CAMARA_COMERCIO", "APROBADO"),
      ],
      HOY
    )
    expect(filas.map((fila) => [fila.tipo, fila.exigencia])).toEqual([
      ["RUT", "obligatorio"],
      ["CAMARA_COMERCIO", "obligatorio"],
      ["OTRO", "adicional"],
    ])
    expect(filas[0]).toMatchObject({ situacion: "falta", principal: null })
  })

  it("en el exterior muestra los dos tipos que valen («alguno»)", () => {
    const filas = filasDocumentos("MX", [], HOY)
    expect(filas.map((fila) => [fila.tipo, fila.exigencia])).toEqual([
      ["CAMARA_COMERCIO", "alguno"],
      ["OTRO", "alguno"],
    ])
  })

  it("separa la carga vigente, el reemplazo por revisar y el historial", () => {
    const viejo = documento("RUT", "RECHAZADO")
    const vigente = documento("RUT", "APROBADO")
    const reemplazo = documento("RUT", "PENDIENTE")
    const [rut] = filasDocumentos("CO", [viejo, vigente, reemplazo], HOY)
    expect(rut.principal).toBe(vigente)
    expect(rut.porRevisar).toBe(reemplazo)
    expect(rut.historial).toEqual([viejo])
  })
})

describe("tipoSugerido", () => {
  it("propone lo primero que la empresa aún debe cargar", () => {
    expect(tipoSugerido("CO", [], HOY)).toBe("RUT")
    expect(tipoSugerido("CO", [documento("RUT", "PENDIENTE")], HOY)).toBe(
      "CAMARA_COMERCIO"
    )
    expect(tipoSugerido("PE", [], HOY)).toBe("CAMARA_COMERCIO")
  })

  it("con todo cargado propone el primero del catálogo", () => {
    expect(
      tipoSugerido(
        "CO",
        [
          documento("RUT", "APROBADO"),
          documento("CAMARA_COMERCIO", "PENDIENTE"),
        ],
        HOY
      )
    ).toBe("RUT")
  })
})
