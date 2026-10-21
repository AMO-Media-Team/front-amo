import { describe, expect, it } from "vitest"

import { permisosDeRol } from "@/lib/auth/permisos"

import {
  type AccionUsuario,
  accionesDisponibles,
  type ObjetivoAcciones,
  puedeCambiarRol,
} from "./reglas-acciones"
import type { ActorUsuarios } from "./tipos"

const ROL_ADMIN = "rol-admin"
const ROL_OPERACIONES = "rol-operaciones"
const ROL_SUPER = "rol-super"

const ADMIN: ActorUsuarios = {
  id: "actor-admin",
  esSuperadmin: false,
  permisos: permisosDeRol("ADMIN"),
}
const SUPER: ActorUsuarios = {
  id: "actor-super",
  esSuperadmin: true,
  permisos: permisosDeRol("SUPERADMIN"),
}
const OPERACIONES: ActorUsuarios = {
  id: "actor-op",
  esSuperadmin: false,
  permisos: permisosDeRol("OPERACIONES"),
}

// roles_asignables: ADMIN puede asignar ADMIN y OPERACIONES; SUPERADMIN todos.
const GESTIONABLES_ADMIN = new Set([ROL_ADMIN, ROL_OPERACIONES])
const GESTIONABLES_SUPER = new Set([ROL_ADMIN, ROL_OPERACIONES, ROL_SUPER])

function objetivo(cambios: Partial<ObjetivoAcciones> = {}): ObjetivoAcciones {
  return {
    id: "objetivo",
    estado: "ACTIVO",
    rolId: ROL_OPERACIONES,
    mfaActivo: true,
    debeCambiarPassword: false,
    ...cambios,
  }
}

const lista = (acciones: ReadonlySet<AccionUsuario>) => [...acciones].sort()

describe("accionesDisponibles", () => {
  it("un ADMIN gestiona por completo a un usuario ACTIVO de un rol asignable, salvo desactivar", () => {
    expect(
      lista(accionesDisponibles(ADMIN, objetivo(), GESTIONABLES_ADMIN))
    ).toEqual(
      [
        "cerrar_sesiones",
        "editar",
        "enlace_recuperacion",
        "forzar_cambio",
        "restablecer_mfa",
        "suspender",
      ].sort()
    )
  })

  it("anti-escalada: nada sobre un rol que el actor no podría asignar (p. ej. SUPERADMIN)", () => {
    expect(
      accionesDisponibles(
        ADMIN,
        objetivo({ rolId: ROL_SUPER }),
        GESTIONABLES_ADMIN
      ).size
    ).toBe(0)
  })

  it("sobre la propia cuenta solo se ofrece editar datos", () => {
    const propia = objetivo({ id: ADMIN.id, rolId: ROL_ADMIN })
    expect(
      lista(accionesDisponibles(ADMIN, propia, GESTIONABLES_ADMIN))
    ).toEqual(["editar"])
    expect(puedeCambiarRol(ADMIN, ADMIN.id)).toBe(false)
    expect(puedeCambiarRol(ADMIN, "otro")).toBe(true)
  })

  it("un INVITADO admite regenerar la invitación y revocarla", () => {
    const invitado = objetivo({ estado: "INVITADO", mfaActivo: false })
    expect(
      lista(accionesDisponibles(ADMIN, invitado, GESTIONABLES_ADMIN))
    ).toEqual(["editar", "enlace_invitacion", "revocar_invitacion"].sort())
  })

  it("un SUSPENDIDO se reactiva; solo SUPERADMIN desactiva", () => {
    const suspendido = objetivo({ estado: "SUSPENDIDO" })
    expect(
      accionesDisponibles(ADMIN, suspendido, GESTIONABLES_ADMIN).has(
        "reactivar"
      )
    ).toBe(true)
    expect(
      accionesDisponibles(ADMIN, suspendido, GESTIONABLES_ADMIN).has(
        "desactivar"
      )
    ).toBe(false)
    expect(
      accionesDisponibles(SUPER, suspendido, GESTIONABLES_SUPER).has(
        "desactivar"
      )
    ).toBe(true)
  })

  it("eliminar definitivamente: solo SUPERADMIN y solo cuentas desactivadas", () => {
    const desactivado = objetivo({ estado: "DESACTIVADO", mfaActivo: false })
    expect(
      lista(accionesDisponibles(SUPER, desactivado, GESTIONABLES_SUPER))
    ).toEqual(["editar", "eliminar"])
    expect(
      accionesDisponibles(SUPER, objetivo(), GESTIONABLES_SUPER).has("eliminar")
    ).toBe(false)
  })

  it("sin permisos de gestión (OPERACIONES) no se ofrece nada", () => {
    expect(
      accionesDisponibles(OPERACIONES, objetivo(), GESTIONABLES_SUPER).size
    ).toBe(0)
  })

  it("en el listado (sin debeCambiarPassword) no ofrece forzar el cambio", () => {
    const fila = objetivo({ debeCambiarPassword: undefined })
    expect(
      accionesDisponibles(ADMIN, fila, GESTIONABLES_ADMIN).has("forzar_cambio")
    ).toBe(false)
  })

  it("sin MFA no hay nada que restablecer", () => {
    expect(
      accionesDisponibles(
        ADMIN,
        objetivo({ mfaActivo: false }),
        GESTIONABLES_ADMIN
      ).has("restablecer_mfa")
    ).toBe(false)
  })

  it("un perfil sin rol se puede gestionar (no tiene permisos que escalar)", () => {
    expect(
      accionesDisponibles(
        ADMIN,
        objetivo({ rolId: null }),
        GESTIONABLES_ADMIN
      ).has("editar")
    ).toBe(true)
  })

  it("una cuenta que no nació de una invitación (INVITADO sin rol) solo se revoca", () => {
    // Auditoría: adoptarla (rol + enlace) activaría la contraseña de quien se registró.
    expect(
      lista(
        accionesDisponibles(
          SUPER,
          objetivo({ estado: "INVITADO", rolId: null, mfaActivo: false }),
          GESTIONABLES_SUPER
        )
      )
    ).toEqual(["revocar_invitacion"])
  })
})
