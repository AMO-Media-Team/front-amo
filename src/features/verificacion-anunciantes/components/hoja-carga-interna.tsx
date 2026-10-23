"use client"

import { FileText, FileUp, RefreshCw, Upload, X } from "lucide-react"
import Image from "next/image"
import { useId, useState } from "react"
import { toast } from "sonner"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SheetClose } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { FICHAS_DOCUMENTO_ANUNCIANTE } from "@/features/documentos-anunciante/catalogo"
import { HojaDocumento } from "@/features/documentos-medio/components/hoja-documento"
import { formatearTamano } from "@/lib/archivos/formato"

import { enFraseDocumento, tituloDocumento } from "../presentacion"
import { AYUDA_FORMATOS, REGLAS_SELECCION } from "../reglas"
import { ORDEN_TIPOS, type TipoDocumentoAnunciante } from "../requisitos"
import type { CargaInterna } from "./use-carga-interna"

/** El archivo elegido, para revisarlo antes de subirlo. */
function ArchivoElegido({
  archivo,
  vistaPrevia,
}: {
  archivo: File
  vistaPrevia: string | null
}) {
  const [sinVista, setSinVista] = useState(false)
  const conImagen = vistaPrevia !== null && !sinVista
  return (
    <figure className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-2">
      {conImagen ? (
        <div className="relative h-56 w-full overflow-hidden rounded-lg bg-muted sm:h-64">
          <Image
            src={vistaPrevia}
            alt={`Vista previa de ${archivo.name}`}
            fill
            unoptimized
            sizes="(min-width: 640px) 32rem, 100vw"
            onError={() => setSinVista(true)}
            className="object-contain"
          />
        </div>
      ) : (
        <div className="grid h-28 place-items-center rounded-lg bg-muted text-muted-foreground">
          <FileText aria-hidden className="size-8" />
        </div>
      )}
      <figcaption className="flex items-baseline justify-between gap-2 px-1 text-sm">
        <span className="truncate font-medium" title={archivo.name}>
          {archivo.name}
        </span>
        <span className="shrink-0 text-xs cifras text-muted-foreground">
          {formatearTamano(archivo.size)}
        </span>
      </figcaption>
    </figure>
  )
}

function SelectorTipo({
  valor,
  onCambiar,
  deshabilitado,
}: {
  valor: TipoDocumentoAnunciante
  onCambiar: (tipo: TipoDocumentoAnunciante) => void
  deshabilitado: boolean
}) {
  const id = useId()
  return (
    <FieldSet>
      <FieldLegend id={`${id}-leyenda`} variant="label">
        Tipo de documento
      </FieldLegend>
      <RadioGroup
        aria-labelledby={`${id}-leyenda`}
        value={valor}
        onValueChange={(nuevo) => {
          const tipo = ORDEN_TIPOS.find((opcion) => opcion === nuevo)
          if (tipo) onCambiar(tipo)
        }}
        disabled={deshabilitado}
        className="gap-2"
      >
        {ORDEN_TIPOS.map((tipo) => (
          <FieldLabel key={tipo} htmlFor={`${id}-${tipo}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{tituloDocumento(tipo)}</FieldTitle>
                <FieldDescription>
                  {FICHAS_DOCUMENTO_ANUNCIANTE[tipo].descripcion}
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem value={tipo} id={`${id}-${tipo}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}

export interface HojaCargaInternaProps {
  empresa: string
  tipo: TipoDocumentoAnunciante
  onTipo: (tipo: TipoDocumentoAnunciante) => void
  carga: CargaInterna
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
}

/**
 * Carga de un documento por cuenta de la empresa (equipo AMO con
 * `anunciantes.editar`): tipo, archivo (PDF o foto, que se reduce sola),
 * revisión de lo elegido y subida con progreso y reintentos. Queda por
 * revisar como cualquier carga de la empresa; la bitácora dice quién la hizo.
 * Mientras sube, la hoja no se cierra (ofrece cancelar).
 */
export function HojaCargaInterna({
  empresa,
  tipo,
  onTipo,
  carga,
  abierta,
  onAbiertaChange,
}: HojaCargaInternaProps) {
  const { subida, elegido, vistaPrevia, elemento } = carga
  const enCurso = subida.activa
  const pendienteDeSubir = elegido !== null && subida.estado === "en-cola"
  const titulo = tituloDocumento(tipo)

  function cambiarAbierta(valor: boolean) {
    if (!valor && enCurso) return
    // Lo elegido y no subido (o fallido) se suelta al cerrar.
    if (!valor) carga.descartar()
    onAbiertaChange(valor)
  }

  async function subir() {
    const documento = await carga.subir()
    if (!documento) return
    toast.success("Documento cargado", {
      description: `${titulo} de ${empresa}: queda por revisar.`,
    })
    onAbiertaChange(false)
  }

  async function reintentar() {
    const documento = await carga.reintentar()
    if (!documento) return
    toast.success("Documento cargado", {
      description: `${titulo} de ${empresa}: queda por revisar.`,
    })
    onAbiertaChange(false)
  }

  const pie = enCurso ? (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={() => subida.cancelar()}
    >
      <X data-icon="inline-start" aria-hidden />
      Cancelar subida
    </Button>
  ) : pendienteDeSubir ? (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => carga.descartar()}
      >
        <RefreshCw data-icon="inline-start" aria-hidden />
        Elegir otro
      </Button>
      <Button type="button" size="lg" onClick={() => void subir()}>
        <Upload data-icon="inline-start" aria-hidden />
        Subir documento
      </Button>
    </>
  ) : (
    <SheetClose render={<Button type="button" variant="outline" size="lg" />}>
      Cerrar
    </SheetClose>
  )

  return (
    <HojaDocumento
      abierta={abierta}
      onAbiertaChange={cambiarAbierta}
      icono={FileUp}
      titulo="Cargar documento"
      descripcion={`Por cuenta de ${empresa}. Queda por revisar como cualquier carga suya; la bitácora registra que lo cargaste tú.`}
      pie={pie}
    >
      <div className="flex flex-col gap-5">
        <SelectorTipo valor={tipo} onCambiar={onTipo} deshabilitado={enCurso} />
        {elegido ? (
          <ArchivoElegido archivo={elegido} vistaPrevia={vistaPrevia} />
        ) : (
          <ZonaArchivos
            reglas={REGLAS_SELECCION}
            onArchivos={([archivo]) => {
              if (archivo) carga.elegir(archivo)
            }}
            capture="environment"
            titulo="Sube el PDF o una foto del documento"
            descripcion={AYUDA_FORMATOS}
          />
        )}
        {elemento ? (
          <ListaSubidas
            elementos={[elemento]}
            etiqueta={`Subida de ${enFraseDocumento(tipo)}`}
            onReintentar={() => void reintentar()}
            onCancelar={() => subida.cancelar()}
            onQuitar={() => carga.descartar()}
          />
        ) : null}
        {pendienteDeSubir ? (
          <p className="text-xs text-pretty text-muted-foreground">
            Revisa que el archivo sea de {empresa} y que se lea bien antes de
            subirlo.
          </p>
        ) : null}
        {enCurso ? (
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Spinner role={undefined} aria-hidden className="size-3.5" />
            Subiendo el documento… no cierres esta ventana hasta que termine.
          </p>
        ) : null}
      </div>
    </HojaDocumento>
  )
}
