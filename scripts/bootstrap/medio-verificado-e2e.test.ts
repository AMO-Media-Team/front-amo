// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import {
  contextoCifrado,
  leerCuentaPago,
} from "../../src/features/mi-medio/datos-pago"
import {
  crearCifrador,
  enmascarar,
  LARGO_MAXIMO_RESUMEN,
} from "../../src/lib/cifrado"
import {
  type CifradorPago,
  CUENTA_PAGO_E2E,
  cuentaAlDia,
  cuentaPagoDe,
  datosPagoE2E,
  describirPaso,
  documentosExigidos,
  type EstadoMedioVerificado,
  type FilaPagoMedio,
  formatoDocumento,
  MEDIO_SUSPENSION_VERIFICADO_E2E,
  MEDIO_VERIFICADO_E2E,
  PAGO_MEDIO_E2E,
  pagoAlDia,
  type PasoMedio,
  pasosEstadoMedio,
  planMedioVerificado,
  tiposVigentes,
  vigenciaDocumento,
} from "./medio-verificado-e2e"
import {
  CUENTA_INSTAGRAM_E2E,
  MEDIO_E2E_ID,
  NIVEL_MEDIO_E2E,
} from "./medios-e2e"

vi.mock("server-only", () => ({}))

/** CHECK de las columnas cifradas de `medios_privado` (migración e2_onboarding_medio). */
const CHECK_CIFRADO =
  /^v[0-9]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+$/

function cifradorDePrueba(byte: number, version = 1): CifradorPago {
  const cifrador = crearCifrador({
    actual: `k${version}:${Buffer.alloc(32, byte).toString("base64")}`,
  })
  return {
    cifrar: cifrador.cifrar,
    descifrar: cifrador.descifrar,
    huella: cifrador.huella,
    enmascarar,
  }
}

const CIFRADOR = cifradorDePrueba(7)
const OTRA_LLAVE = cifradorDePrueba(9, 2)

/** Lo que `guardar_datos_pago_medio_srv` deja en la fila con esos `p_datos`. */
function filaGuardada(datos: ReturnType<typeof datosPagoE2E>): FilaPagoMedio {
  return datos
}

// ── Datos de pago ────────────────────────────────────────────────────────────

describe("datosPagoE2E", () => {
  const datos = datosPagoE2E(MEDIO_E2E_ID, CIFRADOR)

  it("solo usa claves que admite guardar_datos_pago_medio_srv", () => {
    const admitidas = [
      "titular_nombre",
      "tipo_documento",
      "numero_documento_cifrado",
      "numero_documento_hash",
      "numero_documento_resumen",
      "metodo_pago",
      "datos_pago_cifrados",
      "datos_pago_resumen",
      "es_declarante",
      "obligado_facturar",
      "responsable_iva",
      "celular",
      "email_contacto",
      "direccion",
    ]
    expect(Object.keys(datos).sort()).toEqual([...admitidas].sort())
  })

  it("cifra con el formato del CHECK y el contexto «medios_privado:<id>:<columna>»", () => {
    expect(datos.numero_documento_cifrado).toMatch(CHECK_CIFRADO)
    expect(datos.datos_pago_cifrados).toMatch(CHECK_CIFRADO)
    expect(
      CIFRADOR.descifrar(
        datos.numero_documento_cifrado,
        `medios_privado:${MEDIO_E2E_ID}:numero_documento_cifrado`
      )
    ).toBe(PAGO_MEDIO_E2E.numeroDocumento)
    const cuenta = CIFRADOR.descifrar(
      datos.datos_pago_cifrados,
      contextoCifrado(MEDIO_E2E_ID, "datos_pago_cifrados")
    )
    expect(leerCuentaPago(cuenta)).toEqual(CUENTA_PAGO_E2E)
    // Con el contexto de otra columna no se descifra.
    expect(() =>
      CIFRADOR.descifrar(
        datos.datos_pago_cifrados,
        contextoCifrado(MEDIO_E2E_ID, "numero_documento_cifrado")
      )
    ).toThrow()
  })

  it("la huella es la del documento con su tipo y los resúmenes no revelan más de 4 dígitos", () => {
    expect(datos.numero_documento_hash).toBe(
      CIFRADOR.huella(`CC:${PAGO_MEDIO_E2E.numeroDocumento}`)
    )
    expect(datos.numero_documento_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(datos.numero_documento_resumen).toBe("•••• 0001")
    expect(datos.datos_pago_resumen).toBe("Bancolombia •••• 2345")
    expect(datos.datos_pago_resumen.length).toBeLessThanOrEqual(
      LARGO_MAXIMO_RESUMEN
    )
  })

  it("el pago va completo: método, cuenta cifrada y resumen", () => {
    expect(datos.metodo_pago).toBe("BANCARIO")
    expect(datos.datos_pago_cifrados).toBeTruthy()
    expect(datos.datos_pago_resumen).toBeTruthy()
  })
})

describe("pagoAlDia", () => {
  const fila = filaGuardada(datosPagoE2E(MEDIO_E2E_ID, CIFRADOR))

  it("reconoce la fila que ya guardó una corrida anterior (sin volver a cifrar)", () => {
    expect(pagoAlDia(fila, MEDIO_E2E_ID, CIFRADOR)).toBe(true)
  })

  it("exige guardar si no hay fila o si una prueba cambió algo", () => {
    expect(pagoAlDia(null, MEDIO_E2E_ID, CIFRADOR)).toBe(false)
    expect(
      pagoAlDia({ ...fila, titular_nombre: "Otro" }, MEDIO_E2E_ID, CIFRADOR)
    ).toBe(false)
    expect(
      pagoAlDia({ ...fila, es_declarante: true }, MEDIO_E2E_ID, CIFRADOR)
    ).toBe(false)
    expect(
      pagoAlDia({ ...fila, metodo_pago: "BILLETERA" }, MEDIO_E2E_ID, CIFRADOR)
    ).toBe(false)
  })

  it("exige guardar si la cuenta cifrada es otra o falta", () => {
    const otraCuenta = CIFRADOR.cifrar(
      JSON.stringify({ v: 1, ...CUENTA_PAGO_E2E, numero: "40900099999" }),
      contextoCifrado(MEDIO_E2E_ID, "datos_pago_cifrados")
    )
    expect(
      pagoAlDia(
        { ...fila, datos_pago_cifrados: otraCuenta },
        MEDIO_E2E_ID,
        CIFRADOR
      )
    ).toBe(false)
    expect(
      pagoAlDia({ ...fila, datos_pago_cifrados: null }, MEDIO_E2E_ID, CIFRADOR)
    ).toBe(false)
    expect(
      pagoAlDia(
        { ...fila, numero_documento_cifrado: null },
        MEDIO_E2E_ID,
        CIFRADOR
      )
    ).toBe(false)
  })

  it("exige guardar si la llave cambió o el valor es de otro medio", () => {
    // Con otra llave cambian la huella y el descifrado.
    expect(pagoAlDia(fila, MEDIO_E2E_ID, OTRA_LLAVE)).toBe(false)
    // El mismo valor cifrado para otro medio no sirve (contexto distinto).
    const deOtroMedio = filaGuardada(
      datosPagoE2E("e2e00000-0000-4000-8000-0000000000ff", CIFRADOR)
    )
    expect(pagoAlDia(deOtroMedio, MEDIO_E2E_ID, CIFRADOR)).toBe(false)
  })
})

// ── Cuenta social ────────────────────────────────────────────────────────────

describe("cuentaAlDia", () => {
  const ahora = new Date("2026-10-22T15:00:00Z")

  it("una verificación reciente está al día", () => {
    expect(
      cuentaAlDia(
        { verificada: true, fecha_ultima_verificacion: "2026-10-20T15:00:00Z" },
        30,
        ahora
      )
    ).toBe(true)
  })

  it("al entrar en reverificación (o sin verificar) ya no lo está", () => {
    expect(
      cuentaAlDia(
        { verificada: true, fecha_ultima_verificacion: "2026-09-22T15:00:00Z" },
        30,
        ahora
      )
    ).toBe(false)
    expect(
      cuentaAlDia(
        {
          verificada: false,
          fecha_ultima_verificacion: "2026-10-20T15:00:00Z",
        },
        30,
        ahora
      )
    ).toBe(false)
    expect(
      cuentaAlDia(
        { verificada: true, fecha_ultima_verificacion: null },
        30,
        ahora
      )
    ).toBe(false)
  })
})

// ── Documentos ───────────────────────────────────────────────────────────────

describe("documentosExigidos", () => {
  it("suma el certificado del medio de pago a los del nivel, sin repetir", () => {
    expect(
      documentosExigidos(
        ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA"],
        "BANCARIO"
      )
    ).toEqual([
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "CERT_BANCARIA",
    ])
    expect(documentosExigidos(["RUT", "CERT_BILLETERA"], "BILLETERA")).toEqual([
      "RUT",
      "CERT_BILLETERA",
    ])
  })
})

describe("tiposVigentes", () => {
  it("cuenta los aprobados sin vencimiento o que vencen hoy o después", () => {
    expect(
      tiposVigentes(
        [
          { tipo: "CEDULA_FRENTE", fecha_vencimiento: null },
          { tipo: "CERT_BANCARIA", fecha_vencimiento: "2026-10-22" },
          { tipo: "RUT", fecha_vencimiento: "2026-10-21" },
          { tipo: "CEDULA_FRENTE", fecha_vencimiento: "2027-01-01" },
        ],
        "2026-10-22"
      )
    ).toEqual(["CEDULA_FRENTE", "CERT_BANCARIA"])
  })
})

describe("formatoDocumento y vigenciaDocumento", () => {
  it("la cédula va como imagen; lo demás, en PDF", () => {
    expect(formatoDocumento("CEDULA_FRENTE")).toBe("image/png")
    expect(formatoDocumento("CEDULA_REVERSO")).toBe("image/png")
    expect(formatoDocumento("CERT_BANCARIA")).toBe("application/pdf")
    expect(formatoDocumento("RUT")).toBe("application/pdf")
  })

  it("los certificados de pago vencen en un año (fecha de Bogotá); el resto no", () => {
    // 22 oct. 2026 a las 23:30 en Bogotá ya es 23 oct. en UTC.
    const noche = new Date("2026-10-23T04:30:00Z")
    expect(vigenciaDocumento("CERT_BANCARIA", noche)).toBe("2027-10-22")
    expect(vigenciaDocumento("CERT_BILLETERA", noche)).toBe("2027-10-22")
    expect(vigenciaDocumento("CEDULA_FRENTE", noche)).toBeNull()
    expect(vigenciaDocumento("PRUEBA_VIDA", noche)).toBeNull()
  })
})

// ── Plan ─────────────────────────────────────────────────────────────────────

const EXIGIDOS = [
  "CEDULA_FRENTE",
  "CEDULA_REVERSO",
  "PRUEBA_VIDA",
  "CERT_BANCARIA",
] as const

const LISTO: EstadoMedioVerificado = {
  estado: "VERIFICADO",
  nivel: NIVEL_MEDIO_E2E,
  cuenta: {
    alDia: true,
    seguidores: CUENTA_INSTAGRAM_E2E.seguidores,
    verificacionPendienteId: null,
  },
  pagoAlDia: true,
  documentosVigentes: EXIGIDOS,
  documentosExigidos: EXIGIDOS,
}

const RECIEN_REGISTRADO: EstadoMedioVerificado = {
  estado: "PENDIENTE",
  nivel: 0,
  cuenta: null,
  pagoAlDia: false,
  documentosVigentes: [],
  documentosExigidos: EXIGIDOS,
}

describe("planMedioVerificado", () => {
  it("no hace nada si el medio ya es el que esperan las pruebas", () => {
    expect(planMedioVerificado(LISTO)).toEqual([])
  })

  it("desde cero: cuenta, pago y documentos antes de verificar el medio", () => {
    expect(planMedioVerificado(RECIEN_REGISTRADO)).toEqual<PasoMedio[]>([
      { paso: "REGISTRAR_CUENTA" },
      { paso: "VERIFICAR_CUENTA" },
      { paso: "GUARDAR_PAGO" },
      { paso: "APROBAR_DOCUMENTO", documento: "CEDULA_FRENTE" },
      { paso: "APROBAR_DOCUMENTO", documento: "CEDULA_REVERSO" },
      { paso: "VIDEOLLAMADA" },
      { paso: "APROBAR_DOCUMENTO", documento: "CERT_BANCARIA" },
      { paso: "VERIFICAR_MEDIO", nivel: NIVEL_MEDIO_E2E },
    ])
  })

  it("solo lo que falta: un certificado vencido", () => {
    expect(
      planMedioVerificado({
        ...LISTO,
        documentosVigentes: ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA"],
      })
    ).toEqual([{ paso: "APROBAR_DOCUMENTO", documento: "CERT_BANCARIA" }])
  })

  it("reverifica la cuenta vencida y descarta antes una verificación a medias", () => {
    expect(
      planMedioVerificado({
        ...LISTO,
        cuenta: {
          alDia: false,
          seguidores: CUENTA_INSTAGRAM_E2E.seguidores,
          verificacionPendienteId: "v-1",
        },
      })
    ).toEqual([
      { paso: "DESCARTAR_VERIFICACION", verificacionId: "v-1" },
      { paso: "VERIFICAR_CUENTA" },
    ])
  })

  it("vuelve a verificar la cuenta si una prueba cambió sus seguidores", () => {
    expect(
      planMedioVerificado({
        ...LISTO,
        cuenta: {
          alDia: true,
          seguidores: 55_000,
          verificacionPendienteId: null,
        },
      })
    ).toEqual([{ paso: "VERIFICAR_CUENTA" }])
  })

  it("guarda el pago si cambió", () => {
    expect(planMedioVerificado({ ...LISTO, pagoAlDia: false })).toEqual([
      { paso: "GUARDAR_PAGO" },
    ])
  })
})

describe("pasosEstadoMedio", () => {
  it("PENDIENTE se verifica en el nivel", () => {
    expect(pasosEstadoMedio("PENDIENTE", 0, 1)).toEqual([
      { paso: "VERIFICAR_MEDIO", nivel: 1 },
    ])
  })

  it("RECHAZADO vuelve a PENDIENTE por el propio medio y luego se verifica", () => {
    expect(pasosEstadoMedio("RECHAZADO", 0, 1)).toEqual([
      { paso: "REENVIAR_A_VERIFICACION" },
      { paso: "VERIFICAR_MEDIO", nivel: 1 },
    ])
  })

  it("SUSPENDIDO se reactiva y, si hace falta, cambia de nivel", () => {
    expect(pasosEstadoMedio("SUSPENDIDO", 1, 1)).toEqual([
      { paso: "REACTIVAR" },
    ])
    expect(pasosEstadoMedio("SUSPENDIDO", 2, 1)).toEqual([
      { paso: "REACTIVAR" },
      { paso: "CAMBIAR_NIVEL", nivel: 1 },
    ])
  })

  it("VERIFICADO solo cambia si el nivel es otro", () => {
    expect(pasosEstadoMedio("VERIFICADO", 1, 1)).toEqual([])
    expect(pasosEstadoMedio("VERIFICADO", 3, 1)).toEqual([
      { paso: "CAMBIAR_NIVEL", nivel: 1 },
    ])
  })
})

describe("describirPaso", () => {
  it("describe cada paso en palabras, sin datos sensibles", () => {
    const pasos: PasoMedio[] = [
      { paso: "REGISTRAR_CUENTA" },
      { paso: "DESCARTAR_VERIFICACION", verificacionId: "v-1" },
      { paso: "VERIFICAR_CUENTA" },
      { paso: "GUARDAR_PAGO" },
      { paso: "APROBAR_DOCUMENTO", documento: "RUT" },
      { paso: "VIDEOLLAMADA" },
      { paso: "REENVIAR_A_VERIFICACION" },
      { paso: "REACTIVAR" },
      { paso: "VERIFICAR_MEDIO", nivel: 1 },
      { paso: "CAMBIAR_NIVEL", nivel: 2 },
    ]
    for (const paso of pasos) {
      const texto = describirPaso(paso)
      expect(texto.length).toBeGreaterThan(5)
      expect(texto).not.toContain(PAGO_MEDIO_E2E.numeroCuenta)
      expect(texto).not.toContain(PAGO_MEDIO_E2E.numeroDocumento)
    }
  })
})

describe("Medio Suspensión E2E", () => {
  const medio = MEDIO_SUSPENSION_VERIFICADO_E2E

  it("es otro medio, con su cuenta y su documento (las huellas no chocan)", () => {
    expect(medio.datos.id).not.toBe(MEDIO_VERIFICADO_E2E.datos.id)
    expect(medio.cuenta.handle).not.toBe(MEDIO_VERIFICADO_E2E.cuenta.handle)
    expect(medio.datos.municipioPreferido).not.toBe(
      MEDIO_VERIFICADO_E2E.datos.municipioPreferido
    )
    const propia = datosPagoE2E(medio.datos.id, CIFRADOR, medio.pago)
    const delMedioE2E = datosPagoE2E(MEDIO_E2E_ID, CIFRADOR)
    expect(propia.numero_documento_hash).not.toBe(
      delMedioE2E.numero_documento_hash
    )
    expect(
      leerCuentaPago(
        CIFRADOR.descifrar(
          propia.datos_pago_cifrados,
          contextoCifrado(medio.datos.id, "datos_pago_cifrados")
        )
      )
    ).toEqual(cuentaPagoDe(medio.pago))
  })

  it("su pago al día no se confunde con el del Medio E2E", () => {
    const fila = filaGuardada(
      datosPagoE2E(medio.datos.id, CIFRADOR, medio.pago)
    )
    expect(pagoAlDia(fila, medio.datos.id, CIFRADOR, medio.pago)).toBe(true)
    expect(pagoAlDia(fila, medio.datos.id, CIFRADOR)).toBe(false)
  })

  it("se reverifica con sus seguidores y se describe con su cuenta", () => {
    const conSeguidoresDelOtro: EstadoMedioVerificado = {
      ...LISTO,
      cuenta: {
        alDia: true,
        seguidores: CUENTA_INSTAGRAM_E2E.seguidores,
        verificacionPendienteId: null,
      },
    }
    expect(planMedioVerificado(conSeguidoresDelOtro, medio)).toEqual<
      PasoMedio[]
    >([{ paso: "VERIFICAR_CUENTA" }])
    expect(
      planMedioVerificado(
        {
          ...LISTO,
          cuenta: {
            alDia: true,
            seguidores: medio.cuenta.seguidores,
            verificacionPendienteId: null,
          },
        },
        medio
      )
    ).toEqual([])
    expect(describirPaso({ paso: "REGISTRAR_CUENTA" }, medio.cuenta)).toBe(
      "cuenta de Instagram @medio.suspension.e2e.amo"
    )
    expect(describirPaso({ paso: "VERIFICAR_CUENTA" }, medio.cuenta)).toBe(
      "verificar la cuenta con 45000 seguidores"
    )
  })

  it("si quedó suspendido, el plan lo reactiva", () => {
    expect(
      planMedioVerificado(
        {
          ...LISTO,
          estado: "SUSPENDIDO",
          cuenta: {
            alDia: true,
            seguidores: medio.cuenta.seguidores,
            verificacionPendienteId: null,
          },
        },
        medio
      )
    ).toEqual<PasoMedio[]>([{ paso: "REACTIVAR" }])
  })
})
