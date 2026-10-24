import "server-only"

import { enlaceNotificacion } from "@/features/enlaces/destinos"
import {
  analizarMarkdown,
  type Bloque,
  type Segmento,
  segmentosEnLinea,
} from "@/features/configuracion/markdown"
import { RUTA_NOTIFICACIONES, rutaInternaSegura } from "@/lib/auth/navegacion"

/**
 * Correo de un aviso: asunto, HTML y texto plano a partir de la plantilla de
 * correo (Markdown mínimo con `{{variables}}`, el mismo que edita
 * Configuración → Plantillas) y los datos guardados al encolarlo.
 *
 * - Cada valor de variable se escapa: un dato con `<`, `&` o comillas nunca
 *   se interpreta como HTML, y como se sustituye después de analizar el
 *   Markdown, tampoco como énfasis.
 * - Una variable sin dato queda «—», igual que en el aviso de la aplicación
 *   (`private.notificar`).
 * - Colores HEX y estilos en línea (los clientes de correo ignoran las hojas
 *   de estilo); sin imágenes externas.
 */

export interface AvisoParaCorreo {
  /** Nombre del destinatario (para el saludo); `null` si no lo tiene. */
  nombre: string | null
  /** Asunto de la plantilla de correo; sin él se usa el título del aviso. */
  asunto: string | null
  /** Cuerpo de la plantilla de correo (Markdown con `{{variables}}`). */
  cuerpo: string
  /** Variables guardadas al encolar (`private.correos_salientes.datos`). */
  datos: unknown
  /** Título y mensaje ya armados del aviso de la aplicación. */
  titulo: string
  mensaje: string
  url: string | null
  entidad: string | null
  entidadId: string | null
}

export interface CorreoArmado {
  asunto: string
  html: string
  texto: string
}

export const RUTA_PREFERENCIAS_CORREO = "/cuenta/preferencias"
const PIE_INICIO = "Cambia qué avisos recibes por correo en"
const PIE_DESTINO = "Cuenta → Preferencias"
export const TEXTO_PIE = `${PIE_INICIO} ${PIE_DESTINO}`

const SIN_DATO = "—"
const LONGITUD_MAXIMA_ASUNTO = 200
const LONGITUD_MAXIMA_PREENCABEZADO = 140
const VARIABLE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi
const CARACTERES_CONTROL = /[\u0000-\u001f\u007f]+/g

const COLOR = {
  fondo: "#F6F3FF",
  tarjeta: "#FFFFFF",
  borde: "#DCD0FD",
  texto: "#261848",
  tenue: "#5B5470",
  primario: "#6238BF",
  sobrePrimario: "#FFFFFF",
} as const

const FUENTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const ENTIDADES_HTML: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (caracter) => ENTIDADES_HTML[caracter])
}

// ── Variables ────────────────────────────────────────────────────────────────

type Variables = Readonly<Record<string, unknown>>

function variablesDe(datos: unknown): Variables {
  return typeof datos === "object" && datos !== null && !Array.isArray(datos)
    ? (datos as Variables)
    : {}
}

/** Mismo texto que `jsonb #>> '{}'` en `private.notificar`. */
function textoDeValor(valor: unknown): string {
  if (valor === null || valor === undefined) return SIN_DATO
  if (typeof valor === "string") return valor
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor)
  }
  return JSON.stringify(valor)
}

function valorDe(variables: Variables, nombre: string): string {
  return Object.hasOwn(variables, nombre)
    ? textoDeValor(variables[nombre])
    : SIN_DATO
}

/** Sustituye las variables de un texto (sin escapar: lo hace quien lo pinta). */
function sustituir(texto: string, variables: Variables): string {
  return texto.replace(VARIABLE, (_token, nombre: string) =>
    valorDe(variables, nombre)
  )
}

function textoDeSegmento(segmento: Segmento, variables: Variables): string {
  return segmento.tipo === "variable"
    ? valorDe(variables, segmento.nombre)
    : sustituir(segmento.texto, variables)
}

function unaLinea(texto: string): string {
  return texto.replace(CARACTERES_CONTROL, " ").replace(/\s+/g, " ").trim()
}

function recortar(texto: string, maximo: number): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto
}

// ── Enlaces ──────────────────────────────────────────────────────────────────

/**
 * Ruta del botón: la `url` del aviso si es interna y segura; si no, la de su
 * entidad (`/ir/…`, que decide el destino según el rol); si no, la bandeja.
 */
export function rutaDelAviso(
  aviso: Pick<AvisoParaCorreo, "url" | "entidad" | "entidadId">
): string {
  return (
    (aviso.url ? rutaInternaSegura(aviso.url) : null) ??
    enlaceNotificacion(aviso.entidad, aviso.entidadId) ??
    RUTA_NOTIFICACIONES
  )
}

function absoluta(ruta: string, sitioUrl: string): string {
  return new URL(ruta, sitioUrl).toString()
}

// ── HTML ─────────────────────────────────────────────────────────────────────

function htmlEnLinea(segmentos: Segmento[], variables: Variables): string {
  return segmentos
    .map((segmento) => {
      const texto = escaparHtml(textoDeSegmento(segmento, variables))
      if (segmento.tipo === "negrita") {
        return `<strong style="font-weight:700;color:${COLOR.texto};">${texto}</strong>`
      }
      if (segmento.tipo === "cursiva") return `<em>${texto}</em>`
      return texto
    })
    .join("")
}

const ESTILO_PARRAFO = `margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLOR.texto};`

function htmlDeBloque(bloque: Bloque, variables: Variables): string {
  if (bloque.tipo === "titulo") {
    const nivel = bloque.nivel + 1
    const tamano = bloque.nivel === 1 ? 17 : 15
    return `<h${nivel} style="margin:24px 0 8px;font-size:${tamano}px;line-height:1.4;font-weight:700;color:${COLOR.texto};">${htmlEnLinea(bloque.segmentos, variables)}</h${nivel}>`
  }
  if (bloque.tipo === "parrafo") {
    const lineas = bloque.lineas.map((linea) => htmlEnLinea(linea, variables))
    return `<p style="${ESTILO_PARRAFO}">${lineas.join("<br>")}</p>`
  }
  const etiqueta = bloque.ordenada ? "ol" : "ul"
  const elementos = bloque.elementos
    .map(
      (elemento) =>
        `<li style="margin:0 0 6px;">${htmlEnLinea(elemento, variables)}</li>`
    )
    .join("")
  return `<${etiqueta} style="margin:0 0 16px;padding-left:22px;font-size:15px;line-height:1.6;color:${COLOR.texto};">${elementos}</${etiqueta}>`
}

interface PartesCorreo {
  asunto: string
  titulo: string
  saludo: string
  preencabezado: string
  bloques: Bloque[]
  variables: Variables
  enlace: string
  enlacePreferencias: string
}

function html(partes: PartesCorreo): string {
  const enlace = escaparHtml(partes.enlace)
  const enlacePreferencias = escaparHtml(partes.enlacePreferencias)
  const cuerpo = partes.bloques
    .map((bloque) => htmlDeBloque(bloque, partes.variables))
    .join("")
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escaparHtml(partes.asunto)}</title>`,
    "</head>",
    `<body style="margin:0;padding:0;background-color:${COLOR.fondo};">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escaparHtml(partes.preencabezado)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.fondo};">`,
    `<tr><td align="center" style="padding:32px 16px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FUENTE};">`,
    `<tr><td style="padding:0 4px 16px;font-size:22px;line-height:1;font-weight:800;letter-spacing:-0.02em;color:${COLOR.primario};">AMO</td></tr>`,
    `<tr><td style="background-color:${COLOR.tarjeta};border:1px solid ${COLOR.borde};border-radius:16px;padding:32px 28px;">`,
    `<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:700;color:${COLOR.texto};">${escaparHtml(partes.titulo)}</h1>`,
    `<p style="${ESTILO_PARRAFO}">${escaparHtml(partes.saludo)}</p>`,
    cuerpo,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr>`,
    `<td style="border-radius:10px;background-color:${COLOR.primario};">`,
    `<a href="${enlace}" style="display:inline-block;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600;line-height:1.2;color:${COLOR.sobrePrimario};text-decoration:none;">Ver en AMO</a>`,
    "</td></tr></table>",
    `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${COLOR.tenue};">Si el botón no abre, copia este enlace en tu navegador: <a href="${enlace}" style="color:${COLOR.primario};word-break:break-all;">${enlace}</a></p>`,
    "</td></tr>",
    `<tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;text-align:center;color:${COLOR.tenue};">`,
    `${escaparHtml(PIE_INICIO)} <a href="${enlacePreferencias}" style="color:${COLOR.primario};">${escaparHtml(PIE_DESTINO)}</a>.<br>`,
    "AMO · Advertising Market Optimization",
    "</td></tr>",
    "</table>",
    "</td></tr></table>",
    "</body>",
    "</html>",
  ].join("\n")
}

// ── Texto plano ──────────────────────────────────────────────────────────────

function textoEnLinea(segmentos: Segmento[], variables: Variables): string {
  return segmentos
    .map((segmento) => textoDeSegmento(segmento, variables))
    .join("")
}

function textoDeBloque(bloque: Bloque, variables: Variables): string {
  if (bloque.tipo === "titulo") return textoEnLinea(bloque.segmentos, variables)
  if (bloque.tipo === "parrafo") {
    return bloque.lineas
      .map((linea) => textoEnLinea(linea, variables))
      .join("\n")
  }
  return bloque.elementos
    .map(
      (elemento, indice) =>
        `${bloque.ordenada ? `${indice + 1}.` : "-"} ${textoEnLinea(elemento, variables)}`
    )
    .join("\n")
}

function texto(partes: PartesCorreo): string {
  return [
    partes.titulo,
    partes.saludo,
    ...partes.bloques.map((bloque) => textoDeBloque(bloque, partes.variables)),
    `Ver en AMO: ${partes.enlace}`,
    `—\n${TEXTO_PIE}: ${partes.enlacePreferencias}`,
  ].join("\n\n")
}

// ── Armado ───────────────────────────────────────────────────────────────────

function asuntoDe(aviso: AvisoParaCorreo, variables: Variables): string {
  const plantilla = aviso.asunto?.trim() ? aviso.asunto : aviso.titulo
  const plano = unaLinea(
    textoEnLinea(segmentosEnLinea(unaLinea(plantilla)), variables)
  )
  return recortar(plano || unaLinea(aviso.titulo), LONGITUD_MAXIMA_ASUNTO)
}

function saludoDe(nombre: string | null): string {
  const limpio = nombre ? unaLinea(nombre) : ""
  return limpio ? `Hola, ${limpio}:` : "Hola:"
}

export function armarCorreo(
  aviso: AvisoParaCorreo,
  sitioUrl: string
): CorreoArmado {
  const variables = variablesDe(aviso.datos)
  const partes: PartesCorreo = {
    asunto: asuntoDe(aviso, variables),
    titulo: unaLinea(aviso.titulo),
    saludo: saludoDe(aviso.nombre),
    preencabezado: recortar(
      unaLinea(aviso.mensaje),
      LONGITUD_MAXIMA_PREENCABEZADO
    ),
    bloques: analizarMarkdown(aviso.cuerpo),
    variables,
    enlace: absoluta(rutaDelAviso(aviso), sitioUrl),
    enlacePreferencias: absoluta(RUTA_PREFERENCIAS_CORREO, sitioUrl),
  }
  return { asunto: partes.asunto, html: html(partes), texto: texto(partes) }
}
