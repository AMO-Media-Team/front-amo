/**
 * Campos del formulario de métricas por plataforma, con los nombres de EP §9
 * (MED-014; módulo puro). Las columnas y las cifras obligatorias reflejan los
 * CHECK de `metricas`: Instagram y Facebook reportan alcance e impresiones
 * (sin espectadores únicos); TikTok, reproducciones y espectadores únicos
 * (sin alcance ni impresiones). Las demás cifras que el panel siempre muestra
 * se piden según el formato; las que no todos los paneles muestran son
 * opcionales.
 */
import type { TablesInsert } from "@/types/database.types"

import type { CampoMetrica, Plataforma, ValoresMetricas } from "./tipos"

export type TipoCifra = "entero" | "segundos" | "porcentaje"

export interface DefinicionCampo {
  clave: CampoMetrica
  /** Nombre de EP §9 en la plataforma («Reacciones» en Facebook). */
  etiqueta: string
  ayuda: string
  tipo: TipoCifra
  obligatorio: boolean
  /** Suma a las interacciones (me gusta + comentarios + compartidos + guardados). */
  interaccion: boolean
}

type ColumnaMetrica = keyof Pick<
  TablesInsert<"metricas">,
  | "alcance"
  | "impresiones"
  | "reproducciones"
  | "espectadores_unicos"
  | "me_gusta"
  | "comentarios"
  | "compartidos"
  | "guardados"
  | "clics_enlace"
  | "visitas_perfil"
  | "tiempo_promedio_visualizacion_s"
  | "porcentaje_reproduccion_completa"
>

/** Columna de `metricas` de cada campo. */
export const COLUMNAS_METRICAS: Readonly<Record<CampoMetrica, ColumnaMetrica>> =
  {
    alcance: "alcance",
    impresiones: "impresiones",
    reproducciones: "reproducciones",
    espectadoresUnicos: "espectadores_unicos",
    meGusta: "me_gusta",
    comentarios: "comentarios",
    compartidos: "compartidos",
    guardados: "guardados",
    clicsEnlace: "clics_enlace",
    visitasPerfil: "visitas_perfil",
    tiempoPromedioS: "tiempo_promedio_visualizacion_s",
    porcentajeCompleto: "porcentaje_reproduccion_completa",
  }

export const CAMPOS: readonly CampoMetrica[] = Object.keys(
  COLUMNAS_METRICAS
) as CampoMetrica[]

/** Las que suman a `interacciones` en la BD. */
export const CAMPOS_INTERACCION: readonly CampoMetrica[] = [
  "meGusta",
  "comentarios",
  "compartidos",
  "guardados",
]

export const VALORES_VACIOS: ValoresMetricas = Object.fromEntries(
  CAMPOS.map((campo) => [campo, null])
) as Record<CampoMetrica, null>

const AYUDA_CERO = "Si no tuvo ninguno, escribe 0."
const AYUDA_OPCIONAL = "Si tu panel no lo muestra, déjalo vacío."

function campo(
  clave: CampoMetrica,
  etiqueta: string,
  ayuda: string,
  {
    tipo = "entero",
    obligatorio = true,
  }: { tipo?: TipoCifra; obligatorio?: boolean } = {}
): DefinicionCampo {
  return {
    clave,
    etiqueta,
    ayuda,
    tipo,
    obligatorio,
    interaccion: CAMPOS_INTERACCION.includes(clave),
  }
}

/** Campos de EP §9 por plataforma, en el orden del panel nativo. */
export const CAMPOS_METRICAS: Readonly<
  Record<Plataforma, readonly DefinicionCampo[]>
> = {
  INSTAGRAM: [
    campo("alcance", "Alcance", "Cuentas distintas que vieron la publicación."),
    campo(
      "impresiones",
      "Impresiones",
      "Veces que se mostró, contando repeticiones. No puede ser menor que el alcance."
    ),
    campo(
      "reproducciones",
      "Reproducciones",
      "Veces que se reprodujo el reel."
    ),
    campo("meGusta", "Me gusta", AYUDA_CERO),
    campo("comentarios", "Comentarios", AYUDA_CERO),
    campo("guardados", "Guardados", AYUDA_CERO),
    campo("compartidos", "Compartidos", AYUDA_CERO),
    campo("visitasPerfil", "Visitas al perfil", AYUDA_OPCIONAL, {
      obligatorio: false,
    }),
    campo("clicsEnlace", "Clics en el enlace", AYUDA_OPCIONAL, {
      obligatorio: false,
    }),
  ],
  FACEBOOK: [
    campo(
      "alcance",
      "Alcance",
      "Personas distintas que vieron la publicación."
    ),
    campo(
      "impresiones",
      "Impresiones",
      "Veces que se mostró, contando repeticiones. No puede ser menor que el alcance."
    ),
    campo("meGusta", "Reacciones", `Todas las reacciones. ${AYUDA_CERO}`),
    campo("comentarios", "Comentarios", AYUDA_CERO),
    campo("compartidos", "Compartidos", AYUDA_CERO),
    campo("clicsEnlace", "Clics en el enlace", AYUDA_OPCIONAL, {
      obligatorio: false,
    }),
    campo(
      "reproducciones",
      "Reproducciones de video",
      "Veces que se reprodujo el video."
    ),
  ],
  TIKTOK: [
    campo(
      "reproducciones",
      "Reproducciones",
      "Veces que se vio el video. No puede ser menor que los espectadores únicos."
    ),
    campo(
      "espectadoresUnicos",
      "Espectadores únicos",
      "Personas distintas que vieron el video."
    ),
    campo("meGusta", "Me gusta", AYUDA_CERO),
    campo("comentarios", "Comentarios", AYUDA_CERO),
    campo("compartidos", "Compartidos", AYUDA_CERO),
    campo(
      "tiempoPromedioS",
      "Tiempo promedio de visualización",
      "En segundos, como lo muestra el panel (por ejemplo 12,5).",
      { tipo: "segundos" }
    ),
    campo(
      "porcentajeCompleto",
      "Reproducción completa",
      "Porcentaje de vistas que llegaron al final, de 0 a 100.",
      { tipo: "porcentaje" }
    ),
  ],
}

/** Formatos cuyo panel no muestra me gusta, comentarios ni guardados. */
const SIN_INTERACCIONES_FIJAS = new Set(["HISTORIA"])
/** Formatos de video en Facebook (piden reproducciones). */
const VIDEO_FACEBOOK = new Set(["VIDEO", "REEL"])

function ajustarAlFormato(
  plataforma: Plataforma,
  definicion: DefinicionCampo,
  formato: string | null
): DefinicionCampo | null {
  const { clave } = definicion
  if (plataforma === "INSTAGRAM" && clave === "reproducciones") {
    // Solo los reels reportan reproducciones; sin formato conocido, opcional.
    if (formato === null)
      return { ...definicion, ayuda: AYUDA_OPCIONAL, obligatorio: false }
    return formato === "REEL" ? definicion : null
  }
  if (plataforma === "FACEBOOK" && clave === "reproducciones") {
    return formato !== null && VIDEO_FACEBOOK.has(formato)
      ? definicion
      : { ...definicion, ayuda: AYUDA_OPCIONAL, obligatorio: false }
  }
  if (
    formato !== null &&
    SIN_INTERACCIONES_FIJAS.has(formato) &&
    (clave === "meGusta" || clave === "comentarios" || clave === "guardados")
  ) {
    return { ...definicion, ayuda: AYUDA_OPCIONAL, obligatorio: false }
  }
  return definicion
}

/** Los campos que se piden para la plataforma y el formato de la oferta. */
export function camposMetricas(
  plataforma: Plataforma,
  formato: string | null = null
): DefinicionCampo[] {
  return CAMPOS_METRICAS[plataforma]
    .map((definicion) => ajustarAlFormato(plataforma, definicion, formato))
    .filter((definicion): definicion is DefinicionCampo => definicion !== null)
}

/** Nombre de un campo en la plataforma (para los mensajes de coherencia). */
export function etiquetaCampo(
  plataforma: Plataforma,
  clave: CampoMetrica
): string {
  return (
    CAMPOS_METRICAS[plataforma].find((definicion) => definicion.clave === clave)
      ?.etiqueta ?? clave
  )
}

type FilaCifras = Partial<Record<ColumnaMetrica, number | string | null>>

function cifra(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null
  const numero = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}

/** Fila de `metricas` (los `numeric` llegan como texto) → valores del formulario. */
export function valoresDeFila(fila: FilaCifras): ValoresMetricas {
  return Object.fromEntries(
    CAMPOS.map((clave) => [clave, cifra(fila[COLUMNAS_METRICAS[clave]])])
  ) as Record<CampoMetrica, number | null>
}

/**
 * Valores → columnas de `metricas`, con `null` en lo que la plataforma no
 * reporta (el CHECK `metricas_campos_plataforma_chk` lo exige).
 */
export function filaDeValores(
  plataforma: Plataforma,
  valores: ValoresMetricas,
  formato: string | null = null
): Record<ColumnaMetrica, number | null> {
  const pedidos = new Set(
    camposMetricas(plataforma, formato).map((definicion) => definicion.clave)
  )
  return Object.fromEntries(
    CAMPOS.map((clave) => [
      COLUMNAS_METRICAS[clave],
      pedidos.has(clave) ? valores[clave] : null,
    ])
  ) as Record<ColumnaMetrica, number | null>
}
