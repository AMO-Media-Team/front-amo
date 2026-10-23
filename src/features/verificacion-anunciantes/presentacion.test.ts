import { describe, expect, it } from "vitest"

import { Constants } from "@/types/database.types"

import {
  enFraseDocumento,
  ETIQUETAS_EXIGENCIA,
  guiaDocumento,
  MOTIVOS_RECHAZO_DOCUMENTO,
  MOTIVOS_RECHAZO_EMPRESA,
  MOTIVOS_REACTIVACION,
  MOTIVOS_SUSPENSION,
  tituloDocumento,
} from "./presentacion"
import { LIMITES_VERIFICACION_ANUNCIANTE } from "./schemas"

const TIPOS = Constants.public.Enums.documento_anunciante_tipo

describe("nombres de los documentos", () => {
  it("cada tipo tiene título", () => {
    for (const tipo of TIPOS) expect(tituloDocumento(tipo)).not.toBe("")
  })

  it("dentro de una frase conserva siglas y nombres propios", () => {
    expect(enFraseDocumento("RUT")).toBe("RUT")
    expect(enFraseDocumento("CAMARA_COMERCIO")).toMatch(/Cámara de Comercio/)
    expect(enFraseDocumento("OTRO")).toBe("otro documento")
    expect(enFraseDocumento("CERT_BANCARIA")).toMatch(/^[a-z]/)
  })

  it("la exigencia solo se rotula cuando no es obligatoria", () => {
    expect(ETIQUETAS_EXIGENCIA.obligatorio).toBeNull()
    expect(ETIQUETAS_EXIGENCIA.alguno).not.toBeNull()
    expect(ETIQUETAS_EXIGENCIA.adicional).toBe("Adicional")
  })
})

describe("guiaDocumento", () => {
  const EMPRESA = {
    razonSocial: "Café del Sur S.A.S.",
    identificacion: "900.123.456-7",
    colombiana: true,
  }

  it("compara el RUT con la razón social y el NIT registrados", () => {
    const guia = guiaDocumento("RUT", EMPRESA)
    // La razón social ya termina en punto: sin punto doble.
    expect(guia).toContain("Está a nombre de Café del Sur S.A.S.")
    expect(guia.join(" ")).toMatch(
      /NIT coincide con el registrado: 900\.123\.456-7/
    )
  })

  it("la Cámara de Comercio debe tener menos de 30 días", () => {
    expect(guiaDocumento("CAMARA_COMERCIO", EMPRESA).join(" ")).toMatch(
      /menos de 30 días/
    )
  })

  it("una empresa del exterior se compara con su identificación tributaria", () => {
    const guia = guiaDocumento("OTRO", {
      razonSocial: "Acme Inc.",
      identificacion: null,
      colombiana: false,
    })
    expect(guia.join(" ")).toMatch(/identificación tributaria/)
    expect(guia.join(" ")).not.toMatch(/NIT/)
  })

  it("una razón social sin punto final cierra la frase", () => {
    expect(
      guiaDocumento("CERT_BANCARIA", { ...EMPRESA, razonSocial: "Café Sur" })
    ).toContain("La cuenta está a nombre de Café Sur.")
  })

  it("todo tipo tiene qué comprobar", () => {
    for (const tipo of TIPOS) {
      expect(guiaDocumento(tipo, EMPRESA).length, tipo).toBeGreaterThan(0)
    }
  })
})

describe("motivos frecuentes", () => {
  it("caben en el motivo y lo superan en largo mínimo", () => {
    for (const motivo of [
      ...MOTIVOS_RECHAZO_DOCUMENTO,
      ...MOTIVOS_RECHAZO_EMPRESA,
      ...MOTIVOS_SUSPENSION,
      ...MOTIVOS_REACTIVACION,
    ]) {
      expect(motivo.length, motivo).toBeLessThanOrEqual(
        LIMITES_VERIFICACION_ANUNCIANTE.motivoMax
      )
      expect(motivo.length, motivo).toBeGreaterThanOrEqual(
        LIMITES_VERIFICACION_ANUNCIANTE.motivoMin
      )
    }
  })

  it("el rechazo de la empresa ofrece los casos más comunes", () => {
    const texto = MOTIVOS_RECHAZO_EMPRESA.join(" ")
    expect(texto).toMatch(/RUT está ilegible/)
    expect(texto).toMatch(/más de 30 días/)
    expect(texto).toMatch(/NIT no coincide con el RUT/)
  })
})
