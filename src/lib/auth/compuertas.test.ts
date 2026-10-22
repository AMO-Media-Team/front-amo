import type { JwtPayload } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import {
  aTerminoPendiente,
  destinoDeSolicitud,
  destinoFinal,
  esSesionDeEnlace,
  type EstadoCuenta,
  exigeAceptarTerminos,
  leerClaims,
  resolverCompuertas,
  rutaDePaso,
  VENTANA_ENLACE_SEGUNDOS,
} from "./compuertas"

const LISTA: EstadoCuenta = {
  perfilActivo: true,
  debeCambiarPassword: false,
  rolRequiereMfa: true,
  aal: "aal2",
  tieneFactorVerificado: true,
}

describe("resolverCompuertas (orden §2.6)", () => {
  it("una cuenta al día queda lista", () => {
    expect(resolverCompuertas(LISTA)).toEqual({ tipo: "listo" })
  })

  it("un perfil no activo sale antes que cualquier otro paso", () => {
    expect(
      resolverCompuertas({ ...LISTA, perfilActivo: false, aal: "aal1" })
    ).toEqual({ tipo: "salir" })
  })

  it("con factor verificado y aal1 verifica MFA antes de cambiar la contraseña", () => {
    expect(
      resolverCompuertas({ ...LISTA, aal: "aal1", debeCambiarPassword: true })
    ).toEqual({ tipo: "pendiente", paso: "mfa-verificar" })
  })

  it("el primer ingreso (sin factor) cambia la contraseña antes de enrolar MFA", () => {
    const primerIngreso = {
      ...LISTA,
      aal: "aal1" as const,
      tieneFactorVerificado: false,
      debeCambiarPassword: true,
    }
    expect(resolverCompuertas(primerIngreso)).toEqual({
      tipo: "pendiente",
      paso: "cambiar-contrasena",
    })
    expect(
      resolverCompuertas({ ...primerIngreso, debeCambiarPassword: false })
    ).toEqual({ tipo: "pendiente", paso: "mfa-configurar" })
  })

  it("un rol sin MFA obligatoria entra a aal1 sin factor", () => {
    expect(
      resolverCompuertas({
        ...LISTA,
        rolRequiereMfa: false,
        aal: "aal1",
        tieneFactorVerificado: false,
      })
    ).toEqual({ tipo: "listo" })
  })

  it("si un rol sin MFA obligatoria activó un factor, también debe verificarlo", () => {
    expect(
      resolverCompuertas({ ...LISTA, rolRequiereMfa: false, aal: "aal1" })
    ).toEqual({ tipo: "pendiente", paso: "mfa-verificar" })
  })
})

describe("resolverCompuertas: aceptar términos (AUT-012)", () => {
  /** Medio o anunciante: sin MFA obligatoria ni factor, en aal1. */
  const EXTERNO: EstadoCuenta = {
    ...LISTA,
    rolRequiereMfa: false,
    aal: "aal1",
    tieneFactorVerificado: false,
  }

  it("con términos pendientes y lo demás al día, pide aceptarlos", () => {
    expect(
      resolverCompuertas({ ...EXTERNO, terminosPendientes: true })
    ).toEqual({ tipo: "pendiente", paso: "aceptar-terminos" })
  })

  it("sin términos pendientes (o sin consultarlos) la cuenta queda lista", () => {
    expect(
      resolverCompuertas({ ...EXTERNO, terminosPendientes: false })
    ).toEqual({ tipo: "listo" })
    expect(resolverCompuertas(EXTERNO)).toEqual({ tipo: "listo" })
  })

  it("va después del cambio de contraseña", () => {
    expect(
      resolverCompuertas({
        ...EXTERNO,
        debeCambiarPassword: true,
        terminosPendientes: true,
      })
    ).toEqual({ tipo: "pendiente", paso: "cambiar-contrasena" })
  })

  it("va después de verificar y de configurar la MFA", () => {
    expect(
      resolverCompuertas({
        ...EXTERNO,
        tieneFactorVerificado: true,
        terminosPendientes: true,
      })
    ).toEqual({ tipo: "pendiente", paso: "mfa-verificar" })
    expect(
      resolverCompuertas({
        ...EXTERNO,
        rolRequiereMfa: true,
        terminosPendientes: true,
      })
    ).toEqual({ tipo: "pendiente", paso: "mfa-configurar" })
  })

  it("un perfil inactivo sale aunque tenga términos pendientes", () => {
    expect(
      resolverCompuertas({
        ...EXTERNO,
        perfilActivo: false,
        terminosPendientes: true,
      })
    ).toEqual({ tipo: "salir" })
  })

  it("al cerrar el cambio de contraseña, el siguiente paso son los términos", () => {
    const primerIngreso = {
      ...EXTERNO,
      debeCambiarPassword: true,
      terminosPendientes: true,
    }
    expect(
      resolverCompuertas({ ...primerIngreso, debeCambiarPassword: false })
    ).toEqual({ tipo: "pendiente", paso: "aceptar-terminos" })
  })
})

describe("exigeAceptarTerminos", () => {
  it("solo los portales externos aceptan términos", () => {
    expect(exigeAceptarTerminos("MEDIO")).toBe(true)
    expect(exigeAceptarTerminos("ANUNCIANTE")).toBe(true)
    expect(exigeAceptarTerminos("ADMIN")).toBe(false)
  })
})

describe("aTerminoPendiente", () => {
  it("convierte la fila de terminos_pendientes() en el DTO", () => {
    expect(
      aTerminoPendiente({
        id: "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
        tipo: "POLITICA_DATOS",
        version: "2.1",
        vigente_desde: "2026-10-22T05:00:00+00:00",
        hash_sha256: "ab".repeat(32),
        contenido_md: "# Política",
      })
    ).toEqual({
      id: "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
      tipo: "POLITICA_DATOS",
      version: "2.1",
      vigenteDesde: "2026-10-22T05:00:00+00:00",
      hashSha256: "ab".repeat(32),
      contenidoMd: "# Política",
    })
  })
})

describe("rutaDePaso", () => {
  it("la verificación MFA conserva el destino", () => {
    expect(rutaDePaso("mfa-verificar", "/reportes?x=1")).toBe(
      "/mfa/verificar?next=%2Freportes%3Fx%3D1"
    )
    expect(rutaDePaso("mfa-verificar")).toBe("/mfa/verificar")
  })

  it("la aceptación de términos conserva el destino", () => {
    expect(rutaDePaso("aceptar-terminos", "/ir/asignaciones/1")).toBe(
      "/aceptar-terminos?next=%2Fir%2Fasignaciones%2F1"
    )
    expect(rutaDePaso("aceptar-terminos")).toBe("/aceptar-terminos")
  })

  it("los pasos del primer ingreso no lo conservan", () => {
    expect(rutaDePaso("cambiar-contrasena", "/reportes")).toBe(
      "/cambiar-contrasena"
    )
    expect(rutaDePaso("mfa-configurar", "/reportes")).toBe("/mfa/configurar")
  })
})

describe("destinoDeSolicitud", () => {
  it("conserva una ruta privada con su búsqueda", () => {
    expect(destinoDeSolicitud("/ir/asignaciones/1")).toBe("/ir/asignaciones/1")
    expect(destinoDeSolicitud("/reportes/finanzas?periodo=30d")).toBe(
      "/reportes/finanzas?periodo=30d"
    )
  })

  it("no anota Inicio, la raíz ni las rutas públicas", () => {
    expect(destinoDeSolicitud("/inicio")).toBeUndefined()
    expect(destinoDeSolicitud("/")).toBeUndefined()
    expect(destinoDeSolicitud("/ingresar?next=%2Freportes")).toBeUndefined()
    expect(destinoDeSolicitud("/auth/salir")).toBeUndefined()
  })

  it("descarta lo ausente y los destinos externos o manipulados", () => {
    expect(destinoDeSolicitud(undefined)).toBeUndefined()
    expect(destinoDeSolicitud(null)).toBeUndefined()
    expect(destinoDeSolicitud("")).toBeUndefined()
    expect(destinoDeSolicitud("https://otro.sitio/inicio")).toBeUndefined()
    expect(destinoDeSolicitud("//otro.sitio")).toBeUndefined()
    expect(destinoDeSolicitud("/\\otro.sitio")).toBeUndefined()
  })

  it("con rutaDePaso, lleva el destino al paso de términos", () => {
    expect(
      rutaDePaso("aceptar-terminos", destinoDeSolicitud("/notificaciones"))
    ).toBe("/aceptar-terminos?next=%2Fnotificaciones")
    expect(rutaDePaso("aceptar-terminos", destinoDeSolicitud("/inicio"))).toBe(
      "/aceptar-terminos"
    )
  })
})

const USUARIO = "0192f3a4-5b6c-7d8e-9f01-23456789abcd"
const SESION = "0192f3a4-5b6c-7d8e-9f01-23456789abce"

function claims(extra: Partial<JwtPayload> = {}): JwtPayload {
  return {
    iss: "https://x.supabase.co/auth/v1",
    sub: USUARIO,
    aud: "authenticated",
    exp: 2,
    iat: 1,
    role: "authenticated",
    aal: "aal1",
    session_id: SESION,
    ...extra,
  }
}

describe("leerClaims", () => {
  it("extrae usuario, sesión, correo, nivel y métodos", () => {
    expect(
      leerClaims(
        claims({
          email: "ana@amo.test",
          aal: "aal2",
          amr: [
            { method: "totp", timestamp: 20 },
            { method: "password", timestamp: 10 },
          ],
        })
      )
    ).toEqual({
      usuarioId: USUARIO,
      sessionId: SESION,
      email: "ana@amo.test",
      aal: "aal2",
      metodos: [
        { metodo: "totp", instante: 20 },
        { metodo: "password", instante: 10 },
      ],
    })
  })

  it("ignora el formato de amr sin marcas de tiempo", () => {
    expect(leerClaims(claims({ amr: ["password"] }))?.metodos).toEqual([])
  })

  it("rechaza claims sin identificadores válidos", () => {
    expect(leerClaims(claims({ session_id: "x" }))).toBeNull()
    expect(leerClaims(claims({ sub: "" }))).toBeNull()
  })
})

describe("esSesionDeEnlace", () => {
  const ahora = 1_800_000_000_000
  const segundos = ahora / 1000

  it.each(["otp", "recovery", "invite", "magiclink"])(
    "acepta un ingreso reciente por enlace (%s)",
    (metodo) => {
      expect(
        esSesionDeEnlace(
          { metodos: [{ metodo, instante: segundos - 60 }] },
          ahora
        )
      ).toBe(true)
    }
  )

  it("sigue aceptándolo tras verificar el TOTP (amr conserva el enlace)", () => {
    expect(
      esSesionDeEnlace(
        {
          metodos: [
            { metodo: "totp", instante: segundos },
            { metodo: "otp", instante: segundos - 60 },
          ],
        },
        ahora
      )
    ).toBe(true)
  })

  it("rechaza enlaces viejos y los ingresos con contraseña", () => {
    const viejo = segundos - VENTANA_ENLACE_SEGUNDOS - 1
    expect(
      esSesionDeEnlace({ metodos: [{ metodo: "otp", instante: viejo }] }, ahora)
    ).toBe(false)
    expect(
      esSesionDeEnlace(
        { metodos: [{ metodo: "password", instante: segundos }] },
        ahora
      )
    ).toBe(false)
  })
})

describe("destinoFinal", () => {
  const ahora = 1_800_000_000_000
  const enlace = { metodos: [{ metodo: "otp", instante: ahora / 1000 - 60 }] }
  const password = { metodos: [{ metodo: "password", instante: ahora / 1000 }] }

  it("vuelve a /restablecer solo con una sesión de enlace reciente", () => {
    expect(destinoFinal("/restablecer", enlace, ahora)).toBe("/restablecer")
    expect(destinoFinal("/restablecer", password, ahora)).toBe("/inicio")
  })

  it("en los demás casos usa el destino seguro tras ingresar", () => {
    expect(destinoFinal("/reportes", password, ahora)).toBe("/reportes")
    expect(destinoFinal("https://otro.sitio", enlace, ahora)).toBe("/inicio")
    expect(destinoFinal(undefined, enlace, ahora)).toBe("/inicio")
  })
})
