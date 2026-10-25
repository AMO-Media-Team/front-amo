import { describe, expect, it } from "vitest"

import {
  accionesEquipo,
  accionesTitular,
  admiteSupresion,
  categoriasDatos,
  clasificarBloqueos,
  datosParaRol,
  enmascararIp,
  ESTADOS_INTERNO,
  ESTADOS_TITULAR,
  esReclamo,
  formatearDia,
  ORDEN_TIPOS,
  situacionPlazo,
  textoArchivosEjecutada,
  textoArchivosSimulacion,
  textoBorrado,
  textoPlazoLegal,
  textoRadicado,
  textoSolicitudesVinculacion,
  textoVencimiento,
  TIPOS,
  TIPOS_RECLAMO,
} from "./presentacion"
import { ESTADOS_SOLICITUD, type SolicitudBase, TIPOS_SOLICITUD } from "./tipos"

const HOY = "2026-11-10"

function solicitud(
  cambios: Partial<SolicitudBase> = {}
): Pick<
  SolicitudBase,
  | "tipo"
  | "estado"
  | "plazoVence"
  | "alertaDesde"
  | "prorrogadaAt"
  | "decision"
  | "supresionEjecutadaAt"
> {
  return {
    tipo: "SUPRESION",
    estado: "EN_TRAMITE",
    plazoVence: "2026-11-17",
    alertaDesde: "2026-11-12",
    prorrogadaAt: null,
    decision: null,
    supresionEjecutadaAt: null,
    ...cambios,
  }
}

const CONTEXTO = { hoy: HOY, actorEsTitular: false, conCuenta: true }

describe("tipos de solicitud", () => {
  it("cubre todos los tipos de la BD, una vez en el formulario", () => {
    expect([...ORDEN_TIPOS].sort()).toEqual([...TIPOS_SOLICITUD].sort())
    for (const tipo of TIPOS_SOLICITUD) {
      expect(TIPOS[tipo].derecho.length).toBeGreaterThan(20)
    }
  })

  it("separa consultas (art. 14) de reclamos (art. 15) con su plazo legal", () => {
    expect(esReclamo("CONSULTA")).toBe(false)
    expect(esReclamo("PRUEBA_AUTORIZACION")).toBe(false)
    expect(TIPOS_RECLAMO).toEqual([
      "ACTUALIZACION",
      "RECTIFICACION",
      "SUPRESION",
      "REVOCATORIA",
    ])
    expect(textoPlazoLegal("CONSULTA")).toBe(
      "Respondemos en máximo 10 días hábiles (Ley 1581 de 2012, art. 14)."
    )
    expect(textoPlazoLegal("SUPRESION")).toContain("15 días hábiles")
    expect(textoPlazoLegal("SUPRESION")).toContain("art. 15")
  })

  it("solo la supresión y la revocatoria terminan en supresión", () => {
    expect(TIPOS_SOLICITUD.filter(admiteSupresion)).toEqual([
      "SUPRESION",
      "REVOCATORIA",
    ])
  })
})

describe("estados", () => {
  it("tiene voz del titular y del equipo para cada estado", () => {
    for (const estado of ESTADOS_SOLICITUD) {
      expect(ESTADOS_TITULAR[estado].etiqueta).toBeTruthy()
      expect(ESTADOS_INTERNO[estado].etiqueta).toBeTruthy()
    }
    expect(ESTADOS_TITULAR.REQUIERE_INFORMACION.etiqueta).toBe(
      "Te pedimos información"
    )
    expect(ESTADOS_INTERNO.REQUIERE_INFORMACION.etiqueta).toBe(
      "Esperando al titular"
    )
  })
})

describe("situacionPlazo (semáforo)", () => {
  it("vencida, vence hoy, por vencer y en plazo según el día de Bogotá", () => {
    const base = { estado: "EN_TRAMITE" as const, alertaDesde: "2026-11-12" }
    expect(situacionPlazo({ ...base, plazoVence: "2026-11-09" }, HOY)).toBe(
      "vencida"
    )
    expect(situacionPlazo({ ...base, plazoVence: HOY }, HOY)).toBe("hoy")
    expect(
      situacionPlazo(
        { ...base, plazoVence: "2026-11-13", alertaDesde: "2026-11-10" },
        HOY
      )
    ).toBe("por_vencer")
    expect(situacionPlazo({ ...base, plazoVence: "2026-11-17" }, HOY)).toBe(
      "en_plazo"
    )
  })

  it("en Requiere información espera al titular y las cerradas no corren", () => {
    const fechas = { plazoVence: "2026-11-01", alertaDesde: "2026-10-28" }
    expect(
      situacionPlazo({ ...fechas, estado: "REQUIERE_INFORMACION" }, HOY)
    ).toBe("esperando")
    expect(situacionPlazo({ ...fechas, estado: "RESPONDIDA" }, HOY)).toBe(
      "cerrada"
    )
    expect(situacionPlazo({ ...fechas, estado: "DESISTIDA" }, HOY)).toBe(
      "cerrada"
    )
    expect(situacionPlazo({ ...fechas, estado: "RADICADA" }, HOY)).toBe(
      "vencida"
    )
  })
})

describe("textos de fechas", () => {
  it("no corre un día 'YYYY-MM-DD' al anterior", () => {
    expect(formatearDia("2026-11-09")).toMatch(/^9 de nov/)
    expect(formatearDia("2026-11-09", "largo")).toBe("9 de noviembre de 2026")
  })

  it("dice si vence, vence hoy o ya venció", () => {
    expect(textoVencimiento(HOY, HOY)).toBe("Vence hoy")
    expect(textoVencimiento("2026-11-17", HOY)).toMatch(/^Vence el 17 de nov/)
    expect(textoVencimiento("2026-11-03", HOY)).toMatch(/^Venció el 3 de nov/)
  })

  it("muestra el radicado sin separador de miles", () => {
    expect(textoRadicado(41)).toBe("N.º 41")
    expect(textoRadicado(12345)).toBe("N.º 12345")
  })
})

describe("accionesEquipo", () => {
  it("Radicada: tramitar, pedir información, prorrogar y responder", () => {
    expect(
      accionesEquipo(solicitud({ estado: "RADICADA" }), CONTEXTO)
    ).toMatchObject({
      tramitar: true,
      requerir: true,
      prorrogar: true,
      responder: true,
      verDatos: true,
      simularSupresion: true,
      ejecutarSupresion: false,
    })
  })

  it("pide información solo en un reclamo y antes de prorrogarlo", () => {
    for (const tipo of ["CONSULTA", "PRUEBA_AUTORIZACION"] as const) {
      expect(accionesEquipo(solicitud({ tipo }), CONTEXTO).requerir).toBe(false)
    }
    expect(
      accionesEquipo(solicitud({ tipo: "RECTIFICACION" }), CONTEXTO).requerir
    ).toBe(true)
    expect(
      accionesEquipo(
        solicitud({ prorrogadaAt: "2026-11-05T10:00:00Z" }),
        CONTEXTO
      ).requerir
    ).toBe(false)
  })

  it("ve los datos del titular solo con la solicitud abierta y la cuenta viva", () => {
    expect(
      accionesEquipo(solicitud({ estado: "REQUIERE_INFORMACION" }), CONTEXTO)
        .verDatos
    ).toBe(true)
    expect(
      accionesEquipo(
        solicitud({ estado: "RESPONDIDA", decision: "PROCEDE" }),
        CONTEXTO
      ).verDatos
    ).toBe(false)
    expect(
      accionesEquipo(solicitud(), { ...CONTEXTO, conCuenta: false }).verDatos
    ).toBe(false)
  })

  it("prorroga una sola vez y antes del vencimiento", () => {
    expect(
      accionesEquipo(
        solicitud({ prorrogadaAt: "2026-11-05T10:00:00Z" }),
        CONTEXTO
      ).prorrogar
    ).toBe(false)
    expect(
      accionesEquipo(solicitud({ plazoVence: "2026-11-09" }), CONTEXTO)
        .prorrogar
    ).toBe(false)
    expect(
      accionesEquipo(solicitud({ plazoVence: HOY }), CONTEXTO).prorrogar
    ).toBe(true)
  })

  it("en Requiere información solo se espera al titular", () => {
    expect(
      accionesEquipo(solicitud({ estado: "REQUIERE_INFORMACION" }), CONTEXTO)
    ).toMatchObject({
      tramitar: false,
      requerir: false,
      prorrogar: false,
      responder: false,
    })
  })

  it("ejecuta la supresión respondida con procede o procede en parte", () => {
    for (const decision of ["PROCEDE", "PROCEDE_PARCIAL"] as const) {
      expect(
        accionesEquipo(solicitud({ estado: "RESPONDIDA", decision }), CONTEXTO)
          .ejecutarSupresion
      ).toBe(true)
    }
    const negada = accionesEquipo(
      solicitud({ estado: "RESPONDIDA", decision: "NO_PROCEDE" }),
      CONTEXTO
    )
    expect(negada.simularSupresion).toBe(false)
    expect(negada.ejecutarSupresion).toBe(false)
  })

  it("no ofrece la supresión sin cuenta, ya ejecutada, sobre sí mismo o en una consulta", () => {
    const respondida = solicitud({ estado: "RESPONDIDA", decision: "PROCEDE" })
    expect(
      accionesEquipo(respondida, { ...CONTEXTO, conCuenta: false })
        .ejecutarSupresion
    ).toBe(false)
    expect(
      accionesEquipo(
        { ...respondida, supresionEjecutadaAt: "2026-11-10T15:00:00Z" },
        CONTEXTO
      ).simularSupresion
    ).toBe(false)
    expect(
      accionesEquipo(respondida, { ...CONTEXTO, actorEsTitular: true })
        .ejecutarSupresion
    ).toBe(false)
    expect(
      accionesEquipo({ ...respondida, tipo: "CONSULTA" }, CONTEXTO)
        .simularSupresion
    ).toBe(false)
  })
})

describe("textos de la supresión", () => {
  it("dice qué pasó en Storage al ejecutar o reintentar", () => {
    expect(
      textoBorrado({
        archivosBorrados: 3,
        archivosPendientes: 0,
        archivosRechazados: 0,
      })
    ).toBe("3 archivos borrados de Storage.")
    expect(
      textoBorrado({
        archivosBorrados: 0,
        archivosPendientes: 0,
        archivosRechazados: 0,
      })
    ).toBe("No quedaban archivos en Storage.")
    expect(
      textoBorrado({
        archivosBorrados: 1,
        archivosPendientes: 2,
        archivosRechazados: 1,
      })
    ).toBe(
      "1 archivo borrado de Storage. 2 carpetas o archivos siguen ahí: reintenta el borrado. 1 carpeta o archivo no corresponde a este titular y no se tocó: avisa a soporte."
    )
  })

  it("separa los deberes legales del medio de quién puede suprimir la cuenta", () => {
    expect(
      clasificarBloqueos([
        "El medio tiene liquidaciones sin pagar.",
        "Solo un superadministrador puede suprimir esta cuenta.",
        "El medio tiene disputas abiertas.",
        "Es el último superadministrador activo.",
      ])
    ).toEqual({
      legales: [
        "El medio tiene liquidaciones sin pagar.",
        "El medio tiene disputas abiertas.",
      ],
      otros: [
        "Solo un superadministrador puede suprimir esta cuenta.",
        "Es el último superadministrador activo.",
      ],
    })
  })

  it("nunca promete una limpieza programada", () => {
    const texto = textoBorrado({
      archivosBorrados: 0,
      archivosPendientes: 4,
      archivosRechazados: 0,
    })
    expect(texto).not.toMatch(/limpieza/)
    expect(texto).toBe(
      "No se borró ningún archivo de Storage. 4 carpetas o archivos siguen ahí: reintenta el borrado."
    )
  })

  it("lee lo que guardó la BD de una supresión ejecutada", () => {
    expect(textoArchivosEjecutada(1, 0)).toBe("Se borraron de Storage.")
    expect(textoArchivosEjecutada(0, 0)).toBe("No había archivos que borrar.")
    expect(textoArchivosEjecutada(2, 1)).toBe(
      "1 carpeta o archivo sigue en Storage: reintenta el borrado."
    )
    expect(textoArchivosEjecutada(2, null)).toBe(
      "No quedó registro del borrado en Storage."
    )
  })

  it("la simulación cuenta los archivos y las solicitudes de vinculación", () => {
    expect(textoArchivosSimulacion(0)).toBe("No hay archivos que borrar.")
    expect(textoArchivosSimulacion(2)).toBe(
      "2 carpetas o archivos se borran de Storage (foto de perfil y documentos)."
    )
    expect(textoSolicitudesVinculacion(0)).toMatch(/^No hay solicitudes/)
    expect(textoSolicitudesVinculacion(1)).toMatch(/^Se borra 1 solicitud/)
    expect(textoSolicitudesVinculacion(3)).toMatch(/^Se borran 3 solicitudes/)
  })
})

describe("accionesTitular", () => {
  it("responde el requerimiento y desiste mientras esté abierta", () => {
    expect(accionesTitular("REQUIERE_INFORMACION")).toEqual({
      aportar: true,
      desistir: true,
    })
    expect(accionesTitular("RADICADA")).toEqual({
      aportar: false,
      desistir: true,
    })
    expect(accionesTitular("RESPONDIDA")).toEqual({
      aportar: false,
      desistir: false,
    })
  })
})

describe("datos por rol", () => {
  it("pago, documentos y cuentas sociales son solo del medio", () => {
    expect(datosParaRol("MEDIO")).toContain("PAGO")
    expect(datosParaRol("ANUNCIANTE")).not.toContain("PAGO")
    expect(datosParaRol("ADMIN")).not.toContain("CUENTAS_SOCIALES")
    expect(datosParaRol("ANUNCIANTE")).toContain("OTROS")
  })

  it("enlaza dónde corregir según el rol y sus permisos", () => {
    const medio = categoriasDatos("MEDIO", [
      "cuenta.gestionar",
      "medios.editar_propio",
    ])
    expect(medio.map((c) => c.id)).toEqual([
      "identidad",
      "medio",
      "pago",
      "documentos",
      "cuentas",
      "accesos",
      "actividad",
    ])
    expect(medio.find((c) => c.id === "pago")?.enlace?.href).toBe(
      "/mi-medio/pago"
    )

    const anunciante = categoriasDatos("ANUNCIANTE", ["cuenta.gestionar"])
    const empresa = anunciante.find((c) => c.id === "empresa")
    expect(empresa).toBeDefined()
    // Sin `anunciantes.editar_propio` no se ofrece un enlace que termina en 403.
    expect(empresa?.enlace).toBeNull()

    expect(
      categoriasDatos("ADMIN", ["cuenta.gestionar"]).map((c) => c.id)
    ).toEqual(["identidad", "accesos", "actividad"])
  })
})

describe("enmascararIp", () => {
  it("aplica la misma regla de datos_titular()", () => {
    expect(enmascararIp("190.24.115.8")).toBe("190.24.x.x")
    expect(enmascararIp("190.24.115.8/32")).toBe("190.24.x.x")
    expect(enmascararIp("2800:e2:2a80:1a0::1")).toBe("2800:e2:2…")
    expect(enmascararIp(null)).toBeNull()
    expect(enmascararIp("")).toBeNull()
  })
})
