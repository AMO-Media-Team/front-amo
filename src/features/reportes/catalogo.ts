/**
 * Catálogo de reportes (docs/modelo-datos.md §5.9, docs/kpis.md). Módulo puro:
 * lo usan el centro de reportes, las páginas, la exportación y las pruebas.
 * Cada reporte declara los permisos que exige su RPC (todos obligatorios) y
 * los filtros que entiende; la base de datos vuelve a exigirlos.
 */
import type { ClavePermiso } from "@/lib/auth/permisos"
import type { UsuarioSesion } from "@/lib/auth/tipos"

export const SLUGS_REPORTE = [
  "resumen-ejecutivo",
  "desempeno-campanas",
  "finanzas",
  "cartera",
  "cobertura-territorial",
  "cumplimiento-medios",
  "usuarios-accesos",
] as const

export type SlugReporte = (typeof SLUGS_REPORTE)[number]

export type GrupoReporte = "negocio" | "territorio" | "seguridad"

/** Filtros de la URL que entiende cada reporte (además de la tabla). */
export type FiltroReporte =
  "periodo" | "corte" | "departamento" | "anunciante" | "sector" | "agrupacion"

/** Nombre de cada filtro en las tarjetas del centro de reportes. */
export const ETIQUETAS_FILTRO: Readonly<Record<FiltroReporte, string>> = {
  periodo: "Periodo",
  corte: "Fecha de corte",
  departamento: "Departamento",
  anunciante: "Anunciante",
  sector: "Sector",
  agrupacion: "Agrupación",
}

/** Ícono del reporte (mapa estático en los componentes; no se serializan componentes). */
export type IconoReporte =
  | "resumen"
  | "campanas"
  | "finanzas"
  | "cartera"
  | "cobertura"
  | "cumplimiento"
  | "accesos"

export interface ReporteCatalogo {
  slug: SlugReporte
  titulo: string
  /** Una línea para la tarjeta del centro de reportes. */
  descripcion: string
  /** Para qué sirve, en lenguaje llano (encabezado del reporte y portada). */
  proposito: string
  grupo: GrupoReporte
  icono: IconoReporte
  /** Todos obligatorios (los exige la RPC del reporte). */
  permisos: readonly ClavePermiso[]
  /** Texto de la tarjeta: quién puede abrirlo. */
  acceso: string
  filtros: readonly FiltroReporte[]
  /** Muestra la variación frente al periodo (o corte) anterior. */
  comparativo: boolean
  /** Orientación del PDF: horizontal para tablas anchas. */
  orientacionPdf: "vertical" | "horizontal"
  /** Tarjetas de cabecera (el esqueleto de carga reserva las mismas). */
  indicadores: 6 | 8
}

export const GRUPOS_REPORTE: Readonly<
  Record<GrupoReporte, { titulo: string; descripcion: string }>
> = {
  negocio: {
    titulo: "Negocio y finanzas",
    descripcion:
      "Cómo crece el marketplace, cuánto se factura y cuánto falta por cobrar.",
  },
  territorio: {
    titulo: "Territorio y medios",
    descripcion: "Dónde hay medios, dónde se pauta y qué tan bien cumplen.",
  },
  seguridad: {
    titulo: "Seguridad",
    descripcion: "Quién usa la plataforma y con qué hábitos de acceso.",
  },
}

export const REPORTES: Readonly<Record<SlugReporte, ReporteCatalogo>> = {
  "resumen-ejecutivo": {
    slug: "resumen-ejecutivo",
    titulo: "Resumen ejecutivo",
    descripcion:
      "Los 16 indicadores del negocio con su comparativo, tendencia del GMV y hallazgos.",
    proposito:
      "Una foto del negocio en el periodo: cuánto se vendió, cuánto se cumplió, cuánto ganó la plataforma y cómo se movió frente al periodo anterior.",
    grupo: "negocio",
    icono: "resumen",
    permisos: ["reportes.ver", "inicio.admin"],
    acceso: "Equipo interno",
    filtros: ["periodo"],
    comparativo: true,
    orientacionPdf: "vertical",
    indicadores: 8,
  },
  "desempeno-campanas": {
    slug: "desempeno-campanas",
    titulo: "Desempeño de campañas",
    descripcion:
      "Inversión, llenado de cupos, alcance y costo por resultado de cada campaña.",
    proposito:
      "Qué tan bien rindió cada campaña: cuánto se invirtió, cuántos cupos se llenaron y cuánto costó cada mil impresiones, interacción o persona alcanzada.",
    grupo: "negocio",
    icono: "campanas",
    permisos: ["reportes.ver"],
    acceso: "Equipo interno y anunciantes (solo sus campañas)",
    filtros: ["periodo", "anunciante"],
    comparativo: true,
    orientacionPdf: "horizontal",
    indicadores: 6,
  },
  finanzas: {
    slug: "finanzas",
    titulo: "Finanzas",
    descripcion:
      "GMV, comisión, facturación y recaudo por anunciante, sector o mes.",
    proposito:
      "De dónde viene el ingreso de la plataforma: GMV y comisión por anunciante y por industria, lo facturado, lo recaudado y lo pagado a los medios.",
    grupo: "negocio",
    icono: "finanzas",
    permisos: ["reportes.ver", "reportes.finanzas"],
    acceso: "Finanzas y administración",
    filtros: ["periodo", "agrupacion", "sector"],
    comparativo: true,
    orientacionPdf: "horizontal",
    indicadores: 8,
  },
  cartera: {
    slug: "cartera",
    titulo: "Cartera",
    descripcion:
      "Saldo por cobrar a cada anunciante y su antigüedad a una fecha de corte.",
    proposito:
      "Cuánto le deben los anunciantes a la plataforma en una fecha de corte y hace cuánto: lo que está al día, lo vencido y lo que necesita gestión de cobro.",
    grupo: "negocio",
    icono: "cartera",
    permisos: ["reportes.ver", "reportes.finanzas"],
    acceso: "Finanzas y administración",
    filtros: ["corte"],
    comparativo: true,
    orientacionPdf: "horizontal",
    indicadores: 6,
  },
  "cobertura-territorial": {
    slug: "cobertura-territorial",
    titulo: "Cobertura territorial",
    descripcion:
      "Medios verificados por departamento y municipio, pauta y alcance en cada zona.",
    proposito:
      "Dónde tiene AMO medios verificados y activos, cuánta pauta llega a cada zona y qué territorios están desatendidos.",
    grupo: "territorio",
    icono: "cobertura",
    permisos: ["reportes.ver", "medios.ver"],
    acceso: "Equipo interno",
    filtros: ["periodo", "departamento"],
    comparativo: true,
    orientacionPdf: "vertical",
    indicadores: 6,
  },
  "cumplimiento-medios": {
    slug: "cumplimiento-medios",
    titulo: "Cumplimiento de medios",
    descripcion:
      "Qué medios publican a tiempo, cuáles dejan vencer asignaciones y sus alertas.",
    proposito:
      "Qué tan confiables son los medios: de las asignaciones cuyo plazo venció en el periodo, cuántas se publicaron a tiempo y quiénes concentran incumplimientos.",
    grupo: "territorio",
    icono: "cumplimiento",
    permisos: ["reportes.ver", "medios.ver"],
    acceso: "Equipo interno",
    filtros: ["periodo", "departamento"],
    comparativo: true,
    orientacionPdf: "horizontal",
    indicadores: 6,
  },
  "usuarios-accesos": {
    slug: "usuarios-accesos",
    titulo: "Usuarios y accesos",
    descripcion:
      "Ingresos, intentos fallidos, accesos sospechosos y verificación en dos pasos por usuario.",
    proposito:
      "Quién usa la plataforma y cómo: ingresos y fallos por persona, países de origen, accesos sospechosos y cuentas sin verificación en dos pasos.",
    grupo: "seguridad",
    icono: "accesos",
    permisos: ["reportes.ver", "accesos.ver", "usuarios.ver"],
    acceso: "Administración",
    filtros: ["periodo"],
    comparativo: true,
    orientacionPdf: "horizontal",
    indicadores: 6,
  },
}

export function esSlugReporte(valor: string): valor is SlugReporte {
  return (SLUGS_REPORTE as readonly string[]).includes(valor)
}

type UsuarioPermisos = Pick<UsuarioSesion, "permisos">

/** El reporte exige todos sus permisos (los mismos que su RPC). */
export function puedeVerReporte(
  usuario: UsuarioPermisos,
  reporte: Pick<ReporteCatalogo, "permisos">
): boolean {
  return reporte.permisos.every((permiso) => usuario.permisos.includes(permiso))
}

export function puedeExportarReporte(
  usuario: UsuarioPermisos,
  reporte: Pick<ReporteCatalogo, "permisos">
): boolean {
  return (
    puedeVerReporte(usuario, reporte) &&
    usuario.permisos.includes("reportes.exportar")
  )
}

/**
 * Filtros del reporte que aplican a quien consulta. A un anunciante no se le
 * ofrece ni se le aplica el filtro por anunciante: la base ya le limita los
 * datos a sus campañas. La barra de filtros, la consulta, la portada de los
 * documentos y la bitácora usan esta misma lista.
 */
export function filtrosPara(
  reporte: Pick<ReporteCatalogo, "filtros">,
  usuario: Pick<UsuarioSesion, "anuncianteId">
): readonly FiltroReporte[] {
  return usuario.anuncianteId
    ? reporte.filtros.filter((filtro) => filtro !== "anunciante")
    : reporte.filtros
}

/**
 * Lo que dice la tarjeta del centro según quién la mira: los filtros que le
 * aplican (`filtrosPara`) y, a un anunciante, el acceso en segunda persona.
 */
export function tarjetaPara(
  reporte: Pick<ReporteCatalogo, "filtros" | "acceso">,
  usuario: Pick<UsuarioSesion, "anuncianteId">
): { filtros: readonly FiltroReporte[]; acceso: string } {
  const filtros = filtrosPara(reporte, usuario)
  return {
    filtros,
    acceso:
      filtros.length === reporte.filtros.length
        ? reporte.acceso
        : "Solo tus campañas",
  }
}

/** Reportes visibles, en el orden del catálogo. */
export function reportesVisibles(usuario: UsuarioPermisos): ReporteCatalogo[] {
  return SLUGS_REPORTE.map((slug) => REPORTES[slug]).filter((reporte) =>
    puedeVerReporte(usuario, reporte)
  )
}

/** Reportes visibles agrupados (sin grupos vacíos), en el orden de `GRUPOS_REPORTE`. */
export function reportesPorGrupo(
  usuario: UsuarioPermisos
): { grupo: GrupoReporte; reportes: ReporteCatalogo[] }[] {
  const visibles = reportesVisibles(usuario)
  return (Object.keys(GRUPOS_REPORTE) as GrupoReporte[])
    .map((grupo) => ({
      grupo,
      reportes: visibles.filter((reporte) => reporte.grupo === grupo),
    }))
    .filter(({ reportes }) => reportes.length > 0)
}

export function rutaReporte(slug: SlugReporte): `/reportes/${SlugReporte}` {
  return `/reportes/${slug}`
}
