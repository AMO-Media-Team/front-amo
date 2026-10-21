/**
 * Textos de la sección «Mi cuenta» a partir de datos crudos: IP enmascarada,
 * ubicación legible y descripción de la actividad propia. Módulo puro.
 */

const OCULTO = "•••"

/**
 * Deja ver solo la red, no el equipo: `181.51.23.4` → `181.51.•••.•••`;
 * IPv6 conserva los dos primeros grupos. Suficiente para reconocer «mi casa»
 * o «la oficina» sin exponer la dirección completa en pantalla.
 */
export function enmascararIp(ip: string | null | undefined): string | null {
  const limpia = ip?.trim().replace(/\/\d+$/, "")
  if (!limpia) return null
  // El propio equipo (desarrollo local): no dice nada a la persona.
  if (limpia === "::1" || limpia.startsWith("127.")) return null
  if (limpia.includes(":")) {
    const grupos = limpia.split(":").filter(Boolean)
    return `${grupos.slice(0, 2).join(":")}:${OCULTO}`
  }
  const octetos = limpia.split(".")
  if (octetos.length !== 4) return OCULTO
  return `${octetos[0]}.${octetos[1]}.${OCULTO}.${OCULTO}`
}

const nombresPais = new Intl.DisplayNames(["es"], { type: "region" })

function nombrePais(iso2: string): string {
  try {
    return nombresPais.of(iso2.toUpperCase()) ?? iso2
  } catch {
    return iso2
  }
}

/** «Medellín, Colombia», «Colombia» o `null` si no se conoce. */
export function describirUbicacion(
  paisIso2: string | null | undefined,
  ciudad: string | null | undefined
): string | null {
  const partes = [ciudad?.trim(), paisIso2 ? nombrePais(paisIso2) : null]
  const texto = partes.filter(Boolean).join(", ")
  return texto || null
}

/** «Chrome en macOS», «Navegador en Android»; `null` si no se reconoce nada. */
export function describirNavegador(
  navegador: string | null,
  sistema: string | null
): string | null {
  if (sistema) return `${navegador ?? "Navegador"} en ${sistema}`
  return navegador
}

// ── Factores de verificación ─────────────────────────────────────────────────

/**
 * Prefijo del nombre que pone `iniciarFactorMfa`: Supabase exige nombres
 * únicos por cuenta y la fecha los distingue, pero en pantalla sobra (la
 * fecha de alta ya se muestra aparte).
 */
export const PREFIJO_FACTOR_AUTOMATICO = "Autenticador · "

/** «App autenticadora» para los nombres automáticos; los demás, tal cual. */
export function nombreVisibleFactor(
  nombre: string | null | undefined,
  indice: number
): string {
  const limpio = nombre?.trim()
  if (limpio && !limpio.startsWith(PREFIJO_FACTOR_AUTOMATICO)) return limpio
  return indice === 0 ? "App autenticadora" : `App autenticadora ${indice + 1}`
}

// ── Actividad propia (`mi_actividad`) ───────────────────────────────────────

export type TonoActividad = "seguridad" | "edicion" | "datos" | "neutro"

export interface ActividadDescrita {
  titulo: string
  tono: TonoActividad
}

const ENTIDADES: Readonly<Record<string, string>> = {
  perfiles: "un usuario",
  perfiles_privado: "datos personales",
  roles: "un rol",
  rol_permisos: "los permisos de un rol",
  configuracion: "la configuración",
  campanas: "una campaña",
  ofertas: "una oferta",
  asignaciones: "una asignación",
  medios: "un medio",
  anunciantes: "un anunciante",
  liquidaciones: "una liquidación",
  facturas: "una factura",
  reportes: "un reporte",
  bitacora: "la bitácora",
  accesos: "el registro de accesos",
}

function entidadLegible(entidad: string): string {
  return ENTIDADES[entidad] ?? "un registro"
}

/**
 * Frase en segunda persona para un evento de la bitácora del propio usuario.
 * `mi_actividad` no devuelve el detalle del cambio (solo acción y entidad).
 */
export function describirActividad(
  evento: { accion: string; entidad: string; entidadId: string | null },
  usuarioId: string
): ActividadDescrita {
  const sobreMi =
    evento.entidad === "perfiles" && evento.entidadId === usuarioId
  const cosa = entidadLegible(evento.entidad)

  switch (evento.accion) {
    case "UPDATE":
      return sobreMi
        ? { titulo: "Actualizaste tu perfil", tono: "edicion" }
        : { titulo: `Modificaste ${cosa}`, tono: "edicion" }
    case "INSERT":
      return { titulo: `Creaste ${cosa}`, tono: "edicion" }
    case "DELETE":
      return { titulo: `Eliminaste ${cosa}`, tono: "edicion" }
    case "TRANSICION":
      return { titulo: `Cambiaste el estado de ${cosa}`, tono: "edicion" }
    case "CERRAR_SESIONES":
      return sobreMi
        ? { titulo: "Cerraste tus otras sesiones", tono: "seguridad" }
        : { titulo: "Cerraste las sesiones de un usuario", tono: "seguridad" }
    case "EXPORTAR":
      return { titulo: `Exportaste ${cosa}`, tono: "datos" }
    case "REVELAR_DATO":
      return { titulo: "Consultaste un dato protegido", tono: "datos" }
    case "URL_FIRMADA":
      return { titulo: "Abriste un documento protegido", tono: "datos" }
    case "INVITAR":
      return { titulo: "Invitaste a un usuario", tono: "edicion" }
    case "GENERAR_ENLACE":
      return { titulo: "Generaste un enlace de acceso", tono: "seguridad" }
    case "SUSPENDER":
      return { titulo: "Suspendiste una cuenta", tono: "seguridad" }
    case "REACTIVAR":
      return { titulo: "Reactivaste una cuenta", tono: "seguridad" }
    case "CAMBIAR_ROL":
      return { titulo: "Cambiaste el rol de un usuario", tono: "seguridad" }
    case "BORRADO_DEFINITIVO":
      return {
        titulo: "Eliminaste una cuenta definitivamente",
        tono: "seguridad",
      }
    case "CONFIGURAR":
      return { titulo: "Cambiaste la configuración", tono: "edicion" }
    default:
      return sobreMi
        ? { titulo: "Ajustaste la seguridad de tu cuenta", tono: "seguridad" }
        : { titulo: "Otra acción en la plataforma", tono: "neutro" }
  }
}
