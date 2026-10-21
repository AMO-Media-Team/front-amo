import { describe, expect, it } from "vitest"

import {
  ACCIONES,
  ACCIONES_BITACORA,
  complementoEntidad,
  esAccionBitacora,
  esCambioDeConfiguracion,
  esEventoSensible,
  humanizar,
  nombreEntidad,
  rutaEntidad,
  textoEnlaceEntidad,
  tituloPropio,
} from "./catalogo"

const ID = "c2b7b4c9-3b92-4ca6-8d16-e05f37b8231c"

describe("vocabulario", () => {
  it("toda acción del CHECK tiene etiqueta, verbo y tono", () => {
    for (const accion of ACCIONES_BITACORA) {
      expect(ACCIONES[accion].etiqueta).not.toBe("")
      expect(ACCIONES[accion].verbo).not.toBe("")
    }
    expect(esAccionBitacora("EXPORTAR")).toBe(true)
    expect(esAccionBitacora("exportar")).toBe(false)
  })

  it("humanizar recupera tildes de -ción/-sión", () => {
    expect(humanizar("reteica_municipal")).toBe("Reteica municipal")
    expect(humanizar("niveles_verificacion")).toBe("Niveles verificación")
    expect(humanizar("TIPO_SESION")).toBe("Tipo sesión")
  })

  it("humanizar devuelve la ortografía a las palabras frecuentes sin tilde", () => {
    expect(humanizar("es_publica")).toBe("Es pública")
    expect(humanizar("numero_maximo")).toBe("Número máximo")
    expect(humanizar("codigo_pais")).toBe("Código país")
    expect(humanizar("ultimos_dias")).toBe("Últimos días")
    // Solo palabras completas: no toca las que las contienen.
    expect(humanizar("publicador")).toBe("Publicador")
  })

  it("entidades conocidas y desconocidas", () => {
    expect(nombreEntidad("perfiles")).toBe("Usuario")
    expect(complementoEntidad("perfiles")).toBe("un usuario")
    expect(nombreEntidad("tabla_nueva")).toBe("Tabla nueva")
    expect(complementoEntidad("tabla_nueva")).toBe("tabla nueva")
  })

  it("títulos propios por entidad y acción", () => {
    expect(tituloPropio("rol_permisos", "INSERT")).toBe(
      "Otorgó un permiso a un rol"
    )
    expect(tituloPropio("perfiles", "UPDATE")).toBeNull()
  })
})

describe("clasificación", () => {
  it("sensibles: acciones que exponen datos o cambian accesos, y la API directa", () => {
    expect(esEventoSensible({ accion: "REVELAR_DATO", origen: "APP" })).toBe(
      true
    )
    expect(esEventoSensible({ accion: "UPDATE", origen: "API_DIRECTA" })).toBe(
      true
    )
    expect(esEventoSensible({ accion: "UPDATE", origen: "APP" })).toBe(false)
  })

  it("configuración: CONFIGURAR o tablas de configuración (incluidos roles)", () => {
    expect(
      esCambioDeConfiguracion({ accion: "CONFIGURAR", entidad: "x" })
    ).toBe(true)
    expect(
      esCambioDeConfiguracion({ accion: "UPDATE", entidad: "tarifas" })
    ).toBe(true)
    expect(
      esCambioDeConfiguracion({ accion: "INSERT", entidad: "rol_permisos" })
    ).toBe(true)
    expect(
      esCambioDeConfiguracion({ accion: "UPDATE", entidad: "perfiles" })
    ).toBe(false)
  })
})

describe("rutaEntidad", () => {
  it("fichas con id válido (en minúsculas)", () => {
    expect(rutaEntidad("perfiles", ID.toUpperCase())).toBe(
      `/administracion/usuarios/${ID}`
    )
    expect(rutaEntidad("medios", ID)).toBe(`/operacion/medios/${ID}`)
    expect(rutaEntidad("roles", ID)).toBe(`/administracion/roles/${ID}`)
  })

  it("sin id válido cae a la sección, si la hay", () => {
    expect(rutaEntidad("roles", null)).toBe("/administracion/roles")
    expect(rutaEntidad("perfiles", "no-es-uuid")).toBeNull()
    expect(rutaEntidad("tarifas", "12")).toBe("/administracion/configuracion")
    expect(rutaEntidad("bitacora", null)).toBe("/administracion/auditoria")
  })

  it("entidades sin pantalla no enlazan", () => {
    expect(rutaEntidad("aceptaciones_terminos", ID)).toBeNull()
  })
})

describe("textoEnlaceEntidad", () => {
  it("texto del botón según la entidad", () => {
    expect(textoEnlaceEntidad("perfiles")).toBe("Ver usuario")
    expect(textoEnlaceEntidad("roles")).toBe("Ver el rol")
    expect(textoEnlaceEntidad("rol_permisos")).toBe("Ver el rol")
    expect(textoEnlaceEntidad("tarifas")).toBe("Ver configuración")
  })
})
