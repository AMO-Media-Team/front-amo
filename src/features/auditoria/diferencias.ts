/**
 * Visor de diferencias de la bitácora (módulo puro). `bitacora.cambios` llega
 * ya redactado por la BD (`private.auditoria_columnas`, §5.3):
 *
 * - UPDATE / TRANSICION: `{"columna": {"antes": x, "despues": y}}`.
 * - INSERT: la fila creada; DELETE y BORRADO_DEFINITIVO: la fila (o su
 *   instantánea mínima) eliminada.
 * - Columnas HASH: `"sha256:<16 hex>"`; ENMASCARAR: `"••••1234"` o `"a***@dominio"`.
 *
 * Aquí solo se decide cómo MOSTRAR cada valor (fecha, monto, estado,
 * referencia…); nunca se intenta recuperar lo redactado.
 */
import { esPermisoValido, PERMISOS } from "@/lib/auth/permisos"
import { parsearFecha } from "@/lib/fechas"
import {
  formatearCOP,
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import type { Json } from "@/types/database.types"

import { humanizar } from "./catalogo"

export type TipoValor =
  | "vacio"
  | "texto"
  | "numero"
  | "moneda"
  | "porcentaje"
  | "fecha"
  | "booleano"
  | "estado"
  | "referencia"
  | "color"
  | "enmascarado"
  | "hash"
  | "json"

export interface ValorPresentado {
  tipo: TipoValor
  /** Lo que se lee en pantalla. */
  texto: string
  /** Valor completo para el título o la copia (uuid, hash, JSON con formato). */
  detalle?: string
}

export type TipoCambio = "agregado" | "eliminado" | "modificado"

export interface CampoDiff {
  campo: string
  etiqueta: string
  /** `null` = no aplica (una creación no tiene "antes"; un borrado no tiene "después"). */
  antes: ValorPresentado | null
  despues: ValorPresentado | null
  tipo: TipoCambio
}

/**
 * `diferencias`: antes/después por campo · `creacion`: la fila insertada ·
 * `eliminacion`: lo que se borró · `datos`: una fila sin comparación (otros eventos).
 */
export type ModoCambios =
  "diferencias" | "creacion" | "eliminacion" | "datos" | "sin_cambios"

export interface CambiosPresentados {
  modo: ModoCambios
  campos: CampoDiff[]
}

export interface ParMetadato {
  clave: string
  etiqueta: string
  valor: ValorPresentado
}

export interface ContextoValores {
  /** Nombres legibles de ids referenciados (roles, perfiles…) y de claves de rol. */
  nombres: ReadonlyMap<string, string>
}

export const CONTEXTO_VACIO: ContextoValores = { nombres: new Map() }

// ── Nombres de campos ────────────────────────────────────────────────────────

const ETIQUETAS_CAMPO: Readonly<Record<string, string>> = {
  id: "ID",
  email: "Correo",
  email_sha256: "Correo (hash)",
  celular: "Celular",
  nombre: "Nombre",
  estado: "Estado",
  rol: "Rol",
  rol_id: "Rol",
  invitado_por: "Invitado por",
  otorgado_por: "Otorgado por",
  debe_cambiar_password: "Cambio de contraseña obligatorio",
  motivo_estado: "Motivo del estado",
  es_demo: "Dato de demostración",
  avatar_path: "Foto de perfil",
  preferencias: "Preferencias",
  anunciante_id: "Anunciante",
  medio_id: "Medio",
  clave: "Clave",
  valor: "Valor",
  descripcion: "Descripción",
  color: "Color",
  tipo: "Tipo",
  requiere_mfa: "Exige verificación en dos pasos",
  permiso_clave: "Permiso",
  es_sistema: "Rol del sistema",
  tipo_documento: "Tipo de documento",
  numero_documento_hash: "Documento (hash)",
  numero_documento_resumen: "Documento",
  fecha_nacimiento: "Fecha de nacimiento",
  direccion: "Dirección",
  activo: "Activo",
  vigente_desde: "Vigente desde",
  vigente_hasta: "Vigente hasta",
  created_at: "Creado",
  updated_at: "Actualizado",
  deleted_at: "Eliminado",
  ultimo_acceso_at: "Último acceso",
  // Configuración: parámetros, catálogos, tarifas y tributario.
  minimo: "Mínimo",
  maximo: "Máximo",
  modulo: "Módulo",
  unidad: "Unidad",
  opciones: "Opciones",
  es_publica: "Visible para todos los usuarios",
  pendiente_validacion: "Pendiente de validación",
  actualizado_por: "Actualizado por",
  creada_por: "Creada por",
  activa: "Activa",
  publicada: "Publicada",
  seguidores_min: "Seguidores mínimos",
  seguidores_max: "Seguidores máximos",
  documentos_requeridos: "Documentos requeridos",
  porcentaje_alerta: "Porcentaje de alerta",
  porcentaje_bloqueo: "Porcentaje de bloqueo",
  anio: "Año",
  uvt: "UVT",
  smlmv: "SMLMV",
  umbral_seg_social_smlmv: "Umbral de seguridad social (SMLMV)",
  base_minima_uvt: "Base mínima (UVT)",
  tarifa_por_mil: "Tarifa por mil",
  aplica_declarante: "Aplica a declarantes",
  municipio_codigo: "Municipio",
  numero_resolucion: "Número de resolución",
  fecha_resolucion: "Fecha de resolución",
  contenido_md: "Contenido",
  hash_sha256: "Huella (SHA-256)",
}

/** "rol_id" → "Rol", "activado_at" → "Activado", "tope_anual" → "Tope anual". */
export function etiquetaCampo(campo: string): string {
  const conocida = ETIQUETAS_CAMPO[campo]
  if (conocida) return conocida
  const base = campo.replace(/_(id|at)$/, "")
  return humanizar(base || campo)
}

// ── Clasificación de valores ────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INSTANTE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/
const DIA = /^\d{4}-\d{2}-\d{2}$/
const HASH_REDACTADO = /^sha256:[0-9a-f]{6,64}$/i
const HASH_COMPLETO = /^[0-9a-f]{64}$/i
const ENMASCARADO = /^••••|^[^@\s]\*{3}@/
const COLOR_HEX = /^#[0-9a-f]{6}$/i

/** Columnas de dinero COP (numeric(14,2)) por nombre. */
const CAMPO_MONEDA =
  /^(monto|presupuesto|precio|saldo|subtotal|total|iva|retencion|reteica|reteiva|retefuente|gmv|valor_(bruto|neto|medio|comision))(_|$)|_cop$/
/** Fracciones 0–1 (numeric(5,4)) por nombre. */
const CAMPO_FRACCION =
  /(^|_)(porcentaje|tasa|comision|take_rate|tope_pct|fraccion)(_|$)/
const CAMPO_ESTADO = /^estado($|_)|_estado$/

const ESTADOS_CONOCIDOS: Readonly<Record<string, string>> = {
  ACTIVO: "Activo",
  INVITADO: "Invitado",
  SUSPENDIDO: "Suspendido",
  DESACTIVADO: "Desactivado",
  BORRADOR: "Borrador",
  EN_REVISION: "En revisión",
  EN_DISPUTA: "En disputa",
}

export function etiquetaEstado(estado: string): string {
  return ESTADOS_CONOCIDOS[estado] ?? humanizar(estado)
}

function textoJson(valor: unknown, formato = false): string {
  return JSON.stringify(valor, null, formato ? 2 : undefined) ?? ""
}

function presentarTexto(
  campo: string,
  valor: string,
  contexto: ContextoValores
): ValorPresentado {
  if (
    HASH_REDACTADO.test(valor) ||
    (HASH_COMPLETO.test(valor) && /(hash|sha256)/.test(campo))
  ) {
    const resumen = valor.replace(/^sha256:/i, "").slice(0, 10)
    return { tipo: "hash", texto: `sha256:${resumen}…`, detalle: valor }
  }
  if (ENMASCARADO.test(valor)) return { tipo: "enmascarado", texto: valor }
  if (campo === "permiso_clave" && esPermisoValido(valor)) {
    return {
      tipo: "referencia",
      texto: PERMISOS[valor].descripcion,
      detalle: valor,
    }
  }
  if (UUID.test(valor)) {
    const nombre = contexto.nombres.get(valor.toLowerCase())
    return {
      tipo: "referencia",
      texto: nombre ?? `${valor.slice(0, 8)}…`,
      detalle: valor,
    }
  }
  if (COLOR_HEX.test(valor)) {
    return { tipo: "color", texto: valor.toUpperCase() }
  }
  if (CAMPO_ESTADO.test(campo) && /^[A-Z][A-Z0-9_]*$/.test(valor)) {
    return { tipo: "estado", texto: etiquetaEstado(valor), detalle: valor }
  }
  if (INSTANTE.test(valor) && !Number.isNaN(Date.parse(valor))) {
    return { tipo: "fecha", texto: formatearFechaHora(valor), detalle: valor }
  }
  if (DIA.test(valor)) {
    const dia = parsearFecha(valor)
    if (dia)
      return { tipo: "fecha", texto: formatearFecha(dia), detalle: valor }
  }
  return { tipo: "texto", texto: valor }
}

function presentarNumero(campo: string, valor: number): ValorPresentado {
  if (CAMPO_MONEDA.test(campo)) {
    return {
      tipo: "moneda",
      texto: formatearCOP(valor),
      detalle: String(valor),
    }
  }
  if (CAMPO_FRACCION.test(campo) && valor >= 0 && valor <= 1) {
    return {
      tipo: "porcentaje",
      texto: formatearPorcentaje(valor, 2),
      detalle: String(valor),
    }
  }
  return { tipo: "numero", texto: formatearNumero(valor, 4) }
}

/** Cómo se muestra el valor de una columna de la bitácora. */
export function presentarValor(
  campo: string,
  valor: unknown,
  contexto: ContextoValores = CONTEXTO_VACIO
): ValorPresentado {
  if (valor === null || valor === undefined) {
    return { tipo: "vacio", texto: "Vacío" }
  }
  if (typeof valor === "boolean") {
    return { tipo: "booleano", texto: valor ? "Sí" : "No" }
  }
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return presentarNumero(campo, valor)
  }
  if (typeof valor === "string") {
    return valor.trim() === ""
      ? { tipo: "vacio", texto: "Vacío" }
      : presentarTexto(campo, valor, contexto)
  }
  return {
    tipo: "json",
    texto: textoJson(valor),
    detalle: textoJson(valor, true),
  }
}

// ── Diferencias ─────────────────────────────────────────────────────────────

type Objeto = Record<string, unknown>

function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

function esParAntesDespues(
  valor: unknown
): valor is { antes?: unknown; despues?: unknown } {
  return esObjeto(valor) && ("antes" in valor || "despues" in valor)
}

/** Estado primero; fechas de sistema (`*_at`) al final; el resto por nombre legible. */
function ordenCampo(campo: CampoDiff): [number, string] {
  if (campo.campo === "estado") return [0, ""]
  if (/_at$/.test(campo.campo)) return [2, campo.etiqueta]
  return [1, campo.etiqueta]
}

function compararCampos(a: CampoDiff, b: CampoDiff): number {
  const [grupoA, nombreA] = ordenCampo(a)
  const [grupoB, nombreB] = ordenCampo(b)
  return grupoA - grupoB || nombreA.localeCompare(nombreB, "es-CO")
}

function tipoDeCambio(
  antes: ValorPresentado,
  despues: ValorPresentado
): TipoCambio {
  if (antes.tipo === "vacio" && despues.tipo !== "vacio") return "agregado"
  if (despues.tipo === "vacio" && antes.tipo !== "vacio") return "eliminado"
  return "modificado"
}

function diferenciasDeActualizacion(
  cambios: Objeto,
  contexto: ContextoValores
): CampoDiff[] {
  return Object.entries(cambios)
    .filter(([, par]) => esParAntesDespues(par))
    .map(([campo, par]) => {
      const { antes, despues } = par as { antes?: unknown; despues?: unknown }
      const valorAntes = presentarValor(campo, antes, contexto)
      const valorDespues = presentarValor(campo, despues, contexto)
      return {
        campo,
        etiqueta: etiquetaCampo(campo),
        antes: valorAntes,
        despues: valorDespues,
        tipo: tipoDeCambio(valorAntes, valorDespues),
      }
    })
}

function camposDeFila(
  fila: Objeto,
  lado: "antes" | "despues",
  contexto: ContextoValores
): CampoDiff[] {
  return Object.entries(fila).map(([campo, valor]) => {
    const presentado = presentarValor(campo, valor, contexto)
    return {
      campo,
      etiqueta: etiquetaCampo(campo),
      antes: lado === "antes" ? presentado : null,
      despues: lado === "despues" ? presentado : null,
      tipo: lado === "antes" ? "eliminado" : "agregado",
    }
  })
}

const ACCIONES_DE_BORRADO = new Set(["DELETE", "BORRADO_DEFINITIVO"])

/**
 * Cambios de un evento listos para mostrar. Un UPDATE compara antes/después;
 * un INSERT muestra la fila creada; un borrado, lo que se eliminó.
 */
export function construirCambios(
  accion: string,
  cambios: Json | null,
  contexto: ContextoValores = CONTEXTO_VACIO
): CambiosPresentados {
  if (!esObjeto(cambios) || Object.keys(cambios).length === 0) {
    return { modo: "sin_cambios", campos: [] }
  }
  if (ACCIONES_DE_BORRADO.has(accion)) {
    return {
      modo: "eliminacion",
      campos: camposDeFila(cambios, "antes", contexto).sort(compararCampos),
    }
  }
  if (accion === "INSERT") {
    return {
      modo: "creacion",
      campos: camposDeFila(cambios, "despues", contexto).sort(compararCampos),
    }
  }
  if (Object.values(cambios).some(esParAntesDespues)) {
    const campos = diferenciasDeActualizacion(cambios, contexto)
    return { modo: "diferencias", campos: campos.sort(compararCampos) }
  }
  return {
    modo: "datos",
    campos: camposDeFila(cambios, "despues", contexto).sort(compararCampos),
  }
}

/** Nombres de las columnas cambiadas en un UPDATE (para el resumen de la fila). */
export function camposCambiados(cambios: Json | null): string[] {
  if (!esObjeto(cambios)) return []
  return Object.entries(cambios)
    .filter(([, par]) => esParAntesDespues(par))
    .map(([campo]) => campo)
}

/** ¿Hay algún valor redactado (hash o enmascarado) entre los cambios? */
export function tieneRedactados(cambios: CambiosPresentados): boolean {
  return cambios.campos.some((campo) =>
    [campo.antes, campo.despues].some(
      (valor) => valor?.tipo === "hash" || valor?.tipo === "enmascarado"
    )
  )
}

// ── Metadatos de los eventos de aplicación ──────────────────────────────────

const ETIQUETAS_METADATO: Readonly<Record<string, string>> = {
  formato: "Formato",
  filas: "Filas",
  truncado: "Resultado recortado",
  filtros: "Filtros aplicados",
  periodo: "Periodo",
  metodo: "Método",
  correo_enviado: "Correo enviado",
  rol: "Rol",
  tipo: "Tipo",
  sesiones_cerradas: "Sesiones cerradas",
  alcance: "Alcance",
  motivo: "Motivo",
  factor: "Factor",
  factores: "Factores retirados",
  conserva_sesion: "Conservó la sesión actual",
  evento: "Evento",
  campos: "Campos",
  tabla: "Tabla",
  bucket: "Almacenamiento",
  path: "Archivo",
  expira: "Expira",
}

const VALORES_METADATO: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  formato: { xlsx: "Excel (.xlsx)", csv: "CSV (.csv)", pdf: "PDF" },
  metodo: { ENLACE: "Enlace de invitación", CONTRASENA: "Contraseña temporal" },
  tipo: { recovery: "Recuperación de contraseña", invite: "Invitación" },
  alcance: { otras: "Las demás sesiones", todas: "Todas las sesiones" },
  motivo: {
    manual: "Cierre manual",
    cambio_contrasena: "Cambio de contraseña",
    restablecer_contrasena: "Restablecimiento de contraseña",
  },
  factor: { totp: "App de autenticación (TOTP)" },
}

/** Valor conocido de un metadato: vocabulario fijo o nombre del rol por su clave. */
function metadatoConocido(
  clave: string,
  valor: unknown,
  contexto: ContextoValores
): string | undefined {
  if (typeof valor !== "string") return undefined
  if (clave === "rol") return contexto.nombres.get(valor)
  return VALORES_METADATO[clave]?.[valor]
}

/** Pares etiqueta/valor de `bitacora.metadatos` (filtros, formato, filas…). */
export function presentarMetadatos(
  metadatos: Json | null,
  contexto: ContextoValores = CONTEXTO_VACIO
): ParMetadato[] {
  if (!esObjeto(metadatos)) return []
  return Object.entries(metadatos).map(([clave, valor]) => {
    const conocido = metadatoConocido(clave, valor, contexto)
    return {
      clave,
      etiqueta: ETIQUETAS_METADATO[clave] ?? humanizar(clave),
      valor: conocido
        ? { tipo: "texto", texto: conocido }
        : presentarValor(clave, valor, contexto),
    }
  })
}
