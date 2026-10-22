/**
 * Presentación de la cola de solicitudes de vinculación (módulo puro): estados,
 * lectura defensiva de las cuentas declaradas, medios con el mismo nombre y
 * enlaces de contacto.
 */
import type { Route } from "next"

import type { PresentacionEstado } from "@/features/operacion/estados"
import { contar, normalizarBusqueda } from "@/features/operacion/formato"
import { formatearCompacto } from "@/lib/format"
import type { Json } from "@/types/database.types"

import {
  MAXIMO_CUENTAS,
  PLATAFORMAS_CUENTA,
  type PlataformaCuenta,
} from "./cuentas"
import type {
  CuentaDeclarada,
  EstadoSolicitud,
  MedioCoincidente,
} from "./tipos"

/** Ruta de la cola (contrato con el resolvedor `/ir` y el paquete de verificación). */
export const RUTA_COLA_SOLICITUDES =
  "/operacion/verificacion?cola=solicitudes" as Route

/** Ruta pública del formulario. */
export const RUTA_FORMULARIO = "/vincular" as Route

export const ESTADOS_SOLICITUD: Readonly<
  Record<EstadoSolicitud, PresentacionEstado>
> = {
  PENDIENTE: {
    etiqueta: "Por atender",
    tono: "aviso",
    descripcion: "Espera que el equipo AMO la revise.",
  },
  INVITADA: {
    etiqueta: "Invitada",
    tono: "exito",
    descripcion: "Se registró el medio y se invitó a la persona de contacto.",
  },
  DESCARTADA: {
    etiqueta: "Descartada",
    tono: "neutro",
    descripcion: "No siguió adelante; el motivo queda en la bitácora.",
  },
}

function esPlataforma(valor: unknown): valor is PlataformaCuenta {
  return (
    typeof valor === "string" &&
    (PLATAFORMAS_CUENTA as readonly string[]).includes(valor)
  )
}

/**
 * Cuentas de la columna `cuentas` (jsonb). La BD ya las valida al insertar;
 * aun así se leen con cuidado: lo que no tenga forma de cuenta se omite.
 */
export function leerCuentasDeclaradas(valor: Json): CuentaDeclarada[] {
  if (!Array.isArray(valor)) return []
  return valor.slice(0, MAXIMO_CUENTAS).flatMap((elemento) => {
    if (!elemento || typeof elemento !== "object" || Array.isArray(elemento)) {
      return []
    }
    const { plataforma, usuario, seguidores } = elemento
    if (!esPlataforma(plataforma) || typeof usuario !== "string" || !usuario) {
      return []
    }
    return [
      {
        plataforma,
        usuario,
        seguidores:
          typeof seguidores === "number" && Number.isFinite(seguidores)
            ? seguidores
            : null,
      },
    ]
  })
}

/** «45 mil seguidores», «Seguidores sin declarar». */
export function textoSeguidores(seguidores: number | null): string {
  if (seguidores === null) return "Seguidores sin declarar"
  return `${formatearCompacto(seguidores)} ${seguidores === 1 ? "seguidor" : "seguidores"}`
}

export interface FilaMedio {
  id: string
  nombre: string
  estado: MedioCoincidente["estado"]
  municipioCodigo: string
  municipio: string
  creadoAt: string
}

/**
 * Medios ya registrados con el mismo nombre que la solicitud (normalizado
 * como `nombre_normalizado` en la BD). Primero los del mismo municipio; un
 * medio del mismo municipio registrado después de recibirla salió de ella
 * (p. ej. un intento de invitación que no terminó).
 */
export function coincidenciasDeMedio(
  solicitud: {
    nombreMedio: string
    municipioCodigo: string
    recibidaAt: string
  },
  medios: readonly FilaMedio[]
): MedioCoincidente[] {
  const nombre = normalizarBusqueda(solicitud.nombreMedio)
  const recibida = Date.parse(solicitud.recibidaAt)
  return medios
    .filter((medio) => normalizarBusqueda(medio.nombre) === nombre)
    .map((medio) => {
      const mismoMunicipio = medio.municipioCodigo === solicitud.municipioCodigo
      return {
        id: medio.id,
        nombre: medio.nombre,
        estado: medio.estado,
        municipioCodigo: medio.municipioCodigo,
        municipio: medio.municipio,
        desdeSolicitud:
          mismoMunicipio && Date.parse(medio.creadoAt) >= recibida,
      }
    })
    .sort(
      (a, b) =>
        Number(b.desdeSolicitud) - Number(a.desdeSolicitud) ||
        Number(b.municipioCodigo === solicitud.municipioCodigo) -
          Number(a.municipioCodigo === solicitud.municipioCodigo) ||
        a.municipio.localeCompare(b.municipio, "es-CO") ||
        a.id.localeCompare(b.id)
    )
}

/** El medio que ya salió de esta solicitud: se propone para no registrarlo dos veces. */
export function medioYaRegistrado(
  coincidencias: readonly MedioCoincidente[]
): MedioCoincidente | null {
  return coincidencias.find((medio) => medio.desdeSolicitud) ?? null
}

/** Dígitos del celular con indicativo (57 si es un celular colombiano de 10 dígitos). */
function digitosInternacionales(celular: string): string | null {
  const digitos = celular.replace(/\D/g, "")
  if (celular.trim().startsWith("+"))
    return digitos.length >= 8 ? digitos : null
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`
  if (/^573\d{9}$/.test(digitos)) return digitos
  return null
}

/** Enlace de WhatsApp (`https://wa.me/573001234567`) o `null` si el número no lo permite. */
export function enlaceWhatsapp(celular: string | null): string | null {
  const digitos = celular ? digitosInternacionales(celular) : null
  return digitos ? `https://wa.me/${digitos}` : null
}

/** `tel:+573001234567` (o los dígitos tal cual si no tiene indicativo reconocible). */
export function enlaceTelefono(celular: string): string {
  const internacional = digitosInternacionales(celular)
  return internacional
    ? `tel:+${internacional}`
    : `tel:${celular.replace(/[^\d+]/g, "")}`
}

/** «Sin solicitudes por atender», «1 solicitud por atender», «12 solicitudes por atender». */
export function resumenPendientes(total: number): string {
  return total <= 0
    ? "Sin solicitudes por atender"
    : contar(total, "solicitud por atender", "solicitudes por atender")
}
