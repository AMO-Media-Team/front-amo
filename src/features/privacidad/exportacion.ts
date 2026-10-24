/**
 * «Descargar mis datos» (CTA-007, consulta del art. 14), módulo puro: lee el
 * JSON de `datos_titular()` y lo convierte en el libro de Excel de marca
 * (resumen por secciones y una hoja por lista). La BD nunca entrega valores
 * cifrados: la cuenta de pago y el documento llegan ya resumidos («•••• 2345»).
 */
import { z } from "zod"

import { EVENTOS, ETIQUETAS_DISPOSITIVO } from "@/features/accesos/catalogo"
import {
  ACCIONES,
  humanizar,
  nombreEntidad,
} from "@/features/auditoria/catalogo"
import { NOMBRES_TERMINOS } from "@/features/configuracion/presentacion"
import { FICHAS_DOCUMENTO } from "@/features/documentos-medio/catalogo"
import {
  ESTADOS_DOCUMENTO,
  ESTADOS_MEDIO,
  TIPOS_MEDIO,
} from "@/features/operacion/estados"
import type { HojaExcel, LibroExcel, ValorCelda } from "@/lib/export/excel"
import { parsearFecha } from "@/lib/fechas"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import {
  DECISIONES,
  ESTADOS_TITULAR,
  textoRadicado,
  TIPOS,
} from "./presentacion"

const valor = z.unknown()
const lista = <T extends z.ZodType>(fila: T) =>
  z
    .array(fila)
    .nullish()
    .transform((filas) => filas ?? [])

const esquemaDatosTitular = z.object({
  generado_at: z.string(),
  responsable: z.string().nullish(),
  perfil: z.record(z.string(), valor).nullish(),
  identificacion: z.record(z.string(), valor).nullish(),
  medio: z
    .object({
      datos_reservados: z.record(z.string(), valor).nullish(),
      cuentas_sociales: lista(z.record(z.string(), valor)),
      documentos: lista(z.record(z.string(), valor)),
    })
    .catchall(valor)
    .nullish(),
  empresa: z
    .object({ contacto: z.record(z.string(), valor).nullish() })
    .catchall(valor)
    .nullish(),
  autorizaciones: lista(z.record(z.string(), valor)),
  accesos: lista(z.record(z.string(), valor)),
  actividad: lista(z.record(z.string(), valor)),
  consultas_de_tus_datos_reservados: lista(z.record(z.string(), valor)),
  solicitudes: lista(z.record(z.string(), valor)),
})

export type DatosTitular = z.output<typeof esquemaDatosTitular>

/** El JSON de `datos_titular()`; `null` si no tiene esa forma. */
export function leerDatosTitular(datos: unknown): DatosTitular | null {
  const lectura = esquemaDatosTitular.safeParse(datos)
  return lectura.success ? lectura.data : null
}

// ── Valores ──────────────────────────────────────────────────────────────────

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null
  if (typeof valor === "string") return valor
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor)
  }
  return JSON.stringify(valor)
}

function siNo(valor: unknown): boolean | null {
  return typeof valor === "boolean" ? valor : null
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null
}

/** Instante ISO o día 'YYYY-MM-DD' → `Date` (Excel le da el formato). */
function fecha(valor: unknown): Date | null {
  if (typeof valor !== "string" || !valor) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return parsearFecha(valor)
  const instante = new Date(valor)
  return Number.isNaN(instante.getTime()) ? null : instante
}

function de<K extends string>(
  catalogo: Readonly<Record<K, { etiqueta: string } | string>>,
  valor: unknown
): string | null {
  if (typeof valor !== "string" || !valor) return null
  const entrada = (catalogo as Readonly<Record<string, unknown>>)[valor]
  if (typeof entrada === "string") return entrada
  if (entrada && typeof entrada === "object" && "etiqueta" in entrada) {
    return String(entrada.etiqueta)
  }
  return humanizar(valor)
}

/**
 * En el resumen todo es texto: la columna «Valor» mezcla clases de dato y un
 * formato de fecha convertiría un número en una fecha de 1900.
 */
function fechaTexto(valor: unknown): string | null {
  const instante = fecha(valor)
  if (!instante) return null
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? formatearFecha(instante, "largo")
    : formatearFechaHora(instante)
}

function documento(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor) return null
  return (
    (FICHAS_DOCUMENTO as Readonly<Record<string, { titulo: string }>>)[valor]
      ?.titulo ?? humanizar(valor)
  )
}

function terminos(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor) return null
  return (
    (NOMBRES_TERMINOS as Readonly<Record<string, { titulo: string }>>)[valor]
      ?.titulo ?? humanizar(valor)
  )
}

// ── Resumen por secciones ────────────────────────────────────────────────────

type FilaResumen = readonly [string, string, ValorCelda]

function filasPerfil(perfil: DatosTitular["perfil"]): FilaResumen[] {
  if (!perfil) return []
  const s = "Tu cuenta"
  return [
    [s, "Nombre", texto(perfil.nombre)],
    [s, "Correo", texto(perfil.correo)],
    [s, "Celular", texto(perfil.celular)],
    [s, "Rol", texto(perfil.rol)],
    [s, "Estado", humanizar(texto(perfil.estado) ?? "—")],
    [s, "Tiene foto de perfil", siNo(perfil.tiene_foto)],
    [s, "Cuenta creada", fechaTexto(perfil.creado_at)],
    [s, "Cuenta activada", fechaTexto(perfil.activado_at)],
    [s, "Último ingreso", fechaTexto(perfil.ultimo_acceso_at)],
  ]
}

function filasIdentificacion(
  identificacion: DatosTitular["identificacion"]
): FilaResumen[] {
  if (!identificacion) return []
  const s = "Identificación"
  return [
    [s, "Tipo de documento", texto(identificacion.tipo_documento)],
    [s, "Número de documento", texto(identificacion.numero_documento)],
    [s, "Fecha de nacimiento", fechaTexto(identificacion.fecha_nacimiento)],
    [s, "Dirección", texto(identificacion.direccion)],
  ]
}

function filasMedio(medio: DatosTitular["medio"]): FilaResumen[] {
  if (!medio) return []
  const s = "Tu medio"
  const filas: FilaResumen[] = [
    [s, "Nombre", texto(medio.nombre)],
    [s, "Tipo", de(TIPOS_MEDIO, medio.tipo)],
    [s, "Municipio", texto(medio.municipio)],
    [s, "Estado", de(ESTADOS_MEDIO, medio.estado)],
    [s, "Nivel de verificación", texto(medio.nivel_verificacion)],
    [s, "Registrado", fechaTexto(medio.creado_at)],
  ]
  const reservados = medio.datos_reservados
  if (reservados) {
    const r = "Datos de pago y tributarios"
    filas.push(
      [r, "Titular", texto(reservados.titular)],
      [r, "Tipo de documento", texto(reservados.tipo_documento)],
      [r, "Número de documento", texto(reservados.numero_documento)],
      [r, "Celular", texto(reservados.celular)],
      [r, "Correo", texto(reservados.correo)],
      [r, "Dirección", texto(reservados.direccion)],
      [r, "Método de pago", humanizar(texto(reservados.metodo_pago) ?? "—")],
      [r, "Cuenta de pago", texto(reservados.cuenta_de_pago)],
      [r, "Declarante de renta", siNo(reservados.declarante)],
      [r, "Obligado a facturar", siNo(reservados.obligado_a_facturar)],
      [r, "Responsable de IVA", siNo(reservados.responsable_de_iva)]
    )
  }
  return filas
}

function filasEmpresa(empresa: DatosTitular["empresa"]): FilaResumen[] {
  if (!empresa) return []
  const s = "Tu empresa"
  const filas: FilaResumen[] = [
    [s, "Razón social", texto(empresa.razon_social)],
    [s, "Nombre comercial", texto(empresa.nombre_comercial)],
    [s, "Eres la persona de contacto", siNo(empresa.eres_el_contacto)],
  ]
  if (empresa.contacto) {
    filas.push(
      [s, "Nombre de contacto", texto(empresa.contacto.nombre)],
      [s, "Correo de contacto", texto(empresa.contacto.correo)],
      [s, "Celular de contacto", texto(empresa.contacto.celular)]
    )
  }
  return filas
}

// ── Vista en pantalla ────────────────────────────────────────────────────────

export interface SeccionDatos {
  titulo: string
  filas: { dato: string; valor: string }[]
}

function textoCelda(valor: ValorCelda): string {
  if (valor === null || valor === undefined || valor === "") return "—"
  if (typeof valor === "boolean") return valor ? "Sí" : "No"
  if (valor instanceof Date) return formatearFechaHora(valor)
  if (typeof valor === "number") return valor.toLocaleString("es-CO")
  return valor
}

/** Títulos de sección en tercera persona, para el equipo. */
const SECCIONES_INTERNAS: Readonly<Record<string, string>> = {
  "Tu cuenta": "Cuenta",
  "Tu medio": "Medio",
  "Tu empresa": "Empresa",
  "Eres la persona de contacto": "Es la persona de contacto",
}

/**
 * El resumen por secciones, como texto (la ficha del equipo lo muestra al
 * atender una consulta, sin descargar nada). `interno` titula en tercera
 * persona.
 */
export function seccionesDatosTitular(
  datos: DatosTitular,
  { interno = false }: { interno?: boolean } = {}
): SeccionDatos[] {
  const rotulo = (texto: string) =>
    interno ? (SECCIONES_INTERNAS[texto] ?? texto) : texto
  const secciones = new Map<string, SeccionDatos>()
  for (const [original, datoOriginal, valor] of [
    ...filasPerfil(datos.perfil),
    ...filasIdentificacion(datos.identificacion),
    ...filasMedio(datos.medio),
    ...filasEmpresa(datos.empresa),
  ]) {
    const seccion = rotulo(original)
    const dato = rotulo(datoOriginal)
    const actual = secciones.get(seccion) ?? { titulo: seccion, filas: [] }
    actual.filas.push({ dato, valor: textoCelda(valor) })
    secciones.set(seccion, actual)
  }
  return [...secciones.values()]
}

/** Cuántos registros trae cada lista (el detalle va en la descarga). */
export function conteosDatosTitular(
  datos: DatosTitular
): { etiqueta: string; total: number }[] {
  return [
    { etiqueta: "Autorizaciones", total: datos.autorizaciones.length },
    ...(datos.medio
      ? [
          {
            etiqueta: "Cuentas sociales",
            total: datos.medio.cuentas_sociales.length,
          },
          { etiqueta: "Documentos", total: datos.medio.documentos.length },
        ]
      : []),
    { etiqueta: "Ingresos (365 días)", total: datos.accesos.length },
    { etiqueta: "Actividad (365 días)", total: datos.actividad.length },
    {
      etiqueta: "Consultas de sus datos reservados",
      total: datos.consultas_de_tus_datos_reservados.length,
    },
    { etiqueta: "Solicitudes", total: datos.solicitudes.length },
  ]
}

// ── Libro ────────────────────────────────────────────────────────────────────

function hojaResumen(datos: DatosTitular): HojaExcel {
  return {
    nombre: "Resumen",
    titulo: "Tus datos personales en AMO",
    descripcion:
      "Lo que AMO trata de ti. La cuenta de pago y el número de documento se muestran resumidos.",
    columnas: [{ titulo: "Sección" }, { titulo: "Dato" }, { titulo: "Valor" }],
    filas: [
      ...filasPerfil(datos.perfil),
      ...filasIdentificacion(datos.identificacion),
      ...filasMedio(datos.medio),
      ...filasEmpresa(datos.empresa),
    ],
  }
}

function hojasLista(datos: DatosTitular): HojaExcel[] {
  const hojas: HojaExcel[] = [
    {
      nombre: "Autorizaciones",
      titulo: "Autorizaciones que aceptaste",
      columnas: [
        { titulo: "Documento" },
        { titulo: "Versión" },
        { titulo: "Aceptada", formato: "fechaHora" },
        { titulo: "IP (enmascarada)" },
      ],
      filas: datos.autorizaciones.map((a) => [
        terminos(a.documento),
        texto(a.version),
        fecha(a.aceptada_at),
        texto(a.ip),
      ]),
    },
  ]
  if (datos.medio) {
    hojas.push(
      {
        nombre: "Cuentas sociales",
        columnas: [
          { titulo: "Plataforma" },
          { titulo: "Usuario" },
          { titulo: "Enlace" },
          { titulo: "Seguidores", formato: "numero" },
          { titulo: "Verificada" },
          { titulo: "Última verificación", formato: "fechaHora" },
        ],
        filas: datos.medio.cuentas_sociales.map((c) => [
          humanizar(texto(c.plataforma) ?? "—"),
          texto(c.usuario),
          texto(c.enlace),
          numero(c.seguidores),
          siNo(c.verificada),
          fecha(c.ultima_verificacion),
        ]),
      },
      {
        nombre: "Documentos",
        descripcion:
          "Solo los metadatos: los archivos no viajan en la descarga.",
        columnas: [
          { titulo: "Documento" },
          { titulo: "Estado" },
          { titulo: "Cargado", formato: "fechaHora" },
          { titulo: "Vence", formato: "fecha" },
        ],
        filas: datos.medio.documentos.map((d) => [
          documento(d.tipo),
          de(ESTADOS_DOCUMENTO, d.estado),
          fecha(d.cargado_at),
          fecha(d.vence),
        ]),
      }
    )
  }
  hojas.push(
    {
      nombre: "Accesos",
      titulo: "Tus ingresos de los últimos 365 días",
      columnas: [
        { titulo: "Fecha", formato: "fechaHora" },
        { titulo: "Evento" },
        { titulo: "Ciudad" },
        { titulo: "País" },
        { titulo: "Navegador" },
        { titulo: "Sistema" },
        { titulo: "Dispositivo" },
      ],
      filas: datos.accesos.map((a) => [
        fecha(a.fecha),
        de(EVENTOS, a.evento),
        texto(a.ciudad),
        texto(a.pais),
        texto(a.navegador),
        texto(a.sistema),
        de(ETIQUETAS_DISPOSITIVO, a.dispositivo),
      ]),
    },
    {
      nombre: "Actividad",
      titulo: "Tu actividad de los últimos 365 días",
      columnas: [
        { titulo: "Fecha", formato: "fechaHora" },
        { titulo: "Acción" },
        { titulo: "Registro" },
        { titulo: "Estado nuevo" },
      ],
      filas: datos.actividad.map((a) => [
        fecha(a.fecha),
        de(ACCIONES, a.accion),
        typeof a.entidad === "string" ? nombreEntidad(a.entidad) : null,
        typeof a.estado_nuevo === "string" ? humanizar(a.estado_nuevo) : null,
      ]),
    },
    {
      nombre: "Consultas de tus datos",
      titulo: "Quién consultó tus datos reservados",
      descripcion: "La fecha y el rol de quien los consultó, sin su nombre.",
      columnas: [
        { titulo: "Fecha", formato: "fechaHora" },
        { titulo: "Rol de quien consultó" },
        { titulo: "Datos consultados" },
      ],
      filas: datos.consultas_de_tus_datos_reservados.map((c) => [
        fecha(c.fecha),
        typeof c.rol_de_quien_consulto === "string"
          ? humanizar(c.rol_de_quien_consulto)
          : null,
        Array.isArray(c.campos)
          ? c.campos.map((campo) => humanizar(String(campo))).join(", ")
          : texto(c.campos),
      ]),
    },
    {
      nombre: "Solicitudes",
      titulo: "Tus solicitudes sobre datos personales",
      columnas: [
        { titulo: "Radicado" },
        { titulo: "Tipo" },
        { titulo: "Estado" },
        { titulo: "Recibida", formato: "fechaHora" },
        { titulo: "Vence", formato: "fecha" },
        { titulo: "Decisión" },
        { titulo: "Respondida", formato: "fechaHora" },
      ],
      filas: datos.solicitudes.map((s) => [
        typeof s.numero === "number" ? textoRadicado(s.numero) : null,
        de(TIPOS, s.tipo),
        de(ESTADOS_TITULAR, s.estado),
        fecha(s.recibida_at),
        fecha(s.vence),
        de(DECISIONES, s.decision),
        fecha(s.respondida_at),
      ]),
    }
  )
  return hojas
}

/** El libro de Excel de marca con los datos del titular. */
export function libroDatosTitular(
  datos: DatosTitular,
  { titular }: { titular?: string | null } = {}
): LibroExcel {
  const generado = fecha(datos.generado_at) ?? undefined
  return {
    titulo: "Datos personales",
    subtitulo: datos.responsable ?? "AMO — Advertising Market Optimization",
    filtros: titular ? [{ etiqueta: "Titular", valor: titular }] : [],
    hojas: [hojaResumen(datos), ...hojasLista(datos)],
    fecha: generado,
  }
}

/** Base del nombre de los archivos («datos-personales-amo-2026-10-24…»). */
export const NOMBRE_ARCHIVO_DATOS = "datos personales AMO"

/** El JSON tal como lo entregó la BD, legible. */
export function jsonDatosTitular(datos: unknown): string {
  return `${JSON.stringify(datos, null, 2)}\n`
}
