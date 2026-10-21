/**
 * Datos `_privado` que se pueden revelar desde las fichas (módulo puro): qué
 * campos forman cada grupo y cómo se presentan. Cada revelado es una llamada
 * a `revelar_privado_srv`, que exige `datos_sensibles.ver` y deja
 * `REVELAR_DATO` en la bitácora con los campos pedidos. Los valores cifrados
 * (documento y datos de pago completos) nunca se piden: solo sus resúmenes.
 */
import { METODOS_PAGO, TIPOS_DOCUMENTO_IDENTIDAD } from "./estados"

type Entidad = "medio" | "anunciante"
type Grupo = "contacto" | "pago"

interface DefinicionCampo {
  campo: string
  etiqueta: string
  /** Texto legible de un valor de enum. */
  catalogo?: Readonly<Record<string, string>>
  booleano?: boolean
}

interface DefinicionGrupo {
  tabla: "medios_privado" | "anunciantes_privado"
  titulo: string
  campos: readonly DefinicionCampo[]
}

export const GRUPOS_PRIVADOS: Readonly<
  Record<Entidad, Partial<Record<Grupo, DefinicionGrupo>>>
> = {
  medio: {
    contacto: {
      tabla: "medios_privado",
      titulo: "Datos de contacto",
      campos: [
        { campo: "titular_nombre", etiqueta: "Titular" },
        { campo: "celular", etiqueta: "Celular" },
        { campo: "email_contacto", etiqueta: "Correo de contacto" },
        { campo: "direccion", etiqueta: "Dirección" },
      ],
    },
    pago: {
      tabla: "medios_privado",
      titulo: "Datos tributarios y de pago",
      campos: [
        {
          campo: "tipo_documento",
          etiqueta: "Tipo de documento",
          catalogo: TIPOS_DOCUMENTO_IDENTIDAD,
        },
        { campo: "numero_documento_resumen", etiqueta: "Documento" },
        {
          campo: "metodo_pago",
          etiqueta: "Método de pago",
          catalogo: METODOS_PAGO,
        },
        { campo: "datos_pago_resumen", etiqueta: "Cuenta de pago" },
        {
          campo: "es_declarante",
          etiqueta: "Declarante de renta",
          booleano: true,
        },
        {
          campo: "obligado_facturar",
          etiqueta: "Obligado a facturar",
          booleano: true,
        },
        {
          campo: "responsable_iva",
          etiqueta: "Responsable de IVA",
          booleano: true,
        },
      ],
    },
  },
  anunciante: {
    contacto: {
      tabla: "anunciantes_privado",
      titulo: "Datos de contacto",
      campos: [
        { campo: "contacto_nombre", etiqueta: "Persona de contacto" },
        { campo: "contacto_email", etiqueta: "Correo" },
        { campo: "contacto_celular", etiqueta: "Celular" },
        { campo: "direccion", etiqueta: "Dirección" },
      ],
    },
  },
}

export function grupoPrivado(
  entidad: Entidad,
  grupo: Grupo
): DefinicionGrupo | null {
  return GRUPOS_PRIVADOS[entidad][grupo] ?? null
}

export interface DatoRevelado {
  etiqueta: string
  /** `null` = el medio o anunciante no lo ha registrado. */
  valor: string | null
}

function presentarValor(
  definicion: DefinicionCampo,
  valor: unknown
): string | null {
  if (valor === null || valor === undefined || valor === "") return null
  if (definicion.booleano) return valor === true ? "Sí" : "No"
  const texto = String(valor)
  return definicion.catalogo?.[texto] ?? texto
}

/** Respuesta de `revelar_privado_srv` (jsonb o `null` sin fila) → pares legibles. */
export function presentarRevelados(
  definicion: DefinicionGrupo,
  respuesta: unknown
): DatoRevelado[] {
  const valores =
    respuesta && typeof respuesta === "object" && !Array.isArray(respuesta)
      ? (respuesta as Record<string, unknown>)
      : {}
  return definicion.campos.map((campo) => ({
    etiqueta: campo.etiqueta,
    valor: presentarValor(campo, valores[campo.campo]),
  }))
}
