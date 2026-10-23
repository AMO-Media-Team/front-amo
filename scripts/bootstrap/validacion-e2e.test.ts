// @vitest-environment node
import { describe, expect, it } from "vitest"

import { interaccionesDe, PREFIJO_PAUTA } from "./pauta-e2e"
import {
  describirRestablecimiento,
  esBaseLocal,
  ESTADOS_DISPUTABLES,
  esReclamable,
  leerAlerta,
  limiteAlcance,
  MOTIVO_RESOLUCION,
  multiploDe,
  planResolucion,
  plazoVencido,
  PREFIJO_VALIDACION,
  puedeAbrirDisputa,
  reclamoHasta,
  RESULTADOS_DISPUTA,
  valoresConAlertaMultiplo,
} from "./validacion-e2e"

const HORA = 3_600_000

/** Configuración por omisión de `metricas.multiplo_alcance_seguidores`. */
const MULTIPLOS = { INSTAGRAM: 2, FACEBOOK: 3, TIKTOK: 20 }

describe("prefijo", () => {
  it("no choca con el de la pauta ni con el de las campañas del anunciante", () => {
    expect(PREFIJO_VALIDACION.startsWith(PREFIJO_PAUTA)).toBe(false)
    expect(PREFIJO_PAUTA.startsWith(PREFIJO_VALIDACION)).toBe(false)
    expect(PREFIJO_VALIDACION.startsWith("Campaña E2E")).toBe(false)
  })
})

describe("multiploDe", () => {
  it("lee el múltiplo de la plataforma", () => {
    expect(multiploDe(MULTIPLOS, "INSTAGRAM")).toBe(2)
    expect(multiploDe(MULTIPLOS, "TIKTOK")).toBe(20)
  })

  it("falla con un mensaje claro si falta o no es válido", () => {
    expect(() => multiploDe({ INSTAGRAM: 2 }, "FACEBOOK")).toThrow(/FACEBOOK/)
    expect(() => multiploDe({ INSTAGRAM: 0 }, "INSTAGRAM")).toThrow(RangeError)
    expect(() => multiploDe({ INSTAGRAM: "dos" }, "INSTAGRAM")).toThrow(
      RangeError
    )
    expect(() => multiploDe([2], "INSTAGRAM")).toThrow(RangeError)
    expect(() => multiploDe(null, "INSTAGRAM")).toThrow(RangeError)
  })
})

describe("valoresConAlertaMultiplo", () => {
  it("en Instagram, el alcance supera 2 × seguidores y las cifras siguen coherentes", () => {
    const valores = valoresConAlertaMultiplo({
      plataforma: "INSTAGRAM",
      corte: "H24",
      seguidores: 40_000,
      multiplo: 2,
    })
    expect(limiteAlcance(40_000, 2)).toBe(80_000)
    expect(valores.alcance).toBe(100_000)
    expect(valores.alcance).toBeGreaterThan(limiteAlcance(40_000, 2))
    expect(valores.impresiones).toBeGreaterThanOrEqual(valores.alcance ?? 0)
    expect(interaccionesDe(valores)).toBeLessThanOrEqual(
      valores.impresiones ?? 0
    )
    expect(valores.reproducciones).toBeNull()
    expect(valores.espectadores_unicos).toBeNull()
  })

  it("en TikTok, los espectadores únicos superan el límite y las reproducciones los cubren", () => {
    const valores = valoresConAlertaMultiplo({
      plataforma: "TIKTOK",
      corte: "H24",
      seguidores: 35_000,
      multiplo: 20,
    })
    expect(valores.espectadores_unicos).toBeGreaterThan(700_000)
    expect(valores.reproducciones).toBeGreaterThanOrEqual(
      valores.espectadores_unicos ?? 0
    )
    expect(valores.alcance).toBeNull()
    expect(valores.impresiones).toBeNull()
  })

  it("exige seguidores enteros positivos", () => {
    expect(() =>
      valoresConAlertaMultiplo({
        plataforma: "INSTAGRAM",
        corte: "H24",
        seguidores: 0,
        multiplo: 2,
      })
    ).toThrow(RangeError)
  })
})

describe("leerAlerta", () => {
  it("lee las banderas y el límite del detalle", () => {
    expect(
      leerAlerta({
        alerta_multiplo: true,
        alerta_desviacion: false,
        detalle_alertas: { limite_alcance: 80_000, multiplo: 2 },
      })
    ).toEqual({ multiplo: true, desviacion: false, limiteAlcance: 80_000 })
  })

  it("sin detalle, el límite es nulo", () => {
    expect(
      leerAlerta({
        alerta_multiplo: false,
        alerta_desviacion: false,
        detalle_alertas: null,
      }).limiteAlcance
    ).toBeNull()
  })
})

describe("puedeAbrirDisputa", () => {
  it("cualquier parte, desde los estados disputables", () => {
    for (const estado of ESTADOS_DISPUTABLES) {
      expect(puedeAbrirDisputa(estado, "ANUNCIANTE", "METRICAS")).toBe(true)
      expect(puedeAbrirDisputa(estado, "ADMIN", "CONTENIDO")).toBe(true)
    }
    expect(puedeAbrirDisputa("ACEPTADA", "MEDIO", "OTRO")).toBe(false)
    expect(puedeAbrirDisputa("CANCELADA", "ANUNCIANTE", "OTRO")).toBe(false)
  })

  it("una vencida solo la reclama el medio, con Otro o Incumplimiento", () => {
    expect(puedeAbrirDisputa("VENCIDA_SIN_PUBLICAR", "MEDIO", "OTRO")).toBe(
      true
    )
    expect(
      puedeAbrirDisputa("VENCIDA_SIN_PUBLICAR", "MEDIO", "INCUMPLIMIENTO")
    ).toBe(true)
    expect(puedeAbrirDisputa("VENCIDA_SIN_PUBLICAR", "MEDIO", "PAGO")).toBe(
      false
    )
    expect(
      puedeAbrirDisputa("VENCIDA_SIN_PUBLICAR", "ANUNCIANTE", "OTRO")
    ).toBe(false)
  })
})

describe("reclamo de una vencida", () => {
  const vencidaAt = "2026-10-23T12:00:00Z"

  it("el plazo corre desde que venció", () => {
    expect(reclamoHasta(vencidaAt, 72)?.toISOString()).toBe(
      "2026-10-26T12:00:00.000Z"
    )
    expect(reclamoHasta(null, 72)).toBeNull()
  })

  it("es reclamable dentro del plazo y sin disputa", () => {
    const vencida = {
      estado: "VENCIDA_SIN_PUBLICAR" as const,
      vencidaAt,
      conDisputa: false,
    }
    const dentro = new Date(Date.parse(vencidaAt) + 71 * HORA)
    const fuera = new Date(Date.parse(vencidaAt) + 73 * HORA)
    expect(esReclamable(vencida, 72, dentro)).toBe(true)
    expect(esReclamable(vencida, 72, fuera)).toBe(false)
    expect(esReclamable({ ...vencida, conDisputa: true }, 72, dentro)).toBe(
      false
    )
    expect(esReclamable({ ...vencida, estado: "CANCELADA" }, 72, dentro)).toBe(
      false
    )
    expect(esReclamable({ ...vencida, vencidaAt: null }, 72, dentro)).toBe(
      false
    )
  })
})

describe("planResolucion", () => {
  it("RESTAURAR y DESCARTAR devuelven el estado previo", () => {
    expect(
      planResolucion({ resultado: "RESTAURAR", estadoPrevio: "VERIFICADA" })
    ).toEqual({
      hacia: "RESUELTA",
      datos: { estado_asignacion_resultante: "VERIFICADA" },
      estadoAsignacion: "VERIFICADA",
    })
    expect(
      planResolucion({ resultado: "DESCARTAR", estadoPrevio: "PUBLICADA" })
    ).toEqual({ hacia: "DESCARTADA", datos: {}, estadoAsignacion: "PUBLICADA" })
  })

  it("VERIFICAR solo desde METRICAS_CARGADAS, con la constancia si se pide", () => {
    expect(
      planResolucion({
        resultado: "VERIFICAR",
        estadoPrevio: "METRICAS_CARGADAS",
      }).datos
    ).toEqual({ estado_asignacion_resultante: "VERIFICADA" })
    expect(
      planResolucion({
        resultado: "VERIFICAR",
        estadoPrevio: "METRICAS_CARGADAS",
        permanenciaVerificada: true,
      }).datos
    ).toEqual({
      estado_asignacion_resultante: "VERIFICADA",
      permanencia_verificada: true,
    })
    expect(() =>
      planResolucion({ resultado: "VERIFICAR", estadoPrevio: "PUBLICADA" })
    ).toThrow(/METRICAS_CARGADAS/)
  })

  it("REABRIR solo una vencida: vuelve a CONTENIDO_ENTREGADO", () => {
    expect(
      planResolucion({
        resultado: "REABRIR",
        estadoPrevio: "VENCIDA_SIN_PUBLICAR",
      })
    ).toEqual({
      hacia: "RESUELTA",
      datos: { estado_asignacion_resultante: "CONTENIDO_ENTREGADO" },
      estadoAsignacion: "CONTENIDO_ENTREGADO",
    })
    expect(() =>
      planResolucion({ resultado: "REABRIR", estadoPrevio: "VERIFICADA" })
    ).toThrow(/vencida/)
  })

  it("CANCELAR lleva su causa (administrativa por omisión)", () => {
    expect(
      planResolucion({ resultado: "CANCELAR", estadoPrevio: "PUBLICADA" }).datos
    ).toEqual({
      estado_asignacion_resultante: "CANCELADA",
      causa: "ADMINISTRATIVA",
    })
    expect(
      planResolucion({
        resultado: "CANCELAR",
        estadoPrevio: "VENCIDA_SIN_PUBLICAR",
        causa: "INCUMPLIMIENTO_MEDIO",
      }).datos
    ).toEqual({
      estado_asignacion_resultante: "CANCELADA",
      causa: "INCUMPLIMIENTO_MEDIO",
    })
  })

  it("sin estado previo no hay disputa que resolver", () => {
    expect(() =>
      planResolucion({ resultado: "RESTAURAR", estadoPrevio: null })
    ).toThrow(/no está en disputa/)
  })

  it("cada resultado tiene un motivo por omisión", () => {
    for (const resultado of RESULTADOS_DISPUTA) {
      expect(MOTIVO_RESOLUCION[resultado].length).toBeGreaterThan(20)
    }
  })
})

describe("base local", () => {
  it("reconoce la pila de supabase start y nada más", () => {
    expect(esBaseLocal("http://127.0.0.1:54321")).toBe(true)
    expect(esBaseLocal("http://localhost:54321")).toBe(true)
    expect(esBaseLocal("https://depbmnlpfnrcsbqlwxxd.supabase.co")).toBe(false)
    expect(esBaseLocal("https://oriuuuaczpncmtglfgpv.supabase.co")).toBe(false)
    expect(esBaseLocal("no es una url")).toBe(false)
    expect(esBaseLocal(undefined)).toBe(false)
  })

  it("el plazo vencido queda un minuto atrás", () => {
    const ahora = new Date("2026-10-23T12:00:00Z")
    expect(plazoVencido(ahora).toISOString()).toBe("2026-10-23T11:59:00.000Z")
  })
})

describe("describirRestablecimiento", () => {
  const nada = {
    campanasBorradas: 0,
    campanasArchivadas: 0,
    asignacionesBorradas: 0,
    disputasCerradas: 0,
    reclamosCerrados: 0,
    medioReactivado: false,
  }

  it("dice si no había nada", () => {
    expect(describirRestablecimiento(nada)).toBe(
      "sin pruebas de validación anteriores"
    )
  })

  it("resume lo hecho", () => {
    expect(
      describirRestablecimiento({
        ...nada,
        campanasArchivadas: 2,
        disputasCerradas: 1,
        medioReactivado: true,
      })
    ).toBe(
      "2 campaña(s) canceladas y archivadas (la BD no deja borrar descargas ni mensajes); 1 disputa(s) cerradas; Medio Suspensión E2E reactivado"
    )
  })
})
