/**
 * De una fila de `public.bitacora` al evento que ve la persona (módulo puro):
 * título en lenguaje natural, resumen de una línea, actor, ubicación y
 * cambios listos para el visor de diferencias.
 */
import { describirAgente } from "@/lib/auth/agente-usuario"
import { formatearNumero } from "@/lib/format"
import type { Database, Json } from "@/types/database.types"

import {
  ACCIONES,
  type AccionBitacora,
  complementoEntidad,
  esAccionBitacora,
  esEventoSensible,
  humanizar,
  nombreEntidad,
  rutaEntidad,
  textoEnlaceEntidad,
  tituloPropio,
} from "./catalogo"
import {
  camposCambiados,
  construirCambios,
  type ContextoValores,
  etiquetaCampo,
  etiquetaEstado,
  presentarMetadatos,
  presentarValor,
  tieneRedactados,
} from "./diferencias"
import { ipVisible } from "./privacidad"
import type { ActorEvento, EventoBitacora } from "./tipos"

export type FilaBitacora = Pick<
  Database["public"]["Tables"]["bitacora"]["Row"],
  | "id"
  | "created_at"
  | "accion"
  | "entidad"
  | "entidad_id"
  | "actor_id"
  | "actor_email"
  | "actor_rol"
  | "estado_anterior"
  | "estado_nuevo"
  | "cambios"
  | "metadatos"
  | "motivo"
  | "origen"
  | "ip"
  | "pais_iso2"
  | "ciudad"
  | "user_agent"
>

/** Columnas que se leen de la bitácora para describir un evento. */
export const COLUMNAS_EVENTO =
  "id, created_at, accion, entidad, entidad_id, actor_id, actor_email, actor_rol, estado_anterior, estado_nuevo, cambios, metadatos, motivo, origen, ip, pais_iso2, ciudad, user_agent" as const

export interface PerfilResumen {
  nombre: string | null
  email: string
}

export interface RolResumen {
  nombre: string
  color: string
}

export interface ContextoEventos extends ContextoValores {
  /** Perfiles visibles por id (RLS decide cuáles). */
  perfiles: ReadonlyMap<string, PerfilResumen>
  /** Roles por clave (`actor_rol` es la clave del rol en el momento del evento). */
  roles: ReadonlyMap<string, RolResumen>
  nombrePais: (iso2: string) => string | null
  /** `datos_sensibles.ver`: IP completa; si no, enmascarada. */
  ipCompleta: boolean
}

/** Eventos `OTRO` que registra la app (`metadatos.evento`) y su título. */
const EVENTOS_OTRO: Readonly<Record<string, string>> = {
  MFA_ACTIVADA: "Activó la verificación en dos pasos",
  MFA_RECONFIGURADA: "Reconfiguró la verificación en dos pasos",
  MFA_DESACTIVADA: "Desactivó la verificación en dos pasos",
  MFA_RESTABLECIDA: "Restableció la verificación en dos pasos",
  CUENTA_NO_INVITADA_DESCARTADA: "Descartó una cuenta no invitada",
}

function comoObjeto(valor: Json | null): Record<string, Json | undefined> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor
    : {}
}

function titulo(
  accion: string,
  entidad: string,
  metadatos: Json | null
): string {
  if (!esAccionBitacora(accion)) {
    return `${humanizar(accion)} en ${complementoEntidad(entidad)}`
  }
  if (accion === "OTRO") {
    const evento = comoObjeto(metadatos).evento
    if (typeof evento === "string") {
      return EVENTOS_OTRO[evento] ?? humanizar(evento)
    }
  }
  return (
    tituloPropio(entidad, accion) ??
    `${ACCIONES[accion].verbo} ${complementoEntidad(entidad)}`
  )
}

/** "nombre, rol y correo" · "nombre, rol, correo y 2 más". */
export function listaCampos(campos: readonly string[], maximo = 3): string {
  const etiquetas = [
    ...new Set(campos.map((campo) => etiquetaCampo(campo).toLowerCase())),
  ]
  if (etiquetas.length <= 1) return etiquetas.join("")
  if (etiquetas.length <= maximo) {
    return `${etiquetas.slice(0, -1).join(", ")} y ${etiquetas.at(-1)}`
  }
  const resto = etiquetas.length - maximo
  return `${etiquetas.slice(0, maximo).join(", ")} y ${resto} más`
}

function plural(
  cantidad: number,
  singular: string,
  pluralTexto: string
): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : pluralTexto}`
}

function resumenMetadatos(
  accion: AccionBitacora,
  meta: Record<string, Json | undefined>
): string | null {
  switch (accion) {
    case "EXPORTAR": {
      const partes = [
        typeof meta.filas === "number"
          ? plural(meta.filas, "fila", "filas")
          : null,
        typeof meta.formato === "string" ? meta.formato.toUpperCase() : null,
      ].filter(Boolean)
      return partes.length > 0 ? partes.join(" · ") : null
    }
    case "CERRAR_SESIONES":
      return typeof meta.sesiones_cerradas === "number"
        ? `${plural(meta.sesiones_cerradas, "sesión cerrada", "sesiones cerradas")}`
        : null
    case "INVITAR":
      return meta.metodo === "CONTRASENA"
        ? "Con contraseña temporal"
        : meta.correo_enviado === true
          ? "Enlace enviado por correo"
          : "Con enlace de un solo uso"
    case "GENERAR_ENLACE":
      return meta.tipo === "recovery"
        ? "Recuperación de contraseña"
        : meta.tipo === "invite"
          ? "Invitación"
          : null
    case "REVELAR_DATO":
      return Array.isArray(meta.campos)
        ? `Campos: ${listaCampos(meta.campos.filter((c): c is string => typeof c === "string"))}`
        : null
    case "URL_FIRMADA":
      return typeof meta.path === "string" ? meta.path : null
    default:
      return null
  }
}

/** Campos que identifican una fila creada o borrada, en orden de preferencia. */
const CAMPOS_IDENTIFICADORES = [
  "nombre",
  "permiso_clave",
  "clave",
  "titulo",
  "email",
]

/** "Permiso: Ver el listado…", "Nombre: Operaciones Norte" (creaciones y borrados). */
function identificadorDeFila(
  fila: FilaBitacora,
  contexto: ContextoValores
): string | null {
  if (!["INSERT", "DELETE"].includes(fila.accion)) return null
  const datos = comoObjeto(fila.cambios)
  const campo = CAMPOS_IDENTIFICADORES.find(
    (nombre) => typeof datos[nombre] === "string" && datos[nombre] !== ""
  )
  if (!campo) return null
  const valor = presentarValor(campo, datos[campo], contexto)
  return `${etiquetaCampo(campo)}: ${valor.texto}`
}

function resumen(fila: FilaBitacora, contexto: ContextoValores): string | null {
  const accion = fila.accion
  if (
    fila.estado_anterior &&
    fila.estado_nuevo &&
    fila.estado_anterior !== fila.estado_nuevo
  ) {
    return `${etiquetaEstado(fila.estado_anterior)} → ${etiquetaEstado(fila.estado_nuevo)}`
  }
  if (accion === "INSERT" && fila.estado_nuevo) {
    return `Estado inicial: ${etiquetaEstado(fila.estado_nuevo)}`
  }
  const identificador = identificadorDeFila(fila, contexto)
  if (identificador) return identificador
  const cambiados = camposCambiados(fila.cambios).filter((c) => !/_at$/.test(c))
  if (cambiados.length > 0) return `Cambió ${listaCampos(cambiados)}`
  if (esAccionBitacora(accion)) {
    const porMetadatos = resumenMetadatos(accion, comoObjeto(fila.metadatos))
    if (porMetadatos) return porMetadatos
  }
  return fila.motivo
}

function actorDe(fila: FilaBitacora, contexto: ContextoEventos): ActorEvento {
  const rol = fila.actor_rol ? contexto.roles.get(fila.actor_rol) : undefined
  const perfil = fila.actor_id
    ? contexto.perfiles.get(fila.actor_id)
    : undefined
  const esSistema = !fila.actor_id
  const nombre =
    perfil?.nombre?.trim() ||
    perfil?.email ||
    fila.actor_email ||
    (esSistema ? "Sistema" : "Usuario eliminado")
  return {
    id: fila.actor_id,
    nombre,
    correo: fila.actor_email,
    rol: rol?.nombre ?? (fila.actor_rol ? humanizar(fila.actor_rol) : null),
    color: rol?.color ?? null,
    esSistema,
  }
}

const ACCIONES_SIN_ENLACE = new Set(["DELETE", "BORRADO_DEFINITIVO"])
/** Su enlace lleva al registro padre (el rol), que sigue existiendo tras borrarlas. */
const ENTIDADES_HIJAS = new Set(["rol_permisos"])

function rutaDelEvento(fila: FilaBitacora) {
  if (
    ACCIONES_SIN_ENLACE.has(fila.accion) &&
    !ENTIDADES_HIJAS.has(fila.entidad)
  ) {
    return null
  }
  return rutaEntidad(fila.entidad, fila.entidad_id)
}

/** Pares de metadatos para el panel; en un `OTRO` el nombre del evento ya es el título. */
function metadatosVisibles(fila: FilaBitacora, contexto: ContextoValores) {
  const pares = presentarMetadatos(fila.metadatos, contexto)
  return fila.accion === "OTRO"
    ? pares.filter((par) => par.clave !== "evento")
    : pares
}

/** Evento listo para la tabla, la línea de tiempo y el panel de detalle. */
export function describirEvento(
  fila: FilaBitacora,
  contexto: ContextoEventos
): EventoBitacora {
  const accion = fila.accion
  const cambios = construirCambios(accion, fila.cambios, contexto)
  const agente = describirAgente(fila.user_agent)
  const conocida = esAccionBitacora(accion) ? ACCIONES[accion] : null
  return {
    id: fila.id,
    at: fila.created_at,
    accion,
    etiquetaAccion: conocida?.etiqueta ?? humanizar(accion),
    titulo: titulo(accion, fila.entidad, fila.metadatos),
    resumen: resumen(fila, contexto),
    tono: conocida?.tono ?? "neutro",
    entidad: fila.entidad,
    nombreEntidad: nombreEntidad(fila.entidad),
    entidadId: fila.entidad_id,
    ruta: rutaDelEvento(fila),
    textoRuta: textoEnlaceEntidad(fila.entidad),
    actor: actorDe(fila, contexto),
    origen: fila.origen,
    estadoAnterior: fila.estado_anterior
      ? etiquetaEstado(fila.estado_anterior)
      : null,
    estadoNuevo: fila.estado_nuevo ? etiquetaEstado(fila.estado_nuevo) : null,
    motivo: fila.motivo,
    sensible: esEventoSensible(fila),
    ubicacion: {
      ip: ipVisible(fila.ip, contexto.ipCompleta),
      paisIso2: fila.pais_iso2,
      pais: fila.pais_iso2 ? contexto.nombrePais(fila.pais_iso2) : null,
      ciudad: fila.ciudad,
      navegador: agente.navegador,
      sistemaOperativo: agente.sistemaOperativo,
      dispositivo: fila.user_agent ? agente.dispositivo : null,
    },
    cambios,
    metadatos: metadatosVisibles(fila, contexto),
    redactados: tieneRedactados(cambios),
  }
}

/** Ids de perfiles referenciados por un evento (actor y columnas `*_por`). */
export function perfilesReferenciados(
  fila: Pick<FilaBitacora, "actor_id" | "cambios">
): string[] {
  const ids = new Set<string>()
  if (fila.actor_id) ids.add(fila.actor_id)
  const cambios = comoObjeto(fila.cambios)
  for (const [campo, valor] of Object.entries(cambios)) {
    if (!/_por$/.test(campo)) continue
    const candidatos =
      valor && typeof valor === "object" && !Array.isArray(valor)
        ? [valor.antes, valor.despues]
        : [valor]
    for (const candidato of candidatos) {
      if (typeof candidato === "string" && /^[0-9a-f-]{36}$/i.test(candidato)) {
        ids.add(candidato.toLowerCase())
      }
    }
  }
  return [...ids]
}
