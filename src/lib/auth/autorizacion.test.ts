import { describe, expect, it } from "vitest"

import {
  conNivel,
  construirPerfilSesion,
  esDeTipoRol,
  type FilaPerfilSesion,
  tieneAlgunPermiso,
} from "./autorizacion"

const FILA: FilaPerfilSesion = {
  id: "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
  email: "ana.gomez@amo.test",
  nombre: "  Ana Gómez ",
  estado: "ACTIVO",
  debe_cambiar_password: false,
  anunciante_id: "0192f3a4-5b6c-7d8e-9f01-000000000001",
  medio_id: null,
  deleted_at: null,
  rol: {
    id: "rol-1",
    clave: "ANUNCIANTE",
    nombre: "Anunciante",
    tipo: "ANUNCIANTE",
    color: "#3FB8AF",
    requiere_mfa: false,
    rol_permisos: [
      { permiso_clave: "inicio.anunciante" },
      { permiso_clave: "permiso.retirado" },
    ],
  },
}

describe("construirPerfilSesion", () => {
  it("arma el DTO con el rol y solo los permisos del catálogo", () => {
    const perfil = construirPerfilSesion(FILA)
    expect(perfil.activo).toBe(true)
    expect(perfil.debeCambiarPassword).toBe(false)
    expect(perfil.usuario).toEqual({
      id: FILA.id,
      email: FILA.email,
      nombre: "Ana Gómez",
      avatarUrl: null,
      rol: {
        id: "rol-1",
        clave: "ANUNCIANTE",
        nombre: "Anunciante",
        tipo: "ANUNCIANTE",
        color: "#3FB8AF",
        requiereMfa: false,
      },
      permisos: ["inicio.anunciante"],
      anuncianteId: FILA.anunciante_id,
      medioId: null,
    })
    expect(conNivel(perfil, "aal1").aal).toBe("aal1")
  })

  it("usa el correo como nombre si no hay nombre", () => {
    expect(
      construirPerfilSesion({ ...FILA, nombre: null }).usuario.nombre
    ).toBe("ana.gomez")
  })

  it.each([
    ["suspendido", { estado: "SUSPENDIDO" as const }],
    ["invitado", { estado: "INVITADO" as const }],
    ["borrado", { deleted_at: "2026-01-01T00:00:00Z" }],
    ["sin rol", { rol: null }],
  ])("un perfil %s no está activo", (_caso, cambios) => {
    const perfil = construirPerfilSesion({ ...FILA, ...cambios })
    expect(perfil.activo).toBe(false)
  })

  it("sin rol no tiene permisos y se trata como rol con MFA", () => {
    const { usuario } = construirPerfilSesion({ ...FILA, rol: null })
    expect(usuario.permisos).toEqual([])
    expect(usuario.rol.requiereMfa).toBe(true)
  })
})

describe("predicados", () => {
  const usuario = conNivel(construirPerfilSesion(FILA), "aal1")

  it("tieneAlgunPermiso: basta con uno", () => {
    expect(
      tieneAlgunPermiso(usuario, ["inicio.admin", "inicio.anunciante"])
    ).toBe(true)
    expect(tieneAlgunPermiso(usuario, ["configuracion.ver"])).toBe(false)
    expect(tieneAlgunPermiso(usuario, [])).toBe(false)
  })

  it("esDeTipoRol", () => {
    expect(esDeTipoRol(usuario, ["ANUNCIANTE", "MEDIO"])).toBe(true)
    expect(esDeTipoRol(usuario, ["ADMIN"])).toBe(false)
  })
})
