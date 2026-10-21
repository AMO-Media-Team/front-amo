import { describe, expect, it } from "vitest"

import { PERMISOS } from "@/lib/auth/permisos"
import {
  formatearCOP,
  formatearFecha,
  formatearFechaHora,
  formatearPorcentaje,
} from "@/lib/format"
import { parsearFecha } from "@/lib/fechas"

import {
  camposCambiados,
  construirCambios,
  etiquetaCampo,
  etiquetaEstado,
  presentarMetadatos,
  presentarValor,
  tieneRedactados,
} from "./diferencias"

const ROL_ID = "01a0f470-fe84-72e4-864b-2f96932c034e"

describe("etiquetaCampo", () => {
  it("usa las etiquetas conocidas", () => {
    expect(etiquetaCampo("rol_id")).toBe("Rol")
    expect(etiquetaCampo("debe_cambiar_password")).toBe(
      "Cambio de contraseña obligatorio"
    )
  })

  it("humaniza el resto sin los sufijos _id y _at", () => {
    expect(etiquetaCampo("tope_anual")).toBe("Tope anual")
    expect(etiquetaCampo("activado_at")).toBe("Activado")
    expect(etiquetaCampo("medio_id")).toBe("Medio")
    expect(etiquetaCampo("fecha_publicacion")).toBe("Fecha publicación")
  })

  it("nombra en español las columnas de configuración", () => {
    expect(
      [
        "es_publica",
        "maximo",
        "minimo",
        "modulo",
        "pendiente_validacion",
        "base_minima_uvt",
        "anio",
      ].map(etiquetaCampo)
    ).toEqual([
      "Visible para todos los usuarios",
      "Máximo",
      "Mínimo",
      "Módulo",
      "Pendiente de validación",
      "Base mínima (UVT)",
      "Año",
    ])
    // Sin etiqueta propia, el respaldo conserva la ortografía.
    expect(etiquetaCampo("numero_cuenta")).toBe("Número cuenta")
  })
})

describe("presentarValor", () => {
  it("vacíos: null, undefined y texto en blanco", () => {
    expect(presentarValor("nombre", null)).toEqual({
      tipo: "vacio",
      texto: "Vacío",
    })
    expect(presentarValor("nombre", undefined).tipo).toBe("vacio")
    expect(presentarValor("nombre", "  ").tipo).toBe("vacio")
  })

  it("booleanos en español", () => {
    expect(presentarValor("activo", true).texto).toBe("Sí")
    expect(presentarValor("activo", false).texto).toBe("No")
  })

  it("montos en COP según el nombre de la columna", () => {
    const valor = presentarValor("monto_bruto", 1_250_000)
    expect(valor.tipo).toBe("moneda")
    expect(valor.texto).toBe(formatearCOP(1_250_000))
    expect(presentarValor("presupuesto_maximo", 5e6).tipo).toBe("moneda")
    expect(presentarValor("total_cop", 10).tipo).toBe("moneda")
  })

  it("fracciones 0–1 como porcentaje; fuera de rango, como número", () => {
    const comision = presentarValor("comision_global", 0.15)
    expect(comision).toMatchObject({
      tipo: "porcentaje",
      texto: formatearPorcentaje(0.15, 2),
    })
    expect(presentarValor("porcentaje", 35).tipo).toBe("numero")
    expect(presentarValor("seguidores", 1200).tipo).toBe("numero")
  })

  it("instantes ISO y días de calendario como fecha legible", () => {
    const instante = "2026-09-30T22:30:42.424238+00:00"
    expect(presentarValor("created_at", instante)).toEqual({
      tipo: "fecha",
      texto: formatearFechaHora(instante),
      detalle: instante,
    })
    expect(presentarValor("vigente_desde", "2026-01-31")).toEqual({
      tipo: "fecha",
      texto: formatearFecha(parsearFecha("2026-01-31")!),
      detalle: "2026-01-31",
    })
  })

  it("nunca intenta recuperar lo redactado: huella y enmascarado", () => {
    const huella = presentarValor(
      "numero_documento_hash",
      "sha256:9f86d081884c7d65"
    )
    expect(huella.tipo).toBe("hash")
    expect(huella.texto).toBe("sha256:9f86d08188…")
    expect(huella.detalle).toBe("sha256:9f86d081884c7d65")

    const completo = "a".repeat(64)
    expect(presentarValor("email_sha256", completo).tipo).toBe("hash")
    // 64 hex en una columna que no es de huella: texto normal.
    expect(presentarValor("nota", completo).tipo).toBe("texto")

    expect(presentarValor("celular", "••••4567")).toEqual({
      tipo: "enmascarado",
      texto: "••••4567",
    })
    expect(presentarValor("email", "a***@amo.test").tipo).toBe("enmascarado")
  })

  it("referencias: nombre conocido o uuid abreviado, con el id completo al lado", () => {
    const nombres = new Map([[ROL_ID, "Operaciones"]])
    expect(presentarValor("rol_id", ROL_ID.toUpperCase(), { nombres })).toEqual(
      {
        tipo: "referencia",
        texto: "Operaciones",
        detalle: ROL_ID.toUpperCase(),
      }
    )
    expect(presentarValor("rol_id", ROL_ID).texto).toBe("01a0f470…")
  })

  it("colores HEX como muestra de color", () => {
    expect(presentarValor("color", "#5b6cf0")).toEqual({
      tipo: "color",
      texto: "#5B6CF0",
    })
    expect(presentarValor("color", "#5b6")).toMatchObject({ tipo: "texto" })
  })

  it("estados en MAYÚSCULAS con su nombre legible", () => {
    expect(presentarValor("estado", "EN_REVISION")).toEqual({
      tipo: "estado",
      texto: "En revisión",
      detalle: "EN_REVISION",
    })
    expect(presentarValor("estado_validacion", "APROBADA").texto).toBe(
      "Aprobada"
    )
    // Un texto en mayúsculas fuera de una columna de estado no es un estado.
    expect(presentarValor("clave", "SUPERADMIN").tipo).toBe("texto")
  })

  it("claves de permiso con su descripción del catálogo", () => {
    expect(presentarValor("permiso_clave", "usuarios.ver")).toEqual({
      tipo: "referencia",
      texto: PERMISOS["usuarios.ver"].descripcion,
      detalle: "usuarios.ver",
    })
    expect(presentarValor("permiso_clave", "inexistente.x").tipo).toBe("texto")
  })

  it("objetos y listas como JSON (compacto y con formato)", () => {
    const valor = presentarValor("preferencias", { tema: "oscuro" })
    expect(valor.tipo).toBe("json")
    expect(valor.texto).toBe('{"tema":"oscuro"}')
    expect(valor.detalle).toContain("\n")
  })
})

describe("etiquetaEstado", () => {
  it("conocidos y humanizados", () => {
    expect(etiquetaEstado("INVITADO")).toBe("Invitado")
    expect(etiquetaEstado("VENCIDA_SIN_PUBLICAR")).toBe("Vencida sin publicar")
  })
})

describe("construirCambios", () => {
  it("UPDATE: antes → después por campo, estado primero y fechas de sistema al final", () => {
    const cambios = construirCambios("UPDATE", {
      nombre: { antes: null, despues: "Ana" },
      activado_at: { antes: null, despues: "2026-09-30T10:00:00Z" },
      estado: { antes: "INVITADO", despues: "ACTIVO" },
      celular: { antes: "••••1234", despues: null },
      rol_id: { antes: "a", despues: "b" },
    })
    expect(cambios.modo).toBe("diferencias")
    expect(cambios.campos.map((c) => c.campo)).toEqual([
      "estado",
      "celular",
      "nombre",
      "rol_id",
      "activado_at",
    ])
    const porCampo = Object.fromEntries(cambios.campos.map((c) => [c.campo, c]))
    expect(porCampo.nombre.tipo).toBe("agregado")
    expect(porCampo.celular.tipo).toBe("eliminado")
    expect(porCampo.estado.tipo).toBe("modificado")
    expect(porCampo.estado.antes?.texto).toBe("Invitado")
    expect(porCampo.estado.despues?.texto).toBe("Activo")
    expect(tieneRedactados(cambios)).toBe(true)
  })

  it("INSERT muestra la fila creada (sin «antes»)", () => {
    const cambios = construirCambios("INSERT", {
      nombre: "Norte",
      color: "#A788F6",
    })
    expect(cambios.modo).toBe("creacion")
    expect(
      cambios.campos.every((c) => c.antes === null && c.tipo === "agregado")
    ).toBe(true)
    expect(tieneRedactados(cambios)).toBe(false)
  })

  it("DELETE y BORRADO_DEFINITIVO muestran lo eliminado (sin «después»)", () => {
    for (const accion of ["DELETE", "BORRADO_DEFINITIVO"]) {
      const cambios = construirCambios(accion, {
        id: ROL_ID,
        email_sha256: "b".repeat(64),
      })
      expect(cambios.modo).toBe("eliminacion")
      expect(
        cambios.campos.every(
          (c) => c.despues === null && c.tipo === "eliminado"
        )
      ).toBe(true)
      expect(tieneRedactados(cambios)).toBe(true)
    }
  })

  it("eventos de aplicación con una fila plana: datos sin comparación", () => {
    expect(construirCambios("EXPORTAR", { filas: 3 }).modo).toBe("datos")
  })

  it("sin cambios: null, lista u objeto vacío", () => {
    expect(construirCambios("UPDATE", null)).toEqual({
      modo: "sin_cambios",
      campos: [],
    })
    expect(construirCambios("UPDATE", {}).modo).toBe("sin_cambios")
    expect(construirCambios("UPDATE", [1, 2]).modo).toBe("sin_cambios")
  })
})

describe("camposCambiados", () => {
  it("solo los pares antes/después de un UPDATE", () => {
    expect(
      camposCambiados({ nombre: { antes: "a", despues: "b" }, color: "#fff" })
    ).toEqual(["nombre"])
    expect(camposCambiados(null)).toEqual([])
  })
})

describe("presentarMetadatos", () => {
  it("etiquetas y valores conocidos de exportaciones e invitaciones", () => {
    const pares = presentarMetadatos({
      formato: "xlsx",
      filas: 12,
      metodo: "CONTRASENA",
      clave_rara: "x",
    })
    expect(pares.map((p) => [p.etiqueta, p.valor.texto])).toEqual([
      ["Formato", "Excel (.xlsx)"],
      ["Filas", "12"],
      ["Método", "Contraseña temporal"],
      ["Clave rara", "x"],
    ])
  })

  it("cierres de sesión legibles y el rol por su nombre", () => {
    const pares = presentarMetadatos(
      { alcance: "otras", motivo: "cambio_contrasena", rol: "ADMIN" },
      { nombres: new Map([["ADMIN", "Administrador"]]) }
    )
    expect(pares.map((p) => [p.etiqueta, p.valor.texto])).toEqual([
      ["Alcance", "Las demás sesiones"],
      ["Motivo", "Cambio de contraseña"],
      ["Rol", "Administrador"],
    ])
  })

  it("sin metadatos, nada", () => {
    expect(presentarMetadatos(null)).toEqual([])
    expect(presentarMetadatos("texto")).toEqual([])
  })
})
