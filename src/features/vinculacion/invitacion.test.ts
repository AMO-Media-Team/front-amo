import { describe, expect, it } from "vitest"

import { MENSAJES_VINCULACION } from "./errores"
import {
  disponibilidadInvitacion,
  MEDIO_NUEVO,
  medioPropuesto,
  opcionesMedio,
  type SolicitudParaInvitar,
  valoresInvitacion,
} from "./invitacion"
import { esquemaInvitarSolicitud } from "./schemas"
import type {
  CapacidadesCola,
  MedioCoincidente,
  RolMedioAsignable,
} from "./tipos"

const SOLICITUD_ID = "0199f3a0-0000-7000-8000-000000000001"
const ROL_MEDIO = "0199f3a0-0000-7000-8000-0000000000aa"
const OTRO_ROL = "0199f3a0-0000-7000-8000-0000000000bb"

function coincidencia(
  id: string,
  extra: Partial<MedioCoincidente> = {}
): MedioCoincidente {
  return {
    id,
    nombre: "Noticias Pasto",
    estado: "PENDIENTE",
    municipioCodigo: "52001",
    municipio: "Pasto, Nariño",
    desdeSolicitud: false,
    ...extra,
  }
}

const EXISTENTE = coincidencia("0199f3a0-0000-7000-8000-000000000010", {
  estado: "VERIFICADO",
  municipioCodigo: "76001",
  municipio: "Cali, Valle",
})
const DE_LA_SOLICITUD = coincidencia("0199f3a0-0000-7000-8000-000000000011", {
  desdeSolicitud: true,
})

const SOLICITUD: SolicitudParaInvitar = {
  id: SOLICITUD_ID,
  nombreMedio: "Noticias Pasto",
  tipo: "PAGINA_NOTICIAS",
  municipioCodigo: "52001",
  ubicacion: "Pasto, Nariño",
  contactoNombre: "Ana Pérez",
  email: "ana@noticiaspasto.co",
  celular: "300 123 4567",
  coincidencias: [],
}

const TODO: CapacidadesCola = {
  invitar: true,
  registrarMedio: true,
  motivoSinInvitar: null,
}

const ROLES: RolMedioAsignable[] = [{ id: ROL_MEDIO, nombre: "Medio" }]

describe("disponibilidadInvitacion", () => {
  it("permite invitar con los permisos y un medio por registrar", () => {
    expect(disponibilidadInvitacion(SOLICITUD, TODO)).toEqual({ puede: true })
  })

  it("explica por qué no se puede invitar sin el permiso", () => {
    expect(
      disponibilidadInvitacion(SOLICITUD, {
        invitar: false,
        registrarMedio: true,
        motivoSinInvitar: MENSAJES_VINCULACION.sinRolMedio,
      })
    ).toEqual({ puede: false, motivo: MENSAJES_VINCULACION.sinRolMedio })
    expect(
      disponibilidadInvitacion(SOLICITUD, {
        invitar: false,
        registrarMedio: true,
        motivoSinInvitar: null,
      })
    ).toEqual({ puede: false, motivo: MENSAJES_VINCULACION.sinPermisoInvitar })
  })

  it("sin permiso para registrar medios exige un medio ya registrado", () => {
    const sinRegistrar = { ...TODO, registrarMedio: false }
    expect(disponibilidadInvitacion(SOLICITUD, sinRegistrar)).toEqual({
      puede: false,
      motivo: MENSAJES_VINCULACION.sinMedioParaVincular,
    })
    expect(
      disponibilidadInvitacion({ coincidencias: [EXISTENTE] }, sinRegistrar)
    ).toEqual({ puede: true })
  })
})

describe("medioPropuesto", () => {
  it("propone el medio que ya salió de la solicitud", () => {
    expect(medioPropuesto([EXISTENTE, DE_LA_SOLICITUD], true)).toBe(
      DE_LA_SOLICITUD.id
    )
  })

  it("propone registrar uno nuevo aunque haya otro con el mismo nombre", () => {
    expect(medioPropuesto([EXISTENTE], true)).toBe(MEDIO_NUEVO)
    expect(medioPropuesto([], true)).toBe(MEDIO_NUEVO)
  })

  it("sin permiso para registrar, propone el primero con el mismo nombre", () => {
    expect(medioPropuesto([EXISTENTE], false)).toBe(EXISTENTE.id)
    expect(medioPropuesto([], false)).toBe(MEDIO_NUEVO)
  })
})

describe("valoresInvitacion", () => {
  it("llena la hoja con la solicitud y el único rol de medio", () => {
    expect(valoresInvitacion(SOLICITUD, ROLES, TODO)).toEqual({
      solicitudId: SOLICITUD_ID,
      medioExistenteId: MEDIO_NUEVO,
      nombreMedio: "Noticias Pasto",
      tipo: "PAGINA_NOTICIAS",
      municipioCodigo: "52001",
      contactoNombre: "Ana Pérez",
      email: "ana@noticiaspasto.co",
      celular: "300 123 4567",
      rolId: ROL_MEDIO,
      metodo: "ENLACE",
    })
  })

  it("queda lista para confirmar con un clic (pasa el esquema)", () => {
    const valores = valoresInvitacion(SOLICITUD, ROLES, TODO)
    expect(esquemaInvitarSolicitud.safeParse(valores).success).toBe(true)
  })

  it("deja vacíos el tipo, el celular y el rol cuando hay que elegirlos", () => {
    const valores = valoresInvitacion(
      { ...SOLICITUD, tipo: null, celular: null },
      [...ROLES, { id: OTRO_ROL, nombre: "Medio editor" }],
      TODO
    )
    expect(valores).toMatchObject({ tipo: "", celular: "", rolId: "" })
    const validacion = esquemaInvitarSolicitud.safeParse(valores)
    expect(validacion.success).toBe(false)
    expect(validacion.error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(["tipo", "rolId"])
    )
  })

  it("con un medio elegido no exige los datos de un medio nuevo", () => {
    const valores = valoresInvitacion(
      { ...SOLICITUD, tipo: null, coincidencias: [DE_LA_SOLICITUD] },
      ROLES,
      TODO
    )
    expect(valores.medioExistenteId).toBe(DE_LA_SOLICITUD.id)
    expect(esquemaInvitarSolicitud.safeParse(valores).success).toBe(true)
  })
})

describe("opcionesMedio", () => {
  it("ofrece registrar el medio nuevo y los de igual nombre", () => {
    const opciones = opcionesMedio(SOLICITUD, [EXISTENTE], true)
    expect(opciones.map((opcion) => opcion.valor)).toEqual([
      MEDIO_NUEVO,
      EXISTENTE.id,
    ])
    expect(opciones[0]).toMatchObject({
      titulo: "Registrar «Noticias Pasto»",
      descripcion: "Medio nuevo · Página de noticias · Pasto, Nariño",
    })
    expect(opciones[1].descripcion).toBe(
      "Ya registrado · Cali, Valle · Verificado"
    )
  })

  it("omite el tipo que la solicitud no indicó", () => {
    const [nuevo] = opcionesMedio({ ...SOLICITUD, tipo: null }, [], true)
    expect(nuevo.descripcion).toBe("Medio nuevo · Pasto, Nariño")
  })

  it("no ofrece registrar otro si ya salió uno de la solicitud", () => {
    const opciones = opcionesMedio(
      SOLICITUD,
      [DE_LA_SOLICITUD, EXISTENTE],
      true
    )
    expect(opciones.map((opcion) => opcion.valor)).toEqual([
      DE_LA_SOLICITUD.id,
      EXISTENTE.id,
    ])
    expect(opciones[0].descripcion).toMatch(/^Registrado con esta solicitud/)
  })

  it("incluye el medio recién registrado aunque la cola aún no lo traiga", () => {
    const recien = {
      id: "0199f3a0-0000-7000-8000-000000000012",
      nombre: "Noticias Pasto",
    }
    const opciones = opcionesMedio(SOLICITUD, [EXISTENTE], true, recien)
    expect(opciones.map((opcion) => opcion.valor)).toEqual([
      recien.id,
      EXISTENTE.id,
    ])
    // Cuando la cola ya lo trae, no se repite.
    const yaEnCola = opcionesMedio(
      SOLICITUD,
      [coincidencia(recien.id, { desdeSolicitud: true })],
      true,
      recien
    )
    expect(yaEnCola.map((opcion) => opcion.valor)).toEqual([recien.id])
  })

  it("sin permiso para registrar solo ofrece los ya registrados", () => {
    expect(
      opcionesMedio(SOLICITUD, [EXISTENTE], false).map((opcion) => opcion.valor)
    ).toEqual([EXISTENTE.id])
    expect(opcionesMedio(SOLICITUD, [], false)).toEqual([])
  })
})
