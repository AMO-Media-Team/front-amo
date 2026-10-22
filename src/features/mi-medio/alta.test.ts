import { describe, expect, it } from "vitest"

import {
  type DatosAlta,
  enAlta,
  enumerar,
  NOMBRE_EN_FRASE,
  type PasoAlta,
  pasosAlta,
  pasosPorCompletar,
  progresoAlta,
  puedeEnviar,
  RUTA_TERMINOS,
  RUTAS_MI_MEDIO,
  situacionMedio,
} from "./alta"
import type { EstadoRequisito, TipoDocumentoMedio } from "./requisitos"

function requisito(
  tipo: TipoDocumentoMedio,
  situacion: EstadoRequisito["situacion"],
  parcial: Partial<EstadoRequisito> = {}
): EstadoRequisito {
  return {
    tipo,
    situacion,
    fechaVencimiento: null,
    porVencer: false,
    observaciones: null,
    porVideollamada: false,
    renovacionEnRevision: false,
    ...parcial,
  }
}

const NIVEL_1_COMPLETO = [
  requisito("CEDULA_FRENTE", "aprobado"),
  requisito("CEDULA_REVERSO", "aprobado"),
  requisito("PRUEBA_VIDA", "falta"),
  requisito("CERT_BILLETERA", "en-revision"),
]

function datos(parcial: Partial<DatosAlta> = {}): DatosAlta {
  return {
    perfil: { tieneDescripcion: true, categorias: 2, paisesAudiencia: 1 },
    documentos: {
      nivel: 1,
      requisitos: NIVEL_1_COMPLETO,
      faltaMetodoPago: false,
    },
    pago: { titular: true, documentoIdentidad: true, cuentaPago: true },
    cuentas: {
      registradas: 1,
      verificadas: 1,
      enRevision: 0,
      sinCaptura: 0,
      rechazadas: 0,
    },
    terminos: { pendientes: 0 },
    ...parcial,
  }
}

function paso(lista: PasoAlta[], id: PasoAlta["id"]): PasoAlta {
  const encontrado = lista.find((p) => p.id === id)
  if (!encontrado) throw new Error(`Sin paso ${id}`)
  return encontrado
}

describe("rutas", () => {
  it("respeta las rutas que usa el resolvedor /ir", () => {
    expect(RUTAS_MI_MEDIO).toMatchObject({
      inicio: "/mi-medio",
      documentos: "/mi-medio/documentos",
      cuentas: "/mi-medio/cuentas",
    })
  })

  it("la compuerta de términos vuelve a «Mi medio»", () => {
    expect(RUTA_TERMINOS).toBe("/aceptar-terminos?next=%2Fmi-medio")
  })
})

describe("situacionMedio y enAlta", () => {
  const base = {
    nivel: 0,
    enviadoVerificacionAt: null,
    motivoEstado: null,
  }

  it("PENDIENTE sin enviar es alta; enviado, en revisión", () => {
    expect(situacionMedio({ ...base, estado: "PENDIENTE" })).toEqual({
      tipo: "alta",
    })
    expect(
      situacionMedio({
        ...base,
        estado: "PENDIENTE",
        enviadoVerificacionAt: "2026-10-20T15:00:00Z",
      })
    ).toEqual({ tipo: "en-revision", enviadoAt: "2026-10-20T15:00:00Z" })
  })

  it("RECHAZADO y SUSPENDIDO llevan su motivo (vacío = null)", () => {
    expect(
      situacionMedio({
        ...base,
        estado: "RECHAZADO",
        motivoEstado: "  Falta la cédula.  ",
      })
    ).toEqual({
      tipo: "rechazado",
      motivo: "Falta la cédula.",
      enviadoAt: null,
    })
    expect(
      situacionMedio({ ...base, estado: "SUSPENDIDO", motivoEstado: " " })
    ).toEqual({ tipo: "suspendido", motivo: null })
  })

  it("VERIFICADO lleva su nivel", () => {
    expect(situacionMedio({ ...base, estado: "VERIFICADO", nivel: 2 })).toEqual(
      { tipo: "verificado", nivel: 2 }
    )
  })

  it("solo alta, revisión y rechazo cuentan como alta", () => {
    expect(enAlta({ tipo: "alta" })).toBe(true)
    expect(enAlta({ tipo: "en-revision", enviadoAt: "x" })).toBe(true)
    expect(enAlta({ tipo: "rechazado", motivo: null, enviadoAt: null })).toBe(
      true
    )
    expect(enAlta({ tipo: "verificado", nivel: 1 })).toBe(false)
    expect(enAlta({ tipo: "suspendido", motivo: null })).toBe(false)
  })
})

describe("pasosAlta", () => {
  it("cinco pasos en orden fijo, todos listos con los datos completos", () => {
    const pasos = pasosAlta(datos())
    expect(pasos.map((p) => p.id)).toEqual([
      "perfil",
      "documentos",
      "pago",
      "cuentas",
      "terminos",
    ])
    expect(pasos.every((p) => p.listo)).toBe(true)
    expect(pasos.every((p) => p.estado === "completo")).toBe(true)
  })

  describe("perfil", () => {
    it("pide categorías y descripción", () => {
      const perfil = paso(
        pasosAlta(
          datos({
            perfil: {
              tieneDescripcion: false,
              categorias: 0,
              paisesAudiencia: 0,
            },
          })
        ),
        "perfil"
      )
      expect(perfil).toMatchObject({
        estado: "en-curso",
        listo: false,
        detalle: "Agrega tus categorías y la descripción de tu audiencia.",
        href: "/mi-medio/perfil",
      })
    })

    it("la audiencia por país es opcional: solo cambia el texto", () => {
      const perfil = paso(
        pasosAlta(
          datos({
            perfil: {
              tieneDescripcion: true,
              categorias: 1,
              paisesAudiencia: 0,
            },
          })
        ),
        "perfil"
      )
      expect(perfil.listo).toBe(true)
      expect(perfil.detalle).toMatch(/Puedes sumar el origen/)
    })
  })

  describe("documentos", () => {
    const conRequisitos = (
      requisitos: EstadoRequisito[],
      faltaMetodoPago = false
    ) =>
      paso(
        pasosAlta(
          datos({ documentos: { nivel: 1, requisitos, faltaMetodoPago } })
        ),
        "documentos"
      )

    it("sin nada cargado está pendiente", () => {
      const documentos = conRequisitos([
        requisito("CEDULA_FRENTE", "falta"),
        requisito("CEDULA_REVERSO", "falta"),
        requisito("CERT_BANCARIA", "falta"),
      ])
      expect(documentos).toMatchObject({
        estado: "pendiente",
        listo: false,
        detalle: "Carga los 3 documentos del nivel 1.",
      })
    })

    it("sin método de pago explica que el certificado viene después", () => {
      const pendiente = conRequisitos(
        [requisito("CEDULA_FRENTE", "falta")],
        true
      )
      expect(pendiente.detalle).toMatch(/certificado de pago se pide/)
      const cedulaLista = conRequisitos(
        [
          requisito("CEDULA_FRENTE", "aprobado"),
          requisito("CEDULA_REVERSO", "en-revision"),
        ],
        true
      )
      expect(cedulaLista).toMatchObject({ estado: "en-curso", listo: false })
      expect(cedulaLista.detalle).toMatch(/registra primero la cuenta/)
    })

    it("con lo cargado en revisión ya está listo para enviar", () => {
      const documentos = conRequisitos([
        requisito("CEDULA_FRENTE", "en-revision"),
        requisito("CEDULA_REVERSO", "en-revision"),
        requisito("CERT_BANCARIA", "aprobado"),
      ])
      expect(documentos).toMatchObject({
        estado: "completo",
        listo: true,
        detalle: "Cargados. 2 están en revisión.",
      })
    })

    it("la prueba de vida faltante no frena el envío", () => {
      expect(conRequisitos(NIVEL_1_COMPLETO).listo).toBe(true)
      expect(conRequisitos(NIVEL_1_COMPLETO).descripcion).toMatch(
        /prueba de vida es opcional/
      )
    })

    it("un rechazado o vencido pide atención", () => {
      const documentos = conRequisitos([
        requisito("CEDULA_FRENTE", "rechazado"),
        requisito("CEDULA_REVERSO", "vencido"),
        requisito("CERT_BANCARIA", "aprobado"),
      ])
      expect(documentos).toMatchObject({
        estado: "atencion",
        listo: false,
        detalle: "2 documentos necesitan que los cargues de nuevo.",
      })
    })

    it("aprobado pero por vencer: listo y con atención", () => {
      const documentos = conRequisitos([
        requisito("CEDULA_FRENTE", "aprobado", { porVencer: true }),
        requisito("CEDULA_REVERSO", "aprobado"),
        requisito("CERT_BANCARIA", "aprobado"),
      ])
      expect(documentos).toMatchObject({ estado: "atencion", listo: true })
      expect(documentos.detalle).toBe(
        "1 documento vence pronto: carga uno vigente."
      )
    })

    it("por vencer con la renovación ya cargada no pide atención", () => {
      const documentos = conRequisitos([
        requisito("CEDULA_FRENTE", "aprobado", {
          porVencer: true,
          renovacionEnRevision: true,
        }),
        requisito("CEDULA_REVERSO", "aprobado"),
        requisito("CERT_BANCARIA", "aprobado"),
      ])
      expect(documentos.estado).toBe("completo")
      expect(documentos.detalle).toBe("Aprobados y al día.")
    })

    it("a medias cuenta lo que falta", () => {
      const documentos = conRequisitos([
        requisito("CEDULA_FRENTE", "aprobado"),
        requisito("CEDULA_REVERSO", "falta"),
        requisito("CERT_BANCARIA", "falta"),
      ])
      expect(documentos).toMatchObject({
        estado: "en-curso",
        detalle: "2 documentos por cargar.",
      })
    })

    it("con la prueba de vida cubierta no repite que es opcional", () => {
      const documentos = conRequisitos([
        requisito("CEDULA_FRENTE", "aprobado"),
        requisito("PRUEBA_VIDA", "aprobado", { porVideollamada: true }),
      ])
      expect(documentos.descripcion).not.toMatch(/opcional/)
    })
  })

  describe("pago", () => {
    const conPago = (pago: DatosAlta["pago"]) =>
      paso(pasosAlta(datos({ pago })), "pago")

    it("pendiente sin nada; en curso a medias; listo completo", () => {
      expect(
        conPago({
          titular: false,
          documentoIdentidad: false,
          cuentaPago: false,
        })
      ).toMatchObject({
        estado: "pendiente",
        detalle: "Registra tu documento y la cuenta donde te pagamos.",
      })
      expect(
        conPago({ titular: true, documentoIdentidad: true, cuentaPago: false })
      ).toMatchObject({
        estado: "en-curso",
        listo: false,
        detalle: "Registra la cuenta donde te pagamos.",
      })
      expect(
        conPago({ titular: true, documentoIdentidad: true, cuentaPago: true })
      ).toMatchObject({ estado: "completo", listo: true })
    })
  })

  describe("cuentas", () => {
    const conCuentas = (cuentas: DatosAlta["cuentas"]) =>
      paso(pasosAlta(datos({ cuentas })), "cuentas")

    it("sin cuentas está pendiente", () => {
      expect(
        conCuentas({
          registradas: 0,
          verificadas: 0,
          enRevision: 0,
          sinCaptura: 0,
          rechazadas: 0,
        })
      ).toMatchObject({ estado: "pendiente", listo: false })
    })

    it("registrada sin verificar está en curso", () => {
      expect(
        conCuentas({
          registradas: 1,
          verificadas: 0,
          enRevision: 0,
          sinCaptura: 0,
          rechazadas: 0,
        })
      ).toMatchObject({
        estado: "en-curso",
        listo: false,
        detalle: "Falta verificar que la cuenta es tuya.",
      })
    })

    it("en revisión ya cuenta para enviar", () => {
      expect(
        conCuentas({
          registradas: 2,
          verificadas: 0,
          enRevision: 2,
          sinCaptura: 0,
          rechazadas: 0,
        })
      ).toMatchObject({
        estado: "completo",
        listo: true,
        detalle: "2 cuentas en revisión.",
      })
    })

    it("con la verificación iniciada pero sin captura, sigue en curso", () => {
      expect(
        conCuentas({
          registradas: 1,
          verificadas: 0,
          enRevision: 0,
          sinCaptura: 1,
          rechazadas: 0,
        })
      ).toMatchObject({
        estado: "en-curso",
        listo: false,
        detalle: "Termina de verificar tu cuenta: falta cargar la captura.",
      })
    })

    it("rechazada pide atención", () => {
      expect(
        conCuentas({
          registradas: 1,
          verificadas: 0,
          enRevision: 0,
          sinCaptura: 0,
          rechazadas: 1,
        })
      ).toMatchObject({ estado: "atencion", listo: false })
    })

    it("una verificada basta", () => {
      expect(
        conCuentas({
          registradas: 3,
          verificadas: 1,
          enRevision: 0,
          sinCaptura: 0,
          rechazadas: 2,
        })
      ).toMatchObject({ listo: true, detalle: "1 cuenta verificada." })
    })
  })

  describe("términos", () => {
    it("con pendientes enlaza a la compuerta; aceptados, sin enlace", () => {
      expect(
        paso(pasosAlta(datos({ terminos: { pendientes: 2 } })), "terminos")
      ).toMatchObject({
        estado: "pendiente",
        listo: false,
        href: RUTA_TERMINOS,
        detalle: "2 documentos por aceptar.",
      })
      expect(paso(pasosAlta(datos()), "terminos").href).toBeNull()
    })
  })
})

describe("progreso, pendientes y envío", () => {
  const incompletos = pasosAlta(
    datos({
      pago: { titular: false, documentoIdentidad: false, cuentaPago: false },
      terminos: { pendientes: 1 },
    })
  )

  it("cuenta los pasos listos", () => {
    expect(progresoAlta(incompletos)).toEqual({
      completos: 3,
      total: 5,
      fraccion: 0.6,
    })
    expect(progresoAlta([])).toEqual({ completos: 0, total: 0, fraccion: 0 })
  })

  it("lista lo que falta para enviar", () => {
    expect(pasosPorCompletar(incompletos).map((p) => p.id)).toEqual([
      "pago",
      "terminos",
    ])
  })

  it("se envía en el alta o tras un rechazo, con todo listo", () => {
    const listos = pasosAlta(datos())
    expect(puedeEnviar({ tipo: "alta" }, listos)).toBe(true)
    expect(
      puedeEnviar({ tipo: "rechazado", motivo: null, enviadoAt: null }, listos)
    ).toBe(true)
    expect(puedeEnviar({ tipo: "alta" }, incompletos)).toBe(false)
  })

  it("en revisión o verificado no se vuelve a enviar", () => {
    const listos = pasosAlta(datos())
    expect(puedeEnviar({ tipo: "en-revision", enviadoAt: "x" }, listos)).toBe(
      false
    )
    expect(puedeEnviar({ tipo: "verificado", nivel: 1 }, listos)).toBe(false)
    expect(puedeEnviar({ tipo: "suspendido", motivo: null }, listos)).toBe(
      false
    )
  })
})

describe("enumerar", () => {
  it("une con comas y «y» al final", () => {
    expect(enumerar([])).toBe("")
    expect(enumerar([NOMBRE_EN_FRASE.perfil])).toBe("tu perfil")
    expect(enumerar(["a", "b"])).toBe("a y b")
    expect(
      enumerar([
        NOMBRE_EN_FRASE.perfil,
        NOMBRE_EN_FRASE.documentos,
        NOMBRE_EN_FRASE.pago,
      ])
    ).toBe("tu perfil, tus documentos y tus datos de pago")
  })
})
