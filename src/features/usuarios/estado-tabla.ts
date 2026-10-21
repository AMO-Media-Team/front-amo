/**
 * Estado del listado de usuarios en la URL (compartido por la página y la
 * tabla) y su traducción a los parámetros de `listar_usuarios`.
 */
import {
  definirEstadoTabla,
  desplazamiento,
  type EstadoTabla,
  filtroDeIds,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import { Constants, type Database } from "@/types/database.types"

export const ESTADOS_PERFIL = Constants.public.Enums.perfil_estado
export const TIPOS_ROL = Constants.public.Enums.rol_tipo
export const OPCIONES_MFA = ["CON", "SIN"] as const

/** Lista blanca de orden: coincide con los `p_orden` que entiende `listar_usuarios`. */
export const CAMPOS_ORDEN_USUARIOS = [
  "nombre",
  "email",
  "rol",
  "estado",
  "ultimo_acceso",
  "creado",
] as const

export const estadoTablaUsuarios = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_USUARIOS,
  ordenPorDefecto: { campo: "creado", descendente: true },
  filtros: {
    estado: filtroDeOpciones(ESTADOS_PERFIL),
    rol: filtroDeIds(),
    tipo: filtroDeOpciones(TIPOS_ROL),
    mfa: filtroDeOpciones(OPCIONES_MFA),
  },
})

export type EstadoTablaUsuarios = EstadoTabla<typeof estadoTablaUsuarios>

type ArgumentosListado =
  Database["public"]["Functions"]["listar_usuarios"]["Args"]

/** "Con y sin MFA" equivale a no filtrar. */
function filtroMfa(
  valores: readonly (typeof OPCIONES_MFA)[number][]
): boolean | undefined {
  if (valores.length !== 1) return undefined
  return valores[0] === "CON"
}

/** Estado de la URL → argumentos de la RPC (sin filtros vacíos). */
export function argumentosListado(
  estado: EstadoTablaUsuarios
): ArgumentosListado {
  const argumentos: ArgumentosListado = {
    p_orden: estado.orden.campo,
    p_descendente: estado.orden.descendente,
    p_limite: estado.tamano,
    p_desplazamiento: desplazamiento(estado.pagina, estado.tamano),
  }
  if (estado.q) argumentos.p_busqueda = estado.q
  if (estado.estado.length > 0) argumentos.p_estados = [...estado.estado]
  if (estado.rol.length > 0) argumentos.p_roles = [...estado.rol]
  if (estado.tipo.length > 0) argumentos.p_tipos = [...estado.tipo]
  const mfa = filtroMfa(estado.mfa)
  if (mfa !== undefined) argumentos.p_mfa = mfa
  return argumentos
}
