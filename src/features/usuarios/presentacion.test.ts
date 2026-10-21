import { describe, expect, it } from "vitest"

import { CLAVES_PERMISO, PERMISOS } from "@/lib/auth/permisos"

import {
  agruparPorModulo,
  describirEvento,
  estadoMfa,
  MODULOS_PERMISO,
  nombreVisible,
} from "./presentacion"
import type { EventoActividad } from "./tipos"

const USUARIO = "usuario-1"
const ADMIN = "admin-1"
const CONTEXTO = {
  usuarioId: USUARIO,
  nombresRol: new Map([
    ["rol-op", "Operaciones"],
    ["rol-ad", "Administrador"],
  ]),
}

function evento(cambios: Partial<EventoActividad>): EventoActividad {
  return {
    id: 1,
    at: "2026-09-30T19:00:00Z",
    accion: "UPDATE",
    entidad: "perfiles",
    entidadId: USUARIO,
    actorId: ADMIN,
    actorEmail: "a***@amo.test",
    actorRol: "ADMIN",
    estadoAnterior: null,
    estadoNuevo: null,
    camposCambiados: [],
    valores: {},
    metadatos: {},
    motivo: null,
    origen: "APP",
    ...cambios,
  }
}

describe("describirEvento", () => {
  it("describe las transiciones de estado con su motivo", () => {
    expect(
      describirEvento(
        evento({
          accion: "TRANSICION",
          estadoAnterior: "ACTIVO",
          estadoNuevo: "SUSPENDIDO",
          motivo: "Uso indebido",
        }),
        CONTEXTO
      )
    ).toEqual({
      titulo: "Cuenta suspendida",
      detalle: "Uso indebido",
      categoria: "estado",
      tono: "aviso",
      propio: false,
    })
    expect(
      describirEvento(
        evento({
          accion: "TRANSICION",
          estadoAnterior: "SUSPENDIDO",
          estadoNuevo: "ACTIVO",
        }),
        CONTEXTO
      ).titulo
    ).toBe("Cuenta reactivada")
    expect(
      describirEvento(
        evento({
          accion: "TRANSICION",
          estadoAnterior: "INVITADO",
          estadoNuevo: "DESACTIVADO",
        }),
        CONTEXTO
      ).titulo
    ).toBe("Invitación revocada")
  })

  it("nombra los roles de un cambio de rol", () => {
    const descrito = describirEvento(
      evento({
        camposCambiados: ["rol_id"],
        valores: { rol_id: { antes: "rol-op", despues: "rol-ad" } },
      }),
      CONTEXTO
    )
    expect(descrito).toMatchObject({
      titulo: "Rol cambiado",
      detalle: "Operaciones → Administrador",
    })
  })

  it("distingue exigir el cambio de contraseña de completarlo", () => {
    const exigir = evento({
      camposCambiados: ["debe_cambiar_password"],
      valores: { debe_cambiar_password: { antes: false, despues: true } },
    })
    expect(describirEvento(exigir, CONTEXTO).titulo).toBe(
      "Se exigió cambiar la contraseña"
    )
    const completar = evento({
      actorId: USUARIO,
      camposCambiados: ["debe_cambiar_password"],
      valores: { debe_cambiar_password: { antes: true, despues: false } },
    })
    expect(describirEvento(completar, CONTEXTO)).toMatchObject({
      titulo: "Contraseña actualizada",
      propio: true,
    })
  })

  it("resume los campos editados en lenguaje natural", () => {
    expect(
      describirEvento(
        evento({ camposCambiados: ["nombre", "celular", "updated_at"] }),
        CONTEXTO
      ).detalle
    ).toBe("Cambió nombre y celular.")
  })

  it("describe invitaciones, enlaces y sesiones sin exponer secretos", () => {
    expect(
      describirEvento(
        evento({ accion: "INVITAR", metadatos: { metodo: "ENLACE" } }),
        CONTEXTO
      ).detalle
    ).toBe("Con enlace de un solo uso.")
    expect(
      describirEvento(
        evento({ accion: "GENERAR_ENLACE", metadatos: { tipo: "recovery" } }),
        CONTEXTO
      ).titulo
    ).toBe("Enlace de recuperación generado")
    expect(
      describirEvento(
        evento({
          accion: "CERRAR_SESIONES",
          metadatos: { sesiones_cerradas: 2, conserva_sesion: false },
        }),
        CONTEXTO
      ).detalle
    ).toBe("2 sesiones.")
  })

  it("las acciones del usuario sobre otras entidades usan una descripción genérica", () => {
    expect(
      describirEvento(
        evento({
          accion: "EXPORTAR",
          entidad: "usuarios",
          entidadId: null,
          actorId: USUARIO,
          metadatos: { filas: 20, formato: "xlsx" },
        }),
        CONTEXTO
      )
    ).toEqual({
      titulo: "Exportó usuarios",
      detalle: "20 filas · XLSX",
      categoria: "exportacion",
      tono: "neutro",
      propio: true,
    })
  })

  it("la activación de MFA es un evento de seguridad", () => {
    expect(
      describirEvento(
        evento({
          accion: "OTRO",
          actorId: USUARIO,
          metadatos: { evento: "MFA_ACTIVADA" },
        }),
        CONTEXTO
      )
    ).toMatchObject({ categoria: "seguridad", tono: "exito", propio: true })
  })
})

describe("nombreVisible", () => {
  it("usa el nombre o la parte local del correo", () => {
    expect(nombreVisible({ nombre: " Ana ", email: "ana@amo.test" })).toBe(
      "Ana"
    )
    expect(nombreVisible({ nombre: null, email: "ana.gomez@amo.test" })).toBe(
      "ana.gomez"
    )
  })
})

describe("permisos por módulo", () => {
  it("cada módulo del catálogo tiene nombre para mostrar", () => {
    const modulos = new Set(
      CLAVES_PERMISO.map((clave) => PERMISOS[clave].modulo)
    )
    for (const modulo of modulos) expect(MODULOS_PERMISO).toHaveProperty(modulo)
  })

  it("agrupa en el orden del catálogo e ignora claves desconocidas", () => {
    expect(
      agruparPorModulo([
        "usuarios.editar",
        "inicio.admin",
        "usuarios.ver",
        "no.existe",
      ])
    ).toEqual([
      { modulo: "inicio", permisos: ["inicio.admin"] },
      { modulo: "usuarios", permisos: ["usuarios.ver", "usuarios.editar"] },
    ])
  })
})

describe("estadoMfa", () => {
  it("solo alerta de MFA pendiente en cuentas activas cuyo rol la exige", () => {
    expect(estadoMfa(true, true, "ACTIVO")).toBe("activa")
    expect(estadoMfa(false, true, "ACTIVO")).toBe("pendiente")
    expect(estadoMfa(false, true, "INVITADO")).toBe("al_activar")
    expect(estadoMfa(false, true, "SUSPENDIDO")).toBe("no_usa")
    expect(estadoMfa(false, false, "ACTIVO")).toBe("no_usa")
  })
})
