"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { parseAsNumberLiteral, useQueryState } from "nuqs"
import { useCallback, useId, useMemo, useState } from "react"

import { useGuardiaSalida } from "@/components/asistente/use-guardia-salida"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"

import {
  documentosExigidos,
  documentosOpcionales,
  NIVELES,
  nivelSugerido,
} from "../requisitos"
import {
  resumirDocumentos,
  situacionDeTipo,
  situacionesPorTipo,
} from "../situacion"
import { explicarNivelElegido, siguientePaso } from "../textos"
import type {
  DatosDocumentosMedio,
  NivelVerificacion,
  TipoDocumentoMedio,
} from "../tipos"
import { NotaPrivacidad } from "./avisos"
import { ResumenDocumentos } from "./resumen-documentos"
import { SelectorNivel } from "./selector-nivel"
import { TarjetaDocumento } from "./tarjeta-documento"
import { TarjetaPagoPendiente } from "./tarjeta-pago-pendiente"

/** `?nivel=2`: el nivel que se consulta (lo enlaza la página «Nivel» de Mi medio). */
export const PARAMETRO_NIVEL = "nivel"

const parseNivel = parseAsNumberLiteral(NIVELES).withOptions({
  history: "replace",
  scroll: false,
})

/** Tipos con una subida en curso (sus tarjetas no deben desmontarse). */
function useSubidasActivas() {
  const [activas, setActivas] = useState<ReadonlySet<TipoDocumentoMedio>>(
    () => new Set()
  )
  const alCambiar = useCallback(
    (tipo: TipoDocumentoMedio, activa: boolean) => {
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
  children: React.ReactNode
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

/**
 * «Mis documentos»: avance, nivel al que aspira el medio y una tarjeta por
 * documento (los que exige ese nivel con su medio de pago y, aparte, los
 * opcionales). El nivel se elige en la URL sin volver al servidor: todo se
 * calcula aquí con lo que ya trajo la página.
 */
export function PanelDocumentos({ datos }: { datos: DatosDocumentosMedio }) {
  const router = useRouter()
  const { medio, perfil, niveles, documentos, hoy } = datos
  const sugerido = nivelSugerido(medio, perfil)
  const [nivelUrl, setNivelUrl] = useQueryState(PARAMETRO_NIVEL, parseNivel)
  const nivel = nivelUrl ?? sugerido.nivel
  const subidas = useSubidasActivas()
  const [salida, setSalida] = useState<string | null>(null)

  useGuardiaSalida(subidas.hay, setSalida)

  const situaciones = useMemo(
    () => situacionesPorTipo(documentos, hoy),
    [documentos, hoy]
  )
  const requisitos = niveles.find((fila) => fila.nivel === nivel)
  const exigidos = documentosExigidos(requisitos, perfil.metodoPago)
  const opcionales = documentosOpcionales(exigidos, documentos)
  const pagoPendiente = perfil.metodoPago === null
  const resumen = resumirDocumentos(exigidos, situaciones, pagoPendiente)

  function elegirNivel(elegido: NivelVerificacion) {
    void setNivelUrl(elegido === sugerido.nivel ? null : elegido)
  }

  const tarjeta = (tipo: TipoDocumentoMedio) => (
    <TarjetaDocumento
      key={tipo}
      tipo={tipo}
      situacion={situacionDeTipo(situaciones, tipo)}
      onActividad={subidas.alCambiar}
    />
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <ResumenDocumentos
          resumen={resumen}
          nivel={nivel}
          siguiente={siguientePaso(medio, resumen)}
        />
        <SelectorNivel
          valor={nivel}
          onCambiar={elegirNivel}
          niveles={niveles}
          nivelActual={medio.estado === "VERIFICADO" ? medio.nivel : 0}
          explicacion={explicarNivelElegido(nivel, sugerido, medio)}
          deshabilitado={subidas.hay}
        />
        <NotaPrivacidad className="hidden lg:flex" />
      </aside>

      <div className="flex min-w-0 flex-col gap-8">
        <Seccion titulo={`Documentos del nivel ${nivel}`}>
          {exigidos.map(tarjeta)}
          {pagoPendiente ? <TarjetaPagoPendiente /> : null}
        </Seccion>
        {opcionales.length > 0 ? (
          <Seccion
            titulo="Otros documentos"
            descripcion="Tu nivel no los exige, pero puedes cargarlos o mantenerlos al día."
          >
            {opcionales.map(tarjeta)}
          </Seccion>
        ) : null}
        <NotaPrivacidad className="lg:hidden" />
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
