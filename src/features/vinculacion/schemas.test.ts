import { describe, expect, it } from "vitest"

import { desdeErrorZod } from "@/lib/result"

import {
  cuentaVacia,
  datosParaRpc,
  type EntradaInvitarSolicitud,
  type EntradaSolicitudVinculacion,
  esEnvioAutomatico,
  esquemaDescartarSolicitud,
  esquemaInvitarSolicitud,
  esquemaSolicitudVinculacion,
  VALORES_SOLICITUD,
} from "./schemas"

const VALIDA: EntradaSolicitudVinculacion = {
  nombreMedio: "  Noticias   del Sur ",
  tipo: "PAGINA_NOTICIAS",
  municipioCodigo: "52001",
  cuentas: [
    { plataforma: "INSTAGRAM", usuario: "@Noticias.Sur", seguidores: "45.000" },
    { plataforma: "TIKTOK", usuario: "noticiassur", seguidores: "" },
  ],
  contactoNombre: " Ana  Pérez ",
  email: " Ana@Ejemplo.CO ",
  celular: "300-123-4567",
  mensaje: "\n Hola,\n\n\n\n queremos unirnos. \n",
  autorizaDatos: true,
  sitioWeb: "",
}

function erroresDe(entrada: unknown): Record<string, string[]> {
  const resultado = esquemaSolicitudVinculacion.safeParse(entrada)
  if (resultado.success) return {}
  return desdeErrorZod(resultado.error).erroresCampo ?? {}
}

describe("esquemaSolicitudVinculacion", () => {
  it("normaliza lo que se guarda", () => {
    const datos = esquemaSolicitudVinculacion.parse(VALIDA)
    expect(datos).toMatchObject({
      nombreMedio: "Noticias del Sur",
      tipo: "PAGINA_NOTICIAS",
      contactoNombre: "Ana Pérez",
      email: "ana@ejemplo.co",
      celular: "300 123 4567",
      mensaje: "Hola,\n\n queremos unirnos.",
      autorizaDatos: true,
      cuentas: [
        {
          plataforma: "INSTAGRAM",
          usuario: "noticias.sur",
          seguidores: 45_000,
        },
        { plataforma: "TIKTOK", usuario: "noticiassur", seguidores: null },
      ],
    })
  })

  it("tipo, celular y mensaje son opcionales", () => {
    const datos = esquemaSolicitudVinculacion.parse({
      ...VALIDA,
      tipo: "",
      celular: "",
      mensaje: "   ",
    })
    expect(datos.tipo).toBeNull()
    expect(datos.celular).toBeNull()
    expect(datos.mensaje).toBeNull()
  })

  it("el formulario vacío marca cada campo obligatorio", () => {
    const errores = erroresDe(VALORES_SOLICITUD)
    expect(errores.nombreMedio).toEqual(["Escribe el nombre del medio."])
    expect(errores.municipioCodigo).toEqual(["Elige el municipio."])
    expect(errores["cuentas.0.usuario"]).toEqual([
      "Escribe el usuario o pega el enlace del perfil.",
    ])
    expect(errores.contactoNombre).toEqual(["Escribe tu nombre."])
    expect(errores.email).toEqual(["Escribe tu correo."])
    expect(errores.autorizaDatos).toEqual([
      "Para enviar la solicitud debes autorizar el tratamiento de tus datos.",
    ])
    expect(errores.tipo).toBeUndefined()
    expect(errores.celular).toBeUndefined()
  })

  it("respeta los límites de la BD", () => {
    const errores = erroresDe({
      ...VALIDA,
      nombreMedio: "A",
      contactoNombre: "x".repeat(121),
      email: `${"a".repeat(250)}@x.co`,
      celular: "12",
      mensaje: "m".repeat(1001),
      municipioCodigo: "520",
    })
    expect(Object.keys(errores).sort()).toEqual([
      "celular",
      "contactoNombre",
      "email",
      "mensaje",
      "municipioCodigo",
      "nombreMedio",
    ])
  })

  it("exige de 1 a 6 cuentas sin repetir", () => {
    expect(erroresDe({ ...VALIDA, cuentas: [] }).cuentas).toEqual([
      "Agrega al menos una red social.",
    ])
    expect(
      erroresDe({
        ...VALIDA,
        cuentas: Array.from({ length: 7 }, (_, i) => ({
          plataforma: "FACEBOOK" as const,
          usuario: `medio${i}`,
          seguidores: "",
        })),
      }).cuentas
    ).toEqual(["Puedes declarar hasta 6 cuentas."])
    expect(
      erroresDe({
        ...VALIDA,
        cuentas: [
          { plataforma: "INSTAGRAM", usuario: "medio", seguidores: "" },
          { plataforma: "INSTAGRAM", usuario: "@Medio", seguidores: "" },
        ],
      })["cuentas.1.usuario"]
    ).toEqual(["Ya agregaste esta cuenta."])
  })

  it("lleva el error de cada cuenta a su campo", () => {
    const errores = erroresDe({
      ...VALIDA,
      cuentas: [
        {
          plataforma: "INSTAGRAM",
          usuario: "https://www.tiktok.com/@medio",
          seguidores: "muchos",
        },
      ],
    })
    expect(errores["cuentas.0.usuario"]?.[0]).toContain("es de TikTok")
    expect(errores["cuentas.0.seguidores"]).toEqual([
      "Escribe un número, por ejemplo 45.000.",
    ])
  })

  it("rechaza una plataforma o un tipo fuera de la lista", () => {
    const errores = erroresDe({
      ...VALIDA,
      tipo: "BLOG",
      cuentas: [{ plataforma: "X", usuario: "medio", seguidores: "" }],
    })
    expect(errores.tipo).toEqual(["Elige un tipo de la lista."])
    expect(errores["cuentas.0.plataforma"]).toEqual(["Elige la red social."])
  })
})

describe("cuentaVacia y VALORES_SOLICITUD", () => {
  it("el formulario empieza con una cuenta de Instagram vacía", () => {
    expect(VALORES_SOLICITUD.cuentas).toEqual([cuentaVacia("INSTAGRAM")])
    expect(cuentaVacia("TIKTOK")).toEqual({
      plataforma: "TIKTOK",
      usuario: "",
      seguidores: "",
    })
  })
})

describe("esEnvioAutomatico", () => {
  it("detecta el campo trampa con contenido", () => {
    expect(
      esEnvioAutomatico({ ...VALIDA, sitioWeb: "https://spam.example" })
    ).toBe(true)
    expect(esEnvioAutomatico({ sitioWeb: 1 })).toBe(true)
  })

  it("no confunde a una persona", () => {
    expect(esEnvioAutomatico(VALIDA)).toBe(false)
    expect(esEnvioAutomatico({ ...VALIDA, sitioWeb: "   " })).toBe(false)
    expect(esEnvioAutomatico({ nombreMedio: "x" })).toBe(false)
    expect(esEnvioAutomatico(null)).toBe(false)
    expect(esEnvioAutomatico("texto")).toBe(false)
  })
})

describe("datosParaRpc", () => {
  it("arma p_datos con claves de la BD y omite seguidores sin dato", () => {
    const datos = esquemaSolicitudVinculacion.parse(VALIDA)
    expect(datosParaRpc(datos)).toEqual({
      nombre_medio: "Noticias del Sur",
      tipo: "PAGINA_NOTICIAS",
      contacto_nombre: "Ana Pérez",
      email: "ana@ejemplo.co",
      celular: "300 123 4567",
      municipio_codigo: "52001",
      cuentas: [
        {
          plataforma: "INSTAGRAM",
          usuario: "noticias.sur",
          seguidores: 45_000,
        },
        { plataforma: "TIKTOK", usuario: "noticiassur" },
      ],
      mensaje: "Hola,\n\n queremos unirnos.",
      autoriza_datos: true,
    })
  })
})

describe("esquemaInvitarSolicitud", () => {
  const SOLICITUD = "01a16200-c6f2-7978-a9e3-82c5b5ce1059"
  const ROL = "01a16200-c6f2-7978-a9e3-82c5b5ce1060"
  const MEDIO = "01a16200-c6f2-7978-a9e3-82c5b5ce1061"
  const BASE: EntradaInvitarSolicitud = {
    solicitudId: SOLICITUD,
    medioExistenteId: "",
    nombreMedio: "Noticias del Sur",
    tipo: "PAGINA_NOTICIAS",
    municipioCodigo: "52001",
    contactoNombre: "Ana Pérez",
    email: "ana@ejemplo.co",
    celular: "",
    rolId: ROL,
    metodo: "ENLACE",
  }

  function errores(entrada: EntradaInvitarSolicitud) {
    const resultado = esquemaInvitarSolicitud.safeParse(entrada)
    return resultado.success
      ? {}
      : (desdeErrorZod(resultado.error).erroresCampo ?? {})
  }

  it("acepta registrar un medio nuevo", () => {
    expect(esquemaInvitarSolicitud.safeParse(BASE).success).toBe(true)
  })

  it("con medio nuevo exige nombre, tipo y municipio en los campos de la hoja", () => {
    expect(
      Object.keys(
        errores({ ...BASE, nombreMedio: "", tipo: "", municipioCodigo: "" })
      ).sort()
    ).toEqual(["municipioCodigo", "nombreMedio", "tipo"])
  })

  it("con un medio existente no valida los datos del medio", () => {
    expect(
      esquemaInvitarSolicitud.safeParse({
        ...BASE,
        medioExistenteId: MEDIO,
        nombreMedio: "",
        tipo: "",
        municipioCodigo: "",
      }).success
    ).toBe(true)
    expect(errores({ ...BASE, medioExistenteId: "no-uuid" })).toHaveProperty(
      "medioExistenteId"
    )
  })

  it("aplica las reglas de Usuarios a la persona", () => {
    const resultado = errores({
      ...BASE,
      contactoNombre: "A",
      email: "no-es-correo",
      celular: "12",
      rolId: "",
    })
    expect(Object.keys(resultado).sort()).toEqual([
      "celular",
      "contactoNombre",
      "email",
      "rolId",
    ])
  })
})

describe("esquemaDescartarSolicitud", () => {
  it("exige un motivo de 5 a 500 caracteres", () => {
    const id = "01a16200-c6f2-7978-a9e3-82c5b5ce1059"
    expect(
      esquemaDescartarSolicitud.safeParse({ solicitudId: id, motivo: " no " })
        .success
    ).toBe(false)
    expect(
      esquemaDescartarSolicitud.safeParse({
        solicitudId: id,
        motivo: "x".repeat(501),
      }).success
    ).toBe(false)
    expect(
      esquemaDescartarSolicitud.parse({
        solicitudId: id,
        motivo: "  No cumple el umbral  ",
      }).motivo
    ).toBe("No cumple el umbral")
  })
})
