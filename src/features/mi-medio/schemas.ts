/**
 * Esquemas zod de «Mi medio»: los MISMOS en el formulario (`zodResolver`) y
 * en las Server Actions. Reflejan los CHECK de `medios`, `medio_audiencia_paises`
 * y `medios_privado` para que el error llegue al campo antes de ir a la BD,
 * que vuelve a validarlo todo (RLS, municipio activo, suma de la audiencia,
 * unicidad del documento). Módulo puro.
 *
 * Los dos esquemas se construyen con lo que ya está guardado (como
 * `conReglasDeRol` en usuarios): el servidor arma el mismo con lo que relee de
 * la BD, así que no confía en lo que diga el navegador sobre el estado actual.
 */
import { z } from "zod"

import { cantidadDecimales, textoANumero } from "@/features/configuracion/numeros"
import {
  esquemaRegistrarMedio,
  normalizarEspacios,
} from "@/features/gestion-medios/schemas"
import { nitValido } from "@/lib/colombia/nit"

import { enCentesimas, LIMITES_AUDIENCIA } from "./audiencia"
import {
  BANCOS,
  BILLETERAS,
  CARACTERES_DOCUMENTO,
  type CuentaPago,
  normalizarNumeroDocumento,
  OTRA_ENTIDAD,
  REGLAS_DOCUMENTO,
  TIPOS_CUENTA_BD,
  TIPOS_DOCUMENTO_IDENTIDAD_BD,
  type TipoCuenta,
  type TipoDocumentoIdentidad,
} from "./datos-pago"

// ── Perfil (MED-002) ────────────────────────────────────────────────────────

/** Lo que el medio ya tiene y no puede tocar: audiencia verificada por AMO. */
export interface AudienciaFija {
  paises: readonly string[]
  /** Suma de sus porcentajes (0–100). */
  porcentaje: number
}

export const SIN_AUDIENCIA_FIJA: AudienciaFija = { paises: [], porcentaje: 0 }

const filaAudiencia = z.object({
  paisIso2: z
    .string({ error: "Elige el país." })
    .min(1, { error: "Elige el país.", abort: true })
    .regex(/^[A-Z]{2}$/, "Elige un país de la lista."),
  porcentaje: z
    .string({ error: "Escribe el porcentaje." })
    .trim()
    .min(1, { error: "Escribe el porcentaje.", abort: true })
    .transform((texto, contexto) => {
      const valor = textoANumero(texto)
      if (valor === null) {
        contexto.addIssue({
          code: "custom",
          message: "Escribe un número, por ejemplo 35 o 12,5.",
        })
        return z.NEVER
      }
      return valor
    })
    .pipe(
      z
        .number()
        .gt(0, "Debe ser mayor que 0 %.")
        .max(100, "No puede pasar de 100 %.")
        .refine(
          (valor) => cantidadDecimales(valor) <= 2,
          "Usa como máximo dos decimales."
        )
    ),
})

export type FilaAudiencia = z.output<typeof filaAudiencia>

function audiencia(fija: AudienciaFija) {
  return z
    .array(filaAudiencia)
    .max(
      LIMITES_AUDIENCIA.paisesMax,
      `Indica como máximo ${LIMITES_AUDIENCIA.paisesMax} países.`
    )
    .superRefine((filas, contexto) => {
      const vistos = new Set(fija.paises)
      filas.forEach((fila, indice) => {
        if (vistos.has(fila.paisIso2)) {
          contexto.addIssue({
            code: "custom",
            path: [indice, "paisIso2"],
            message: fija.paises.includes(fila.paisIso2)
              ? "Este país ya lo verificó el equipo de AMO."
              : "Este país ya está en la lista.",
          })
        }
        vistos.add(fila.paisIso2)
      })
      const total =
        enCentesimas(fija.porcentaje) +
        filas.reduce((suma, fila) => suma + enCentesimas(fila.porcentaje), 0)
      if (total > enCentesimas(100)) {
        contexto.addIssue({
          code: "custom",
          message: `La suma no puede pasar de 100 % (hoy da ${(total / 100).toLocaleString("es-CO")} %).`,
        })
      }
    })
}

/** Perfil propio con bloqueo optimista (`updated_at` de `medios`). */
export function esquemaPerfilMedio(fija: AudienciaFija = SIN_AUDIENCIA_FIJA) {
  return esquemaRegistrarMedio.extend({
    actualizadoAt: z
      .string({ error: "Falta la versión del registro." })
      .min(1, "Falta la versión del registro.")
      .max(64, "Versión del registro inválida."),
    audiencia: audiencia(fija),
  })
}

type EsquemaPerfil = ReturnType<typeof esquemaPerfilMedio>
export type EntradaPerfilMedio = z.input<EsquemaPerfil>
export type DatosPerfilMedio = z.output<EsquemaPerfil>

export const CAMPOS_PERFIL = [
  "nombre",
  "tipo",
  "municipioCodigo",
  "descripcionAudiencia",
  "categoriaIds",
  "audiencia",
] as const satisfies readonly (keyof EntradaPerfilMedio)[]

// ── Pago y condición tributaria (MED-004) ───────────────────────────────────

/** Lo que ya está guardado (lo relee el servidor; nunca los números). */
export interface PagoGuardado {
  tipoDocumento: TipoDocumentoIdentidad | null
  /** Hay número de documento cifrado. */
  documentoRegistrado: boolean
  /** Hay cuenta cifrada completa (método + cuenta + resumen). */
  cuentaRegistrada: boolean
}

export const SIN_PAGO_GUARDADO: PagoGuardado = {
  tipoDocumento: null,
  documentoRegistrado: false,
  cuentaRegistrada: false,
}

export const LIMITES_PAGO = {
  titularMin: 2,
  titularMax: 120,
  entidadMin: 2,
  entidadMax: 40,
  cuentaMin: 5,
  cuentaMax: 20,
} as const

/** Campos tal como se escriben (todo texto o booleano: sin `null`). */
const camposPago = z.object({
  titularNombre: z.string().overwrite(normalizarEspacios),
  tipoDocumento: z.string(),
  numeroDocumento: z.string(),
  /** Escribir una cuenta nueva (siempre, si no hay una guardada). */
  cambiarCuenta: z.boolean(),
  metodoPago: z.string(),
  banco: z.string(),
  bancoOtro: z.string().overwrite(normalizarEspacios),
  tipoCuenta: z.string(),
  numeroCuenta: z.string(),
  billetera: z.string(),
  billeteraOtra: z.string().overwrite(normalizarEspacios),
  numeroBilletera: z.string(),
  esDeclarante: z.boolean(),
  obligadoFacturar: z.boolean(),
  responsableIva: z.boolean(),
})

type CamposPago = z.output<typeof camposPago>
export type CampoPago = keyof CamposPago
type Contexto = z.RefinementCtx<CamposPago>

function avisar(contexto: Contexto, campo: CampoPago, mensaje: string) {
  contexto.addIssue({ code: "custom", path: [campo], message: mensaje })
}

const esTipoDocumento = (valor: string): valor is TipoDocumentoIdentidad =>
  (TIPOS_DOCUMENTO_IDENTIDAD_BD as readonly string[]).includes(valor)

const esTipoCuenta = (valor: string): valor is TipoCuenta =>
  (TIPOS_CUENTA_BD as readonly string[]).includes(valor)

/** Mensaje del número escrito para su tipo, o `null` si sirve. */
export function problemaNumeroDocumento(
  tipo: TipoDocumentoIdentidad,
  texto: string
): string | null {
  if (!CARACTERES_DOCUMENTO.test(texto)) {
    return "Escribe solo números y letras (puedes separarlos con puntos o guiones)."
  }
  const numero = normalizarNumeroDocumento(texto)
  const regla = REGLAS_DOCUMENTO[tipo]
  if (!regla.patron.test(numero)) return regla.mensaje
  if (tipo === "NIT" && !nitValido(numero.slice(0, -1), numero.slice(-1))) {
    return "El dígito de verificación no corresponde al NIT. Revísalo en tu RUT."
  }
  return null
}

/** Solo dígitos, sin separadores (los de la cuenta o el celular). */
const digitos = (texto: string) => texto.replace(/[\s.\-]/g, "")

function validarDocumento(
  datos: CamposPago,
  contexto: Contexto,
  guardado: PagoGuardado
) {
  if (datos.titularNombre.length < LIMITES_PAGO.titularMin) {
    avisar(contexto, "titularNombre", "Escribe el nombre del titular.")
  } else if (datos.titularNombre.length > LIMITES_PAGO.titularMax) {
    avisar(
      contexto,
      "titularNombre",
      `Máximo ${LIMITES_PAGO.titularMax} caracteres.`
    )
  }
  if (!esTipoDocumento(datos.tipoDocumento)) {
    avisar(contexto, "tipoDocumento", "Elige el tipo de documento.")
    return
  }
  const conservar =
    datos.numeroDocumento.trim() === "" &&
    guardado.documentoRegistrado &&
    guardado.tipoDocumento === datos.tipoDocumento
  if (conservar) return
  if (datos.numeroDocumento.trim() === "") {
    avisar(
      contexto,
      "numeroDocumento",
      guardado.documentoRegistrado
        ? "Cambiaste el tipo de documento: escribe de nuevo el número."
        : "Escribe el número de documento."
    )
    return
  }
  const problema = problemaNumeroDocumento(
    datos.tipoDocumento,
    datos.numeroDocumento
  )
  if (problema) avisar(contexto, "numeroDocumento", problema)
}

function validarEntidad(
  contexto: Contexto,
  campo: "banco" | "billetera",
  campoOtra: "bancoOtro" | "billeteraOtra",
  elegida: string,
  otra: string,
  catalogo: readonly string[]
) {
  const nombre = campo === "banco" ? "el banco" : "la billetera"
  if (elegida === OTRA_ENTIDAD) {
    if (otra.length < LIMITES_PAGO.entidadMin) {
      avisar(contexto, campoOtra, `Escribe el nombre de ${nombre}.`)
    } else if (otra.length > LIMITES_PAGO.entidadMax) {
      avisar(contexto, campoOtra, `Máximo ${LIMITES_PAGO.entidadMax} caracteres.`)
    }
  } else if (!catalogo.includes(elegida)) {
    avisar(contexto, campo, `Elige ${nombre}.`)
  }
}

function validarNumeroCuenta(
  contexto: Contexto,
  campo: "numeroCuenta" | "numeroBilletera",
  texto: string
) {
  const numero = digitos(texto)
  if (numero === "") {
    avisar(
      contexto,
      campo,
      campo === "numeroCuenta"
        ? "Escribe el número de la cuenta."
        : "Escribe el celular de la billetera."
    )
  } else if (!/^\d+$/.test(numero)) {
    avisar(contexto, campo, "Escribe solo números.")
  } else if (campo === "numeroBilletera" && !/^3\d{9}$/.test(numero)) {
    avisar(
      contexto,
      campo,
      "Es el celular de la billetera: 10 dígitos que empiezan por 3."
    )
  } else if (
    numero.length < LIMITES_PAGO.cuentaMin ||
    numero.length > LIMITES_PAGO.cuentaMax
  ) {
    avisar(
      contexto,
      campo,
      `El número tiene entre ${LIMITES_PAGO.cuentaMin} y ${LIMITES_PAGO.cuentaMax} dígitos.`
    )
  }
}

/** La cuenta se escribe completa: nunca se combina con la guardada. */
export function escribeCuenta(
  datos: Pick<CamposPago, "cambiarCuenta">,
  guardado: PagoGuardado
): boolean {
  return datos.cambiarCuenta || !guardado.cuentaRegistrada
}

function validarCuenta(
  datos: CamposPago,
  contexto: Contexto,
  guardado: PagoGuardado
) {
  if (!escribeCuenta(datos, guardado)) return
  if (datos.metodoPago === "BANCARIO") {
    validarEntidad(
      contexto,
      "banco",
      "bancoOtro",
      datos.banco,
      datos.bancoOtro,
      BANCOS
    )
    if (!esTipoCuenta(datos.tipoCuenta)) {
      avisar(contexto, "tipoCuenta", "Elige si es de ahorros o corriente.")
    }
    validarNumeroCuenta(contexto, "numeroCuenta", datos.numeroCuenta)
  } else if (datos.metodoPago === "BILLETERA") {
    validarEntidad(
      contexto,
      "billetera",
      "billeteraOtra",
      datos.billetera,
      datos.billeteraOtra,
      BILLETERAS
    )
    validarNumeroCuenta(contexto, "numeroBilletera", datos.numeroBilletera)
  } else {
    avisar(contexto, "metodoPago", "Elige cómo quieres recibir tus pagos.")
  }
}

/** Datos ya resueltos: `null` en número o cuenta = conservar lo guardado. */
export interface DatosPagoMedio {
  titularNombre: string
  tipoDocumento: TipoDocumentoIdentidad
  /** Normalizado (solo dígitos y letras, en mayúsculas). */
  numeroDocumento: string | null
  cuenta: CuentaPago | null
  esDeclarante: boolean
  obligadoFacturar: boolean
  responsableIva: boolean
}

function entidad(elegida: string, otra: string): string {
  return elegida === OTRA_ENTIDAD ? otra : elegida
}

function resolverCuenta(datos: CamposPago): CuentaPago {
  return datos.metodoPago === "BANCARIO"
    ? {
        metodo: "BANCARIO",
        banco: entidad(datos.banco, datos.bancoOtro),
        tipoCuenta: datos.tipoCuenta as TipoCuenta,
        numero: digitos(datos.numeroCuenta),
      }
    : {
        metodo: "BILLETERA",
        proveedor: entidad(datos.billetera, datos.billeteraOtra),
        numero: digitos(datos.numeroBilletera),
      }
}

export function esquemaDatosPago(guardado: PagoGuardado = SIN_PAGO_GUARDADO) {
  return camposPago
    .superRefine((datos, contexto) => {
      validarDocumento(datos, contexto, guardado)
      validarCuenta(datos, contexto, guardado)
    })
    .transform(
      (datos): DatosPagoMedio => ({
        titularNombre: datos.titularNombre,
        tipoDocumento: datos.tipoDocumento as TipoDocumentoIdentidad,
        numeroDocumento:
          datos.numeroDocumento.trim() === ""
            ? null
            : normalizarNumeroDocumento(datos.numeroDocumento),
        cuenta: escribeCuenta(datos, guardado) ? resolverCuenta(datos) : null,
        esDeclarante: datos.esDeclarante,
        obligadoFacturar: datos.obligadoFacturar,
        responsableIva: datos.responsableIva,
      })
    )
}

export type EntradaDatosPago = z.input<ReturnType<typeof esquemaDatosPago>>

export const CAMPOS_PAGO = [
  "titularNombre",
  "tipoDocumento",
  "numeroDocumento",
  "metodoPago",
  "banco",
  "bancoOtro",
  "tipoCuenta",
  "numeroCuenta",
  "billetera",
  "billeteraOtra",
  "numeroBilletera",
] as const satisfies readonly CampoPago[]
