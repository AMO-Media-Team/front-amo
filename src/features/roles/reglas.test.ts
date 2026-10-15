import { describe, expect, it } from "vitest"

import { CLAVES_PERMISO, permisosDeRol } from "@/lib/auth/permisos"

import {
  accionesDisponibles,
  esAplicable,
  fueraDeAlcance,
  motivoSoloLectura,
  noAplicables,
  permisosClonables,
  puedeOtorgar,
  totalAplicables,
} from "./reglas"
import type { ActorRoles, RolListado } from "./tipos"

const ROL_SUPER = "rol-super"
const ROL_ADMIN = "rol-admin"

const SUPER: ActorRoles = {
  id: "actor-super",
  rolId: ROL_SUPER,
  esSuperadmin: true,
  permisos: CLAVES_PERMISO,
  puedeGestionar: true,
  puedeVerUsuarios: true,
  puedeVerAuditoria: true,
}

/** Gestiona roles pero no tiene los permisos financieros ni `usuarios.eliminar`. */
const GESTOR: ActorRoles = {
  id: "actor-gestor",
  rolId: "rol-gestor",
  esSuperadmin: false,
  permisos: [...permisosDeRol("ADMIN"), "roles.gestionar"],
  puedeGestionar: true,
  puedeVerUsuarios: true,
  puedeVerAuditoria: true,
}

const LECTOR: ActorRoles = {
  ...GESTOR,
  id: "actor-lector",
  rolId: ROL_ADMIN,
  permisos: permisosDeRol("ADMIN"),
  puedeGestionar: false,
}

function rol(cambios: Partial<RolListado> = {}): RolListado {
  return {
    id: "rol-personalizado",
    clave: "SOPORTE",
    nombre: "Soporte",
    descripcion: null,
    tipo: "ADMIN",
    esSistema: false,
    requiereMfa: true,
    color: "#8C66EE",
    permisos: ["inicio.admin", "usuarios.ver"],
    usuarios: 0,
    asignados: 0,
    ...cambios,
  }
}

describe("anti-escalada", () => {
  it("solo se otorga o retira lo que el actor tiene", () => {
    expect(puedeOtorgar(GESTOR, "usuarios.ver")).toBe(true)
    expect(puedeOtorgar(GESTOR, "pagos.registrar")).toBe(false)
    expect(puedeOtorgar(SUPER, "pagos.registrar")).toBe(true)
    expect(
      fueraDeAlcance(GESTOR, [
        "usuarios.ver",
        "pagos.registrar",
        "usuarios.eliminar",
      ])
    ).toEqual(["pagos.registrar", "usuarios.eliminar"])
  })

  it("al clonar copia lo permitido y cuenta lo omitido", () => {
    expect(
      permisosClonables(["inicio.admin", "facturas.gestionar"], GESTOR, "ADMIN")
    ).toEqual({
      copiables: ["inicio.admin"],
      sinAlcance: ["facturas.gestionar"],
      noAplicables: [],
    })
    expect(
      permisosClonables(permisosDeRol("FINANZAS"), SUPER, "ADMIN").sinAlcance
    ).toEqual([])
  })

  it("al clonar hacia un rol externo descarta los permisos internos", () => {
    const resultado = permisosClonables(
      ["inicio.admin", "campanas.ver", "reportes.ver", "facturas.ver_propias"],
      SUPER,
      "ANUNCIANTE"
    )
    expect(resultado).toEqual({
      copiables: ["reportes.ver", "facturas.ver_propias"],
      sinAlcance: [],
      noAplicables: ["inicio.admin", "campanas.ver"],
    })
  })
})

describe("permisos aplicables por tipo de rol", () => {
  it("un rol del equipo interno admite todo el catálogo", () => {
    expect(totalAplicables("ADMIN")).toBe(CLAVES_PERMISO.length)
    expect(noAplicables("ADMIN", CLAVES_PERMISO)).toEqual([])
  })

  it("un rol externo solo admite los permisos de su rol de sistema", () => {
    for (const tipo of ["ANUNCIANTE", "MEDIO"] as const) {
      const propios = permisosDeRol(tipo)
      expect(totalAplicables(tipo)).toBe(propios.length)
      expect(propios.every((clave) => esAplicable(tipo, clave))).toBe(true)
    }
  })

  it("ningún permiso interno de lectura global aplica a un rol externo", () => {
    const globales = [
      "usuarios.ver",
      "roles.gestionar",
      "campanas.ver",
      "ofertas.ver",
      "liquidaciones.ver",
      "datos_sensibles.ver",
      "auditoria.ver",
    ] as const
    expect(noAplicables("ANUNCIANTE", globales)).toEqual(globales)
    expect(noAplicables("MEDIO", globales)).toEqual(globales)
    expect(esAplicable("MEDIO", "ofertas.marketplace")).toBe(true)
    expect(esAplicable("ANUNCIANTE", "ofertas.marketplace")).toBe(false)
  })
})

describe("motivoSoloLectura", () => {
  it("SUPERADMIN y los roles de sistema son de solo lectura", () => {
    expect(
      motivoSoloLectura(
        { id: ROL_SUPER, clave: "SUPERADMIN", esSistema: true },
        GESTOR
      )
    ).toBe("superadmin")
    expect(
      motivoSoloLectura(
        { id: ROL_ADMIN, clave: "ADMIN", esSistema: true },
        SUPER
      )
    ).toBe("sistema")
  })

  it("sin roles.gestionar o sobre el propio rol no se edita", () => {
    expect(motivoSoloLectura(rol(), LECTOR)).toBe("sin-permiso")
    expect(motivoSoloLectura(rol({ id: GESTOR.rolId }), GESTOR)).toBe("propio")
  })

  it("un rol personalizado ajeno es editable para quien gestiona roles", () => {
    expect(motivoSoloLectura(rol(), GESTOR)).toBeNull()
  })
})

describe("accionesDisponibles", () => {
  it("en un rol de sistema solo se edita la apariencia y se duplica", () => {
    expect(
      accionesDisponibles(rol({ esSistema: true, clave: "ADMIN" }), SUPER)
    ).toEqual({
      editar: true,
      soloApariencia: true,
      duplicar: true,
      eliminar: false,
      motivoNoEliminar: null,
    })
  })

  it("un rol personalizado sin cuentas se puede eliminar", () => {
    expect(accionesDisponibles(rol(), GESTOR)).toMatchObject({
      editar: true,
      soloApariencia: false,
      eliminar: true,
      motivoNoEliminar: null,
    })
  })

  it("explica por qué no se puede eliminar", () => {
    expect(
      accionesDisponibles(rol({ asignados: 1 }), GESTOR).motivoNoEliminar
    ).toBe(
      "Tiene 1 usuario asignado: reasígnalo a otro rol antes de eliminarlo."
    )
    expect(
      accionesDisponibles(rol({ asignados: 3, usuarios: 2 }), GESTOR)
        .motivoNoEliminar
    ).toBe(
      "Tiene 3 usuarios asignados: reasígnalos a otro rol antes de eliminarlo."
    )
    expect(
      accionesDisponibles(rol({ id: GESTOR.rolId }), GESTOR).motivoNoEliminar
    ).toBe("Es tu propio rol.")
    const conPagos = accionesDisponibles(
      rol({ permisos: ["pagos.registrar"] }),
      GESTOR
    )
    expect(conPagos.eliminar).toBe(false)
    expect(conPagos.motivoNoEliminar).toBe(
      "Incluye permisos que tú no tienes: no puedes retirarlos."
    )
  })

  it("sin roles.gestionar no ofrece acciones", () => {
    expect(accionesDisponibles(rol(), LECTOR)).toEqual({
      editar: false,
      soloApariencia: false,
      duplicar: false,
      eliminar: false,
      motivoNoEliminar: null,
    })
  })
})
