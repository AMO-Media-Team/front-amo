import { describe, expect, it } from "vitest"

import { PERMISOS } from "@/lib/auth/permisos"

import {
  type ContextoEventos,
  describirEvento,
  type FilaBitacora,
  listaCampos,
  perfilesReferenciados,
} from "./presentacion"

const ACTOR = "33992fcd-61ff-46ab-b5c5-a493aaeac64a"
const ROL = "01a0f470-fe84-72e4-864b-2f96932c034e"
const USUARIO = "c2b7b4c9-3b92-4ca6-8d16-e05f37b8231c"
const UA_CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

const CONTEXTO: ContextoEventos = {
  nombres: new Map([[ROL, "Operaciones"]]),
  perfiles: new Map([[ACTOR, { nombre: "Ana Gómez", email: "ana@amo.test" }]]),
  roles: new Map([
    ["SUPERADMIN", { nombre: "Superadministrador", color: "#A788F6" }],
  ]),
  nombrePais: (iso2) => (iso2 === "CO" ? "Colombia" : null),
  ipCompleta: false,
}

function fila(parcial: Partial<FilaBitacora>): FilaBitacora {
  return {
    id: 1,
    created_at: "2026-09-30T22:30:00Z",
    accion: "UPDATE",
    entidad: "perfiles",
    entidad_id: USUARIO,
    actor_id: ACTOR,
    actor_email: "a***@amo.test",
    actor_rol: "SUPERADMIN",
    estado_anterior: null,
    estado_nuevo: null,
    cambios: null,
    metadatos: {},
    motivo: null,
    origen: "APP",
    ip: "181.52.10.20",
    pais_iso2: "CO",
    ciudad: "Medellín",
    user_agent: UA_CHROME_MAC,
    ...parcial,
  }
}

describe("describirEvento", () => {
  it("una edición: título natural, campos cambiados, actor, ruta y red enmascarada", () => {
    const evento = describirEvento(
      fila({
        cambios: {
          nombre: { antes: "Ana", despues: "Ana María" },
          rol_id: { antes: null, despues: ROL },
          updated_at: { antes: "x", despues: "y" },
        },
      }),
      CONTEXTO
    )
    expect(evento.titulo).toBe("Editó un usuario")
    expect(evento.etiquetaAccion).toBe("Edición")
    expect(evento.resumen).toBe("Cambió nombre y rol")
    expect(evento.actor).toMatchObject({
      nombre: "Ana Gómez",
      rol: "Superadministrador",
      color: "#A788F6",
      esSistema: false,
    })
    expect(evento.ruta).toBe(`/administracion/usuarios/${USUARIO}`)
    expect(evento.ubicacion).toMatchObject({
      ip: "181.52.•••.•••",
      pais: "Colombia",
      ciudad: "Medellín",
      navegador: "Chrome",
    })
    expect(evento.sensible).toBe(false)
    const rol = evento.cambios.campos.find((c) => c.campo === "rol_id")
    expect(rol?.despues?.texto).toBe("Operaciones")
  })

  it("con datos_sensibles.ver la IP llega completa", () => {
    const evento = describirEvento(fila({}), { ...CONTEXTO, ipCompleta: true })
    expect(evento.ubicacion.ip).toBe("181.52.10.20")
  })

  it("una transición resume estado anterior → nuevo", () => {
    const evento = describirEvento(
      fila({
        accion: "TRANSICION",
        estado_anterior: "INVITADO",
        estado_nuevo: "ACTIVO",
      }),
      CONTEXTO
    )
    expect(evento.titulo).toBe("Cambió el estado de un usuario")
    expect(evento.resumen).toBe("Invitado → Activo")
    expect(evento.estadoNuevo).toBe("Activo")
  })

  it("otorgar un permiso: título propio, permiso legible y enlace al rol", () => {
    const evento = describirEvento(
      fila({
        accion: "INSERT",
        entidad: "rol_permisos",
        entidad_id: ROL,
        cambios: {
          rol_id: ROL,
          permiso_clave: "reportes.finanzas",
          otorgado_por: ACTOR,
        },
      }),
      CONTEXTO
    )
    expect(evento.titulo).toBe("Otorgó un permiso a un rol")
    expect(evento.resumen).toBe(
      `Permiso: ${PERMISOS["reportes.finanzas"].descripcion}`
    )
    expect(evento.ruta).toBe(`/administracion/roles/${ROL}`)
  })

  it("un borrado no enlaza a una ficha que ya no existe, salvo la del rol padre", () => {
    const borrado = describirEvento(
      fila({
        accion: "DELETE",
        cambios: { id: USUARIO, email: "a***@amo.test" },
      }),
      CONTEXTO
    )
    expect(borrado.ruta).toBeNull()
    expect(borrado.resumen).toBe("Correo: a***@amo.test")
    expect(borrado.redactados).toBe(true)

    const retirado = describirEvento(
      fila({
        accion: "DELETE",
        entidad: "rol_permisos",
        entidad_id: ROL,
        cambios: { permiso_clave: "usuarios.ver" },
      }),
      CONTEXTO
    )
    expect(retirado.titulo).toBe("Retiró un permiso de un rol")
    expect(retirado.ruta).toBe(`/administracion/roles/${ROL}`)
  })

  it("una creación con estado indica el estado inicial", () => {
    const evento = describirEvento(
      fila({
        accion: "INSERT",
        estado_nuevo: "INVITADO",
        cambios: { email: "b***@amo.test" },
      }),
      CONTEXTO
    )
    expect(evento.titulo).toBe("Creó un usuario")
    expect(evento.resumen).toBe("Estado inicial: Invitado")
  })

  it("eventos de aplicación: exportación sensible con filas y formato", () => {
    const evento = describirEvento(
      fila({
        accion: "EXPORTAR",
        entidad: "bitacora",
        entidad_id: null,
        metadatos: { filas: 1200, formato: "xlsx" },
      }),
      CONTEXTO
    )
    expect(evento.titulo).toBe("Exportó la bitácora")
    expect(evento.resumen).toBe("1.200 filas · XLSX")
    expect(evento.sensible).toBe(true)
    expect(evento.ruta).toBe("/administracion/auditoria")
    expect(evento.metadatos.map((m) => m.etiqueta)).toEqual([
      "Filas",
      "Formato",
    ])
  })

  it("OTRO usa el nombre del evento de los metadatos", () => {
    const evento = describirEvento(
      fila({ accion: "OTRO", metadatos: { evento: "MFA_ACTIVADA" } }),
      CONTEXTO
    )
    expect(evento.titulo).toBe("Activó la verificación en dos pasos")
    // El nombre del evento ya es el título: no se repite en los detalles.
    expect(evento.metadatos.map((par) => par.clave)).toEqual([])
    const desactivada = describirEvento(
      fila({
        accion: "OTRO",
        metadatos: { evento: "MFA_DESACTIVADA", factor: "totp" },
      }),
      CONTEXTO
    )
    expect(desactivada.titulo).toBe("Desactivó la verificación en dos pasos")
    expect(desactivada.metadatos.map((par) => par.valor.texto)).toEqual([
      "App de autenticación (TOTP)",
    ])
  })

  it("sin actor es el sistema; un actor sin perfil visible muestra su correo enmascarado", () => {
    const sistema = describirEvento(
      fila({
        actor_id: null,
        actor_email: null,
        actor_rol: null,
        origen: "DB",
        user_agent: null,
        ip: null,
      }),
      CONTEXTO
    )
    expect(sistema.actor).toMatchObject({
      nombre: "Sistema",
      esSistema: true,
      rol: null,
    })
    expect(sistema.ubicacion.dispositivo).toBeNull()

    const oculto = describirEvento(
      fila({
        actor_id: USUARIO,
        actor_email: "c***@amo.test",
        actor_rol: "ROL_BORRADO",
      }),
      CONTEXTO
    )
    expect(oculto.actor).toMatchObject({
      nombre: "c***@amo.test",
      rol: "Rol borrado",
      color: null,
    })
  })

  it("la API directa siempre es sensible", () => {
    expect(
      describirEvento(fila({ origen: "API_DIRECTA" }), CONTEXTO).sensible
    ).toBe(true)
  })

  it("acciones desconocidas se humanizan sin romper", () => {
    const evento = describirEvento(
      fila({ accion: "IMPORTAR_LOTE", entidad: "tabla_nueva" }),
      CONTEXTO
    )
    expect(evento.titulo).toBe("Importar lote en tabla nueva")
    expect(evento.tono).toBe("neutro")
  })
})

describe("listaCampos", () => {
  it("une con «y» y resume los que sobran", () => {
    expect(listaCampos(["nombre"])).toBe("nombre")
    expect(listaCampos(["nombre", "rol_id"])).toBe("nombre y rol")
    expect(
      listaCampos(["nombre", "rol_id", "celular", "estado", "color"])
    ).toBe("nombre, rol, celular y 2 más")
    // rol y rol_id comparten etiqueta: no se repite.
    expect(listaCampos(["rol", "rol_id"])).toBe("rol")
  })
})

describe("perfilesReferenciados", () => {
  it("actor y columnas *_por (antes y después), sin duplicados", () => {
    const otro = "8f0f7a9e-8a3c-4d57-9c8a-2c4d1b6f7e10"
    expect(
      perfilesReferenciados({
        actor_id: ACTOR,
        cambios: {
          invitado_por: { antes: null, despues: otro.toUpperCase() },
          otorgado_por: ACTOR,
          nombre: "x",
        },
      }).sort()
    ).toEqual([ACTOR, otro].sort())
  })
})
