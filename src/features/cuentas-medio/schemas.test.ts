import { describe, expect, it } from "vitest"

import type { ArchivoSubido } from "@/lib/archivos/tipos"

import {
  esquemaCapturaCodigo,
  esquemaEditarCuenta,
  esquemaFormularioCuenta,
  esquemaGenerarCodigo,
  esquemaPrepararCaptura,
  esquemaRegistrarCuenta,
  esquemaSeguidores,
  esquemaVerificacionManual,
  LIMITES_CUENTA,
  REGLAS_CAPTURA,
  REGLAS_SELECCION_CAPTURA,
} from "./schemas"

const CUENTA_ID = "01a163a7-f319-7427-951f-3da7a3ad87d6"
const VERIFICACION_ID = "01a163a7-f319-7ec9-97d0-68fd485da70b"

const CAPTURA: ArchivoSubido = {
  nombre: "captura.webp",
  tipo: "image/webp",
  tamano: 120_000,
  sha256: null,
  dimensiones: { ancho: 1080, alto: 1920 },
  duracionSeg: null,
  conMiniatura: false,
  bucket: "documentos",
  ruta: `medio/x/cuenta_social/${CUENTA_ID}/a.webp`,
  rutaMiniatura: null,
}

function errores(resultado: { success: boolean; error?: unknown }) {
  if (resultado.success) throw new Error("Se esperaba un error")
  const error = resultado.error as {
    issues: { path: PropertyKey[]; message: string }[]
  }
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join("."), issue.message])
  )
}

describe("esquemaRegistrarCuenta", () => {
  it("resuelve el perfil a usuario y URL canónica y lee la tarifa es-CO", () => {
    expect(
      esquemaRegistrarCuenta.parse({
        plataforma: "INSTAGRAM",
        perfil: "https://www.instagram.com/Noticias.Sur/",
        tarifa: "$ 250.000",
      })
    ).toEqual({
      plataforma: "INSTAGRAM",
      handle: "noticias.sur",
      url: "https://www.instagram.com/noticias.sur/",
      tarifaReferencia: 250_000,
    })
  })

  it("la tarifa es opcional", () => {
    const datos = esquemaRegistrarCuenta.parse({
      plataforma: "TIKTOK",
      perfil: "@noticias",
      tarifa: "",
    })
    expect(datos.tarifaReferencia).toBeNull()
  })

  it("pide elegir la red y lleva el error del perfil a su campo", () => {
    expect(
      errores(
        esquemaRegistrarCuenta.safeParse({
          plataforma: "",
          perfil: "@noticias",
          tarifa: "",
        })
      )
    ).toEqual({ plataforma: "Elige la red social." })
    expect(
      errores(
        esquemaRegistrarCuenta.safeParse({
          plataforma: "FACEBOOK",
          perfil: "https://www.instagram.com/noticias/",
          tarifa: "",
        })
      ).perfil
    ).toMatch(/es de Instagram, pero la cuenta es de Facebook/)
  })

  it("rechaza tarifas con decimales, en cero o desmesuradas", () => {
    const base = { plataforma: "INSTAGRAM", perfil: "@noticias" }
    expect(
      errores(
        esquemaRegistrarCuenta.safeParse({ ...base, tarifa: "250.000,50" })
      ).tarifa
    ).toMatch(/sin decimales/)
    expect(
      errores(esquemaRegistrarCuenta.safeParse({ ...base, tarifa: "0" })).tarifa
    ).toBe("La tarifa debe ser mayor que cero.")
    expect(
      errores(
        esquemaRegistrarCuenta.safeParse({
          ...base,
          tarifa: LIMITES_CUENTA.tarifaMax + 1,
        })
      ).tarifa
    ).toMatch(/demasiado alta/)
    expect(
      errores(esquemaRegistrarCuenta.safeParse({ ...base, tarifa: "mucho" }))
        .tarifa
    ).toMatch(/en pesos/)
  })

  it("rechaza una red que no existe", () => {
    expect(
      errores(
        esquemaRegistrarCuenta.safeParse({
          plataforma: "YOUTUBE",
          perfil: "@noticias",
          tarifa: "",
        })
      ).plataforma
    ).toBe("Elige una red social de la lista.")
  })
})

describe("esquemaEditarCuenta", () => {
  it("agrega el id y la versión de la cuenta", () => {
    expect(
      esquemaEditarCuenta.parse({
        cuentaId: CUENTA_ID,
        actualizadaAt: "2026-10-22T05:19:00.123456+00:00",
        plataforma: "FACEBOOK",
        perfil: "NoticiasDelSur",
        tarifa: 300000,
      })
    ).toEqual({
      cuentaId: CUENTA_ID,
      actualizadaAt: "2026-10-22T05:19:00.123456+00:00",
      plataforma: "FACEBOOK",
      perfil: {
        handle: "NoticiasDelSur",
        url: "https://www.facebook.com/NoticiasDelSur",
      },
      tarifaReferencia: 300_000,
    })
  })

  it("perfil `null`: el usuario no cambia y no se vuelve a validar", () => {
    expect(
      esquemaEditarCuenta.parse({
        cuentaId: CUENTA_ID,
        actualizadaAt: "v1",
        plataforma: "TIKTOK",
        perfil: null,
        tarifa: "180.000",
      })
    ).toEqual({
      cuentaId: CUENTA_ID,
      actualizadaAt: "v1",
      plataforma: "TIKTOK",
      perfil: null,
      tarifaReferencia: 180_000,
    })
  })

  it("exige un id válido", () => {
    expect(
      errores(
        esquemaEditarCuenta.safeParse({
          cuentaId: "x",
          actualizadaAt: "v",
          plataforma: "FACEBOOK",
          perfil: "NoticiasDelSur",
          tarifa: "",
        })
      ).cuentaId
    ).toBe("Identificador inválido.")
  })
})

describe("esquemaFormularioCuenta", () => {
  // Usuario anterior a las reglas de hoy (Facebook no admite «_»).
  const LEGADO = "@noticias_del_sur"

  it("al editar, un perfil sin cambios no se valida", () => {
    expect(
      esquemaFormularioCuenta(LEGADO).safeParse({
        plataforma: "FACEBOOK",
        perfil: LEGADO,
        tarifa: "",
      }).success
    ).toBe(true)
  })

  it("si se cambia, o en un alta, se valida con las reglas de la red", () => {
    expect(
      esquemaFormularioCuenta(LEGADO).safeParse({
        plataforma: "FACEBOOK",
        perfil: "@otra_pagina",
        tarifa: "",
      }).success
    ).toBe(false)
    expect(
      esquemaFormularioCuenta(null).safeParse({
        plataforma: "FACEBOOK",
        perfil: LEGADO,
        tarifa: "",
      }).success
    ).toBe(false)
  })
})

describe("seguidores", () => {
  it("lee cifras escritas en es-CO", () => {
    expect(esquemaSeguidores.parse({ seguidores: "45.000" })).toEqual({
      seguidores: 45_000,
    })
    expect(esquemaSeguidores.parse({ seguidores: 120_500 })).toEqual({
      seguidores: 120_500,
    })
  })

  it("explica cada error con un ejemplo", () => {
    expect(errores(esquemaSeguidores.safeParse({ seguidores: "" }))).toEqual({
      seguidores: "Escribe cuántos seguidores tiene hoy la cuenta.",
    })
    expect(
      errores(esquemaSeguidores.safeParse({ seguidores: "45 mil" })).seguidores
    ).toMatch(/por ejemplo 45\.000/)
    expect(
      errores(esquemaSeguidores.safeParse({ seguidores: "45,5" })).seguidores
    ).toMatch(/solo el número/)
    expect(
      errores(esquemaSeguidores.safeParse({ seguidores: "0" })).seguidores
    ).toBe("La cuenta debe tener al menos un seguidor.")
  })
})

describe("esquemas de verificación", () => {
  it("generar código: cuenta y seguidores", () => {
    expect(
      esquemaGenerarCodigo.parse({ cuentaId: CUENTA_ID, seguidores: "40.000" })
    ).toEqual({ cuentaId: CUENTA_ID, seguidores: 40_000 })
  })

  it("manual: seguidores y la captura ya subida", () => {
    const datos = esquemaVerificacionManual.parse({
      cuentaId: CUENTA_ID,
      seguidores: "52.300",
      captura: CAPTURA,
    })
    expect(datos.seguidores).toBe(52_300)
    expect(datos.captura.ruta).toBe(CAPTURA.ruta)
  })

  it("rechaza capturas que no son imágenes", () => {
    expect(
      esquemaCapturaCodigo.safeParse({
        verificacionId: VERIFICACION_ID,
        captura: { ...CAPTURA, tipo: "application/pdf" },
      }).success
    ).toBe(false)
  })

  it("preparar: valida la descripción con los límites del bucket", () => {
    const { bucket: _b, ruta: _r, rutaMiniatura: _m, ...descripcion } = CAPTURA
    expect(
      esquemaPrepararCaptura.safeParse({ cuentaId: CUENTA_ID, descripcion })
        .success
    ).toBe(true)
    expect(
      esquemaPrepararCaptura.safeParse({
        cuentaId: CUENTA_ID,
        descripcion: { ...descripcion, tamano: REGLAS_CAPTURA.maxBytes + 1 },
      }).success
    ).toBe(false)
  })

  it("al elegir se admite más peso del que se sube (se comprime antes)", () => {
    expect(REGLAS_SELECCION_CAPTURA.maxBytes).toBeGreaterThan(
      REGLAS_CAPTURA.maxBytes
    )
    expect(REGLAS_SELECCION_CAPTURA.mimes).toEqual(REGLAS_CAPTURA.mimes)
  })
})
