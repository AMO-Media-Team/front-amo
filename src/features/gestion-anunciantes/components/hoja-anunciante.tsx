"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Building2, Hourglass, PencilLine } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { toast } from "sonner"

import { EstadoError } from "@/components/feedback/estado-error"
import {
  CuerpoHoja,
  FormularioHoja,
  HojaLateral,
  useHojaLateral,
} from "@/features/configuracion/components/hoja-lateral"
import { useEnvio } from "@/features/configuracion/components/use-envio"

import { editarAnunciante, registrarAnunciante } from "../actions"
import { valoresFormulario } from "../filas"
import {
  CAMPOS_ANUNCIANTE,
  type EntradaAnunciante,
  esquemaAnunciante,
} from "../schemas"
import type {
  AnuncianteEditable,
  AnuncianteRegistrado,
  CatalogosAnunciante,
} from "../tipos"
import { CamposAnunciante } from "./campos-anunciante"

/** Sin sectores no hay formulario: se ofrece reintentar (vuelve a pedir la página). */
function CatalogosNoDisponibles() {
  const router = useRouter()
  return (
    <CuerpoHoja>
      <EstadoError
        compacto
        nivelTitulo="h3"
        titulo="No pudimos preparar el formulario"
        descripcion="No se pudieron leer los sectores. Revisa tu conexión y reintenta en unos segundos."
        onReintentar={() => router.refresh()}
      />
    </CuerpoHoja>
  )
}

function AvisoVerificacion({ invitarEquipo }: { invitarEquipo: boolean }) {
  return (
    <p className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
      <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      <span>
        Queda{" "}
        <strong className="font-medium text-foreground">
          pendiente de verificación
        </strong>{" "}
        hasta que AMO revise sus documentos.
        {invitarEquipo ? " Desde su ficha podrás invitar a su equipo." : null}
      </span>
    </p>
  )
}

function FormularioRegistro({
  catalogos,
  invitarEquipo,
  onRegistrado,
}: {
  catalogos: CatalogosAnunciante
  invitarEquipo: boolean
  onRegistrado: (datos: AnuncianteRegistrado) => void
}) {
  // Tras registrar se abre la ficha: el formulario queda bloqueado mientras
  // tanto (un segundo envío duplicaría al anunciante).
  const [abriendoFicha, setAbriendoFicha] = useState(false)
  const formulario = useForm({
    resolver: zodResolver(esquemaAnunciante),
    defaultValues: valoresFormulario(null),
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: registrarAnunciante,
    campos: CAMPOS_ANUNCIANTE,
    onExito: (datos) => {
      setAbriendoFicha(true)
      // Ya guardado: cerrar la hoja no debe preguntar por cambios perdidos.
      formulario.reset(formulario.getValues())
      onRegistrado(datos)
    },
  })
  const ocupado = pendiente || abriendoFicha

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={ocupado}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar={abriendoFicha ? "Abriendo la ficha…" : "Registrar"}
        iconoEnviar={Building2}
      >
        <CamposAnunciante
          catalogos={catalogos}
          deshabilitado={ocupado}
          enfocarPrimero
        />
        <AvisoVerificacion invitarEquipo={invitarEquipo} />
      </FormularioHoja>
    </FormProvider>
  )
}

/** Hoja «Registrar anunciante» (equipo AMO). */
export function HojaRegistroAnunciante({
  abierta,
  onAbiertaChange,
  catalogos,
  invitarEquipo,
  onRegistrado,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  /** `null` si no se pudieron leer los sectores. */
  catalogos: CatalogosAnunciante | null
  /** `usuarios.invitar`: los textos anuncian el siguiente paso. */
  invitarEquipo: boolean
  onRegistrado: (datos: AnuncianteRegistrado) => void
}) {
  return (
    <HojaLateral
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      icono={Building2}
      titulo="Registrar anunciante"
      descripcion={
        invitarEquipo
          ? "La empresa que pautará en AMO. Después invitarás a su equipo desde su ficha."
          : "La empresa que pautará en AMO."
      }
      ancho="lg"
    >
      {catalogos ? (
        <FormularioRegistro
          catalogos={catalogos}
          invitarEquipo={invitarEquipo}
          onRegistrado={onRegistrado}
        />
      ) : (
        <CatalogosNoDisponibles />
      )}
    </HojaLateral>
  )
}

function FormularioEdicion({
  catalogos,
  anunciante,
}: {
  catalogos: CatalogosAnunciante
  anunciante: AnuncianteEditable
}) {
  const { cerrar } = useHojaLateral()
  // La versión con la que se abrió la hoja: si la página se refresca con datos
  // de otra persona, reintentar no debe pisarlos con este formulario viejo.
  const [{ id, actualizadoAt }] = useState(anunciante)
  const formulario = useForm({
    resolver: zodResolver(esquemaAnunciante),
    defaultValues: valoresFormulario(anunciante),
    mode: "onTouched",
  })
  const accion = useCallback(
    (valores: EntradaAnunciante) =>
      editarAnunciante({ ...valores, id, actualizadoAt }),
    [id, actualizadoAt]
  )
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion,
    campos: CAMPOS_ANUNCIANTE,
    onExito: () => {
      toast.success("Datos del anunciante actualizados", {
        description: formulario.getValues("nombreComercial"),
      })
      cerrar()
    },
  })

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar="Guardar cambios"
        envioDeshabilitado={!sucio}
      >
        <CamposAnunciante
          catalogos={catalogos}
          sectorActual={anunciante.sector}
          deshabilitado={pendiente}
        />
      </FormularioHoja>
    </FormProvider>
  )
}

/** Hoja «Editar datos» de un anunciante (incluye NIT y DV: el equipo AMO sí puede). */
export function HojaEdicionAnunciante({
  abierta,
  onAbiertaChange,
  catalogos,
  anunciante,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  catalogos: CatalogosAnunciante | null
  anunciante: AnuncianteEditable
}) {
  return (
    <HojaLateral
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      icono={PencilLine}
      titulo="Editar datos del anunciante"
      descripcion={anunciante.nombreComercial}
      ancho="lg"
    >
      {catalogos ? (
        <FormularioEdicion catalogos={catalogos} anunciante={anunciante} />
      ) : (
        <CatalogosNoDisponibles />
      )}
    </HojaLateral>
  )
}
