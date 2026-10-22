"use client"

import { ImageIcon } from "lucide-react"

import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { esMimeConocido, extensionDeMime } from "@/lib/archivos/mime"
import { formatearFechaHora } from "@/lib/format"

import { firmarCaptura } from "../actions"
import type { VerificacionCuentaMedio } from "../tipos"
import { HojaCuenta } from "./hoja-cuenta"

/** «Captura de la verificación.webp»: el nombre con el que se ve y se descarga. */
export function nombreCaptura(tipo: string | null): string {
  const base = "Captura de la verificación"
  return tipo && esMimeConocido(tipo)
    ? `${base}.${extensionDeMime(tipo)}`
    : base
}

/**
 * La captura que el medio envió en una verificación, con URL firmada de
 * corta duración (se pide con su sesión: solo ve las de su medio).
 */
export function VisorCaptura({
  verificacion,
  abierta,
  onAbiertaChange,
  handle,
}: {
  /** La última que se pidió ver: se conserva mientras la hoja se cierra. */
  verificacion: VerificacionCuentaMedio | null
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  handle: string
}) {
  return (
    <HojaCuenta
      abierta={abierta && verificacion !== null}
      onAbiertaChange={onAbiertaChange}
      icono={<ImageIcon />}
      titulo="Captura enviada"
      descripcion={
        verificacion
          ? `${handle} · ${formatearFechaHora(verificacion.creadaAt)}`
          : undefined
      }
    >
      {verificacion ? (
        <VisorArchivoFirmado
          key={verificacion.id}
          firmar={() => firmarCaptura({ verificacionId: verificacion.id })}
          nombre={nombreCaptura(verificacion.capturaTipo)}
          tipo={verificacion.capturaTipo ?? undefined}
          descripcion={`Captura enviada para verificar ${handle}`}
        />
      ) : null}
    </HojaCuenta>
  )
}
