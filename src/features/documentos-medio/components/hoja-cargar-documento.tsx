"use client"

import {
  Check,
  FileText,
  RefreshCw,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react"
import Image from "next/image"
import { useId, useState } from "react"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { Button } from "@/components/ui/button"
import { SheetClose } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { formatearTamano } from "@/lib/archivos/formato"

import { AYUDA_FORMATOS, FICHAS_DOCUMENTO, REGLAS_SELECCION } from "../catalogo"
import type { Situacion } from "../situacion"
import type { TipoDocumentoMedio } from "../tipos"
import { AvisoPruebaVida, Nota, NotaRechazo } from "./avisos"
import { HojaDocumento } from "./hoja-documento"
import { ICONOS_DOCUMENTO } from "./iconos"
import type { CargaDocumento } from "./use-carga-documento"

/** Lo que cambia según lo que ya hay de este documento. */
function Contexto({ situacion }: { situacion: Situacion }) {
  switch (situacion.tipo) {
    case "rechazado":
      return <NotaRechazo observaciones={situacion.documento.observaciones} />
    case "vencido":
      return (
        <Nota tono="aviso" icono={TriangleAlert} titulo="Tu documento venció">
          Carga uno vigente para conservar tu nivel de verificación.
        </Nota>
      )
    case "aprobado":
      return (
        <Nota tono="info">
          Tu documento aprobado sigue valiendo mientras revisamos el nuevo.
        </Nota>
      )
    case "en-revision":
      return (
        <Nota tono="info">
          {situacion.vigente
            ? "Ya enviaste un reemplazo y lo estamos revisando; mientras tanto sigue valiendo el aprobado. Si te equivocaste de archivo, sube el correcto: revisaremos el más reciente."
            : "Ya enviaste este documento y lo estamos revisando. Si te equivocaste de archivo, sube el correcto: revisaremos el más reciente."}
        </Nota>
      )
    case "falta":
      return null
  }
}

function Consejos({ consejos }: { consejos: readonly string[] }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-sm font-semibold">
        Para que lo aprueben a la primera
      </h3>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {consejos.map((consejo) => (
          <li key={consejo} className="flex gap-2 text-pretty">
            <Check
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-success"
            />
            {consejo}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** El archivo elegido, para revisarlo antes de subirlo. */
function ArchivoElegido({
  archivo,
  vistaPrevia,
  descripcion,
}: {
  archivo: File
  vistaPrevia: string | null
  descripcion: string
}) {
  const [sinVista, setSinVista] = useState(false)
  const conImagen = vistaPrevia !== null && !sinVista
  return (
    <figure className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-2">
      {conImagen ? (
        <div className="relative h-56 w-full overflow-hidden rounded-lg bg-muted sm:h-64">
          <Image
            src={vistaPrevia}
            alt={descripcion}
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

export interface HojaCargarDocumentoProps {
  tipo: TipoDocumentoMedio
  situacion: Situacion
  carga: CargaDocumento
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
}

/**
 * Cargar o reemplazar un documento: contexto (motivo del rechazo, vigencia),
 * consejos, elección con cámara o archivo, revisión de lo elegido y subida
 * con progreso, pausa sin conexión y reintentos. Cerrar la hoja no detiene
 * una subida en curso: la tarjeta sigue mostrando su avance.
 */
export function HojaCargarDocumento({
  tipo,
  situacion,
  carga,
  abierta,
  onAbiertaChange,
}: HojaCargarDocumentoProps) {
  const ficha = FICHAS_DOCUMENTO[tipo]
  const { subida, elegido, vistaPrevia, elemento } = carga
  const enCurso = subida.activa
  const pendienteDeSubir = elegido !== null && subida.estado === "en-cola"

  function cambiarAbierta(valor: boolean) {
    // Lo elegido y no subido se suelta al cerrar; una subida en curso o fallida
    // se conserva y la tarjeta la muestra.
    if (!valor && pendienteDeSubir) carga.descartar()
    onAbiertaChange(valor)
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
      <Button type="button" size="lg" onClick={() => void carga.subir()}>
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
      icono={ICONOS_DOCUMENTO[tipo]}
      titulo={ficha.titulo}
      descripcion={ficha.descripcion}
      pie={pie}
    >
      <div className="flex flex-col gap-5">
        <Contexto situacion={situacion} />
        {ficha.biometrico ? <AvisoPruebaVida /> : null}
        <Consejos consejos={ficha.consejos} />
        {elegido ? (
          <ArchivoElegido
            archivo={elegido}
            vistaPrevia={vistaPrevia}
            descripcion={`Vista previa de ${ficha.titulo.toLowerCase()}`}
          />
        ) : (
          <ZonaArchivos
            reglas={REGLAS_SELECCION}
            onArchivos={([archivo]) => {
              if (archivo) carga.elegir(archivo)
            }}
            capture={ficha.camara}
            // En pantallas con mouse la zona agrega «: arrástralo aquí o elígelo».
            titulo={
              ficha.camara === "user"
                ? "Sube el archivo de tu selfie"
                : "Sube una foto o el PDF del documento"
            }
            descripcion={AYUDA_FORMATOS}
          />
        )}
        {elemento ? (
          <ListaSubidas
            elementos={[elemento]}
            etiqueta={`Subida de ${ficha.titulo.toLowerCase()}`}
            onReintentar={() => void carga.reintentar()}
            onCancelar={() => subida.cancelar()}
            onQuitar={() => carga.descartar()}
          />
        ) : null}
        {pendienteDeSubir ? (
          <p className="text-xs text-pretty text-muted-foreground">
            Revisa que se lea bien antes de subirlo.
            {ficha.biometrico
              ? " Al subirla autorizas que AMO la use solo para verificar tu identidad (Ley 1581 de 2012)."
              : null}
          </p>
        ) : null}
        {enCurso ? (
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Spinner role={undefined} aria-hidden className="size-3.5" />
            Puedes cerrar esta ventana: la subida sigue y te avisamos al
            terminar.
          </p>
        ) : null}
      </div>
    </HojaDocumento>
  )
}
