/**
 * Registro único de navegación: barra lateral, menú de comandos (⌘K), migas
 * de pan y rutas públicas del proxy salen de aquí. Filtrar el menú es solo
 * presentación; cada página vuelve a autorizar con el DAL.
 */
import {
  BadgeCheck,
  Banknote,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  FileLock2,
  Fingerprint,
  Handshake,
  House,
  Landmark,
  ListChecks,
  LockKeyhole,
  type LucideIcon,
  MapPinned,
  Megaphone,
  RadioTower,
  Receipt,
  Scale,
  ScrollText,
  Store,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  UserRound,
  Users,
  Wallet,
} from "lucide-react"
import type { Route } from "next"

import type { ClavePermiso } from "./permisos"
import type { TipoRol, UsuarioSesion } from "./tipos"

/**
 * typedRoutes solo conoce rutas con `page.tsx`; varias secciones llegan en
 * fases posteriores, así que el registro declara su ruta explícitamente.
 */
const ruta = (valor: `/${string}`): Route => valor as Route

export const RUTA_INGRESO = ruta("/ingresar")
export const RUTA_INICIO = ruta("/inicio")
export const RUTA_PERFIL = ruta("/cuenta/perfil")
export const RUTA_SEGURIDAD = ruta("/cuenta/seguridad")
export const RUTA_NOTIFICACIONES = ruta("/notificaciones")

export interface ItemNavegacion {
  id: string
  titulo: string
  href: Route
  icono: LucideIcon
  /** Basta con tener uno. Vacío: cualquier usuario con sesión. */
  permisos: readonly ClavePermiso[]
  /** Tipos de rol que ven la entrada; sin valor, todos. */
  tiposRol?: readonly TipoRol[]
  /** Texto de apoyo en el menú de comandos. */
  descripcion: string
  /** Sinónimos para la búsqueda del menú de comandos. */
  palabrasClave: readonly string[]
  /**
   * Subpáginas con nombre propio (`/reportes/finanzas`): segmento → título de
   * su miga. Sin entrada, el título sale del segmento (ver `migas`).
   */
  subpaginas?: Readonly<Record<string, string>>
  /**
   * `false`: la sección existe para las migas y `/ir`, pero no se lista en la
   * barra lateral ni en ⌘K (p. ej. la ficha interna de una oferta, a la que se
   * llega desde la moderación o desde su campaña).
   */
  enMenu?: false
}

export type IdGrupoNavegacion =
  "general" | "negocio" | "operacion" | "finanzas" | "administracion" | "cuenta"

export interface GrupoNavegacion {
  id: IdGrupoNavegacion
  titulo: string
  /** El grupo aparece como miga (sin enlace) antes de la sección. */
  enMigas: boolean
  /** "Cuenta" vive en el menú de usuario, no en la barra lateral. */
  enBarraLateral: boolean
  items: readonly ItemNavegacion[]
}

const SOLO_INTERNOS: readonly TipoRol[] = ["ADMIN"]
const SOLO_MEDIOS: readonly TipoRol[] = ["MEDIO"]
const SOLO_ANUNCIANTES: readonly TipoRol[] = ["ANUNCIANTE"]

export const NAVEGACION: readonly GrupoNavegacion[] = [
  {
    id: "general",
    titulo: "General",
    enMigas: false,
    enBarraLateral: true,
    items: [
      {
        id: "inicio",
        titulo: "Inicio",
        href: RUTA_INICIO,
        icono: House,
        permisos: ["inicio.admin", "inicio.anunciante", "inicio.medio"],
        descripcion: "Resumen del negocio, alertas y actividad reciente",
        palabrasClave: ["panel", "dashboard", "resumen", "indicadores", "kpi"],
      },
      {
        id: "mapa",
        titulo: "Mapa",
        href: ruta("/analitica/mapa"),
        icono: MapPinned,
        permisos: ["analitica.mapa"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Explorador geográfico de medios, pauta y accesos",
        palabrasClave: [
          "geografía",
          "departamentos",
          "municipios",
          "países",
          "cobertura",
          "territorio",
        ],
      },
      {
        id: "reportes",
        titulo: "Reportes",
        href: ruta("/reportes"),
        icono: ChartColumn,
        permisos: ["reportes.ver"],
        descripcion: "Reportes con filtros y exportación a Excel y PDF",
        palabrasClave: ["informes", "estadísticas", "excel", "pdf", "exportar"],
        // Mismos títulos que el catálogo de reportes (un test lo vigila): el
        // slug no lleva tildes ni preposiciones («Desempeno campanas»).
        subpaginas: {
          "resumen-ejecutivo": "Resumen ejecutivo",
          "desempeno-campanas": "Desempeño de campañas",
          finanzas: "Finanzas",
          cartera: "Cartera",
          "cobertura-territorial": "Cobertura territorial",
          "cumplimiento-medios": "Cumplimiento de medios",
          "usuarios-accesos": "Usuarios y accesos",
        },
      },
    ],
  },
  {
    // Portales externos (medio y anunciante). El orden de sus entradas fija la
    // barra inferior del celular: lo del día a día primero.
    id: "negocio",
    titulo: "Mi negocio",
    enMigas: true,
    enBarraLateral: true,
    items: [
      {
        id: "ofertas-medio",
        titulo: "Ofertas",
        href: ruta("/ofertas"),
        icono: Tags,
        permisos: ["ofertas.marketplace"],
        tiposRol: SOLO_MEDIOS,
        descripcion: "Ofertas de pauta que tu medio puede aceptar hoy",
        palabrasClave: ["marketplace", "pauta", "aceptar", "cupos", "pago"],
      },
      {
        id: "campanas-medio",
        titulo: "Mis campañas",
        href: ruta("/mis-campanas"),
        icono: ClipboardList,
        permisos: ["asignaciones.ver_propias"],
        tiposRol: SOLO_MEDIOS,
        descripcion:
          "Lo que aceptaste: contenido, evidencia de publicación y métricas",
        palabrasClave: ["asignaciones", "publicar", "evidencia", "métricas"],
      },
      {
        id: "ganancias",
        titulo: "Ganancias",
        href: ruta("/ganancias"),
        icono: Wallet,
        permisos: ["liquidaciones.ver_propias"],
        tiposRol: SOLO_MEDIOS,
        descripcion:
          "Lo que ganaste, lo que está por pagarse, tus pagos y documentos soporte",
        palabrasClave: [
          "pagos",
          "liquidaciones",
          "retenciones",
          "documento soporte",
          "dinero",
        ],
      },
      {
        id: "mi-medio",
        titulo: "Mi medio",
        href: ruta("/mi-medio"),
        icono: Store,
        permisos: ["medios.editar_propio"],
        tiposRol: SOLO_MEDIOS,
        descripcion: "Perfil, documentos, datos de pago, cuentas y nivel",
        palabrasClave: [
          "perfil",
          "documentos",
          "pago",
          "cuentas sociales",
          "verificación",
          "nivel",
        ],
        subpaginas: {
          perfil: "Perfil",
          documentos: "Documentos",
          pago: "Pago y tributario",
          cuentas: "Cuentas sociales",
          nivel: "Nivel",
          reputacion: "Reputación",
        },
      },
      {
        id: "mis-campanas",
        titulo: "Mis campañas",
        href: ruta("/campanas"),
        icono: Megaphone,
        permisos: ["campanas.gestionar_propias"],
        tiposRol: SOLO_ANUNCIANTES,
        descripcion: "Tus campañas, sus ofertas y el estado de cada una",
        palabrasClave: [
          "ofertas",
          "pauta",
          "crear oferta",
          "presupuesto",
          "moderación",
        ],
        subpaginas: { nueva: "Nueva campaña" },
      },
      {
        id: "facturas-anunciante",
        titulo: "Facturas",
        href: ruta("/facturas"),
        icono: Receipt,
        permisos: ["facturas.ver_propias"],
        tiposRol: SOLO_ANUNCIANTES,
        descripcion: "Tus facturas: estado de pago, saldo, vencimiento y PDF",
        palabrasClave: ["cartera", "pagos", "cufe", "saldo", "vencimiento"],
      },
      {
        id: "empresa",
        titulo: "Mi empresa",
        href: ruta("/empresa"),
        icono: BriefcaseBusiness,
        permisos: ["anunciantes.editar_propio"],
        tiposRol: SOLO_ANUNCIANTES,
        descripcion: "Datos de la empresa, documentos, verificación y equipo",
        palabrasClave: [
          "empresa",
          "rut",
          "cámara de comercio",
          "verificación",
          "equipo",
          "facturación",
        ],
        subpaginas: { documentos: "Documentos", equipo: "Equipo" },
      },
    ],
  },
  {
    id: "operacion",
    titulo: "Operación",
    enMigas: true,
    enBarraLateral: true,
    items: [
      {
        id: "verificacion",
        titulo: "Verificación",
        href: ruta("/operacion/verificacion"),
        icono: BadgeCheck,
        permisos: ["medios.verificar", "anunciantes.verificar"],
        tiposRol: SOLO_INTERNOS,
        descripcion:
          "Colas de medios, anunciantes, cuentas, documentos y solicitudes",
        palabrasClave: [
          "revisión",
          "aprobar",
          "documentos",
          "solicitudes",
          "vinculación",
          "pendientes",
          "anunciantes",
        ],
      },
      {
        id: "moderacion",
        titulo: "Moderación",
        href: ruta("/operacion/moderacion"),
        icono: ClipboardCheck,
        permisos: ["ofertas.moderar"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Ofertas en revisión para publicar, devolver o rechazar",
        palabrasClave: [
          "ofertas",
          "revisión",
          "publicar",
          "devolver",
          "aprobar",
        ],
      },
      {
        id: "validacion",
        titulo: "Validación",
        href: ruta("/operacion/validacion"),
        icono: ListChecks,
        permisos: ["evidencias.validar", "metricas.validar"],
        tiposRol: SOLO_INTERNOS,
        descripcion:
          "Evidencias, métricas con alertas y asignaciones por verificar",
        palabrasClave: [
          "evidencias",
          "métricas",
          "alertas",
          "verificar",
          "pago",
          "permanencia",
        ],
      },
      {
        id: "disputas",
        titulo: "Disputas",
        href: ruta("/operacion/disputas"),
        icono: Scale,
        permisos: ["disputas.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion:
          "Casos entre medios y anunciantes: mensajes, notas internas y resolución",
        palabrasClave: [
          "reclamos",
          "casos",
          "resolver",
          "descartar",
          "vencida",
        ],
      },
      {
        id: "ofertas",
        titulo: "Ofertas",
        href: ruta("/operacion/ofertas"),
        icono: Megaphone,
        permisos: ["ofertas.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion:
          "Ficha completa de una oferta: segmentación, creativos e historial",
        palabrasClave: ["oferta", "creativos", "moderación"],
        enMenu: false,
      },
      {
        id: "medios",
        titulo: "Medios",
        href: ruta("/operacion/medios"),
        icono: RadioTower,
        permisos: ["medios.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Fichas, verificación y desempeño de los medios",
        palabrasClave: [
          "emisoras",
          "páginas",
          "cuentas sociales",
          "verificación",
        ],
      },
      {
        id: "anunciantes",
        titulo: "Anunciantes",
        href: ruta("/operacion/anunciantes"),
        icono: Building2,
        permisos: ["anunciantes.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Empresas anunciantes, documentos y cartera",
        palabrasClave: ["empresas", "marcas", "clientes", "cartera"],
      },
      {
        id: "campanas",
        titulo: "Campañas",
        href: ruta("/operacion/campanas"),
        icono: Megaphone,
        permisos: ["campanas.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Campañas, ofertas y cupos publicados",
        palabrasClave: ["ofertas", "cupos", "pauta", "presupuesto"],
      },
      {
        id: "asignaciones",
        titulo: "Asignaciones",
        href: ruta("/operacion/asignaciones"),
        icono: Handshake,
        permisos: ["asignaciones.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Negocios cerrados entre ofertas y medios",
        palabrasClave: ["negocios", "publicaciones", "evidencias", "métricas"],
      },
    ],
  },
  {
    id: "finanzas",
    titulo: "Finanzas",
    enMigas: true,
    enBarraLateral: true,
    items: [
      {
        id: "liquidaciones",
        titulo: "Liquidaciones",
        href: ruta("/finanzas/liquidaciones"),
        icono: Landmark,
        permisos: ["liquidaciones.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion:
          "Cortes por medio y periodo, retenciones, aprobación y documento soporte",
        palabrasClave: [
          "liquidar",
          "corte",
          "retenciones",
          "documento soporte",
          "cuds",
          "seguridad social",
        ],
      },
      {
        id: "pagos-medios",
        titulo: "Pagos a medios",
        href: ruta("/finanzas/pagos"),
        icono: Banknote,
        permisos: ["liquidaciones.registrar_pago"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Archivo de pagos para el banco y registro de cada pago",
        palabrasClave: [
          "dispersión",
          "banco",
          "csv",
          "transferencia",
          "soporte",
        ],
      },
      {
        id: "facturas",
        titulo: "Facturas",
        href: ruta("/finanzas/facturas"),
        icono: Receipt,
        permisos: ["facturas.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion:
          "Borradores desde las asignaciones, facturas expedidas, pagos y notas crédito",
        palabrasClave: [
          "facturar",
          "anunciantes",
          "cufe",
          "nota crédito",
          "recaudo",
        ],
      },
      {
        id: "cartera",
        titulo: "Cartera",
        href: ruta("/finanzas/cartera"),
        icono: Wallet,
        permisos: ["facturas.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Saldos por anunciante, edades y facturas vencidas",
        palabrasClave: ["vencidas", "mora", "cobro", "saldo", "edades"],
      },
    ],
  },
  {
    id: "administracion",
    titulo: "Administración",
    enMigas: true,
    enBarraLateral: true,
    items: [
      {
        id: "usuarios",
        titulo: "Usuarios",
        href: ruta("/administracion/usuarios"),
        icono: Users,
        permisos: ["usuarios.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Invitaciones, roles asignados y estado de las cuentas",
        palabrasClave: ["cuentas", "invitar", "equipo", "personas"],
      },
      {
        id: "roles",
        titulo: "Roles y permisos",
        href: ruta("/administracion/roles"),
        icono: ShieldCheck,
        permisos: ["roles.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Qué puede hacer cada rol en la plataforma",
        palabrasClave: ["permisos", "seguridad", "accesos", "perfiles"],
      },
      {
        id: "auditoria",
        titulo: "Auditoría",
        href: ruta("/administracion/auditoria"),
        icono: ScrollText,
        permisos: ["auditoria.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Bitácora de cambios con actor, fecha y detalle",
        palabrasClave: ["bitácora", "historial", "cambios", "registro"],
      },
      {
        id: "accesos",
        titulo: "Accesos",
        href: ruta("/administracion/accesos"),
        icono: Fingerprint,
        permisos: ["accesos.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Inicios de sesión, países de origen e intentos fallidos",
        palabrasClave: [
          "ingresos",
          "inicios de sesión",
          "intentos",
          "ubicación",
        ],
      },
      {
        id: "configuracion",
        titulo: "Configuración",
        href: ruta("/administracion/configuracion"),
        icono: SlidersHorizontal,
        permisos: ["configuracion.ver"],
        tiposRol: SOLO_INTERNOS,
        descripcion: "Parámetros, tarifas, comisiones y catálogos",
        palabrasClave: [
          "parámetros",
          "tarifas",
          "comisiones",
          "catálogos",
          "ajustes",
        ],
      },
      {
        id: "privacidad-admin",
        titulo: "Datos personales",
        href: ruta("/administracion/privacidad"),
        icono: FileLock2,
        permisos: ["privacidad.gestionar"],
        tiposRol: SOLO_INTERNOS,
        descripcion:
          "Solicitudes de titulares de datos: consultas, reclamos y supresiones",
        palabrasClave: [
          "habeas data",
          "ley 1581",
          "datos personales",
          "supresión",
          "titular",
        ],
      },
    ],
  },
  {
    id: "cuenta",
    titulo: "Cuenta",
    enMigas: true,
    enBarraLateral: false,
    items: [
      {
        id: "perfil",
        titulo: "Mi perfil",
        href: RUTA_PERFIL,
        icono: UserRound,
        permisos: ["cuenta.gestionar"],
        descripcion: "Tus datos y tu foto de perfil",
        palabrasClave: ["mi cuenta", "nombre", "foto", "avatar"],
      },
      {
        id: "seguridad",
        titulo: "Seguridad",
        href: RUTA_SEGURIDAD,
        icono: LockKeyhole,
        permisos: ["cuenta.gestionar"],
        descripcion: "Contraseña, verificación en dos pasos y sesiones",
        palabrasClave: ["contraseña", "mfa", "2fa", "sesiones", "autenticador"],
      },
      {
        id: "preferencias",
        titulo: "Preferencias",
        href: ruta("/cuenta/preferencias"),
        icono: Settings,
        permisos: ["cuenta.gestionar"],
        descripcion: "Tema, avisos y otras preferencias",
        palabrasClave: ["tema", "apariencia", "oscuro", "claro"],
      },
      {
        id: "privacidad",
        titulo: "Privacidad",
        href: ruta("/cuenta/privacidad"),
        icono: FileLock2,
        permisos: ["cuenta.gestionar"],
        descripcion: "Tus datos personales, autorizaciones y solicitudes",
        palabrasClave: [
          "datos personales",
          "habeas data",
          "descargar mis datos",
          "supresión",
          "autorización",
        ],
      },
      {
        id: "notificaciones",
        titulo: "Notificaciones",
        href: RUTA_NOTIFICACIONES,
        icono: Bell,
        permisos: ["notificaciones.ver"],
        descripcion: "Avisos y alertas de la plataforma",
        palabrasClave: ["alertas", "avisos", "mensajes"],
      },
    ],
  },
]

// ── Filtrado por permisos ────────────────────────────────────────────────────

type UsuarioNavegacion = Pick<UsuarioSesion, "permisos"> & {
  rol: Pick<UsuarioSesion["rol"], "tipo">
}

function puedeVerItem(
  item: ItemNavegacion,
  usuario: UsuarioNavegacion
): boolean {
  const tipoPermitido =
    !item.tiposRol || item.tiposRol.includes(usuario.rol.tipo)
  const tienePermiso =
    item.permisos.length === 0 ||
    item.permisos.some((permiso) => usuario.permisos.includes(permiso))
  return tipoPermitido && tienePermiso
}

/** Grupos con solo las entradas visibles para el usuario; sin grupos vacíos. */
export function filtrarNavegacion(
  usuario: UsuarioNavegacion
): GrupoNavegacion[] {
  return NAVEGACION.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter(
      (item) => item.enMenu !== false && puedeVerItem(item, usuario)
    ),
  })).filter((grupo) => grupo.items.length > 0)
}

// ── Migas de pan ─────────────────────────────────────────────────────────────

export interface Miga {
  titulo: string
  /** Sin `href`: la página actual o un grupo sin página propia. */
  href?: Route
}

const PARECE_IDENTIFICADOR =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

function tituloDeSegmento(segmento: string): string {
  let texto = segmento
  try {
    texto = decodeURIComponent(segmento)
  } catch {
    // Segmento con codificación inválida: se muestra tal cual.
  }
  if (PARECE_IDENTIFICADOR.test(texto)) return "Detalle"
  const legible = texto.replace(/[-_]+/g, " ").trim()
  return legible.charAt(0).toLocaleUpperCase("es-CO") + legible.slice(1)
}

/** `true` si la ruta es la sección o una de sus subpáginas. */
export function perteneceA(rutaActual: string, href: string): boolean {
  return rutaActual === href || rutaActual.startsWith(`${href}/`)
}

/** La entrada del registro más específica que contiene la ruta. */
function buscarSeccion(
  rutaActual: string
): { grupo: GrupoNavegacion; item: ItemNavegacion } | null {
  let mejor: { grupo: GrupoNavegacion; item: ItemNavegacion } | null = null
  for (const grupo of NAVEGACION) {
    for (const item of grupo.items) {
      const masEspecifica = !mejor || item.href.length > mejor.item.href.length
      if (perteneceA(rutaActual, item.href) && masEspecifica) {
        mejor = { grupo, item }
      }
    }
  }
  return mejor
}

/**
 * Migas para una ruta: grupo › sección › subpáginas. Una subpágina toma su
 * título del registro (`subpaginas`) o, si no, de su segmento; los que
 * parecen identificadores se muestran como "Detalle". La última miga no
 * enlaza (es la página actual) y puede llevar el título que la propia página
 * conoce (`tituloFinal`: el nombre del medio, de la campaña…).
 */
export function migas(rutaActual: string, tituloFinal?: string | null): Miga[] {
  const rutaLimpia = rutaActual.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
  const seccion = buscarSeccion(rutaLimpia)
  if (!seccion) return []

  const { grupo, item } = seccion
  const resultado: Miga[] = grupo.enMigas ? [{ titulo: grupo.titulo }] : []
  const restantes = rutaLimpia
    .slice(item.href.length)
    .split("/")
    .filter(Boolean)

  resultado.push(
    restantes.length > 0
      ? { titulo: item.titulo, href: item.href }
      : { titulo: item.titulo }
  )

  let acumulada: string = item.href
  restantes.forEach((segmento, indice) => {
    acumulada = `${acumulada}/${segmento}`
    const esUltimo = indice === restantes.length - 1
    // Solo el primer nivel bajo la sección tiene nombre en el registro.
    const titulo =
      (indice === 0 ? item.subpaginas?.[segmento] : undefined) ??
      tituloDeSegmento(segmento)
    resultado.push(
      esUltimo ? { titulo } : { titulo, href: ruta(acumulada as `/${string}`) }
    )
  })

  const propio = tituloFinal?.trim()
  // El título propio nombra una subpágina, nunca a la sección misma.
  if (propio && restantes.length > 0) {
    resultado[resultado.length - 1] = { titulo: propio }
  }
  return resultado
}

// ── Rutas públicas y redirecciones del proxy ─────────────────────────────────

/** Accesibles sin sesión. `/cambiar-contrasena` y `/mfa/*` exigen sesión (aal1). */
export const RUTAS_PUBLICAS: readonly string[] = [
  "/ingresar",
  // Solicitud de vinculación de un medio (MED-001): formulario público.
  "/vincular",
  "/recuperar",
  "/restablecer",
  "/auth",
  "/api/csp-report",
  // Despachador de correo (NOT-004): lo llama pg_cron con un secreto propio, sin sesión.
  "/api/correos/procesar",
  "/manifest.webmanifest",
  "/robots.txt",
]

/** Iconos e imágenes generados por Next (`/icon`, `/icon.svg`, `/apple-icon`, `/opengraph-image-…`). */
const RUTA_METADATOS =
  /^\/(?:icon|apple-icon|opengraph-image|twitter-image)\d*(?:-[\w]+)?(?:\.\w+)?(?:\/.*)?$/

export function esRutaPublica(rutaActual: string): boolean {
  return (
    RUTAS_PUBLICAS.some((publica) => perteneceA(rutaActual, publica)) ||
    RUTA_METADATOS.test(rutaActual)
  )
}

const ORIGEN_REFERENCIA = "http://amo.local"

/** `//host` o `/\host`: el navegador lo resuelve como otro origen. */
const PROTOCOLO_RELATIVO = /^\/[/\\]/

/**
 * Normaliza un destino recibido por URL (`?next=`) a una ruta interna.
 * Rechaza URL absolutas, rutas de protocolo relativo (`//evil.com`) y
 * barras invertidas: evita redirecciones abiertas.
 */
export function rutaInternaSegura(
  valor: string | null | undefined
): Route | null {
  if (!valor || !valor.startsWith("/") || PROTOCOLO_RELATIVO.test(valor)) {
    return null
  }
  // Caracteres de control o barras invertidas: nunca en una ruta legítima.
  if (/[\u0000-\u001f\\]/.test(valor)) return null
  try {
    const url = new URL(valor, ORIGEN_REFERENCIA)
    if (url.origin !== ORIGEN_REFERENCIA) return null
    // La normalización resuelve `.` y `..` ("/.//evil.com" → "//evil.com"):
    // se valida el resultado, que es lo que llega a la cabecera Location.
    if (PROTOCOLO_RELATIVO.test(url.pathname)) return null
    return ruta(`${url.pathname}${url.search}${url.hash}` as `/${string}`)
  } catch {
    return null
  }
}

/** A dónde ir tras ingresar: el `next` seguro y privado o, si no, Inicio. */
export function destinoTrasIngreso(
  siguiente: string | null | undefined
): Route {
  const destino = rutaInternaSegura(siguiente)
  if (!destino || destino === "/" || esRutaPublica(destino.split(/[?#]/)[0])) {
    return RUTA_INICIO
  }
  return destino
}

export type DecisionAcceso =
  | { tipo: "continuar" }
  | { tipo: "redirigir"; destino: string }
  | { tipo: "no-autenticado" }

export interface SolicitudAcceso {
  ruta: string
  /** `search` de la URL, con `?` inicial o vacío. */
  busqueda: string
  autenticado: boolean
}

/** Decisión optimista del proxy (la autorización real la hace el DAL). */
export function resolverAcceso({
  ruta: rutaActual,
  busqueda,
  autenticado,
}: SolicitudAcceso): DecisionAcceso {
  if (autenticado && rutaActual === RUTA_INGRESO) {
    const siguiente = new URLSearchParams(busqueda).get("next")
    return { tipo: "redirigir", destino: destinoTrasIngreso(siguiente) }
  }
  if (autenticado || esRutaPublica(rutaActual)) return { tipo: "continuar" }
  if (perteneceA(rutaActual, "/api")) return { tipo: "no-autenticado" }
  if (rutaActual === "/") return { tipo: "redirigir", destino: RUTA_INGRESO }

  const siguiente = new URLSearchParams({ next: `${rutaActual}${busqueda}` })
  return { tipo: "redirigir", destino: `${RUTA_INGRESO}?${siguiente}` }
}
