"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Layers, SquareStack } from "lucide-react"
import { FormProvider, useForm } from "react-hook-form"
import { toast } from "sonner"

import { guardarFormato, guardarFranja } from "../actions"
import { valoresFormato, valoresFranja } from "../formularios"
import { NOMBRES_FORMATO, nombrePlataforma } from "../presentacion"
import {
  CLAVES_FORMATO,
  type EntradaFormato,
  type EntradaFranja,
  esquemaFormato,
  esquemaFranja,
  PLATAFORMAS,
} from "../schemas"
import type { Formato, Franja } from "../tipos"
import {
  CampoCifra,
  CampoEtiquetas,
  CampoInterruptor,
  CampoSelect,
  CampoTexto,
} from "./campos"
import { FormularioHoja, HojaLateral, useHojaLateral } from "./hoja-lateral"
import { useEnvio } from "./use-envio"

const CAMPOS_FRANJA = [
  "clave",
  "nombre",
  "seguidoresMin",
  "seguidoresMax",
  "orden",
] as const satisfies readonly (keyof EntradaFranja)[]

const CAMPOS_FORMATO = [
  "clave",
  "nombre",
  "orden",
  "relacionesAspecto",
  "mime",
  "duracionMaxS",
  "pesoMaxMb",
  "maxArchivos",
] as const satisfies readonly (keyof EntradaFormato)[]

export function HojaFranja({
  abierta,
  onAbiertaChange,
  franja,
  franjas,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  franja: Franja | null
  franjas: readonly Franja[]
}) {
  return (
    <HojaLateral
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      icono={Layers}
      titulo={
        franja ? `Editar franja ${franja.clave}` : "Nueva franja de seguidores"
      }
      descripcion="Los rangos de las franjas activas no pueden cruzarse. Una franja no se borra: se desactiva."
    >
      <FormularioFranja franja={franja} franjas={franjas} />
    </HojaLateral>
  )
}

function FormularioFranja({
  franja,
  franjas,
}: {
  franja: Franja | null
  franjas: readonly Franja[]
}) {
  const { cerrar } = useHojaLateral()
  const formulario = useForm({
    resolver: zodResolver(esquemaFranja),
    defaultValues: valoresFranja(franja, franjas),
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarFranja,
    campos: CAMPOS_FRANJA,
    onExito: () => {
      toast.success(franja ? "Franja actualizada" : "Franja creada")
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
        textoEnviar={franja ? "Guardar cambios" : "Crear franja"}
      >
        <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
          <CampoTexto
            nombre="clave"
            etiqueta="Clave"
            mayusculas
            deshabilitado={franja !== null || pendiente}
            descripcion={franja ? "No cambia." : "F y un dígito."}
          />
          <CampoTexto
            nombre="nombre"
            etiqueta="Nombre"
            placeholder="120.001 – 250.000"
            deshabilitado={pendiente}
            descripcion="Así la ven los anunciantes al elegir cupos."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoCifra
            nombre="seguidoresMin"
            etiqueta="Desde (seguidores)"
            deshabilitado={pendiente}
          />
          <CampoCifra
            nombre="seguidoresMax"
            etiqueta="Hasta (seguidores)"
            opcional
            placeholder="Sin límite"
            deshabilitado={pendiente}
            descripcion="Vacío = sin tope."
          />
        </div>
        <CampoCifra
          nombre="orden"
          etiqueta="Orden"
          className="max-w-40"
          deshabilitado={pendiente}
          descripcion="Posición en el tarifario y en los formularios."
        />
        <CampoInterruptor
          nombre="activa"
          etiqueta="Franja activa"
          descripcion="Una franja inactiva no recibe cuentas nuevas ni se ofrece en los cupos; sus tarifas se conservan."
          deshabilitado={pendiente}
        />
      </FormularioHoja>
    </FormProvider>
  )
}

export function HojaFormato({
  abierta,
  onAbiertaChange,
  formato,
  formatos,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  formato: Formato | null
  formatos: readonly Formato[]
}) {
  return (
    <HojaLateral
      abierta={abierta}
      onAbiertaChange={onAbiertaChange}
      icono={SquareStack}
      titulo={formato ? `Editar ${formato.nombre}` : "Nuevo formato"}
      descripcion={
        formato
          ? `${nombrePlataforma(formato.plataforma)} · ${NOMBRES_FORMATO[formato.clave] ?? formato.clave}`
          : "Tipo de publicación que un anunciante puede pedir en una plataforma."
      }
      ancho="lg"
    >
      <FormularioFormato formato={formato} formatos={formatos} />
    </HojaLateral>
  )
}

function FormularioFormato({
  formato,
  formatos,
}: {
  formato: Formato | null
  formatos: readonly Formato[]
}) {
  const { cerrar } = useHojaLateral()
  const formulario = useForm({
    resolver: zodResolver(esquemaFormato),
    defaultValues: valoresFormato(formato, formatos),
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarFormato,
    campos: CAMPOS_FORMATO,
    onExito: () => {
      toast.success(formato ? "Formato actualizado" : "Formato creado")
      cerrar()
    },
  })
  const nuevo = formato === null

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar={nuevo ? "Crear formato" : "Guardar cambios"}
      >
        {nuevo ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoSelect
              nombre="plataforma"
              etiqueta="Plataforma"
              opciones={PLATAFORMAS.map((p) => ({
                valor: p,
                etiqueta: nombrePlataforma(p),
              }))}
              deshabilitado={pendiente}
            />
            <CampoSelect
              nombre="clave"
              etiqueta="Tipo de formato"
              opciones={CLAVES_FORMATO.map((c) => ({
                valor: c,
                etiqueta: NOMBRES_FORMATO[c] ?? c,
              }))}
              deshabilitado={pendiente}
            />
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <CampoTexto
            nombre="nombre"
            etiqueta="Nombre visible"
            placeholder="Reel"
            deshabilitado={pendiente}
          />
          <CampoCifra
            nombre="orden"
            etiqueta="Orden"
            deshabilitado={pendiente}
          />
        </div>

        <fieldset className="flex flex-col gap-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">
            Requisitos del contenido
          </legend>
          <CampoEtiquetas
            nombre="relacionesAspecto"
            etiqueta="Relaciones de aspecto"
            placeholder="9:16 y Enter"
            sugerencias={["9:16", "4:5", "1:1", "16:9"]}
            deshabilitado={pendiente}
          />
          <CampoEtiquetas
            nombre="mime"
            etiqueta="Tipos de archivo"
            placeholder="video/mp4 y Enter"
            sugerencias={[
              "video/mp4",
              "video/quicktime",
              "image/jpeg",
              "image/png",
            ]}
            deshabilitado={pendiente}
          />
          <div className="flex flex-col gap-2">
            <div className="grid gap-4 sm:grid-cols-3">
              <CampoCifra
                nombre="duracionMaxS"
                etiqueta="Duración máx."
                sufijo="s"
                deshabilitado={pendiente}
              />
              <CampoCifra
                nombre="pesoMaxMb"
                etiqueta="Peso máx."
                sufijo="MB"
                deshabilitado={pendiente}
              />
              <CampoCifra
                nombre="maxArchivos"
                etiqueta="Archivos máx."
                deshabilitado={pendiente}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Los tres límites son opcionales: vacío significa sin límite.
            </p>
          </div>
        </fieldset>

        <CampoInterruptor
          nombre="activo"
          etiqueta="Formato activo"
          descripcion="Un formato inactivo no se ofrece en ofertas nuevas; las existentes y sus tarifas no cambian."
          deshabilitado={pendiente}
        />
      </FormularioHoja>
    </FormProvider>
  )
}
