"use client"

import { ImageIcon, Trash2 } from "lucide-react"
import { useCallback, useEffect, useId, useState } from "react"
import { toast } from "sonner"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { useSubida } from "@/components/archivos/use-subida"
import type { ElementoSubida } from "@/components/archivos/use-subidas"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { iniciales } from "@/components/layout/iniciales"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { comprimirImagen } from "@/lib/archivos/compresion"
import { mimeDeArchivo } from "@/lib/archivos/mime"

import { confirmarLogo, prepararSubidaLogo, quitarLogo } from "../actions"
import {
  AYUDA_LOGO,
  COMPRESION_LOGO,
  elegirLogoFinal,
  REGLAS_LOGO,
  REGLAS_SELECCION_LOGO,
} from "../logo"

/** Reduce el logo sin perder la transparencia de un PNG (ver `elegirLogoFinal`). */
async function prepararLogo(archivo: File): Promise<File> {
  return elegirLogoFinal(
    archivo,
    await comprimirImagen(archivo, COMPRESION_LOGO)
  )
}

interface Eleccion {
  archivo: File
  /** `blob:` local para la miniatura de la fila de subida. */
  vistaPrevia: string
}

/**
 * Logo de la empresa: vista previa (o sus iniciales), subida directa a
 * Storage con progreso, reintentos y pausa sin conexión, y «Quitar». Lo ven
 * los medios en las ofertas y el equipo AMO en la ficha.
 */
export function LogoEmpresa({
  nombre,
  logoUrl,
  tieneLogo,
}: {
  nombre: string
  /** URL firmada de corta duración; `null` sin logo (o si no se pudo firmar). */
  logoUrl: string | null
  tieneLogo: boolean
}) {
  const idTitulo = useId()
  const subida = useSubida<void>({
    preparar: (descripcion) => prepararSubidaLogo(descripcion),
    confirmar: (archivo) => confirmarLogo(archivo),
    comprimir: prepararLogo,
    reglas: REGLAS_LOGO,
  })
  const { subir, reiniciar, reintentar, cancelar } = subida
  const [eleccion, setEleccion] = useState<Eleccion | null>(null)

  // La miniatura local se libera al cambiar de archivo y al salir de la página.
  useEffect(() => {
    const url = eleccion?.vistaPrevia
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [eleccion])

  const terminar = useCallback(
    (resultado: { ok: boolean } | null) => {
      if (!resultado?.ok) return
      reiniciar()
      setEleccion(null)
      toast.success("Logo actualizado", {
        description: "Así lo verán los medios en tus ofertas.",
      })
    },
    [reiniciar]
  )

  const elegir = useCallback(
    async (archivo: File) => {
      setEleccion({ archivo, vistaPrevia: URL.createObjectURL(archivo) })
      terminar(await subir(archivo))
    },
    [subir, terminar]
  )

  const descartar = useCallback(() => {
    reiniciar()
    setEleccion(null)
  }, [reiniciar])

  const enCurso = subida.activa
  const elementos: ElementoSubida[] =
    eleccion && subida.estado !== "en-cola"
      ? [
          {
            id: "logo",
            nombre: eleccion.archivo.name,
            tamano: eleccion.archivo.size,
            tipo: mimeDeArchivo(eleccion.archivo),
            vistaPrevia: eleccion.vistaPrevia,
            resultado: null,
            estado: subida.estado,
            progreso: subida.progreso,
            error: subida.error,
            intento: subida.intento,
            reanudaEn: subida.reanudaEn,
          },
        ]
      : []

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-xs sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"
        >
          <ImageIcon className="size-[1.125rem]" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id={idTitulo}
            className="font-heading text-base leading-snug font-semibold"
          >
            Logo
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Lo ven los medios en tus ofertas. Si no subes uno, mostramos tus
            iniciales.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Avatar className="size-20 shrink-0 rounded-2xl ring-1 ring-border after:rounded-2xl">
          {logoUrl ? (
            <AvatarImage
              src={logoUrl}
              alt={`Logo de ${nombre}`}
              className="rounded-2xl bg-white object-contain p-1"
            />
          ) : null}
          <AvatarFallback className="rounded-2xl bg-primary/12 font-heading text-xl font-semibold text-lila-700 dark:text-primary">
            <span aria-hidden>{iniciales(nombre)}</span>
            <span className="sr-only">
              {tieneLogo ? `Logo de ${nombre}` : `${nombre} aún no tiene logo`}
            </span>
          </AvatarFallback>
        </Avatar>
        {tieneLogo ? (
          <DialogoConfirmacion
            titulo="¿Quitar el logo?"
            descripcion="Tus ofertas mostrarán las iniciales de tu empresa hasta que subas otro."
            textoConfirmar="Quitar logo"
            destructivo
            disparador={
              <Button type="button" variant="outline" disabled={enCurso}>
                <Trash2 data-icon="inline-start" aria-hidden />
                Quitar logo
              </Button>
            }
            onConfirmar={async () => {
              const resultado = await quitarLogo()
              if (resultado.ok) toast.success("Logo quitado")
              return resultado
            }}
          />
        ) : null}
      </div>

      <ZonaArchivos
        compacta
        reglas={REGLAS_SELECCION_LOGO}
        deshabilitada={enCurso}
        titulo={tieneLogo ? "Cambia el logo" : "Sube el logo"}
        descripcion={AYUDA_LOGO}
        onArchivos={([archivo]) => {
          if (archivo) void elegir(archivo)
        }}
      />
      <ListaSubidas
        elementos={elementos}
        etiqueta="Subida del logo"
        onReintentar={() => {
          void reintentar().then(terminar)
        }}
        onCancelar={() => cancelar()}
        onQuitar={descartar}
      />
    </section>
  )
}
