import { describe, expect, it } from "vitest"

import type { ResumenDocumentos } from "@/features/documentos-anunciante/situacion"
import type { DatosDocumentosAnunciante } from "@/features/documentos-anunciante/tipos"

import type { EmpresaPropia } from "./tipos"
import {
  contactoCompleto,
  enVerificacion,
  etiquetaPaso,
  faltantesParaEnviar,
  identificacionBloqueada,
  identificacionEnFrase,
  pasosVerificacion,
  presentarSituacionEmpresa,
  progresoVerificacion,
  puedeEnviar,
  situacionEmpresa,
  vistaVerificacion,
} from "./verificacion"

const CONTACTO = { nombre: "Laura Gómez", email: "laura@andina.co" }
const SIN_CONTACTO = { nombre: null, email: null }

function resumen(cambios: Partial<ResumenDocumentos> = {}): ResumenDocumentos {
  return {
    total: 2,
    aprobados: 0,
    enRevision: 0,
    porCorregir: 0,
    faltan: 2,
    porVencer: 0,
    completo: false,
    listoParaEnviar: false,
    pendientes: [
      {
        id: "RUT",
        tipos: ["RUT"],
        estado: "falta",
        porVencer: false,
        enFrase: "el RUT",
        titulo: "RUT",
      },
      {
        id: "CAMARA_COMERCIO",
        tipos: ["CAMARA_COMERCIO"],
        estado: "falta",
        porVencer: false,
        enFrase: "la Cámara de Comercio",
        titulo: "Cámara de Comercio",
      },
    ],
    ...cambios,
  }
}

const LISTO = resumen({
  faltan: 0,
  enRevision: 2,
  listoParaEnviar: true,
  pendientes: [],
})

const EMPRESA: EmpresaPropia = {
  id: "0192f1c2-5b6a-7d00-8000-000000000001",
  razonSocial: "Comercializadora Andina S.A.S.",
  nombreComercial: "Andina",
  sector: { id: "s1", nombre: "Retail" },
  paisIso2: "CO",
  nit: "900123456",
  digitoVerificacion: "8",
  municipioCodigo: "11001",
  identificacionExtranjera: null,
  ciudadExtranjera: null,
  facturacion: {
    email: null,
    regimen: null,
    granContribuyente: false,
    autorretenedor: false,
  },
  estado: "PENDIENTE",
  motivoEstado: null,
  enviadoVerificacionAt: null,
  verificadoAt: null,
  actualizadoAt: "2026-10-22T15:00:00Z",
  logoUrl: null,
  tieneLogo: false,
}

describe("situacionEmpresa", () => {
  it("distingue el alta de la revisión por el envío", () => {
    const base = {
      motivoEstado: null,
      verificadoAt: null,
      enviadoVerificacionAt: null,
    }
    expect(situacionEmpresa({ ...base, estado: "PENDIENTE" })).toEqual({
      tipo: "alta",
    })
    expect(
      situacionEmpresa({
        ...base,
        estado: "PENDIENTE",
        enviadoVerificacionAt: "2026-10-20T15:00:00Z",
      })
    ).toEqual({ tipo: "en-revision", enviadoAt: "2026-10-20T15:00:00Z" })
  })

  it("lleva el motivo del rechazo y de la suspensión (sin espacios vacíos)", () => {
    const base = { enviadoVerificacionAt: null, verificadoAt: null }
    expect(
      situacionEmpresa({
        ...base,
        estado: "RECHAZADO",
        motivoEstado: "  RUT ilegible ",
      })
    ).toEqual({ tipo: "rechazado", motivo: "RUT ilegible" })
    expect(
      situacionEmpresa({ ...base, estado: "SUSPENDIDO", motivoEstado: " " })
    ).toEqual({ tipo: "suspendido", motivo: null })
    expect(
      situacionEmpresa({
        ...base,
        estado: "VERIFICADO",
        motivoEstado: null,
        verificadoAt: "2026-10-01T15:00:00Z",
      })
    ).toEqual({ tipo: "verificado", verificadoAt: "2026-10-01T15:00:00Z" })
  })

  it("verificada o suspendida, la identificación se bloquea y no se envía", () => {
    expect(identificacionBloqueada("VERIFICADO")).toBe(true)
    expect(identificacionBloqueada("SUSPENDIDO")).toBe(true)
    expect(identificacionBloqueada("PENDIENTE")).toBe(false)
    expect(identificacionBloqueada("RECHAZADO")).toBe(false)
    expect(puedeEnviar({ tipo: "alta" })).toBe(true)
    expect(puedeEnviar({ tipo: "rechazado", motivo: null })).toBe(true)
    expect(puedeEnviar({ tipo: "en-revision", enviadoAt: "x" })).toBe(false)
    expect(enVerificacion({ tipo: "verificado", verificadoAt: null })).toBe(
      false
    )
  })
})

describe("pasosVerificacion", () => {
  it("sin contacto ni documentos dice qué falta, en frase", () => {
    const pasos = pasosVerificacion({
      identificacion: "Andina S.A.S. · NIT 900.123.456-8",
      contacto: SIN_CONTACTO,
      documentos: resumen(),
    })
    expect(pasos.map((p) => [p.id, p.estado, p.listo])).toEqual([
      ["datos", "completo", true],
      ["contacto", "pendiente", false],
      ["documentos", "pendiente", false],
    ])
    expect(pasos[2].detalle).toBe("Falta cargar: RUT y Cámara de Comercio.")
    expect(pasos[1].href).toBe("/empresa#contacto")
    expect(pasos[2].href).toBe("/empresa/documentos")
    expect(faltantesParaEnviar(pasos)).toEqual([
      "los datos de la persona de contacto",
      "el RUT",
      "la Cámara de Comercio",
    ])
    expect(progresoVerificacion(pasos)).toEqual({
      completos: 1,
      total: 3,
      fraccion: 1 / 3,
    })
  })

  it("documentos cargados en revisión ya cumplen para enviar", () => {
    const pasos = pasosVerificacion({
      identificacion: "Andina",
      contacto: CONTACTO,
      documentos: LISTO,
    })
    expect(pasos[1].detalle).toBe("Laura Gómez · laura@andina.co")
    expect(pasos[2]).toMatchObject({
      estado: "en-curso",
      listo: true,
      detalle: "Cargados: el equipo de AMO los revisa.",
    })
    expect(faltantesParaEnviar(pasos)).toEqual([])
    expect(etiquetaPaso(pasos[2])).toEqual({
      etiqueta: "En revisión",
      tono: "info",
    })
  })

  it("un documento rechazado pide atención y nombra lo que falta", () => {
    const pasos = pasosVerificacion({
      identificacion: "Andina",
      contacto: CONTACTO,
      documentos: resumen({
        faltan: 1,
        porCorregir: 1,
        pendientes: [
          {
            id: "RUT",
            tipos: ["RUT"],
            estado: "por-corregir",
            porVencer: false,
            enFrase: "el RUT",
            titulo: "RUT",
          },
          {
            id: "CAMARA_COMERCIO",
            tipos: ["CAMARA_COMERCIO"],
            estado: "falta",
            porVencer: false,
            enFrase: "la Cámara de Comercio",
            titulo: "Cámara de Comercio",
          },
        ],
      }),
    })
    expect(pasos[2]).toMatchObject({
      estado: "atencion",
      listo: false,
      detalle: "Por corregir: RUT. Falta cargar: Cámara de Comercio.",
    })
    expect(etiquetaPaso(pasos[2]).etiqueta).toBe("Por corregir")
  })

  it("aprobados por AMO, avisa si alguno vence pronto", () => {
    const [, , documentos] = pasosVerificacion({
      identificacion: "Andina",
      contacto: CONTACTO,
      documentos: resumen({
        faltan: 0,
        aprobados: 2,
        completo: true,
        listoParaEnviar: true,
        porVencer: 1,
        pendientes: [],
      }),
    })
    expect(documentos).toMatchObject({
      estado: "completo",
      detalle: "Aprobados por AMO; alguno vence pronto.",
    })
  })

  it("un documento cargado y otro sin cargar va «en curso» pero no cumple", () => {
    const [, , documentos] = pasosVerificacion({
      identificacion: "Andina",
      contacto: CONTACTO,
      documentos: resumen({
        faltan: 1,
        enRevision: 1,
        pendientes: [resumen().pendientes[1]],
      }),
    })
    expect(documentos).toMatchObject({ estado: "en-curso", listo: false })
    expect(etiquetaPaso(documentos).etiqueta).toBe("Incompleto")
  })

  it("el contacto exige nombre y correo", () => {
    expect(contactoCompleto(CONTACTO)).toBe(true)
    expect(contactoCompleto({ nombre: "Laura", email: " " })).toBe(false)
    expect(contactoCompleto(SIN_CONTACTO)).toBe(false)
  })
})

describe("identificacionEnFrase", () => {
  it("razón social con el NIT formateado o la identificación extranjera", () => {
    expect(identificacionEnFrase(EMPRESA)).toBe(
      "Comercializadora Andina S.A.S. · NIT 900.123.456-8"
    )
    expect(
      identificacionEnFrase({
        ...EMPRESA,
        paisIso2: "US",
        nit: null,
        digitoVerificacion: null,
        identificacionExtranjera: "EIN 12-3456789",
      })
    ).toBe("Comercializadora Andina S.A.S. · Identificación EIN 12-3456789")
    expect(
      identificacionEnFrase({
        ...EMPRESA,
        paisIso2: "US",
        nit: null,
        identificacionExtranjera: null,
      })
    ).toBe("Comercializadora Andina S.A.S.")
  })
})

describe("vistaVerificacion", () => {
  const DOCUMENTOS: DatosDocumentosAnunciante = {
    empresa: {
      id: EMPRESA.id,
      nombre: "Andina",
      pais: "CO",
      estado: "PENDIENTE",
      enviadoVerificacionAt: null,
      identificacionCambiadaAt: null,
    },
    documentos: [],
    hoy: "2026-10-22",
  }

  it("en alta: pasos, avance, faltantes y envío", () => {
    const vista = vistaVerificacion({
      empresa: EMPRESA,
      contacto: CONTACTO,
      documentos: DOCUMENTOS,
    })
    expect(vista.situacion).toEqual({ tipo: "alta" })
    expect(vista.pasos).toHaveLength(3)
    expect(vista.progreso?.completos).toBe(2)
    expect(vista.faltantes).toEqual(["el RUT", "la Cámara de Comercio"])
    expect(vista.envio).toEqual({ reenvio: false })
    expect(vista.identificacionBloqueada).toBe(false)
  })

  it("lo aprobado antes de cambiar la identificación falta para enviar", () => {
    const aprobado = (tipo: "RUT" | "CAMARA_COMERCIO") => ({
      id: tipo,
      tipo,
      estado: "APROBADO" as const,
      observaciones: null,
      venceEl: null,
      cargadoAt: "2026-10-01T15:00:00Z",
      revisadoAt: "2026-10-02T15:00:00Z",
      formato: "application/pdf",
    })
    const conDocumentos = (cambio: string | null) =>
      vistaVerificacion({
        empresa: EMPRESA,
        contacto: CONTACTO,
        documentos: {
          ...DOCUMENTOS,
          empresa: { ...DOCUMENTOS.empresa, identificacionCambiadaAt: cambio },
          documentos: [aprobado("RUT"), aprobado("CAMARA_COMERCIO")],
        },
      })
    expect(conDocumentos(null).faltantes).toEqual([])
    const cambiada = conDocumentos("2026-10-15T12:00:00Z")
    expect(cambiada.faltantes).toEqual(["el RUT", "la Cámara de Comercio"])
    expect(cambiada.pasos?.[2]).toMatchObject({
      estado: "atencion",
      listo: false,
      detalle: "Por corregir: RUT y Cámara de Comercio.",
    })
  })

  it("rechazada: reenvío; verificada: sin pasos y con la identificación bloqueada", () => {
    expect(
      vistaVerificacion({
        empresa: { ...EMPRESA, estado: "RECHAZADO" },
        contacto: CONTACTO,
        documentos: DOCUMENTOS,
      }).envio
    ).toEqual({ reenvio: true })
    const verificada = vistaVerificacion({
      empresa: { ...EMPRESA, estado: "VERIFICADO" },
      contacto: CONTACTO,
      documentos: DOCUMENTOS,
    })
    expect(verificada).toMatchObject({
      pasos: null,
      progreso: null,
      faltantes: [],
      envio: null,
      identificacionBloqueada: true,
    })
  })
})

describe("presentarSituacionEmpresa", () => {
  it("en alta cuenta los pasos que faltan o invita a enviar", () => {
    expect(presentarSituacionEmpresa({ tipo: "alta" }, 2)).toMatchObject({
      titulo: "Verifica tu empresa",
      tono: "info",
    })
    expect(presentarSituacionEmpresa({ tipo: "alta" }, 1).descripcion).toMatch(
      /^Te falta 1 paso/
    )
    expect(presentarSituacionEmpresa({ tipo: "alta" }, 0)).toMatchObject({
      titulo: "Todo listo para enviar",
      tono: "exito",
    })
  })

  it("en revisión dice desde cuándo (hora de Bogotá)", () => {
    expect(
      presentarSituacionEmpresa(
        { tipo: "en-revision", enviadoAt: "2026-10-21T03:00:00Z" },
        0
      ).descripcion
    ).toMatch(/^La enviaste el 20 de octubre de 2026\./)
  })

  it("rechazada pide corregir; suspendida explica lo que no puede hacer", () => {
    expect(
      presentarSituacionEmpresa({ tipo: "rechazado", motivo: "x" }, 0)
    ).toMatchObject({
      titulo: "Tu verificación no fue aprobada",
      tono: "peligro",
    })
    expect(
      presentarSituacionEmpresa({ tipo: "suspendido", motivo: null }, 0)
        .descripcion
    ).toMatch(/no puedes activar campañas ni enviar ofertas a revisión/)
    expect(
      presentarSituacionEmpresa({ tipo: "verificado", verificadoAt: null }, 0)
        .titulo
    ).toBe("Tu empresa está verificada")
  })
})
