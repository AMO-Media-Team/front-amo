/**
 * Datos de ejemplo para las pruebas de los paneles de Inicio (no se usan en
 * la aplicación). Tienen la forma que entregan las consultas ya normalizadas
 * y son deterministas: sin `Math.random` ni la hora del sistema.
 */
import type { AccesoSospechosoReciente } from "./admin/components/alertas-panel"
import type { EventoReciente } from "./admin/components/actividad-reciente"
import type { FilaSalud, MedioEnRiesgo, ZonaPanel } from "./admin/datos"
import type { FacturaPendiente, FilaDesempeno } from "./anunciante/datos"
import type { AccionPendiente, NegocioEnCurso } from "./medio/datos"

/** 10:00 del lunes 5 de octubre de 2026 en Bogotá. */
export const AHORA = new Date("2026-10-05T15:00:00Z")

export const PERIODO = { desde: "2026-09-06", hasta: "2026-10-05" }

// ── Panel general ────────────────────────────────────────────────────────────

export const ZONAS: ZonaPanel[] = [
  {
    codigo: "11",
    nombre: "Bogotá, D. C.",
    valor: 56_100_000,
    participacion: 0.24,
    valorAnterior: 47_500_000,
    variacion: 0.18,
  },
  {
    codigo: "05",
    nombre: "Antioquia",
    valor: 45_000_000,
    participacion: 0.19,
    valorAnterior: 50_000_000,
    variacion: -0.1,
  },
  {
    codigo: "76",
    nombre: "Valle del Cauca",
    valor: 38_800_000,
    participacion: 0.16,
    valorAnterior: 0,
    variacion: null,
  },
]

export const SALUD: FilaSalud[] = [
  { segmento: "activos", cantidad: 186, porcentaje: 0.62, gmvEnJuego: 0 },
  { segmento: "nuevos", cantidad: 14, porcentaje: 0.047, gmvEnJuego: 0 },
  {
    segmento: "en_riesgo",
    cantidad: 9,
    porcentaje: 0.03,
    gmvEnJuego: 21_400_000,
  },
  { segmento: "inactivos", cantidad: 97, porcentaje: 0.323, gmvEnJuego: 0 },
  { segmento: "suspendidos", cantidad: 4, porcentaje: 0.013, gmvEnJuego: 0 },
]

export const MEDIOS_EN_RIESGO: MedioEnRiesgo[] = [
  {
    id: "m1",
    nombre: "Noticias del Huila",
    departamento: "Huila",
    ultimaAceptacionAt: "2026-08-24T15:00:00Z",
    gmv90d: 6_800_000,
    abiertas: 0,
  },
  {
    id: "m2",
    nombre: "Cali Al Día",
    departamento: "Valle del Cauca",
    ultimaAceptacionAt: "2026-08-29T15:00:00Z",
    gmv90d: 5_100_000,
    abiertas: 1,
  },
  {
    id: "m3",
    nombre: "La Costa Informa",
    departamento: "Atlántico",
    ultimaAceptacionAt: null,
    gmv90d: 3_200_000,
    abiertas: 0,
  },
  {
    id: "m4",
    nombre: "Radio Sabana",
    departamento: "Sucre",
    ultimaAceptacionAt: null,
    gmv90d: 900_000,
    abiertas: 0,
  },
]

export const ACCESOS_SOSPECHOSOS: AccesoSospechosoReciente[] = [
  {
    id: 1,
    at: "2026-10-02T13:40:00Z",
    usuario: { nombre: "Laura Gómez" },
    paisIso2: "RU",
    pais: "Rusia",
    bandera: "🇷🇺",
    ciudad: "Moscú",
    motivoSospecha: "PAIS_INUSUAL",
  },
  {
    id: 2,
    at: "2026-10-01T22:05:00Z",
    usuario: null,
    paisIso2: "CO",
    pais: "Colombia",
    bandera: "🇨🇴",
    ciudad: "Medellín",
    motivoSospecha: "FUERZA_BRUTA",
  },
  {
    id: 3,
    at: "2026-10-01T10:00:00Z",
    usuario: { nombre: "Luis Peña" },
    paisIso2: null,
    pais: null,
    bandera: null,
    ciudad: null,
    motivoSospecha: "PAIS_INUSUAL",
  },
  {
    id: 4,
    at: "2026-09-30T10:00:00Z",
    usuario: { nombre: "Cuarta Persona" },
    paisIso2: "NG",
    pais: "Nigeria",
    bandera: "🇳🇬",
    ciudad: "Lagos",
    motivoSospecha: "PAIS_INUSUAL",
  },
]

const evento = (
  id: number,
  titulo: string,
  parcial: Partial<EventoReciente> = {}
): EventoReciente => ({
  id,
  at: "2026-10-02T14:12:00Z",
  accion: "UPDATE",
  tono: "info",
  titulo,
  resumen: null,
  ruta: null,
  actor: { nombre: "Andrés Ramírez" },
  ...parcial,
})

export const EVENTOS: EventoReciente[] = [
  evento(1, "Editó un usuario", {
    resumen: "Cambió el rol a Operaciones",
    ruta: "/administracion/usuarios",
  }),
  evento(2, "Aprobó la verificación de un medio", {
    accion: "TRANSICION",
    tono: "exito",
    actor: { nombre: "Camila Torres" },
  }),
  evento(3, "Creó una campaña", {
    accion: "INSERT",
    tono: "exito",
    actor: { nombre: "Sistema" },
  }),
  evento(4, "Cambió la configuración", {
    tono: "aviso",
    resumen: "Comisión base 18 % → 20 %",
  }),
  evento(5, "Suspendió un usuario", { accion: "DELETE", tono: "peligro" }),
  evento(6, "Exportó un reporte", {
    accion: "EXPORTAR",
    tono: "neutro",
    resumen: "124 filas · Excel",
  }),
  evento(7, "Séptimo evento"),
  evento(8, "Octavo evento"),
]

// ── Panel del anunciante ─────────────────────────────────────────────────────

/** Fila de `desempeno_anunciante` coherente a partir de la inversión. */
export function desempeno(
  clave: string,
  nombre: string,
  gmv: number,
  parcial: Partial<FilaDesempeno> = {}
): FilaDesempeno {
  const alcance = Math.round(gmv / 13)
  const engagement = parcial.engagement ?? 0.066
  const interacciones = Math.round(alcance * engagement)
  return {
    clave,
    nombre,
    asignaciones: Math.max(1, Math.round(gmv / 700_000)),
    gmv,
    alcance,
    impresiones: Math.round(alcance * 1.6),
    interacciones,
    reproducciones: Math.round(alcance * 0.6),
    clics: Math.round(interacciones * 0.08),
    cpm: 8_300,
    costoInteraccion: interacciones ? gmv / interacciones : null,
    engagement,
    costoAlcance: 13,
    n: 6,
    ...parcial,
  }
}

export const MUNICIPIOS: FilaDesempeno[] = [
  desempeno("76520", "Palmira, Valle", 900_000),
  desempeno("11001", "Bogotá, D.C.", 15_200_000),
  desempeno("05001", "Medellín, Antioquia", 9_800_000),
  desempeno("76001", "Cali, Valle", 6_200_000),
  desempeno("08001", "Barranquilla, Atlántico", 4_300_000),
  desempeno("68001", "Bucaramanga, Santander", 2_600_000),
]

export const MEDIOS: FilaDesempeno[] = [
  desempeno("a", "Medellín Se Mueve", 6_200_000, { engagement: 0.094, n: 8 }),
  desempeno("b", "Bogotá Insólita", 7_400_000, { engagement: 0.081, n: 9 }),
  desempeno("c", "Cali Pachanguera", 4_100_000, { engagement: 0.077, n: 6 }),
  desempeno("d", "Huila Noticias", 1_400_000, { engagement: 0.12, n: 1 }),
]

export const FACTURAS: FacturaPendiente[] = [
  {
    id: "f1",
    numero: "FE1042",
    total: 12_400_000,
    saldo: 12_400_000,
    estado: "EMITIDA",
    fechaVencimiento: "2026-10-15",
  },
  {
    id: "f2",
    numero: "FE1018",
    total: 9_800_000,
    saldo: 4_800_000,
    estado: "PAGADA_PARCIAL",
    fechaVencimiento: "2026-10-05",
  },
  {
    id: "f3",
    numero: null,
    total: 6_200_000,
    saldo: 6_200_000,
    estado: "VENCIDA",
    fechaVencimiento: "2026-09-20",
  },
]

// ── Panel del medio ──────────────────────────────────────────────────────────

export const NEGOCIOS: NegocioEnCurso[] = [
  {
    id: "n1",
    ofertaId: "o1",
    estado: "ACEPTADA",
    plataforma: "INSTAGRAM",
    montoMedio: 480_000,
    titulo: "Café de Colombia · historia patrocinada",
    marca: "Café de Colombia",
  },
  {
    id: "n2",
    ofertaId: "o2",
    estado: "PUBLICADA",
    plataforma: "TIKTOK",
    montoMedio: 620_000,
    titulo: "Feria del Libro Bogotá 2026",
    marca: null,
  },
  {
    id: "n3",
    ofertaId: "o3",
    estado: "EVIDENCIA_VALIDADA",
    plataforma: "FACEBOOK",
    montoMedio: null,
    titulo: null,
    marca: null,
  },
]

/** Acciones con vencimientos relativos a `ahora` (minutos; negativo = vencida). */
export function acciones(ahora: Date): AccionPendiente[] {
  const en = (minutos: number) =>
    new Date(ahora.getTime() + minutos * 60_000).toISOString()
  return [
    {
      asignacionId: "a1",
      ofertaTitulo: "Lanzamiento app Banco Andino",
      accion: "PUBLICAR",
      venceAt: en(-190),
    },
    {
      asignacionId: "a2",
      ofertaTitulo: "Feria del Libro Bogotá 2026",
      accion: "CARGAR_METRICA_H24",
      venceAt: en(135),
    },
    {
      asignacionId: "a3",
      ofertaTitulo: "Café de Colombia",
      accion: "DESCARGAR",
      venceAt: en(20 * 60),
    },
    {
      asignacionId: "a4",
      ofertaTitulo: "Temporada de vacaciones",
      accion: "CARGAR_METRICA_D7",
      venceAt: null,
    },
  ]
}
