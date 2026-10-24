// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  codigoNegocio,
  interpretarErrorBd,
  MENSAJE_INESPERADO,
  MENSAJE_SIN_PERMISO,
  mensajeErrorBd,
  MENSAJES_NEGOCIO,
} from "./errores-bd"

const MIGRACIONES = join(process.cwd(), "supabase/migrations")

/** Códigos que las migraciones lanzan con `raise exception … message = 'AMO_*'`. */
function codigosLanzados(): Set<string> {
  const codigos = new Set<string>()
  for (const archivo of readdirSync(MIGRACIONES)) {
    if (!archivo.endsWith(".sql")) continue
    const sql = readFileSync(join(MIGRACIONES, archivo), "utf8")
    for (const [, codigo] of sql.matchAll(
      /message\s*=\s*'(AMO_[A-Z0-9_]+)'/g
    )) {
      codigos.add(codigo)
    }
  }
  return codigos
}

describe("catálogo de códigos de negocio", () => {
  it("tiene un mensaje para cada código AMO_* de las migraciones", () => {
    const lanzados = codigosLanzados()
    expect(lanzados.size).toBeGreaterThan(20)
    const faltantes = [...lanzados].filter(
      (codigo) => !Object.hasOwn(MENSAJES_NEGOCIO, codigo)
    )
    expect(faltantes).toEqual([])
  })

  it("no conserva códigos que ya no existen", () => {
    const lanzados = codigosLanzados()
    const sobrantes = Object.keys(MENSAJES_NEGOCIO).filter(
      (codigo) => !lanzados.has(codigo)
    )
    expect(sobrantes).toEqual([])
  })

  it("escribe frases completas, sin jerga técnica", () => {
    for (const mensaje of Object.values(MENSAJES_NEGOCIO)) {
      expect(mensaje).toMatch(/^[A-ZÁÉÍÓÚÑ¿¡].*\.$/)
      expect(mensaje).not.toMatch(/AMO_|SQL|null|RLS|_srv/)
    }
  })
})

describe("mensajeErrorBd", () => {
  it("usa el detalle escrito por la BD para los errores de negocio", () => {
    expect(
      mensajeErrorBd({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details:
          "El dígito de verificación no corresponde al NIT. Revísalo en el RUT de la empresa.",
      })
    ).toBe(
      "El dígito de verificación no corresponde al NIT. Revísalo en el RUT de la empresa."
    )
  })

  it("sin detalle usa el mensaje del catálogo", () => {
    expect(mensajeErrorBd({ code: "P0001", message: "AMO_SIN_CUPO" })).toBe(
      MENSAJES_NEGOCIO.AMO_SIN_CUPO
    )
    expect(
      mensajeErrorBd({
        code: "P0001",
        message: "AMO_YA_ACEPTADA",
        details: " ",
      })
    ).toBe(MENSAJES_NEGOCIO.AMO_YA_ACEPTADA)
  })

  it("antepone los rótulos que exigen los criterios de finanzas", () => {
    expect(
      mensajeErrorBd({
        code: "P0001",
        message: "AMO_SEG_SOCIAL_PENDIENTE",
        details:
          "El medio supera el umbral mensual y no tiene la seguridad social aprobada.",
      })
    ).toBe(
      "Seguridad social pendiente: el medio supera el umbral mensual y no tiene la seguridad social aprobada."
    )
    expect(
      mensajeErrorBd({
        code: "P0001",
        message: "AMO_DOCUMENTO_SOPORTE_REQUERIDO",
        details: "Falta el documento soporte o la factura de: Medio Humo X.",
      })
    ).toBe(
      "Documento soporte requerido: falta el documento soporte o la factura de: Medio Humo X."
    )
    // Una sigla al inicio se respeta; sin detalle, el catálogo ya trae el rótulo.
    expect(
      mensajeErrorBd({
        code: "P0001",
        message: "AMO_RESOLUCION_AGOTADA",
        details: "DIAN: la resolución está vencida.",
      })
    ).toBe("Resolución agotada: DIAN: la resolución está vencida.")
    expect(
      mensajeErrorBd({ code: "P0001", message: "AMO_RESOLUCION_AGOTADA" })
    ).toBe(MENSAJES_NEGOCIO.AMO_RESOLUCION_AGOTADA)
  })

  it("los códigos que delatan un defecto no se dan por esperados ni muestran el detalle técnico", () => {
    expect(
      interpretarErrorBd({
        code: "P0001",
        message: "AMO_BITACORA_INMUTABLE",
        details:
          "La tabla bitacora es de solo inserción: no admite cambios ni borrados.",
      })
    ).toEqual({
      codigo: "AMO_BITACORA_INMUTABLE",
      esperado: false,
      mensaje: MENSAJES_NEGOCIO.AMO_BITACORA_INMUTABLE,
    })
    expect(
      interpretarErrorBd({
        code: "P0001",
        message: "AMO_ESTADO_SOLO_VIA_TRANSICION",
        details: "El estado solo cambia mediante una transición autorizada.",
      })
    ).toMatchObject({ esperado: false })
    expect(
      interpretarErrorBd({ code: "P0001", message: "AMO_SIN_CUPO" })
    ).toMatchObject({ esperado: true })
  })

  it("un código desconocido sin detalle cae en el genérico", () => {
    expect(mensajeErrorBd({ code: "P0001", message: "AMO_DESCONOCIDO" })).toBe(
      MENSAJE_INESPERADO
    )
  })

  it("traduce restricciones comunes por su nombre", () => {
    expect(
      mensajeErrorBd({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "anunciantes_nit_key"',
        details: "Key (nit)=(900123456) already exists.",
      })
    ).toBe("Ya hay un anunciante registrado con ese NIT.")
    expect(
      mensajeErrorBd({
        code: "23514",
        message: "perfiles_rol_organizacion_chk",
      })
    ).toBe("Un usuario activo necesita la organización que exige su rol.")
  })

  it("las restricciones del módulo prevalecen y pueden señalar un campo", () => {
    const error = {
      code: "23514",
      message:
        'new row for relation "medios" violates check constraint "medios_nombre_chk"',
    }
    expect(
      interpretarErrorBd(error, {
        medios_nombre_chk: {
          mensaje: "El nombre debe tener entre 2 y 120 caracteres.",
          campo: "nombre",
        },
      })
    ).toEqual({
      codigo: null,
      esperado: true,
      mensaje: "El nombre debe tener entre 2 y 120 caracteres.",
      campo: "nombre",
    })
    expect(
      mensajeErrorBd(
        {
          code: "23505",
          message: 'unique constraint "perfiles_email_key"',
        },
        { perfiles_email_key: "Ese correo ya pertenece a otra persona." }
      )
    ).toBe("Ese correo ya pertenece a otra persona.")
  })

  it("la restricción del mensaje prevalece sobre un nombre que aparezca en el detalle", () => {
    expect(
      interpretarErrorBd(
        {
          code: "23514",
          message:
            'new row for relation "medios" violates check constraint "medios_nombre_chk"',
          details:
            "Failing row contains (b2f0, anunciantes_nit_key, PENDIENTE).",
        },
        { medios_nombre_chk: { mensaje: "Nombre inválido.", campo: "nombre" } }
      )
    ).toMatchObject({ mensaje: "Nombre inválido.", campo: "nombre" })
  })

  it("si el mensaje no nombra ninguna conocida, busca en el detalle", () => {
    expect(
      mensajeErrorBd({
        code: "23514",
        message: "check_violation",
        details: "perfiles_celular_chk",
      })
    ).toBe("El celular no tiene un formato válido.")
  })

  it("compara el nombre completo de la restricción, no un prefijo", () => {
    expect(
      interpretarErrorBd({
        code: "23514",
        message: 'violates check constraint "perfiles_celular_chk2"',
      })
    ).toMatchObject({ esperado: false })
  })

  it("con una restricción desconocida responde por SQLSTATE y lo marca como no esperado", () => {
    expect(
      interpretarErrorBd({
        code: "23505",
        message: 'duplicate key value violates unique constraint "otra_key"',
      })
    ).toEqual({
      codigo: null,
      esperado: false,
      mensaje: "Ya existe un registro con esos datos.",
    })
    expect(
      mensajeErrorBd({
        code: "55P03",
        message: 'could not obtain lock on row in relation "asignaciones"',
      })
    ).toMatch(/Otra persona está cambiando/)
  })

  it("una violación de RLS se explica como falta de permiso", () => {
    expect(
      mensajeErrorBd({
        code: "42501",
        message:
          'new row violates row-level security policy for table "medios"',
      })
    ).toBe(MENSAJE_SIN_PERMISO)
  })

  it("nunca muestra un error técnico crudo", () => {
    expect(
      mensajeErrorBd({
        code: "42501",
        message: "permission denied for table users",
      })
    ).toBe(MENSAJE_INESPERADO)
    expect(
      mensajeErrorBd({
        code: "22P02",
        message: 'invalid input syntax for type uuid: "x"',
      })
    ).toBe(MENSAJE_INESPERADO)
    expect(mensajeErrorBd({})).toBe(MENSAJE_INESPERADO)
  })
})

describe("codigoNegocio", () => {
  it("reconoce los códigos de negocio", () => {
    expect(codigoNegocio({ message: "AMO_ESCALADA_PERMISOS" })).toBe(
      "AMO_ESCALADA_PERMISOS"
    )
    expect(codigoNegocio({ message: "AMO_SIN_CUPO: sin cupos" })).toBe(
      "AMO_SIN_CUPO"
    )
    expect(codigoNegocio({ message: "otra cosa" })).toBeNull()
    expect(codigoNegocio({ message: null })).toBeNull()
  })
})
