/**
 * Catálogo de roles de sistema y permisos de AMO: fuente única (docs/modelo-datos.md §6).
 *
 * `pnpm db:permisos` genera `supabase/seed/permisos.sql` a partir de este archivo; la semilla
 * se copia en la migración que cambie el catálogo (nunca se edita una migración aplicada).
 * Los tests comparan este catálogo con la tabla de §6 del documento y con la semilla generada.
 */

export const CLAVES_ROL_SISTEMA = [
  "SUPERADMIN",
  "ADMIN",
  "OPERACIONES",
  "FINANZAS",
  "ANUNCIANTE",
  "MEDIO",
] as const

export type ClaveRol = (typeof CLAVES_ROL_SISTEMA)[number]

/** Tipo de usuario de negocio que determina el alcance de las filas visibles (§2.2). */
export type TipoRol = "ADMIN" | "ANUNCIANTE" | "MEDIO"

export interface RolSistema {
  readonly nombre: string
  readonly descripcion: string
  readonly tipo: TipoRol
  readonly requiereMfa: boolean
  readonly color: string
}

/** Roles sembrados por la migración `identidad_rbac` (§3.2); inmutables salvo por migración (D20). */
export const ROLES_SISTEMA = {
  SUPERADMIN: {
    nombre: "Superadministrador",
    descripcion:
      "Control total de la plataforma, incluidos roles y superadministradores.",
    tipo: "ADMIN",
    requiereMfa: true,
    color: "#A788F6",
  },
  ADMIN: {
    nombre: "Administrador",
    descripcion:
      "Administra usuarios, configuración y la operación de la plataforma.",
    tipo: "ADMIN",
    requiereMfa: true,
    color: "#7549DE",
  },
  OPERACIONES: {
    nombre: "Operaciones",
    descripcion:
      "Verifica medios y anunciantes, modera ofertas y valida ejecución.",
    tipo: "ADMIN",
    requiereMfa: true,
    color: "#5B6CF0",
  },
  FINANZAS: {
    nombre: "Finanzas",
    descripcion:
      "Gestiona liquidaciones, facturas, pagos y parámetros tributarios.",
    tipo: "ADMIN",
    requiereMfa: true,
    color: "#C77DFF",
  },
  ANUNCIANTE: {
    nombre: "Anunciante",
    descripcion: "Empresa que crea campañas y ofertas de pauta.",
    tipo: "ANUNCIANTE",
    requiereMfa: false,
    color: "#3FB8AF",
  },
  MEDIO: {
    nombre: "Medio",
    descripcion: "Medio hiperlocal que acepta ofertas y publica contenido.",
    tipo: "MEDIO",
    requiereMfa: false,
    color: "#F2A65A",
  },
} as const satisfies Record<ClaveRol, RolSistema>

export interface DefinicionPermiso {
  readonly modulo: string
  readonly descripcion: string
  /** Se resalta en la UI de roles: otorgarlo tiene impacto en seguridad o dinero. */
  readonly esSensible: boolean
  /** Roles de sistema que lo reciben por defecto. SUPERADMIN los recibe todos (§6). */
  readonly rolesPorDefecto: readonly ClaveRol[]
}

const INTERNOS = ["SUPERADMIN", "ADMIN", "OPERACIONES", "FINANZAS"] as const
const GESTION = ["SUPERADMIN", "ADMIN", "OPERACIONES"] as const
const ADMINISTRACION = ["SUPERADMIN", "ADMIN"] as const
const FINANCIERO = ["SUPERADMIN", "ADMIN", "FINANZAS"] as const
const TESORERIA = ["SUPERADMIN", "FINANZAS"] as const
const SOLO_SUPERADMIN = ["SUPERADMIN"] as const
const PROPIO_ANUNCIANTE = ["SUPERADMIN", "ANUNCIANTE"] as const
const PROPIO_MEDIO = ["SUPERADMIN", "MEDIO"] as const
const TODOS = CLAVES_ROL_SISTEMA

/** El orden de declaración es el orden de presentación (`permisos.orden`). */
export const PERMISOS = {
  "inicio.admin": {
    modulo: "inicio",
    descripcion: "Ver el panel de inicio administrativo",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "inicio.anunciante": {
    modulo: "inicio",
    descripcion: "Ver el panel de inicio del anunciante",
    esSensible: false,
    rolesPorDefecto: PROPIO_ANUNCIANTE,
  },
  "inicio.medio": {
    modulo: "inicio",
    descripcion: "Ver el panel de inicio del medio",
    esSensible: false,
    rolesPorDefecto: PROPIO_MEDIO,
  },
  "analitica.global": {
    modulo: "analitica",
    descripcion: "Ver analítica agregada de toda la plataforma",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "analitica.mapa": {
    modulo: "analitica",
    descripcion: "Usar el explorador geográfico",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "reportes.ver": {
    modulo: "reportes",
    descripcion: "Consultar reportes (el anunciante solo ve los suyos)",
    esSensible: false,
    rolesPorDefecto: [...INTERNOS, "ANUNCIANTE"],
  },
  "reportes.exportar": {
    modulo: "reportes",
    descripcion: "Exportar reportes a Excel y PDF",
    esSensible: false,
    rolesPorDefecto: [...INTERNOS, "ANUNCIANTE"],
  },
  "reportes.finanzas": {
    modulo: "reportes",
    descripcion: "Ver reportes financieros y de cartera",
    esSensible: false,
    rolesPorDefecto: FINANCIERO,
  },
  "usuarios.ver": {
    modulo: "usuarios",
    descripcion: "Ver el listado y la ficha de usuarios",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "usuarios.invitar": {
    modulo: "usuarios",
    descripcion: "Invitar usuarios y regenerar invitaciones",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "usuarios.editar": {
    modulo: "usuarios",
    descripcion: "Editar datos, rol y organización de usuarios",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "usuarios.suspender": {
    modulo: "usuarios",
    descripcion: "Suspender y reactivar usuarios",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "usuarios.cerrar_sesiones": {
    modulo: "usuarios",
    descripcion: "Cerrar las sesiones activas de otro usuario",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "usuarios.generar_enlace": {
    modulo: "usuarios",
    descripcion: "Generar enlaces de recuperación de contraseña",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "usuarios.eliminar": {
    modulo: "usuarios",
    descripcion: "Desactivar usuarios definitivamente",
    esSensible: true,
    rolesPorDefecto: SOLO_SUPERADMIN,
  },
  "roles.ver": {
    modulo: "roles",
    descripcion: "Ver roles y sus permisos",
    esSensible: false,
    rolesPorDefecto: ADMINISTRACION,
  },
  "roles.gestionar": {
    modulo: "roles",
    descripcion: "Crear, editar y eliminar roles personalizados",
    esSensible: true,
    rolesPorDefecto: SOLO_SUPERADMIN,
  },
  "auditoria.ver": {
    modulo: "auditoria",
    descripcion: "Consultar la bitácora de auditoría",
    esSensible: false,
    rolesPorDefecto: ADMINISTRACION,
  },
  "auditoria.exportar": {
    modulo: "auditoria",
    descripcion: "Exportar la bitácora",
    esSensible: false,
    rolesPorDefecto: ADMINISTRACION,
  },
  "accesos.ver": {
    modulo: "accesos",
    descripcion: "Consultar el registro de accesos y su mapa",
    esSensible: false,
    rolesPorDefecto: ADMINISTRACION,
  },
  "accesos.exportar": {
    modulo: "accesos",
    descripcion: "Exportar el registro de accesos",
    esSensible: false,
    rolesPorDefecto: ADMINISTRACION,
  },
  "configuracion.ver": {
    modulo: "configuracion",
    descripcion: "Ver parámetros de la plataforma",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "configuracion.editar": {
    modulo: "configuracion",
    descripcion: "Editar parámetros generales y niveles de verificación",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "configuracion.tarifas": {
    modulo: "configuracion",
    descripcion: "Programar nuevas vigencias de tarifas",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "configuracion.comisiones": {
    modulo: "configuracion",
    descripcion: "Editar la comisión global y sus excepciones",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "configuracion.tributario": {
    modulo: "configuracion",
    descripcion: "Editar parámetros tributarios y resoluciones DIAN",
    esSensible: true,
    rolesPorDefecto: FINANCIERO,
  },
  "configuracion.catalogos": {
    modulo: "configuracion",
    descripcion:
      "Editar sectores, categorías, franjas, formatos, plantillas y términos",
    esSensible: false,
    rolesPorDefecto: ADMINISTRACION,
  },
  "datos_sensibles.ver": {
    modulo: "datos_sensibles",
    descripcion:
      "Revelar datos personales, documentos de identidad y datos bancarios (uno por uno, con bitácora)",
    esSensible: true,
    rolesPorDefecto: INTERNOS,
  },
  "datos_sensibles.editar": {
    modulo: "datos_sensibles",
    descripcion: "Corregir datos personales o bancarios de terceros",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "medios.ver": {
    modulo: "medios",
    descripcion: "Ver medios y sus fichas",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "medios.editar": {
    modulo: "medios",
    descripcion: "Editar la ficha de cualquier medio",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "medios.verificar": {
    modulo: "medios",
    descripcion:
      "Verificar medios, documentos y cuentas sociales (incluidas las reverificaciones)",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "medios.suspender": {
    modulo: "medios",
    descripcion: "Suspender y reactivar medios",
    esSensible: true,
    rolesPorDefecto: GESTION,
  },
  "medios.clasificar_pertinencia": {
    modulo: "medios",
    descripcion: "Clasificar la pertinencia geográfica de medios",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "medios.editar_propio": {
    modulo: "medios",
    descripcion: "Editar el perfil, cuentas y documentos del propio medio",
    esSensible: false,
    rolesPorDefecto: PROPIO_MEDIO,
  },
  "anunciantes.ver": {
    modulo: "anunciantes",
    descripcion: "Ver anunciantes y sus fichas",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "anunciantes.editar": {
    modulo: "anunciantes",
    descripcion: "Crear y editar anunciantes",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "anunciantes.verificar": {
    modulo: "anunciantes",
    descripcion: "Verificar anunciantes y sus documentos",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "anunciantes.suspender": {
    modulo: "anunciantes",
    descripcion: "Suspender y reactivar anunciantes",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "anunciantes.editar_propio": {
    modulo: "anunciantes",
    descripcion: "Editar los datos de la propia empresa",
    esSensible: false,
    rolesPorDefecto: PROPIO_ANUNCIANTE,
  },
  "campanas.ver": {
    modulo: "campanas",
    descripcion: "Ver todas las campañas",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "campanas.gestionar": {
    modulo: "campanas",
    descripcion: "Crear y gestionar campañas por cuenta de un anunciante",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "campanas.gestionar_propias": {
    modulo: "campanas",
    descripcion: "Crear y gestionar las campañas propias",
    esSensible: false,
    rolesPorDefecto: PROPIO_ANUNCIANTE,
  },
  "ofertas.ver": {
    modulo: "ofertas",
    descripcion: "Ver todas las ofertas",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "ofertas.gestionar": {
    modulo: "ofertas",
    descripcion: "Crear y editar ofertas por cuenta de un anunciante",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "ofertas.moderar": {
    modulo: "ofertas",
    descripcion: "Moderar ofertas (publicar, devolver, rechazar, cancelar)",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "ofertas.gestionar_propias": {
    modulo: "ofertas",
    descripcion: "Crear, enviar a revisión y cancelar ofertas propias",
    esSensible: false,
    rolesPorDefecto: PROPIO_ANUNCIANTE,
  },
  "ofertas.marketplace": {
    modulo: "ofertas",
    descripcion: "Ver el marketplace de ofertas elegibles",
    esSensible: false,
    rolesPorDefecto: PROPIO_MEDIO,
  },
  "ofertas.aceptar": {
    modulo: "ofertas",
    descripcion: "Aceptar o rechazar ofertas",
    esSensible: false,
    rolesPorDefecto: PROPIO_MEDIO,
  },
  "asignaciones.ver": {
    modulo: "asignaciones",
    descripcion: "Ver todas las asignaciones",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "asignaciones.gestionar": {
    modulo: "asignaciones",
    descripcion: "Cancelar asignaciones",
    esSensible: true,
    rolesPorDefecto: GESTION,
  },
  "asignaciones.ver_propias": {
    modulo: "asignaciones",
    descripcion: "Ver las asignaciones propias",
    esSensible: false,
    rolesPorDefecto: ["SUPERADMIN", "ANUNCIANTE", "MEDIO"],
  },
  "asignaciones.ejecutar": {
    modulo: "asignaciones",
    descripcion: "Descargar contenido, cargar evidencia y métricas",
    esSensible: false,
    rolesPorDefecto: PROPIO_MEDIO,
  },
  "evidencias.validar": {
    modulo: "evidencias",
    descripcion: "Validar o rechazar evidencias de publicación",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "metricas.validar": {
    modulo: "metricas",
    descripcion: "Validar o rechazar métricas",
    esSensible: false,
    rolesPorDefecto: GESTION,
  },
  "metricas.editar_validadas": {
    modulo: "metricas",
    descripcion: "Corregir métricas ya validadas",
    esSensible: true,
    rolesPorDefecto: ADMINISTRACION,
  },
  "liquidaciones.ver": {
    modulo: "liquidaciones",
    descripcion: "Ver todas las liquidaciones",
    esSensible: false,
    rolesPorDefecto: FINANCIERO,
  },
  "liquidaciones.generar": {
    modulo: "liquidaciones",
    descripcion: "Generar cortes de liquidación",
    esSensible: false,
    rolesPorDefecto: FINANCIERO,
  },
  "liquidaciones.aprobar": {
    modulo: "liquidaciones",
    descripcion: "Aprobar o anular liquidaciones y documentos soporte",
    esSensible: true,
    rolesPorDefecto: FINANCIERO,
  },
  "liquidaciones.registrar_pago": {
    modulo: "liquidaciones",
    descripcion: "Registrar el pago de liquidaciones con soporte",
    esSensible: true,
    rolesPorDefecto: TESORERIA,
  },
  "liquidaciones.ver_propias": {
    modulo: "liquidaciones",
    descripcion: "Ver las liquidaciones y ganancias propias",
    esSensible: false,
    rolesPorDefecto: PROPIO_MEDIO,
  },
  "facturas.ver": {
    modulo: "facturas",
    descripcion: "Ver todas las facturas",
    esSensible: false,
    rolesPorDefecto: FINANCIERO,
  },
  "facturas.gestionar": {
    modulo: "facturas",
    descripcion: "Crear, emitir y anular facturas",
    esSensible: true,
    rolesPorDefecto: TESORERIA,
  },
  "facturas.ver_propias": {
    modulo: "facturas",
    descripcion: "Ver las facturas propias",
    esSensible: false,
    rolesPorDefecto: PROPIO_ANUNCIANTE,
  },
  "pagos.registrar": {
    modulo: "pagos",
    descripcion: "Registrar pagos de anunciantes",
    esSensible: true,
    rolesPorDefecto: TESORERIA,
  },
  "disputas.ver": {
    modulo: "disputas",
    descripcion: "Ver todas las disputas",
    esSensible: false,
    rolesPorDefecto: INTERNOS,
  },
  "disputas.abrir": {
    modulo: "disputas",
    descripcion: "Abrir disputas sobre asignaciones",
    esSensible: false,
    rolesPorDefecto: [...GESTION, "ANUNCIANTE", "MEDIO"],
  },
  "disputas.resolver": {
    modulo: "disputas",
    descripcion: "Resolver o descartar disputas",
    esSensible: true,
    rolesPorDefecto: GESTION,
  },
  "notificaciones.ver": {
    modulo: "notificaciones",
    descripcion: "Ver y marcar las notificaciones propias",
    esSensible: false,
    rolesPorDefecto: TODOS,
  },
  "cuenta.gestionar": {
    modulo: "cuenta",
    descripcion: "Gestionar el perfil, la seguridad y las preferencias propias",
    esSensible: false,
    rolesPorDefecto: TODOS,
  },
} as const satisfies Record<string, DefinicionPermiso>

export type ClavePermiso = keyof typeof PERMISOS
export type ModuloPermiso = (typeof PERMISOS)[ClavePermiso]["modulo"]

export const CLAVES_PERMISO = Object.keys(PERMISOS) as readonly ClavePermiso[]

export function esPermisoValido(valor: string): valor is ClavePermiso {
  return Object.hasOwn(PERMISOS, valor)
}

export function esRolSistema(valor: string): valor is ClaveRol {
  return (CLAVES_ROL_SISTEMA as readonly string[]).includes(valor)
}

/** Permisos que un rol de sistema recibe por defecto, en el orden del catálogo. */
export function permisosDeRol(rol: ClaveRol): readonly ClavePermiso[] {
  return CLAVES_PERMISO.filter((clave) => {
    const roles: readonly ClaveRol[] = PERMISOS[clave].rolesPorDefecto
    return roles.includes(rol)
  })
}
