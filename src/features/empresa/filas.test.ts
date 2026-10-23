import { describe, expect, it } from "vitest"

import {
  aContacto,
  cambiosContacto,
  cambiosMiEmpresa,
  columnasContacto,
  conIdentificacionGuardada,
  facturacionNueva,
  type FilaEmpresaEditable,
  hayCambios,
  jsonIgual,
  leerFacturacion,
  opcionesRegimen,
  valoresContacto,
  valoresMiEmpresa,
} from "./filas"
import { esquemaContactoEmpresa, esquemaMiEmpresa } from "./schemas"
import type { EmpresaPropia } from "./tipos"

const SECTOR = "0192f1c2-5b6a-7d00-8000-0000000000c1"

const FILA: FilaEmpresaEditable = {
  razon_social: "Comercializadora Andina S.A.S.",
  nombre_comercial: "Andina",
  sector_id: SECTOR,
  pais_iso2: "CO",
  nit: "900123456",
  digito_verificacion: "8",
  municipio_codigo: "11001",
  identificacion_extranjera: null,
  ciudad_extranjera: null,
  datos_facturacion: {
    email_facturacion: "facturas@andina.co",
    regimen: "RESPONSABLE_IVA",
    es_gran_contribuyente: false,
    es_autorretenedor: false,
    responsabilidades_fiscales: ["O-13", "R-99-PN"],
  },
}

const EMPRESA: EmpresaPropia = {
  id: "0192f1c2-5b6a-7d00-8000-000000000001",
  razonSocial: FILA.razon_social,
  nombreComercial: FILA.nombre_comercial,
  sector: { id: SECTOR, nombre: "Retail" },
  paisIso2: "CO",
  nit: "900123456",
  digitoVerificacion: "8",
  municipioCodigo: "11001",
  identificacionExtranjera: null,
  ciudadExtranjera: null,
  facturacion: leerFacturacion(FILA.datos_facturacion),
  estado: "PENDIENTE",
  motivoEstado: null,
  enviadoVerificacionAt: null,
  verificadoAt: null,
  actualizadoAt: "2026-10-22T15:00:00Z",
  logoUrl: null,
  tieneLogo: false,
}

function datosDe(cambios: Partial<ReturnType<typeof valoresMiEmpresa>> = {}) {
  const resultado = esquemaMiEmpresa.safeParse({
    ...valoresMiEmpresa(EMPRESA),
    ...cambios,
  })
  if (!resultado.success) throw resultado.error
  return resultado.data
}

describe("facturación", () => {
  it("lee el correo, el régimen y los interruptores", () => {
    expect(leerFacturacion(FILA.datos_facturacion)).toEqual({
      email: "facturas@andina.co",
      regimen: "RESPONSABLE_IVA",
      granContribuyente: false,
      autorretenedor: false,
    })
    expect(leerFacturacion(null)).toEqual({
      email: null,
      regimen: null,
      granContribuyente: false,
      autorretenedor: false,
    })
  })

  it("sin cambios devuelve el mismo objeto (no hay nada que escribir)", () => {
    const escrita = {
      emailFacturacion: "facturas@andina.co",
      regimen: "RESPONSABLE_IVA",
      granContribuyente: false,
      autorretenedor: false,
    }
    expect(
      jsonIgual(
        facturacionNueva(FILA.datos_facturacion, escrita),
        FILA.datos_facturacion
      )
    ).toBe(true)
    // Un objeto vacío tampoco se llena con valores por defecto.
    expect(
      facturacionNueva(
        {},
        {
          emailFacturacion: null,
          regimen: "",
          granContribuyente: false,
          autorretenedor: false,
        }
      )
    ).toEqual({})
  })

  it("quita la clave del correo o del régimen vacíos y conserva lo demás", () => {
    expect(
      facturacionNueva(FILA.datos_facturacion, {
        emailFacturacion: null,
        regimen: "",
        granContribuyente: false,
        autorretenedor: false,
      })
    ).toEqual({
      es_gran_contribuyente: false,
      es_autorretenedor: false,
      responsabilidades_fiscales: ["O-13", "R-99-PN"],
    })
  })

  it("un interruptor que cambia ajusta su responsabilidad (O-13, O-15)", () => {
    const nueva = facturacionNueva(FILA.datos_facturacion, {
      emailFacturacion: "facturas@andina.co",
      regimen: "RESPONSABLE_IVA",
      granContribuyente: false,
      autorretenedor: true,
    })
    expect(nueva).toMatchObject({
      es_autorretenedor: true,
      // O-13 no se toca: el interruptor de gran contribuyente no cambió.
      responsabilidades_fiscales: ["O-13", "O-15", "R-99-PN"],
    })
    expect(
      facturacionNueva(
        { es_gran_contribuyente: true, responsabilidades_fiscales: ["O-13"] },
        {
          emailFacturacion: null,
          regimen: "",
          granContribuyente: false,
          autorretenedor: false,
        }
      )
    ).toEqual({ es_gran_contribuyente: false, responsabilidades_fiscales: [] })
  })

  it("compara JSON sin importar el orden de las claves", () => {
    expect(jsonIgual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
    expect(jsonIgual({ a: 1 }, { a: 2 })).toBe(false)
  })

  it("ofrece los regímenes y conserva uno guardado que no esté en la lista", () => {
    expect(opcionesRegimen(null).map((o) => o.valor)).toEqual([
      "RESPONSABLE_IVA",
      "NO_RESPONSABLE_IVA",
    ])
    expect(opcionesRegimen("REGIMEN_SIMPLE").at(-1)).toEqual({
      valor: "REGIMEN_SIMPLE",
      etiqueta: "REGIMEN_SIMPLE",
    })
  })
})

describe("datos de la empresa", () => {
  it("los valores iniciales muestran el NIT con puntos y la condición tributaria", () => {
    expect(valoresMiEmpresa(EMPRESA)).toMatchObject({
      nit: "900.123.456",
      digitoVerificacion: "8",
      emailFacturacion: "facturas@andina.co",
      regimen: "RESPONSABLE_IVA",
      granContribuyente: false,
      actualizadoAt: EMPRESA.actualizadoAt,
    })
  })

  it("guardar sin cambios no escribe nada", () => {
    expect(hayCambios(cambiosMiEmpresa(FILA, datosDe(), false))).toBe(false)
  })

  it("escribe solo las columnas que cambiaron y combina la facturación", () => {
    const cambios = cambiosMiEmpresa(
      FILA,
      datosDe({ nombreComercial: "Andina Express", autorretenedor: true }),
      false
    )
    expect(Object.keys(cambios).sort()).toEqual([
      "datos_facturacion",
      "nombre_comercial",
    ])
    expect(cambios.datos_facturacion).toMatchObject({
      email_facturacion: "facturas@andina.co",
      es_autorretenedor: true,
    })
  })

  it("verificada, nunca escribe la identificación aunque llegue distinta", () => {
    const cambios = cambiosMiEmpresa(
      FILA,
      datosDe({ razonSocial: "Otra S.A.S.", nombreComercial: "Andina 2" }),
      true
    )
    expect(Object.keys(cambios)).toEqual(["nombre_comercial"])
  })

  it("con la identificación bloqueada, la entrada toma lo guardado", () => {
    const entrada = {
      ...valoresMiEmpresa(EMPRESA),
      razonSocial: "Otra",
      nit: "1",
      digitoVerificacion: "",
    }
    expect(conIdentificacionGuardada(entrada, FILA)).toMatchObject({
      razonSocial: FILA.razon_social,
      paisIso2: "CO",
      nit: "900.123.456",
      digitoVerificacion: "8",
      identificacionExtranjera: "",
    })
  })
})

describe("persona de contacto", () => {
  it("lee la fila (o su ausencia) y arma los valores del formulario", () => {
    expect(aContacto(null)).toEqual({
      nombre: null,
      email: null,
      celular: null,
      direccion: null,
      actualizadoAt: null,
    })
    const contacto = aContacto({
      contacto_nombre: " Laura Gómez ",
      contacto_email: "laura@andina.co",
      contacto_celular: "+573001234567",
      direccion: null,
      updated_at: "2026-10-22T15:00:00Z",
    })
    expect(valoresContacto(contacto)).toEqual({
      nombre: "Laura Gómez",
      correo: "laura@andina.co",
      celular: "+57 300 123 4567",
      direccion: "",
      version: "2026-10-22T15:00:00Z",
    })
  })

  it("solo cambian las columnas distintas; el correo se compara sin mayúsculas (citext)", () => {
    const datos = esquemaContactoEmpresa.parse({
      nombre: "Laura Gómez",
      correo: "LAURA@andina.co",
      celular: "300 123 4567",
      direccion: "",
      version: "v1",
    })
    expect(
      cambiosContacto(
        {
          contacto_nombre: "Laura Gómez",
          contacto_email: "Laura@Andina.co",
          contacto_celular: null,
          direccion: null,
        },
        columnasContacto(datos)
      )
    ).toEqual({ contacto_celular: "+57 300 123 4567" })
  })
})
