"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { type ReactNode, useCallback, useId, useMemo, useState } from "react"

import { useGuardiaSalida } from "@/components/asistente/use-guardia-salida"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"

import {
  documentosExigidos,
  documentosOpcionales,
  ORDEN_DOCUMENTOS_ANUNCIANTE,
  PAIS_COLOMBIA,
  type TipoDocumentoAnunciante,
} from "../catalogo"
import {
  requisitosDocumentales,
  resumirDocumentos,
  situacionDeTipo,
  situacionesPorTipo,
  tiposOpcionales,
} from "../situacion"
import type { DatosDocumentosAnunciante } from "../tipos"
import {
  NotaPrivacidadEmpresa,
  ResumenDocumentosAnunciante,
} from "./resumen-documentos"
import { TarjetaDocumentoAnunciante } from "./tarjeta-documento"

/** Tipos con una subida en curso (salir de la página la cancelaría). */
function useSubidasActivas() {
  const [activas, setActivas] = useState<ReadonlySet<TipoDocumentoAnunciante>>(
    () => new Set()
  )
  const alCambiar = useCallback(
    (tipo: TipoDocumentoAnunciante, activa: boolean) => {
      setActivas((previas) => {
        if (previas.has(tipo) === activa) return previas
        const siguientes = new Set(previas)
        if (activa) siguientes.add(tipo)
        else siguientes.delete(tipo)
        return siguientes
      })
    },
    []
  )
  return { hay: activas.size > 0, alCambiar }
}

function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string
  descripcion?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-base font-semibold">
          {titulo}
        </h2>
        {descripcion ? (
          <p className="text-sm text-pretty text-muted-foreground">
            {descripcion}
          </p>
        ) : null}
      </div>
      <ul className="flex flex-col gap-3">{children}</ul>
    </section>
  )
}

function enOrden(
  tipos: readonly TipoDocumentoAnunciante[]
): TipoDocumentoAnunciante[] {
  return ORDEN_DOCUMENTOS_ANUNCIANTE.filter((tipo) => tipos.includes(tipo))
}

/**
 * «Mi empresa › Documentos»: avance de lo que exige la verificación, una
 * tarjeta por documento exigido (en Colombia, RUT y Cámara de Comercio; en el
 * exterior, basta uno de los de existencia) y, aparte, los opcionales. Todo se
 * calcula aquí con lo que ya trajo la página; `siguiente` (qué sigue: enviar a
 * verificación, en revisión…) lo arma la página.
 */
export function PanelDocumentosAnunciante({
  datos,
  siguiente,
}: {
  datos: DatosDocumentosAnunciante
  siguiente?: ReactNode
}) {
  const router = useRouter()
  const { empresa, documentos, hoy } = datos
  const subidas = useSubidasActivas()
  const [salida, setSalida] = useState<string | null>(null)

  useGuardiaSalida(subidas.hay, setSalida)

  const cambioIdentificacion = empresa.identificacionCambiadaAt
  const situaciones = useMemo(
    () => situacionesPorTipo(documentos, hoy, cambioIdentificacion),
    [documentos, hoy, cambioIdentificacion]
  )
  const { todos, alguno } = documentosExigidos(empresa.pais)
  const exigidos = enOrden([...todos, ...alguno])
  const opcionales = enOrden(
    tiposOpcionales(exigidos, documentosOpcionales(empresa.pais), documentos)
  )
  const resumen = resumirDocumentos(
    requisitosDocumentales(empresa.pais, situaciones)
  )
  const colombiana = empresa.pais === PAIS_COLOMBIA

  const tarjeta = (tipo: TipoDocumentoAnunciante, exigido: boolean) => (
    <TarjetaDocumentoAnunciante
      key={tipo}
      tipo={tipo}
      pais={empresa.pais}
      situacion={situacionDeTipo(situaciones, tipo)}
      exigido={exigido}
      onActividad={subidas.alCambiar}
    />
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <ResumenDocumentosAnunciante resumen={resumen} siguiente={siguiente} />
        <NotaPrivacidadEmpresa className="hidden lg:flex" />
      </aside>

      <div className="flex min-w-0 flex-col gap-8">
        <Seccion
          titulo="Para verificar tu empresa"
          descripcion={
            colombiana
              ? "AMO revisa el RUT y la Cámara de Comercio antes de que puedas activar campañas y enviar ofertas."
              : "Basta con uno de estos: el certificado de existencia de tu país u otro documento equivalente."
          }
        >
          {exigidos.map((tipo) => tarjeta(tipo, true))}
        </Seccion>
        {opcionales.length > 0 ? (
          <Seccion
            titulo="Otros documentos"
            descripcion="La verificación no los exige, pero puedes cargarlos o mantenerlos al día."
          >
            {opcionales.map((tipo) => tarjeta(tipo, false))}
          </Seccion>
        ) : null}
        <NotaPrivacidadEmpresa className="lg:hidden" />
      </div>

      <DialogoConfirmacion
        abierto={salida !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setSalida(null)
        }}
        titulo="¿Salir y cancelar la subida?"
        descripcion="Hay un documento subiéndose. Si sales ahora se cancela y tendrás que cargarlo de nuevo."
        textoConfirmar="Salir"
        textoCancelar="Seguir aquí"
        destructivo
        onConfirmar={() => {
          if (salida) router.push(salida as Route)
        }}
      />
    </div>
  )
}
