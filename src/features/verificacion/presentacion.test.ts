import { describe, expect, it } from "vitest"

import { TIPOS_DOCUMENTO_MEDIO } from "@/features/operacion/estados"

import {
  etiquetaNivelCompleta,
  GUIA_DOCUMENTO,
  humanizarDetalle,
  MOTIVOS_RECHAZO_CUENTA,
  MOTIVOS_RECHAZO_DOCUMENTO,
  MOTIVOS_RECHAZO_MEDIO,
  NOMBRE_CERTIFICADO_PAGO,
  SITUACIONES_REQUISITO,
  tituloRequisito,
} from "./presentacion"

describe("humanizarDetalle", () => {
  it("cambia los códigos de documento por su nombre", () => {
    expect(
      humanizarDetalle(
        "Faltan documentos aprobados y vigentes: CEDULA_FRENTE, CEDULA_REVERSO, PRUEBA_VIDA, CERT_BILLETERA."
      )
    ).toBe(
      "Faltan documentos aprobados y vigentes: Cédula (frente), Cédula (reverso), Prueba de vida, Certificación de billetera."
    )
  })

  it("no confunde RUT con RUT_SOCIEDAD", () => {
    expect(humanizarDetalle("Faltan: RUT, RUT_SOCIEDAD.")).toBe(
      "Faltan: RUT, RUT de la sociedad."
    )
  })

  it("traduce el aviso del medio de pago sin método", () => {
    expect(
      humanizarDetalle("Faltan: CERT_BANCARIA o CERT_BILLETERA (medio de pago).")
    ).toBe(
      "Faltan: Certificación bancaria o Certificación de billetera (medio de pago)."
    )
  })

  it("deja intacto un texto sin códigos", () => {
    const texto =
      "El medio necesita al menos una cuenta social verificada y vigente."
    expect(humanizarDetalle(texto)).toBe(texto)
  })
})

describe("textos", () => {
  it("nombra los requisitos", () => {
    expect(tituloRequisito("CERT_PAGO")).toBe(NOMBRE_CERTIFICADO_PAGO)
    expect(tituloRequisito("CEDULA_FRENTE")).toBe("Cédula (frente)")
  })

  it("cada situación tiene etiqueta y tono", () => {
    expect(SITUACIONES_REQUISITO.aprobado.tono).toBe("exito")
    expect(SITUACIONES_REQUISITO.falta.etiqueta).toBe("Sin cargar")
  })

  it("etiqueta de nivel con su nombre", () => {
    expect(etiquetaNivelCompleta(2, "Persona natural con RUT")).toBe(
      "Nivel 2 · Persona natural con RUT"
    )
  })
})

describe("ayudas de revisión", () => {
  it("cada tipo de documento tiene qué comprobar", () => {
    for (const tipo of Object.keys(TIPOS_DOCUMENTO_MEDIO)) {
      expect(
        GUIA_DOCUMENTO[tipo as keyof typeof GUIA_DOCUMENTO].length
      ).toBeGreaterThan(0)
    }
  })

  it("los motivos sugeridos caben en el campo (5–500)", () => {
    for (const motivo of [
      ...MOTIVOS_RECHAZO_DOCUMENTO,
      ...MOTIVOS_RECHAZO_CUENTA,
      ...MOTIVOS_RECHAZO_MEDIO,
    ]) {
      expect(motivo.length).toBeGreaterThanOrEqual(5)
      expect(motivo.length).toBeLessThanOrEqual(500)
    }
  })
})
