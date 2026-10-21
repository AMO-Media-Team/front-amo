/**
 * Edición en línea de un parámetro (módulo puro): el borrador que escribe la
 * persona según el tipo, su interpretación con el MISMO esquema zod que usa
 * la Server Action y los textos de ayuda (rango y valor por defecto).
 */
import { numeroAEntrada, textoANumero } from "./numeros"
import { esquemaValorParametro, type OpcionesValidacionValor } from "./schemas"
import type { ReglasParametro, ValorParametro } from "./tipos"
import {
  fraccionAPorcentaje,
  porcentajeAFraccion,
  presentarValor,
} from "./valores"

export type Borrador =
  | { tipo: "numero"; texto: string }
  | { tipo: "porcentaje"; texto: string }
  | { tipo: "booleano"; valor: boolean }
  | { tipo: "texto"; valor: string }
  | { tipo: "lista"; valores: string[] }
  | { tipo: "mapa"; textos: Record<string, string> }

export type ReglasConUnidad = ReglasParametro & { unidad: string | null }

function esNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor)
}

/** Borrador inicial a partir del valor guardado (o vacío si no es válido). */
export function borradorInicial(
  reglas: Pick<ReglasParametro, "tipo" | "opciones">,
  valor: ValorParametro | null
): Borrador {
  switch (reglas.tipo) {
    case "ENTERO":
    case "DECIMAL":
      return {
        tipo: "numero",
        texto: esNumero(valor) ? numeroAEntrada(valor) : "",
      }
    case "PORCENTAJE":
      return {
        tipo: "porcentaje",
        texto: esNumero(valor)
          ? numeroAEntrada(fraccionAPorcentaje(valor))
          : "",
      }
    case "BOOLEANO":
      return { tipo: "booleano", valor: valor === true }
    case "TEXTO":
      return { tipo: "texto", valor: typeof valor === "string" ? valor : "" }
    case "LISTA_TEXTO":
      return { tipo: "lista", valores: Array.isArray(valor) ? [...valor] : [] }
    case "MAPA_DECIMAL": {
      const mapa =
        valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {}
      const claves = reglas.opciones ?? Object.keys(mapa)
      return {
        tipo: "mapa",
        textos: Object.fromEntries(
          claves.map((clave) => [clave, numeroAEntrada(mapa[clave])])
        ),
      }
    }
  }
}

/** Borrador → valor JSON (sin validar todavía); `null` si una cifra no se entiende. */
function valorCrudo(borrador: Borrador): unknown {
  switch (borrador.tipo) {
    case "numero":
      return textoANumero(borrador.texto)
    case "porcentaje": {
      const numero = textoANumero(borrador.texto)
      return numero === null ? null : porcentajeAFraccion(numero)
    }
    case "booleano":
      return borrador.valor
    case "texto":
      return borrador.valor
    case "lista":
      return borrador.valores
    case "mapa": {
      const entradas = Object.entries(borrador.textos).map(
        ([clave, texto]) => [clave, textoANumero(texto)] as const
      )
      return entradas.some(([, numero]) => numero === null)
        ? null
        : Object.fromEntries(entradas)
    }
  }
}

const MENSAJE_CIFRA: Readonly<Record<Borrador["tipo"], string>> = {
  numero: "Escribe un número.",
  porcentaje: "Escribe un porcentaje.",
  booleano: "Elige una opción.",
  texto: "Elige una opción.",
  lista: "Elige al menos una opción.",
  mapa: "Escribe un número en cada plataforma.",
}

export type ResultadoBorrador =
  { ok: true; valor: ValorParametro } | { ok: false; error: string }

/** Valida el borrador con las reglas de la BD (mismo esquema que el servidor). */
export function interpretarBorrador(
  reglas: ReglasParametro,
  borrador: Borrador,
  opciones: OpcionesValidacionValor = {}
): ResultadoBorrador {
  const crudo = valorCrudo(borrador)
  if (crudo === null) return { ok: false, error: MENSAJE_CIFRA[borrador.tipo] }
  const resultado = esquemaValorParametro(reglas, opciones).safeParse(crudo)
  if (!resultado.success) {
    return {
      ok: false,
      error: resultado.error.issues[0]?.message ?? "Valor inválido.",
    }
  }
  return { ok: true, valor: resultado.data }
}

/** "Entre 1.000 y 1.000.000 seguidores" · "Entre 0% y 50%" · "Mínimo 1 h"; `null` sin rango. */
export function textoRango(
  reglas: Pick<ReglasConUnidad, "tipo" | "minimo" | "maximo" | "unidad">
): string | null {
  const numerico =
    reglas.tipo === "ENTERO" ||
    reglas.tipo === "DECIMAL" ||
    reglas.tipo === "PORCENTAJE" ||
    reglas.tipo === "MAPA_DECIMAL"
  if (!numerico) return null
  const tipo = reglas.tipo === "MAPA_DECIMAL" ? "DECIMAL" : reglas.tipo
  const texto = (n: number) =>
    presentarValor({ tipo, unidad: reglas.unidad }, n).texto
  const { minimo, maximo } = reglas
  const rango =
    minimo !== null && maximo !== null
      ? `entre ${soloCifra(texto(minimo), reglas.unidad)} y ${texto(maximo)}`
      : minimo !== null
        ? `mínimo ${texto(minimo)}`
        : maximo !== null
          ? `máximo ${texto(maximo)}`
          : null
  if (!rango) return null
  if (reglas.tipo === "MAPA_DECIMAL") return `Cada valor: ${rango}`
  return rango.charAt(0).toUpperCase() + rango.slice(1)
}

/** En "entre 7 y 365 días" la unidad va una sola vez, al final. */
function soloCifra(texto: string, unidad: string | null): string {
  if (!unidad || unidad === "COP" || unidad === "%" || unidad === "×") {
    return texto
  }
  const espacio = texto.lastIndexOf(" ")
  return espacio === -1 ? texto : texto.slice(0, espacio)
}

/** Sufijo o prefijo que acompaña al campo numérico. */
export function adornoUnidad(
  reglas: Pick<ReglasConUnidad, "tipo" | "unidad">
): { posicion: "inicio" | "fin"; texto: string } | null {
  if (reglas.tipo === "PORCENTAJE") return { posicion: "fin", texto: "%" }
  if (!reglas.unidad) return null
  if (reglas.unidad === "COP") return { posicion: "inicio", texto: "$" }
  // Un «×» al final de un campo se lee como «borrar»: el multiplicador se nombra.
  if (reglas.unidad === "×") return { posicion: "fin", texto: "veces" }
  return { posicion: "fin", texto: reglas.unidad }
}
