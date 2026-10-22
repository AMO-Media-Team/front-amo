import { describe, expect, it } from "vitest"

import {
  documentoFijo,
  DOCUMENTOS_NIVEL_1,
  medioFijo,
  pagoFijo,
  resumenCompleto,
  resumenFijo,
} from "./fixtures"
import { datosAlta, estadoCuentasAlta, vistaAlta } from "./resumen"
import type { CuentaSocialAlta } from "./tipos"

const cuenta = (
  id: string,
  parcial: Partial<CuentaSocialAlta> = {}
): CuentaSocialAlta => ({
  id,
  verificada: false,
  enRevision: false,
  esperandoCaptura: false,
  rechazada: false,
  ...parcial,
})

describe("estadoCuentasAlta", () => {
  const verificacion = (
    cuenta: string,
    estado: string,
    captura: string | null = "medio/x/cuenta_social/y/a.webp",
    metodo = "MANUAL"
  ) => ({
    cuenta_social_id: cuenta,
    metodo,
    estado_validacion: estado,
    captura_path: captura,
  })

  it("decide la verificación más reciente de cada cuenta", () => {
    const [cuenta] = estadoCuentasAlta(
      [{ id: "a", verificada: false }],
      [verificacion("a", "RECHAZADA"), verificacion("a", "APROBADA")]
    )
    expect(cuenta).toMatchObject({ rechazada: true, enRevision: false })
  })

  it("una pendiente sin captura no está en revisión: espera la captura", () => {
    const [cuenta] = estadoCuentasAlta(
      [{ id: "a", verificada: false }],
      [verificacion("a", "PENDIENTE", null, "CODIGO_HISTORIA")]
    )
    expect(cuenta).toEqual({
      id: "a",
      verificada: false,
      enRevision: false,
      esperandoCaptura: true,
      rechazada: false,
    })
  })

  it("con captura (o por API) sí está en revisión", () => {
    const cuentas = estadoCuentasAlta(
      [
        { id: "a", verificada: false },
        { id: "b", verificada: false },
      ],
      [
        verificacion("a", "PENDIENTE"),
        verificacion("b", "PENDIENTE", null, "API"),
      ]
    )
    expect(cuentas.map((c) => [c.enRevision, c.esperandoCaptura])).toEqual([
      [true, false],
      [true, false],
    ])
  })

  it("sin verificaciones, nada en curso", () => {
    expect(estadoCuentasAlta([{ id: "a", verificada: true }], [])).toEqual([
      {
        id: "a",
        verificada: true,
        enRevision: false,
        esperandoCaptura: false,
        rechazada: false,
      },
    ])
  })
})

describe("datosAlta", () => {
  it("resume perfil, pago, cuentas y términos de lo leído", () => {
    const datos = datosAlta(
      resumenFijo({
        categorias: 1,
        cuentas: [
          cuenta("a", { verificada: true, enRevision: true }),
          cuenta("b", { enRevision: true }),
          cuenta("c", { rechazada: true }),
          cuenta("d"),
          cuenta("e", { esperandoCaptura: true }),
        ],
        terminosPendientes: 2,
      }),
      1
    )
    expect(datos.perfil).toEqual({
      tieneDescripcion: false,
      categorias: 1,
      paisesAudiencia: 0,
    })
    expect(datos.pago).toEqual({
      titular: false,
      documentoIdentidad: false,
      cuentaPago: false,
    })
    expect(datos.cuentas).toEqual({
      registradas: 5,
      verificadas: 1,
      enRevision: 1,
      sinCaptura: 1,
      rechazadas: 1,
    })
    expect(datos.terminos).toEqual({ pendientes: 2 })
  })

  it("una descripción en blanco no cuenta", () => {
    const datos = datosAlta(
      resumenFijo({ medio: medioFijo({ descripcionAudiencia: "   " }) }),
      1
    )
    expect(datos.perfil.tieneDescripcion).toBe(false)
  })

  it("el documento cuenta solo si está cifrado y con su tipo", () => {
    const sinCifrar = datosAlta(
      resumenFijo({ pago: pagoFijo({ documentoRegistrado: false }) }),
      1
    )
    expect(sinCifrar.pago.documentoIdentidad).toBe(false)
    const completo = datosAlta(resumenFijo({ pago: pagoFijo() }), 1)
    expect(completo.pago).toEqual({
      titular: true,
      documentoIdentidad: true,
      cuentaPago: true,
    })
  })

  it("pide los documentos del nivel objetivo y el certificado de pago", () => {
    const datos = datosAlta(resumenFijo({ pago: pagoFijo() }), 2)
    expect(datos.requisitos.map((r) => r.tipo)).toEqual([
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "RUT",
      "CERT_BILLETERA",
    ])
    expect(datos.documentos.faltaMetodoPago).toBe(false)
  })
})

describe("vistaAlta", () => {
  it("medio recién registrado: alta con 1 de 5 (términos) y sin envío", () => {
    const vista = vistaAlta(resumenFijo())
    expect(vista.situacion).toEqual({ tipo: "alta" })
    expect(vista.progreso).toEqual({ completos: 1, total: 5, fraccion: 0.2 })
    expect(vista.porCompletar.map((p) => p.id)).toEqual([
      "perfil",
      "documentos",
      "pago",
      "cuentas",
    ])
    expect(vista.puedeEnviar).toBe(false)
    expect(vista.nivelDocumentos.numero).toBe(1)
    expect(vista.faltaMetodoPago).toBe(true)
  })

  it("con todo completo se puede enviar", () => {
    const vista = vistaAlta(resumenCompleto())
    expect(vista.progreso.completos).toBe(5)
    expect(vista.porCompletar).toEqual([])
    expect(vista.puedeEnviar).toBe(true)
  })

  it("en revisión no ofrece volver a enviar", () => {
    const vista = vistaAlta(
      resumenCompleto({
        medio: medioFijo({ enviadoVerificacionAt: "2026-10-21T15:00:00Z" }),
      })
    )
    expect(vista.situacion.tipo).toBe("en-revision")
    expect(vista.puedeEnviar).toBe(false)
  })

  it("tras un rechazo se puede reenviar si todo está listo", () => {
    const vista = vistaAlta(
      resumenCompleto({
        medio: medioFijo({
          estado: "RECHAZADO",
          motivoEstado: "La cédula no se lee.",
        }),
      })
    )
    expect(vista.situacion).toMatchObject({
      tipo: "rechazado",
      motivo: "La cédula no se lee.",
    })
    expect(vista.puedeEnviar).toBe(true)
  })

  it("verificado revisa los documentos de su nivel actual, no los del siguiente", () => {
    const vista = vistaAlta(
      resumenCompleto({
        medio: medioFijo({ estado: "VERIFICADO", nivel: 1 }),
      })
    )
    expect(vista.situacion).toEqual({ tipo: "verificado", nivel: 1 })
    expect(vista.nivelDocumentos.numero).toBe(1)
    expect(vista.requisitos.map((r) => r.tipo)).not.toContain("RUT")
    expect(vista.puedeEnviar).toBe(false)
  })

  it("un documento vencido de un verificado pide atención", () => {
    const vista = vistaAlta(
      resumenCompleto({
        medio: medioFijo({ estado: "VERIFICADO", nivel: 1 }),
        documentos: [
          ...DOCUMENTOS_NIVEL_1.filter((d) => d.tipo !== "CEDULA_FRENTE"),
          documentoFijo({ fechaVencimiento: "2026-10-01" }),
        ],
      })
    )
    expect(vista.pasos.find((p) => p.id === "documentos")?.estado).toBe(
      "atencion"
    )
  })

  it("tras cambiar la cuenta de pago, el certificado anterior ya no basta para enviar", () => {
    const vista = vistaAlta(
      resumenCompleto({
        documentos: [
          ...DOCUMENTOS_NIVEL_1.filter((d) => d.tipo !== "CERT_BILLETERA"),
          documentoFijo({ tipo: "CERT_BILLETERA", deCuentaAnterior: true }),
        ],
      })
    )
    expect(
      vista.requisitos.find((r) => r.tipo === "CERT_BILLETERA")
    ).toMatchObject({ situacion: "falta", deCuentaAnterior: true })
    expect(vista.pasos.find((p) => p.id === "documentos")).toMatchObject({
      estado: "atencion",
      listo: false,
      detalle:
        "Cambiaste tu cuenta de pago: carga el certificado de la cuenta nueva.",
    })
    expect(vista.puedeEnviar).toBe(false)
  })
})
