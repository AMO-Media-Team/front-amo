/**
 * Esquemas zod de la evidencia y las métricas: los MISMOS en el formulario
 * (cliente, con `zodResolver`) y en las Server Actions. Las reglas que
 * dependen de la oferta (plataforma, formato, ventana, cortes ya cargados,
 * tolerancia) se agregan con `conReglasEvidencia` y `conReglasMetricas`: el
 * navegador las arma con lo que pintó la página y el servidor con lo que lee
 * de la BD antes de escribir, que vuelve a validarlo todo (triggers, CHECK,
 * RLS). Módulo puro.
 */
import { z } from "zod"

import { combinarFechaHora } from "@/features/asistente-oferta/instantes"
import {
  cantidadDecimales,
  textoANumero,
} from "@/features/configuracion/numeros"
import { BUCKETS } from "@/lib/archivos/buckets"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import { MIB } from "@/lib/archivos/formato"
import type { ReglasArchivo } from "@/lib/archivos/validar"
import { formatearFecha, formatearFechaHora } from "@/lib/format"
import { validarUrlPost } from "@/lib/redes/url-post"
import { Constants } from "@/types/database.types"

import { camposMetricas, VALORES_VACIOS } from "./campos-metricas"
import { validarCoherencia } from "./coherencia"
import { disponibleDesde, esCorteFijo } from "./cortes"
import { limitesFechaPublicacion, MARGEN_RELOJ_MS } from "./evidencia"
import { diaDe, periodoPersonalizado } from "./metricas"
import type {
  CampoMetrica,
  Corte,
  CorteComparable,
  Plataforma,
  ValoresMetricas,
} from "./tipos"

// ── Capturas ─────────────────────────────────────────────────────────────────

/** Capturas de pantalla: imágenes (la BD exige `image/*` en `evidencias`). */
export const MIMES_CAPTURA = ["image/jpeg", "image/png", "image/webp"] as const

export const LIMITES_CAPTURA: LimitesArchivo = {
  mimes: MIMES_CAPTURA,
  maxBytes: BUCKETS.evidencias.maxBytes,
}

/** Lo que el motor de subida exige al archivo final (ya comprimido). */
export const REGLAS_CAPTURA: ReglasArchivo = LIMITES_CAPTURA

/**
 * Al elegir: una captura o foto del celular puede pesar más de 10 MB (o ser
 * HEIC) y se reduce a WebP en el dispositivo antes de subirla; el límite real
 * se aplica después de comprimir.
 */
export const REGLAS_SELECCION_CAPTURA: ReglasArchivo = {
  mimes: [...MIMES_CAPTURA, "image/heic"],
  maxBytes: 40 * MIB,
}

export const TIPOS_CAPTURA = ["publicacion", "metrica"] as const
export type TipoCaptura = (typeof TIPOS_CAPTURA)[number]

const id = z.uuid({ error: "Identificador inválido." })
const tipoCaptura = z.enum(TIPOS_CAPTURA)
const captura = esquemaArchivoSubido(LIMITES_CAPTURA)

export const esquemaPrepararCaptura = z.object({
  asignacionId: id,
  tipo: tipoCaptura,
  descripcion: esquemaDescripcionArchivo(LIMITES_CAPTURA),
})
export type EntradaPrepararCaptura = z.input<typeof esquemaPrepararCaptura>

export const esquemaConfirmarCaptura = z.object({
  asignacionId: id,
  tipo: tipoCaptura,
  captura,
})
export type EntradaConfirmarCaptura = z.input<typeof esquemaConfirmarCaptura>

export const esquemaFirmarPublicacion = z.object({
  publicacionId: id,
  miniatura: z.boolean(),
})
export type EntradaFirmarPublicacion = z.input<typeof esquemaFirmarPublicacion>

export const esquemaFirmarMetrica = z.object({
  metricaId: id,
  miniatura: z.boolean(),
})
export type EntradaFirmarMetrica = z.input<typeof esquemaFirmarMetrica>

// ── Piezas comunes ───────────────────────────────────────────────────────────

const numero = z
  .number({ error: "Elige la publicación." })
  .int()
  .min(1, "Elige la publicación.")
  .max(10, "Elige la publicación.")
/** 'YYYY-MM-DD' en Bogotá ('' sin elegir). */
const dia = z.string().trim().max(10, "Elige el día en el calendario.")
/** 'HH:mm' de 24 horas ('' sin escribir). */
const hora = z.string().trim().max(5, "Escribe la hora como 15:30.")

type Contexto = z.RefinementCtx

function problema(contexto: Contexto, campo: string, mensaje: string): void {
  contexto.addIssue({ code: "custom", path: [campo], message: mensaje })
}

/**
 * Día y hora de Bogotá → instante, o el problema en su campo. `null` si
 * falta o no es válido (el problema ya quedó anotado).
 */
function instanteDe(
  contexto: Contexto,
  valores: { dia: string; hora: string },
  mensajes: { dia: string; hora: string }
): Date | null {
  if (!valores.dia) {
    problema(contexto, "dia", mensajes.dia)
    return null
  }
  const iso = combinarFechaHora(valores.dia, valores.hora)
  if (!iso) {
    problema(
      contexto,
      /^\d{4}-\d{2}-\d{2}$/.test(valores.dia) ? "hora" : "dia",
      /^\d{4}-\d{2}-\d{2}$/.test(valores.dia) ? mensajes.hora : mensajes.dia
    )
    return null
  }
  return new Date(iso)
}

// ── Evidencia de publicación (MED-013, INT-002) ──────────────────────────────

export const esquemaEvidencia = z.object({
  asignacionId: id,
  numero,
  url: z.string().trim().max(2000, "El enlace es demasiado largo."),
  dia,
  hora,
  etiquetaConfirmada: z.boolean(),
})
export type ValoresEvidencia = z.input<typeof esquemaEvidencia>

/** Con la captura ya subida, o `null` para conservar la que se envió antes. */
export const esquemaRegistrarEvidencia = esquemaEvidencia.extend({
  captura: captura.nullable(),
})
export type EntradaRegistrarEvidencia = z.input<
  typeof esquemaRegistrarEvidencia
>

export const CAMPOS_EVIDENCIA = [
  "url",
  "dia",
  "hora",
  "etiquetaConfirmada",
] as const

export interface ReglasEvidencia {
  plataforma: Plataforma
  /** Clave del formato de la oferta (`REEL`…), para el ejemplo y el aviso. */
  formato: string | null
  /** Usuario de la cuenta de la campaña (sin `@`): el enlace no puede nombrar otra. */
  cuenta: string | null
  ventanaInicio: string
  ventanaFin: string
  /** Primera descarga del contenido: no pudo publicar antes. */
  contenidoDescargadoAt: string | null
  ahora: Date
}

/** Instante de publicación ya validado (o `null` si el día o la hora no sirven). */
export function fechaPublicacionDe(valores: {
  dia: string
  hora: string
}): string | null {
  return combinarFechaHora(valores.dia, valores.hora)
}

/**
 * Reglas de la oferta sobre la evidencia: el enlace es de una publicación de
 * su red (`publicaciones_url_chk`) y no nombra otra cuenta, la fecha cae en la
 * ventana, no antes de descargar el contenido (al minuto) ni en el futuro (con
 * el desfase de reloj que admite la BD) y la etiqueta de publicidad está
 * confirmada. La BD no exige la descarga (las pruebas simulan publicaciones
 * pasadas): la autoridad es la Server Action, único camino del medio a
 * `registrar_evidencia_srv`.
 */
export function conReglasEvidencia<
  T extends z.ZodType<{
    url: string
    dia: string
    hora: string
    etiquetaConfirmada: boolean
  }>,
>(esquema: T, reglas: ReglasEvidencia) {
  return esquema.superRefine((valores, contexto) => {
    const enlace = validarUrlPost(
      reglas.plataforma,
      valores.url,
      reglas.formato,
      reglas.cuenta
    )
    if (!enlace.ok) problema(contexto, "url", enlace.mensaje)

    const instante = instanteDe(contexto, valores, {
      dia: "Elige el día en que publicaste.",
      hora: "Escribe la hora en que publicaste, como 15:30.",
    })
    if (instante) {
      const limites = limitesFechaPublicacion(
        reglas,
        reglas.ahora,
        MARGEN_RELOJ_MS
      )
      const fin = new Date(reglas.ventanaFin)
      if (instante < limites.minimo) {
        // El mismo día, lo que sobra es la hora.
        const campo =
          diaDe(instante.toISOString()) === diaDe(limites.minimo.toISOString())
            ? "hora"
            : "dia"
        const desde = formatearFechaHora(limites.minimo)
        problema(
          contexto,
          campo,
          limites.desdeDescarga
            ? `La publicación no puede ser anterior a la descarga del contenido (${desde}).`
            : `La oferta permite publicar desde el ${desde}.`
        )
      } else if (instante > fin) {
        problema(
          contexto,
          "dia",
          `La oferta permitía publicar hasta el ${formatearFechaHora(fin)}.`
        )
      } else if (instante > limites.maximo) {
        problema(
          contexto,
          "hora",
          "La hora de publicación no puede estar en el futuro."
        )
      }
    }

    if (!valores.etiquetaConfirmada) {
      problema(
        contexto,
        "etiquetaConfirmada",
        "Confirma que tu publicación lleva la etiqueta de publicidad."
      )
    }
  })
}

// ── Métricas por corte (MED-014, INT-001, INT-005) ───────────────────────────

const cifra = z.string().trim().max(30, "Revisa la cifra.")

export const esquemaMetricas = z.object({
  asignacionId: id,
  numero,
  corte: z.enum(Constants.public.Enums.corte_metrica),
  /** El personalizado que se corrige (`null`: uno nuevo, o un corte fijo). */
  metricaId: id.nullable(),
  /** Día y hora de la captura (`fecha_corte`). */
  dia,
  hora,
  /** Días del periodo personalizado ('' en los cortes fijos). */
  periodoDesde: dia,
  periodoHasta: dia,
  alcance: cifra,
  impresiones: cifra,
  reproducciones: cifra,
  espectadoresUnicos: cifra,
  meGusta: cifra,
  comentarios: cifra,
  compartidos: cifra,
  guardados: cifra,
  clicsEnlace: cifra,
  visitasPerfil: cifra,
  tiempoPromedioS: cifra,
  porcentajeCompleto: cifra,
})
export type ValoresFormularioMetricas = z.input<typeof esquemaMetricas>

/** Con la captura ya subida, o `null` para conservar la del corte que se corrige. */
export const esquemaGuardarMetricas = esquemaMetricas.extend({
  captura: captura.nullable(),
})
export type EntradaGuardarMetricas = z.input<typeof esquemaGuardarMetricas>

export const CAMPOS_FORMULARIO_METRICAS = [
  "dia",
  "hora",
  "periodoDesde",
  "periodoHasta",
  "interacciones",
  "alcance",
  "impresiones",
  "reproducciones",
  "espectadoresUnicos",
  "meGusta",
  "comentarios",
  "compartidos",
  "guardados",
  "clicsEnlace",
  "visitasPerfil",
  "tiempoPromedioS",
  "porcentajeCompleto",
] as const

export interface ReglasMetricas {
  plataforma: Plataforma
  formato: string | null
  corte: Corte
  fechaPublicacion: string
  /** Los demás cortes de la publicación (sin el que se corrige). */
  otros: readonly CorteComparable[]
  tolerancia: number
  ahora: Date
}

/** `numeric(8,2)` y `numeric(5,2)`. */
const MAXIMOS = { segundos: 999_999.99, porcentaje: 100 } as const

export interface LecturaCifras {
  valores: ValoresMetricas
  problemas: { campo: CampoMetrica; mensaje: string }[]
}

/**
 * Las cifras escritas (es-CO: «1.250», «12,5») de los campos que pide la
 * plataforma y el formato; lo que no pide queda en `null`.
 */
export function leerCifras(
  textos: Readonly<Record<CampoMetrica, string>>,
  plataforma: Plataforma,
  formato: string | null
): LecturaCifras {
  const valores: Record<CampoMetrica, number | null> = { ...VALORES_VACIOS }
  const problemas: LecturaCifras["problemas"] = []
  for (const definicion of camposMetricas(plataforma, formato)) {
    const { clave, tipo, obligatorio, interaccion } = definicion
    const texto = textos[clave].trim()
    if (texto === "") {
      if (obligatorio) {
        problemas.push({
          campo: clave,
          mensaje: interaccion
            ? "Escribe la cifra del panel. Si no tuvo ninguno, escribe 0."
            : "Escribe la cifra que muestra el panel.",
        })
      }
      continue
    }
    const numeroLeido = textoANumero(texto)
    const mensaje =
      numeroLeido === null
        ? "Escribe solo la cifra, sin letras (por ejemplo 1.250)."
        : numeroLeido < 0
          ? "La cifra no puede ser negativa."
          : tipo === "entero" && !Number.isInteger(numeroLeido)
            ? "Escribe la cifra completa, sin decimales ni abreviaturas (1.250, no 1,2 mil)."
            : tipo === "entero" && numeroLeido > Number.MAX_SAFE_INTEGER
              ? "La cifra es demasiado grande."
              : tipo !== "entero" && cantidadDecimales(numeroLeido) > 2
                ? "Usa máximo dos decimales."
                : tipo === "porcentaje" && numeroLeido > MAXIMOS.porcentaje
                  ? "El porcentaje va de 0 a 100."
                  : tipo === "segundos" && numeroLeido > MAXIMOS.segundos
                    ? "La cifra es demasiado grande."
                    : null
    if (mensaje) problemas.push({ campo: clave, mensaje })
    else valores[clave] = numeroLeido
  }
  return { valores, problemas }
}

/** Lo que se guarda en la fila, ya validado. */
export interface DatosMetricas {
  fechaCorte: string
  periodoDesde: string | null
  periodoHasta: string | null
  valores: ValoresMetricas
}

/** Textos de las cifras de un formulario de métricas. */
export function textosCifras(
  valores: Readonly<Record<CampoMetrica, string>>
): Record<CampoMetrica, string> {
  return {
    alcance: valores.alcance,
    impresiones: valores.impresiones,
    reproducciones: valores.reproducciones,
    espectadoresUnicos: valores.espectadoresUnicos,
    meGusta: valores.meGusta,
    comentarios: valores.comentarios,
    compartidos: valores.compartidos,
    guardados: valores.guardados,
    clicsEnlace: valores.clicsEnlace,
    visitasPerfil: valores.visitasPerfil,
    tiempoPromedioS: valores.tiempoPromedioS,
    porcentajeCompleto: valores.porcentajeCompleto,
  }
}

function validarPeriodo(
  contexto: Contexto | null,
  valores: { periodoDesde: string; periodoHasta: string },
  fechaCorte: string,
  fechaPublicacion: string
): { desde: string; hasta: string } | null {
  const anotar = (campo: string, mensaje: string) => {
    if (contexto) problema(contexto, campo, mensaje)
  }
  const { periodoDesde, periodoHasta } = valores
  if (!periodoDesde) anotar("periodoDesde", "Elige el primer día del periodo.")
  if (!periodoHasta) anotar("periodoHasta", "Elige el último día del periodo.")
  const periodo = periodoPersonalizado(periodoDesde, periodoHasta, fechaCorte)
  if (!periodo) return null
  const diaPublicacion = diaDe(fechaPublicacion)
  let valido = true
  if (periodoDesde < diaPublicacion) {
    valido = false
    anotar(
      "periodoDesde",
      `El periodo empieza, como pronto, el día de la publicación (${formatearFecha(fechaPublicacion)}).`
    )
  }
  if (periodoHasta < periodoDesde) {
    valido = false
    anotar("periodoHasta", "El último día no puede ser anterior al primero.")
  } else if (periodoHasta > diaDe(fechaCorte)) {
    valido = false
    anotar(
      "periodoHasta",
      "El periodo no puede terminar después del día de la captura."
    )
  } else if (periodo.hasta <= periodo.desde) {
    valido = false
    anotar("periodoHasta", "El periodo debe terminar después de empezar.")
  }
  return valido ? periodo : null
}

/**
 * Reglas de la oferta sobre un corte: las cifras que pide su plataforma, la
 * fecha de la captura (cumplido el corte, nunca en el futuro), el periodo del
 * personalizado y la coherencia con los demás cortes (INT-005). Bloqueantes:
 * son las mismas que hacen fallar a la BD.
 */
export function conReglasMetricas<
  T extends z.ZodType<z.output<typeof esquemaMetricas>>,
>(esquema: T, reglas: ReglasMetricas) {
  return esquema.superRefine((valores, contexto) => {
    const { valores: cifras, problemas } = leerCifras(
      textosCifras(valores),
      reglas.plataforma,
      reglas.formato
    )
    for (const { campo, mensaje } of problemas) {
      problema(contexto, campo, mensaje)
    }

    const instante = instanteDe(contexto, valores, {
      dia: "Elige el día de la captura.",
      hora: "Escribe la hora de la captura, como 15:30.",
    })
    if (instante) {
      const desde = disponibleDesde(reglas.fechaPublicacion, reglas.corte)
      if (instante.getTime() > reglas.ahora.getTime() + MARGEN_RELOJ_MS) {
        problema(
          contexto,
          "hora",
          "La fecha de la captura no puede estar en el futuro."
        )
      } else if (desde && instante < desde) {
        problema(
          contexto,
          "hora",
          `Este corte se cumple el ${formatearFechaHora(desde)}: la captura debe ser de ese momento o después.`
        )
      }
      if (!esCorteFijo(reglas.corte)) {
        validarPeriodo(
          contexto,
          valores,
          instante.toISOString(),
          reglas.fechaPublicacion
        )
      }
    }

    if (problemas.length > 0) return
    for (const { campo, mensaje } of validarCoherencia({
      plataforma: reglas.plataforma,
      corte: reglas.corte,
      valores: cifras,
      otros: reglas.otros,
      tolerancia: reglas.tolerancia,
    })) {
      problema(contexto, campo, mensaje)
    }
  })
}

/**
 * Lo que se guarda a partir de valores que YA pasaron `conReglasMetricas`
 * (fechas e intervalo calculados igual que al validar).
 */
export function datosMetricas(
  valores: z.output<typeof esquemaMetricas>,
  reglas: Pick<ReglasMetricas, "plataforma" | "formato" | "fechaPublicacion">
): DatosMetricas | null {
  const fechaCorte = combinarFechaHora(valores.dia, valores.hora)
  if (!fechaCorte) return null
  const { valores: cifras } = leerCifras(
    textosCifras(valores),
    reglas.plataforma,
    reglas.formato
  )
  if (esCorteFijo(valores.corte)) {
    return {
      fechaCorte,
      periodoDesde: null,
      periodoHasta: null,
      valores: cifras,
    }
  }
  const periodo = validarPeriodo(
    null,
    valores,
    fechaCorte,
    reglas.fechaPublicacion
  )
  return periodo
    ? {
        fechaCorte,
        periodoDesde: periodo.desde,
        periodoHasta: periodo.hasta,
        valores: cifras,
      }
    : null
}
