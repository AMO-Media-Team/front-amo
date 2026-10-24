"use client"

import { Download, FileJson, FileSpreadsheet } from "lucide-react"
import { unstable_rethrow } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { SeccionCuenta } from "@/features/cuenta/components/seccion-cuenta"

import { descargarMisDatos } from "../actions"
import {
  descargarDatosTitular,
  type FormatoDatos,
  NOMBRES_FORMATO,
} from "./descarga-datos"

const ICONOS = { json: FileJson, xlsx: FileSpreadsheet } as const

/**
 * «Descargar mis datos» (consulta, Ley 1581 art. 14): el servidor reúne con
 * la sesión lo que AMO trata del titular (`datos_titular`, sin valores
 * cifrados; queda en la bitácora) y el navegador arma el JSON o el Excel.
 */
export function DescargarMisDatos({ nombre }: { nombre: string }) {
  const [pendiente, iniciar] = useTransition()
  const [formato, setFormato] = useState<FormatoDatos | null>(null)

  function descargar(elegido: FormatoDatos) {
    setFormato(elegido)
    iniciar(async () => {
      const aviso = toast.loading(
        `Preparando tus datos en ${NOMBRES_FORMATO[elegido]}…`
      )
      try {
        const resultado = await descargarMisDatos()
        if (!resultado.ok) {
          toast.error(resultado.error, { id: aviso })
          return
        }
        const listo = await descargarDatosTitular(resultado.datos, elegido, {
          titular: nombre,
        })
        if (listo) {
          toast.success("Descargamos tus datos", {
            id: aviso,
            description: "Revisa la carpeta de descargas de tu dispositivo.",
          })
        } else {
          toast.error("No pudimos armar el Excel. Descarga el JSON.", {
            id: aviso,
          })
        }
      } catch (error) {
        toast.dismiss(aviso)
        unstable_rethrow(error)
        toast.error("No pudimos conectar con el servidor", {
          description: "Revisa tu conexión e intenta de nuevo.",
        })
      } finally {
        setFormato(null)
      }
    })
  }

  return (
    <SeccionCuenta
      id="descargar-datos"
      titulo="Descargar mis datos"
      icono={Download}
      descripcion="Una copia de tus datos personales en AMO: cuenta, organización, autorizaciones, ingresos, actividad y solicitudes."
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-pretty text-muted-foreground">
          La cuenta de pago y el documento llegan resumidos (por ejemplo, ••••
          2345): AMO no entrega valores cifrados. Cada descarga queda en la
          bitácora de auditoría.
        </p>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {(["xlsx", "json"] as const).map((opcion) => {
            const Icono = ICONOS[opcion]
            const cargando = pendiente && formato === opcion
            return (
              <Button
                key={opcion}
                type="button"
                variant={opcion === "xlsx" ? "default" : "outline"}
                size="lg"
                disabled={pendiente}
                aria-busy={cargando || undefined}
                onClick={() => descargar(opcion)}
                className="w-full sm:w-auto"
              >
                {cargando ? (
                  <Spinner
                    role={undefined}
                    aria-hidden
                    data-icon="inline-start"
                  />
                ) : (
                  <Icono data-icon="inline-start" aria-hidden />
                )}
                Descargar en {NOMBRES_FORMATO[opcion]}
              </Button>
            )
          })}
        </div>
      </div>
    </SeccionCuenta>
  )
}
