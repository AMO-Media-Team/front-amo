/**
 * Esquemas zod de la vinculación de medios (MED-001): los MISMOS en los
 * formularios (cliente, con `zodResolver`) y en las Server Actions. Reflejan
 * los CHECK de `solicitudes_vinculacion` (nombres 2–120, correo ≤ 254,
 * celular, 1–6 cuentas, mensaje ≤ 1000, autorización obligatoria) para que el
 * error llegue al campo antes de ir a la BD. Módulo puro.
 */
import { z } from "zod"

import {
  esquemaRegistrarMedio,
  normalizarEspacios,
  normalizarParrafos,
} from "@/features/gestion-medios/schemas"
import {
  esquemaCrearUsuario,
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
  normalizarCelular,
} from "@/features/usuarios/schemas"
import type { Json } from "@/types/database.types"
import { Constants } from "@/types/database.types"

import {
  claveCuenta,
  interpretarSeguidores,
  MAXIMO_CUENTAS,
  MINIMO_CUENTAS,
  normalizarUsuarioCuenta,
  PLATAFORMAS_CUENTA,
  type PlataformaCuenta,
} from "./cuentas"

export const LIMITES_SOLICITUD = {
  nombreMin: 2,
  nombreMax: 120,
  emailMax: 254,
  mensajeMax: 1000,
} as const

const TIPOS_MEDIO = Constants.public.Enums.medio_tipo

// ── Piezas ──────────────────────────────────────────────────────────────────

function nombreObligatorio(vacio: string) {
  return z
    .string({ error: vacio })
    .transform(normalizarEspacios)
    .pipe(
      z
        .string()
        .min(1, { error: vacio, abort: true })
        .min(
          LIMITES_SOLICITUD.nombreMin,
          `Escribe al menos ${LIMITES_SOLICITUD.nombreMin} caracteres.`
        )
        .max(
          LIMITES_SOLICITUD.nombreMax,
          `Máximo ${LIMITES_SOLICITUD.nombreMax} caracteres.`
        )
    )
}

const correo = z
  .string({ error: "Escribe tu correo." })
  .trim()
  .toLowerCase()
  .min(1, "Escribe tu correo.")
  .max(LIMITES_SOLICITUD.emailMax, "El correo es demasiado largo.")
  .pipe(z.email("Escribe un correo válido, por ejemplo nombre@medio.com."))

/** Opcional; se guarda como `+57 300 123 4567` o `3001234567` (`^\+?[0-9 ]{7,20}$`). */
const celular = z
  .string()
  .transform(normalizarCelular)
  .refine(
    (valor) => valor === "" || /^\+?[0-9 ]{7,20}$/.test(valor),
    "Escribe solo números (7 a 20), con + opcional al inicio."
  )
  .transform((valor) => valor || null)

const tipoOpcional = z
  .union([z.literal(""), z.enum(TIPOS_MEDIO)], {
    error: "Elige un tipo de la lista.",
  })
  .transform((valor) => valor || null)

const municipioCodigo = z
  .string({ error: "Elige el municipio." })
  .min(1, { error: "Elige el municipio.", abort: true })
  .regex(/^\d{5}$/, "Elige un municipio de la lista.")

const mensaje = z
  .string()
  .transform(normalizarParrafos)
  .pipe(
    z
      .string()
      .max(
        LIMITES_SOLICITUD.mensajeMax,
        `Máximo ${LIMITES_SOLICITUD.mensajeMax.toLocaleString("es-CO")} caracteres.`
      )
  )
  .transform((valor) => valor || null)

const cuenta = z
  .object({
    plataforma: z.enum(PLATAFORMAS_CUENTA, { error: "Elige la red social." }),
    usuario: z.string({ error: "Escribe el usuario o pega el enlace." }),
    seguidores: z.string({ error: "Escribe un número, por ejemplo 45.000." }),
  })
  .transform((entrada, contexto) => {
    const usuario = normalizarUsuarioCuenta(entrada.plataforma, entrada.usuario)
    const seguidores = interpretarSeguidores(entrada.seguidores)
    if (!usuario.ok) {
      contexto.addIssue({
        code: "custom",
        path: ["usuario"],
        message: usuario.mensaje,
      })
    }
    if (!seguidores.ok) {
      contexto.addIssue({
        code: "custom",
        path: ["seguidores"],
        message: seguidores.mensaje,
      })
    }
    if (!usuario.ok || !seguidores.ok) return z.NEVER
    return {
      plataforma: entrada.plataforma,
      usuario: usuario.usuario,
      seguidores: seguidores.valor,
    }
  })

const cuentas = z
  .array(cuenta, { error: "Agrega al menos una red social." })
  .min(MINIMO_CUENTAS, "Agrega al menos una red social.")
  .max(MAXIMO_CUENTAS, `Puedes declarar hasta ${MAXIMO_CUENTAS} cuentas.`)
  .superRefine((lista, contexto) => {
    const vistas = new Set<string>()
    lista.forEach((elemento, indice) => {
      const clave = claveCuenta(elemento.plataforma, elemento.usuario)
      if (vistas.has(clave)) {
        contexto.addIssue({
          code: "custom",
          path: [indice, "usuario"],
          message: "Ya agregaste esta cuenta.",
        })
      }
      vistas.add(clave)
    })
  })

// ── Formulario público ──────────────────────────────────────────────────────

export const esquemaSolicitudVinculacion = z.object({
  nombreMedio: nombreObligatorio("Escribe el nombre del medio."),
  tipo: tipoOpcional,
  municipioCodigo,
  cuentas,
  contactoNombre: nombreObligatorio("Escribe tu nombre."),
  email: correo,
  celular,
  mensaje,
  autorizaDatos: z
    .boolean({ error: "Debes autorizar el tratamiento de tus datos." })
    .refine(
      (valor) => valor,
      "Para enviar la solicitud debes autorizar el tratamiento de tus datos."
    ),
  /** Campo trampa: invisible para las personas; si llega con algo, es un robot. */
  sitioWeb: z.string().max(500).optional(),
})

export type EntradaSolicitudVinculacion = z.input<
  typeof esquemaSolicitudVinculacion
>
export type DatosSolicitudVinculacion = z.output<
  typeof esquemaSolicitudVinculacion
>
export type EntradaCuenta = EntradaSolicitudVinculacion["cuentas"][number]

export function cuentaVacia(plataforma: PlataformaCuenta): EntradaCuenta {
  return { plataforma, usuario: "", seguidores: "" }
}

export const VALORES_SOLICITUD: EntradaSolicitudVinculacion = {
  nombreMedio: "",
  tipo: "",
  municipioCodigo: "",
  cuentas: [cuentaVacia("INSTAGRAM")],
  contactoNombre: "",
  email: "",
  celular: "",
  mensaje: "",
  autorizaDatos: false,
  sitioWeb: "",
}

/** ¿Llegó algo en el campo trampa? Se mira antes de validar: no se le responde distinto a un robot. */
export function esEnvioAutomatico(entrada: unknown): boolean {
  if (!entrada || typeof entrada !== "object" || !("sitioWeb" in entrada)) {
    return false
  }
  const valor = entrada.sitioWeb
  return typeof valor === "string" ? valor.trim() !== "" : valor != null
}

/**
 * `p_datos` de `crear_solicitud_vinculacion_srv`. Una cuenta sin seguidores
 * no lleva la clave: la BD rechaza `"seguidores": null`.
 */
export function datosParaRpc(datos: DatosSolicitudVinculacion): Json {
  return {
    nombre_medio: datos.nombreMedio,
    tipo: datos.tipo,
    contacto_nombre: datos.contactoNombre,
    email: datos.email,
    celular: datos.celular,
    municipio_codigo: datos.municipioCodigo,
    cuentas: datos.cuentas.map(({ plataforma, usuario, seguidores }) =>
      seguidores === null
        ? { plataforma, usuario }
        : { plataforma, usuario, seguidores }
    ),
    mensaje: datos.mensaje,
    autoriza_datos: true,
  }
}

// ── Cola interna ────────────────────────────────────────────────────────────

const id = z.uuid({ error: "Identificador inválido." })

const camposUsuario = esquemaCrearUsuario.shape
const camposMedio = esquemaRegistrarMedio.pick({
  nombre: true,
  tipo: true,
  municipioCodigo: true,
})

/** Campo de `registrarMedio` → campo de la hoja «Invitar». */
export const CAMPOS_MEDIO_EN_HOJA = {
  nombre: "nombreMedio",
  tipo: "tipo",
  municipioCodigo: "municipioCodigo",
} as const

/** Campo de `crearUsuario` → campo de la hoja «Invitar». */
export const CAMPOS_USUARIO_EN_HOJA = {
  nombre: "contactoNombre",
  email: "email",
  celular: "celular",
  rolId: "rolId",
  metodo: "metodo",
} as const

/**
 * «Invitar»: el medio se registra con los datos de la solicitud (o se elige
 * uno ya registrado con `medioExistenteId`) y se invita a la persona de
 * contacto con la organización fija. Los datos del medio solo se validan
 * cuando se registra uno nuevo; los de la persona usan las reglas de Usuarios.
 */
export const esquemaInvitarSolicitud = z
  .object({
    solicitudId: id,
    /** `""`: registrar un medio nuevo. */
    medioExistenteId: z.union([id, z.literal("")], {
      error: "Elige el medio de la lista.",
    }),
    nombreMedio: z.string(),
    tipo: z.string(),
    municipioCodigo: z.string(),
    contactoNombre: camposUsuario.nombre,
    email: camposUsuario.email,
    celular: camposUsuario.celular,
    rolId: z
      .string({ error: "Elige el rol." })
      .min(1, "Elige el rol.")
      .pipe(id),
    metodo: camposUsuario.metodo,
  })
  .superRefine((datos, contexto) => {
    if (datos.medioExistenteId) return
    const medio = camposMedio.safeParse({
      nombre: datos.nombreMedio,
      tipo: datos.tipo,
      municipioCodigo: datos.municipioCodigo,
    })
    if (medio.success) return
    for (const problema of medio.error.issues) {
      const campo = problema.path[0] as keyof typeof CAMPOS_MEDIO_EN_HOJA
      contexto.addIssue({
        code: "custom",
        path: [CAMPOS_MEDIO_EN_HOJA[campo]],
        message: problema.message,
      })
    }
  })

export type EntradaInvitarSolicitud = z.input<typeof esquemaInvitarSolicitud>

/** Campos de la hoja «Invitar» que pueden recibir un error del servidor. */
export const CAMPOS_INVITAR = [
  "medioExistenteId",
  "nombreMedio",
  "tipo",
  "municipioCodigo",
  "contactoNombre",
  "email",
  "celular",
  "rolId",
  "metodo",
] as const satisfies readonly (keyof EntradaInvitarSolicitud)[]

export const esquemaDescartarSolicitud = z.object({
  solicitudId: id,
  motivo: z
    .string({ error: "Escribe el motivo." })
    .trim()
    .min(
      LONGITUD_MINIMA_MOTIVO,
      `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
    )
    .max(
      LONGITUD_MAXIMA_MOTIVO,
      `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`
    ),
})

export type EntradaDescartarSolicitud = z.input<
  typeof esquemaDescartarSolicitud
>
