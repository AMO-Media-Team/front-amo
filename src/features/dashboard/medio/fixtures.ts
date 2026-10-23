/**
 * Datos de ejemplo del panel del medio para las pruebas (no se usan en la
 * aplicación): filas de `proximas_acciones_medio` con su publicación y su
 * corte, y negocios en curso como los entrega `mis_asignaciones_medio`.
 * Deterministas: los plazos son relativos al `ahora` que reciben.
 */
import type { AccionPendiente, NegocioEnCurso } from "./datos"

/** 10:00 del viernes 23 de octubre de 2026 en Bogotá. */
export const AHORA_MEDIO = new Date("2026-10-23T15:00:00Z")

/** Instante a `minutos` de `ahora` (negativo: ya pasó). */
export function enMinutos(ahora: Date, minutos: number): string {
  return new Date(ahora.getTime() + minutos * 60_000).toISOString()
}

/**
 * Seis pendientes, en el orden en que los entrega la RPC (por vencimiento):
 * una publicación que venció hace poco, una métrica de 24 h que vence en
 * 5 h, una publicación con 2 días, la versión nueva del creativo, una métrica
 * de 7 días que aún no se habilita (se habilita en 10 h) y una corrección.
 */
export function filasAcciones(ahora: Date): AccionPendiente[] {
  const en = (minutos: number) => enMinutos(ahora, minutos)
  return [
    {
      asignacionId: "a1",
      ofertaTitulo: "Lanzamiento app Banco Andino",
      accion: "PUBLICAR",
      venceAt: en(-190),
      numero: null,
      corte: null,
    },
    {
      asignacionId: "a2",
      ofertaTitulo: "Feria del Libro Bogotá 2026",
      accion: "CARGAR_METRICA_H24",
      venceAt: en(5 * 60),
      numero: 1,
      corte: "H24",
    },
    {
      asignacionId: "a5",
      ofertaTitulo: "Temporada de vacaciones",
      // Se habilita en 10 h: 48 h antes de vencer.
      accion: "CARGAR_METRICA_D7",
      venceAt: en((10 + 48) * 60),
      numero: 2,
      corte: "D7",
    },
    {
      asignacionId: "a3",
      ofertaTitulo: "Café de Colombia",
      accion: "DESCARGAR_NUEVA_VERSION",
      venceAt: en(3 * 24 * 60),
      numero: null,
      corte: null,
    },
    {
      asignacionId: "a4",
      ofertaTitulo: "Gran Feria Ganadera",
      accion: "CORREGIR_EVIDENCIA",
      venceAt: en(4 * 24 * 60),
      numero: 2,
      corte: null,
    },
    {
      asignacionId: "a6",
      ofertaTitulo: "Acción del futuro",
      accion: "FIRMAR_CONTRATO",
      venceAt: en(60),
      numero: null,
      corte: null,
    },
  ]
}

export const NEGOCIOS_MEDIO: NegocioEnCurso[] = [
  {
    id: "a3",
    ofertaId: "o3",
    estado: "CONTENIDO_ENTREGADO",
    plataforma: "INSTAGRAM",
    montoMedio: 480_000,
    titulo: "Café de Colombia · historia patrocinada",
    marca: "Café de Colombia",
    handle: "noticias.pereira",
    publicaciones: 1,
  },
  {
    id: "a5",
    ofertaId: "o5",
    estado: "PUBLICADA",
    plataforma: "TIKTOK",
    montoMedio: 620_000,
    titulo: "Temporada de vacaciones",
    marca: null,
    handle: null,
    publicaciones: 2,
  },
]
