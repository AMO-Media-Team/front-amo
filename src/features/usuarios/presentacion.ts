/**
 * Textos y tonos de presentación del módulo de Usuarios (módulo puro): estados
 * de la cuenta, tipos de rol y la descripción legible de cada evento de la
 * bitácora en la línea de tiempo de la ficha.
 */
import {
  CLAVES_PERMISO,
  type ClavePermiso,
  esPermisoValido,
  PERMISOS,
} from "@/lib/auth/permisos"

import type { EstadoPerfil, EventoActividad, TipoRol } from "./tipos"

export type Tono = "exito" | "info" | "aviso" | "peligro" | "neutro"

export const ESTADOS_CUENTA: Readonly<
  Record<EstadoPerfil, { etiqueta: string; descripcion: string; tono: Tono }>
> = {
  INVITADO: {
    etiqueta: "Invitado",
    descripcion: "Aún no activa su cuenta.",
    tono: "info",
  },
  ACTIVO: {
    etiqueta: "Activo",
    descripcion: "Puede ingresar y operar según su rol.",
    tono: "exito",
  },
  SUSPENDIDO: {
    etiqueta: "Suspendido",
    descripcion: "No puede ingresar hasta que se reactive.",
    tono: "aviso",
  },
  DESACTIVADO: {
    etiqueta: "Desactivado",
    descripcion: "Dado de baja; se conserva su historial.",
    tono: "neutro",
  },
}

export const TIPOS_ROL_ETIQUETA: Readonly<Record<TipoRol, string>> = {
  ADMIN: "Equipo interno",
  ANUNCIANTE: "Anunciante",
  MEDIO: "Medio",
}

/** Nombres de los módulos del catálogo de permisos (§6). */
export const MODULOS_PERMISO: Readonly<Record<string, string>> = {
  inicio: "Inicio",
  analitica: "Analítica",
  reportes: "Reportes",
  usuarios: "Usuarios",
  roles: "Roles",
  auditoria: "Auditoría",
  accesos: "Accesos",
  configuracion: "Configuración",
  datos_sensibles: "Datos sensibles",
  medios: "Medios",
  anunciantes: "Anunciantes",
  campanas: "Campañas",
  ofertas: "Ofertas",
  asignaciones: "Asignaciones",
  evidencias: "Evidencias",
  metricas: "Métricas",
  liquidaciones: "Liquidaciones",
  facturas: "Facturas",
  pagos: "Pagos",
  disputas: "Disputas",
  notificaciones: "Notificaciones",
  cuenta: "Cuenta",
}

/** Permisos otorgados agrupados por módulo, en el orden del catálogo (ignora claves desconocidas). */
export function agruparPorModulo(
  otorgados: readonly string[]
): { modulo: string; permisos: ClavePermiso[] }[] {
  const conjunto = new Set(otorgados.filter(esPermisoValido))
  const grupos = new Map<string, ClavePermiso[]>()
  for (const clave of CLAVES_PERMISO) {
    if (!conjunto.has(clave)) continue
    const { modulo } = PERMISOS[clave]
    grupos.set(modulo, [...(grupos.get(modulo) ?? []), clave])
  }
  return [...grupos].map(([modulo, permisos]) => ({ modulo, permisos }))
}

export type EstadoMfa = "activa" | "pendiente" | "al_activar" | "no_usa"

/**
 * Verificación en dos pasos de una cuenta: "pendiente" solo alerta cuando la
 * cuenta está ACTIVA y su rol la exige (la configurará al próximo ingreso);
 * una invitación la configurará al activarse.
 */
export function estadoMfa(
  mfaActivo: boolean,
  exigida: boolean,
  estado: EstadoPerfil
): EstadoMfa {
  if (mfaActivo) return "activa"
  if (exigida && estado === "ACTIVO") return "pendiente"
  if (exigida && estado === "INVITADO") return "al_activar"
  return "no_usa"
}

/** Nombre para mostrar: el nombre o, si falta, la parte local del correo. */
export function nombreVisible(usuario: {
  nombre: string | null
  email: string
}): string {
  return usuario.nombre?.trim() || usuario.email.split("@")[0] || usuario.email
}

// ── Línea de tiempo (bitácora) ───────────────────────────────────────────────

export type CategoriaEvento =
  | "creacion"
  | "estado"
  | "edicion"
  | "acceso"
  | "seguridad"
  | "exportacion"
  | "otro"

export interface EventoDescrito {
  titulo: string
  detalle: string | null
  categoria: CategoriaEvento
  tono: Tono
  /** El usuario de la ficha hizo la acción (y no un administrador sobre él). */
  propio: boolean
}

const CAMPOS_PERFIL: Readonly<Record<string, string>> = {
  nombre: "nombre",
  celular: "celular",
  email: "correo",
  rol_id: "rol",
  anunciante_id: "organización",
  medio_id: "organización",
  debe_cambiar_password: "cambio de contraseña obligatorio",
  invitado_por: "invitado por",
}

const ACCIONES: Readonly<Record<string, string>> = {
  INSERT: "Creó",
  UPDATE: "Actualizó",
  DELETE: "Eliminó",
  TRANSICION: "Cambió el estado de",
  EXPORTAR: "Exportó",
  REVELAR_DATO: "Reveló un dato sensible de",
  URL_FIRMADA: "Abrió un archivo de",
  INVITAR: "Invitó a",
  GENERAR_ENLACE: "Generó un enlace para",
  CERRAR_SESIONES: "Cerró sesiones de",
  CONFIGURAR: "Configuró",
}

const ENTIDADES: Readonly<Record<string, string>> = {
  perfiles: "un usuario",
  roles: "un rol",
  rol_permisos: "los permisos de un rol",
  configuracion: "la configuración",
  sesion: "la sesión",
  usuarios: "usuarios",
}

function listaNatural(elementos: readonly string[]): string {
  const unicos = [...new Set(elementos)]
  if (unicos.length <= 1) return unicos.join("")
  return `${unicos.slice(0, -1).join(", ")} y ${unicos.at(-1)}`
}

function etiquetaEstado(estado: string | null): string {
  return estado && estado in ESTADOS_CUENTA
    ? ESTADOS_CUENTA[estado as EstadoPerfil].etiqueta
    : (estado ?? "—")
}

function describirTransicion(
  evento: EventoActividad
): Pick<EventoDescrito, "titulo" | "tono"> {
  const { estadoAnterior: desde, estadoNuevo: hacia } = evento
  if (hacia === "SUSPENDIDO")
    return { titulo: "Cuenta suspendida", tono: "aviso" }
  if (hacia === "ACTIVO" && desde === "SUSPENDIDO") {
    return { titulo: "Cuenta reactivada", tono: "exito" }
  }
  if (hacia === "ACTIVO") return { titulo: "Cuenta activada", tono: "exito" }
  if (hacia === "DESACTIVADO" && desde === "INVITADO") {
    return { titulo: "Invitación revocada", tono: "neutro" }
  }
  if (hacia === "DESACTIVADO")
    return { titulo: "Cuenta desactivada", tono: "peligro" }
  return {
    titulo: `Estado: ${etiquetaEstado(desde)} → ${etiquetaEstado(hacia)}`,
    tono: "info",
  }
}

type Contexto = {
  usuarioId: string
  /** Nombres de roles por id, para describir cambios de rol. */
  nombresRol: ReadonlyMap<string, string>
}

function describirEdicion(
  evento: EventoActividad,
  { nombresRol }: Contexto
): Pick<EventoDescrito, "titulo" | "detalle" | "categoria"> {
  const { rol_id: rol, debe_cambiar_password: cambio } = evento.valores
  if (rol) {
    const nombre = (id: unknown) =>
      typeof id === "string" ? (nombresRol.get(id) ?? "otro rol") : "sin rol"
    return {
      titulo: "Rol cambiado",
      detalle: `${nombre(rol.antes)} → ${nombre(rol.despues)}`,
      categoria: "edicion",
    }
  }
  if (cambio && evento.camposCambiados.length === 1) {
    return cambio.despues === true
      ? {
          titulo: "Se exigió cambiar la contraseña",
          detalle: "Deberá crear una nueva al próximo ingreso.",
          categoria: "seguridad",
        }
      : {
          titulo: "Contraseña actualizada",
          detalle: null,
          categoria: "seguridad",
        }
  }
  const campos = evento.camposCambiados
    .map((campo) => CAMPOS_PERFIL[campo])
    .filter((campo): campo is string => Boolean(campo))
  return {
    titulo: "Datos actualizados",
    detalle: campos.length > 0 ? `Cambió ${listaNatural(campos)}.` : null,
    categoria: "edicion",
  }
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null
}

function describirSobrePerfil(
  evento: EventoActividad,
  contexto: Contexto
): Omit<EventoDescrito, "propio"> | null {
  const meta = evento.metadatos
  switch (evento.accion) {
    case "INSERT":
      return {
        titulo: "Cuenta creada",
        detalle: null,
        categoria: "creacion",
        tono: "info",
      }
    case "TRANSICION":
      return {
        ...describirTransicion(evento),
        detalle: evento.motivo,
        categoria: "estado",
      }
    case "UPDATE":
      return { ...describirEdicion(evento, contexto), tono: "neutro" }
    case "INVITAR":
      return {
        titulo: "Invitación creada",
        detalle:
          meta.metodo === "CONTRASENA"
            ? "Con contraseña temporal."
            : meta.correo_enviado === true
              ? "Enlace enviado por correo."
              : "Con enlace de un solo uso.",
        categoria: "creacion",
        tono: "info",
      }
    case "GENERAR_ENLACE":
      return {
        titulo:
          meta.tipo === "recovery"
            ? "Enlace de recuperación generado"
            : "Enlace de invitación generado",
        detalle: null,
        categoria: "acceso",
        tono: "info",
      }
    case "CERRAR_SESIONES": {
      const cerradas = numero(meta.sesiones_cerradas)
      return {
        titulo: "Sesiones cerradas",
        detalle:
          cerradas === null
            ? evento.motivo
            : `${cerradas === 1 ? "1 sesión" : `${cerradas} sesiones`}${
                meta.conserva_sesion === true ? " (conservó la actual)" : ""
              }.`,
        categoria: "seguridad",
        tono: "aviso",
      }
    }
    case "OTRO":
      if (meta.evento === "MFA_ACTIVADA") {
        return {
          titulo: "Verificación en dos pasos activada",
          detalle: null,
          categoria: "seguridad",
          tono: "exito",
        }
      }
      if (meta.evento === "MFA_RESTABLECIDA") {
        return {
          titulo: "Verificación en dos pasos restablecida",
          detalle: "Deberá configurarla de nuevo al ingresar.",
          categoria: "seguridad",
          tono: "aviso",
        }
      }
      return null
    case "BORRADO_DEFINITIVO":
      return {
        titulo: "Cuenta eliminada definitivamente",
        detalle: null,
        categoria: "estado",
        tono: "peligro",
      }
    default:
      return null
  }
}

function describirGenerico(
  evento: EventoActividad
): Omit<EventoDescrito, "propio"> {
  const accion = ACCIONES[evento.accion] ?? "Registró"
  const entidad = ENTIDADES[evento.entidad] ?? evento.entidad
  const filas = numero(evento.metadatos.filas)
  const formato = evento.metadatos.formato
  return {
    titulo: `${accion} ${entidad}`,
    detalle:
      evento.accion === "EXPORTAR" && filas !== null
        ? `${filas} filas${typeof formato === "string" ? ` · ${formato.toUpperCase()}` : ""}`
        : evento.motivo,
    categoria: evento.accion === "EXPORTAR" ? "exportacion" : "otro",
    tono: "neutro",
  }
}

/** Título, detalle y tono de un evento para la línea de tiempo de un usuario. */
export function describirEvento(
  evento: EventoActividad,
  contexto: Contexto
): EventoDescrito {
  const sobreElUsuario =
    evento.entidad === "perfiles" && evento.entidadId === contexto.usuarioId
  const descrito =
    (sobreElUsuario ? describirSobrePerfil(evento, contexto) : null) ??
    describirGenerico(evento)
  return { ...descrito, propio: evento.actorId === contexto.usuarioId }
}
