/**
 * Valores iniciales de los formularios de Configuración (módulo puro): cada
 * DTO se convierte a lo que la persona ve escrito en los campos (cifras es-CO,
 * porcentajes de 0 a 100, fin de vigencia como último día incluido). El
 * servidor aplica el MISMO esquema zod a estos textos.
 */
import { serializarFecha } from "@/lib/fechas"

import { numeroAEntrada } from "./numeros"
import type {
  EntradaElementoCatalogo,
  EntradaExcepcion,
  EntradaFormato,
  EntradaFranja,
  EntradaNivel,
  EntradaParametrosAnio,
  EntradaPlantilla,
  EntradaProgramarTarifa,
  EntradaPublicarTerminos,
  EntradaResolucion,
  EntradaRetencion,
  EntradaReteica,
  EntradaVersionTerminos,
} from "./schemas"
import type {
  ElementoCatalogo,
  ExcepcionComision,
  Formato,
  Franja,
  NivelVerificacion,
  NombreCatalogo,
  ParametrosAnio,
  Plantilla,
  Plataforma,
  ResolucionDian,
  Retencion,
  ReteicaMunicipal,
  TipoTerminos,
  VersionTerminos,
} from "./tipos"
import { fraccionAPorcentaje, redondear } from "./valores"
import { diaAnterior, hoyBogota, ultimoDiaIncluido } from "./vigencias"

/** Porcentaje con hasta 4 decimales (tarifas de retención con 6 decimales de fracción). */
function porcentajePreciso(fraccion: number): string {
  return numeroAEntrada(redondear(fraccion * 100, 4))
}

function siguienteOrden(elementos: readonly { orden: number }[]): number {
  return elementos.reduce((maximo, e) => Math.max(maximo, e.orden), 0) + 1
}

// ── Precios ─────────────────────────────────────────────────────────────────

/** Primera clave F1…F9 libre; `null` si ya se usaron todas. */
export function siguienteClaveFranja(
  franjas: readonly Pick<Franja, "clave">[]
): string | null {
  const usadas = new Set(franjas.map((f) => f.clave))
  for (let digito = 1; digito <= 9; digito++) {
    if (!usadas.has(`F${digito}`)) return `F${digito}`
  }
  return null
}

export function valoresFranja(
  franja: Franja | null,
  franjas: readonly Franja[]
): EntradaFranja {
  if (franja) {
    return {
      id: franja.id,
      clave: franja.clave,
      nombre: franja.nombre,
      seguidoresMin: numeroAEntrada(franja.seguidoresMin),
      seguidoresMax: numeroAEntrada(franja.seguidoresMax),
      orden: String(franja.orden),
      activa: franja.activa,
      actualizadoAt: franja.actualizadoAt,
    }
  }
  // Una franja nueva arranca donde termina la más alta con límite.
  const techo = franjas
    .filter((f) => f.activa && f.seguidoresMax !== null)
    .reduce((maximo, f) => Math.max(maximo, f.seguidoresMax ?? 0), -1)
  return {
    id: null,
    clave: siguienteClaveFranja(franjas) ?? "",
    nombre: "",
    seguidoresMin: techo >= 0 ? numeroAEntrada(techo + 1) : "",
    seguidoresMax: "",
    orden: String(siguienteOrden(franjas)),
    activa: true,
    actualizadoAt: null,
  }
}

export function valoresFormato(
  formato: Formato | null,
  formatos: readonly Formato[],
  plataforma: Plataforma = "INSTAGRAM"
): EntradaFormato {
  if (formato) {
    return {
      id: formato.id,
      plataforma: formato.plataforma,
      clave: formato.clave as EntradaFormato["clave"],
      nombre: formato.nombre,
      activo: formato.activo,
      orden: String(formato.orden),
      relacionesAspecto: [...formato.requisitos.relacionesAspecto],
      mime: [...formato.requisitos.mime],
      duracionMaxS: numeroAEntrada(formato.requisitos.duracionMaxS),
      pesoMaxMb: numeroAEntrada(formato.requisitos.pesoMaxMb),
      maxArchivos: numeroAEntrada(formato.requisitos.maxArchivos),
      actualizadoAt: formato.actualizadoAt,
    }
  }
  return {
    id: null,
    plataforma,
    clave: "POST_FEED",
    nombre: "",
    activo: true,
    orden: String(siguienteOrden(formatos)),
    relacionesAspecto: [],
    mime: [],
    duracionMaxS: "",
    pesoMaxMb: "50",
    maxArchivos: "",
    actualizadoAt: null,
  }
}

export function valoresProgramarTarifa(
  formatoId: string,
  franjaId: string,
  inicio: EntradaProgramarTarifa["inicio"] = "manana"
): EntradaProgramarTarifa {
  return { formatoId, franjaId, valor: "", inicio, dia: "", hora: "00:00" }
}

// ── Comercial ───────────────────────────────────────────────────────────────

export function valoresExcepcion(
  excepcion: ExcepcionComision | null,
  ahora: Date = new Date()
): EntradaExcepcion {
  if (!excepcion) {
    return {
      id: null,
      objetivo: "anunciante",
      objetivoId: "",
      porcentaje: "",
      desdeAhora: true,
      desde: hoyBogota(ahora),
      hasta: "",
      motivo: "",
      actualizadoAt: null,
    }
  }
  return {
    id: excepcion.id,
    objetivo: excepcion.objetivo.tipo,
    objetivoId: excepcion.objetivo.id,
    porcentaje: numeroAEntrada(fraccionAPorcentaje(excepcion.porcentaje)),
    desdeAhora: false,
    desde: serializarFecha(new Date(excepcion.vigenteDesde)),
    hasta: excepcion.vigenteHasta
      ? ultimoDiaIncluido(excepcion.vigenteHasta)
      : "",
    motivo: excepcion.motivo,
    actualizadoAt: excepcion.actualizadoAt,
  }
}

// ── Medios ──────────────────────────────────────────────────────────────────

export function valoresNivel(nivel: NivelVerificacion): EntradaNivel {
  return {
    nivel: nivel.nivel,
    nombre: nivel.nombre,
    requisitos: nivel.requisitos.join("\n"),
    documentosRequeridos: [...nivel.documentosRequeridos],
    sinTope: nivel.topeAnual === null,
    topeAnual: numeroAEntrada(nivel.topeAnual),
    porcentajeAlerta: numeroAEntrada(
      fraccionAPorcentaje(nivel.porcentajeAlerta)
    ),
    porcentajeBloqueo: numeroAEntrada(
      fraccionAPorcentaje(nivel.porcentajeBloqueo)
    ),
    pendienteValidacion: nivel.pendienteValidacion,
    actualizadoAt: nivel.actualizadoAt,
  }
}

// ── Tributario ──────────────────────────────────────────────────────────────

/** Año siguiente al más reciente registrado (o el actual si no hay ninguno). */
export function anioSugerido(
  anios: readonly Pick<ParametrosAnio, "anio">[],
  ahora: Date = new Date()
): number {
  const actual = Number(hoyBogota(ahora).slice(0, 4))
  const ultimo = anios.reduce((maximo, a) => Math.max(maximo, a.anio), 0)
  return ultimo > 0 ? ultimo + 1 : actual
}

export function valoresParametrosAnio(
  parametros: ParametrosAnio | null,
  anios: readonly ParametrosAnio[],
  ahora: Date = new Date()
): EntradaParametrosAnio {
  if (parametros) {
    return {
      nuevo: false,
      anio: String(parametros.anio),
      uvt: numeroAEntrada(parametros.uvt),
      smlmv: numeroAEntrada(parametros.smlmv),
      umbralSegSocialSmlmv: numeroAEntrada(parametros.umbralSegSocialSmlmv),
      pendienteValidacion: parametros.pendienteValidacion,
      actualizadoAt: parametros.actualizadoAt,
    }
  }
  return {
    nuevo: true,
    anio: String(anioSugerido(anios, ahora)),
    uvt: "",
    smlmv: "",
    umbralSegSocialSmlmv: "1",
    pendienteValidacion: true,
    actualizadoAt: null,
  }
}

export function valoresRetencion(
  retencion: Retencion | null,
  ahora: Date = new Date()
): EntradaRetencion {
  if (!retencion) {
    return {
      id: null,
      tipo: "RETEFUENTE",
      concepto: "SERVICIOS",
      aplicaDeclarante: true,
      tarifa: "",
      baseMinimaUvt: "0",
      desde: hoyBogota(ahora),
      hasta: "",
      pendienteValidacion: true,
      actualizadoAt: null,
    }
  }
  return {
    id: retencion.id,
    tipo: retencion.tipo,
    concepto: retencion.concepto as EntradaRetencion["concepto"],
    aplicaDeclarante: retencion.aplicaDeclarante,
    tarifa: porcentajePreciso(retencion.tarifa),
    baseMinimaUvt: numeroAEntrada(retencion.baseMinimaUvt),
    desde: retencion.vigenteDesde,
    hasta: retencion.vigenteHasta
      ? (diaAnterior(retencion.vigenteHasta) ?? "")
      : "",
    pendienteValidacion: retencion.pendienteValidacion,
    actualizadoAt: retencion.actualizadoAt,
  }
}

export function valoresReteica(
  reteica: ReteicaMunicipal | null,
  ahora: Date = new Date()
): EntradaReteica {
  if (!reteica) {
    return {
      id: null,
      municipioCodigo: "",
      tarifaPorMil: "",
      baseMinimaUvt: "0",
      desde: hoyBogota(ahora),
      hasta: "",
      pendienteValidacion: true,
      actualizadoAt: null,
    }
  }
  return {
    id: reteica.id,
    municipioCodigo: reteica.municipioCodigo,
    tarifaPorMil: numeroAEntrada(reteica.tarifaPorMil),
    baseMinimaUvt: numeroAEntrada(reteica.baseMinimaUvt),
    desde: reteica.vigenteDesde,
    hasta: reteica.vigenteHasta
      ? (diaAnterior(reteica.vigenteHasta) ?? "")
      : "",
    pendienteValidacion: reteica.pendienteValidacion,
    actualizadoAt: reteica.actualizadoAt,
  }
}

export function valoresResolucion(
  resolucion: ResolucionDian | null,
  ahora: Date = new Date()
): EntradaResolucion {
  if (!resolucion) {
    const hoy = hoyBogota(ahora)
    return {
      id: null,
      tipo: "FACTURA_VENTA",
      prefijo: "",
      numeroResolucion: "",
      fechaResolucion: hoy,
      rangoDesde: "1",
      rangoHasta: "",
      vigenteDesde: hoy,
      vigenteHasta: "",
      activa: true,
      actualizadoAt: null,
    }
  }
  return {
    id: resolucion.id,
    tipo: resolucion.tipo,
    prefijo: resolucion.prefijo,
    numeroResolucion: resolucion.numeroResolucion,
    fechaResolucion: resolucion.fechaResolucion,
    rangoDesde: numeroAEntrada(resolucion.rangoDesde),
    rangoHasta: numeroAEntrada(resolucion.rangoHasta),
    vigenteDesde: resolucion.vigenteDesde,
    vigenteHasta: resolucion.vigenteHasta ?? "",
    activa: resolucion.activa,
    actualizadoAt: resolucion.actualizadoAt,
  }
}

// ── Catálogos ───────────────────────────────────────────────────────────────

export function valoresElementoCatalogo(
  catalogo: NombreCatalogo,
  elemento: ElementoCatalogo | null,
  elementos: readonly ElementoCatalogo[]
): EntradaElementoCatalogo {
  return {
    catalogo,
    id: elemento?.id ?? null,
    nombre: elemento?.nombre ?? "",
    descripcion: elemento?.descripcion ?? "",
    orden: String(elemento?.orden ?? siguienteOrden(elementos)),
    activo: elemento?.activo ?? true,
    actualizadoAt: elemento?.actualizadoAt ?? null,
  }
}

// ── Legal y plantillas ──────────────────────────────────────────────────────

export function valoresVersionTerminos(
  tipo: TipoTerminos,
  version: Pick<VersionTerminos, "id" | "version" | "actualizadoAt"> | null,
  contenido: string,
  versionSugerida: string
): EntradaVersionTerminos {
  return {
    id: version?.id ?? null,
    tipo,
    version: version?.version ?? versionSugerida,
    contenido,
    actualizadoAt: version?.actualizadoAt ?? null,
  }
}

export function valoresPublicarTerminos(
  version: Pick<VersionTerminos, "id" | "actualizadoAt">
): EntradaPublicarTerminos {
  return {
    id: version.id,
    inmediata: true,
    dia: "",
    hora: "00:00",
    confirmacion: "",
    actualizadoAt: version.actualizadoAt,
  }
}

export function valoresPlantilla(plantilla: Plantilla): EntradaPlantilla {
  return {
    clave: plantilla.clave,
    canal: plantilla.canal,
    nombre: plantilla.nombre,
    asunto: plantilla.asunto ?? "",
    cuerpo: plantilla.cuerpo,
    activa: plantilla.activa,
    actualizadoAt: plantilla.actualizadoAt,
  }
}
