"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { RadioTower, Save } from "lucide-react"
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"

import {
  CampoAreaTexto,
  CampoSelect,
  CampoTexto,
} from "@/features/configuracion/components/campos"
import { FormularioHoja } from "@/features/configuracion/components/hoja-lateral"
import { useEnvio } from "@/features/configuracion/components/use-envio"
import { TIPOS_MEDIO } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { editarMedio, registrarMedio } from "../actions"
import {
  CAMPOS_MEDIO,
  type EntradaEditarMedio,
  type EntradaRegistrarMedio,
  esquemaEditarMedio,
  esquemaRegistrarMedio,
  LIMITES_MEDIO,
  normalizarParrafos,
  TIPOS_MEDIO_BD,
  VALORES_REGISTRO,
} from "../schemas"
import type {
  MedioEditable,
  MedioGuardado,
  MedioRegistrado,
  OpcionCategoria,
} from "../tipos"
import { CampoCategorias } from "./campo-categorias"
import { CampoMunicipio } from "./campo-municipio"

const OPCIONES_TIPO = TIPOS_MEDIO_BD.map((tipo) => ({
  valor: tipo,
  etiqueta: TIPOS_MEDIO[tipo],
}))

/**
 * Ayuda de la descripción con el conteo de caracteres (se avisa cerca del
 * límite). Cuenta lo que se guardaría, normalizado igual que el esquema.
 */
function AyudaDescripcion() {
  const { control } = useFormContext<EntradaRegistrarMedio>()
  const texto = useWatch({ control, name: "descripcionAudiencia" }) ?? ""
  const usados = normalizarParrafos(texto).length
  const cerca = usados > LIMITES_MEDIO.descripcionMax * 0.9
  return (
    <span className="flex items-start justify-between gap-3">
      <span>
        Ayuda al equipo AMO y a los anunciantes a entender a quién llega.
      </span>
      <span
        className={cn(
          "shrink-0 cifras",
          cerca && "font-medium text-warning",
          usados > LIMITES_MEDIO.descripcionMax && "text-destructive"
        )}
      >
        {formatearNumero(usados)}
        <span aria-hidden>/</span>
        <span className="sr-only"> de </span>
        {formatearNumero(LIMITES_MEDIO.descripcionMax)}
        <span className="sr-only"> caracteres</span>
      </span>
    </span>
  )
}

function CamposMedio({
  categorias,
  pendiente,
}: {
  categorias: readonly OpcionCategoria[] | null
  pendiente: boolean
}) {
  return (
    <>
      <CampoTexto
        nombre="nombre"
        etiqueta="Nombre del medio"
        placeholder="Noticias del Sur"
        descripcion="Como lo reconoce su audiencia en redes."
        autoFocus
        deshabilitado={pendiente}
      />
      <CampoSelect
        nombre="tipo"
        etiqueta="Tipo de medio"
        opciones={OPCIONES_TIPO}
        placeholder="Elige el tipo"
        deshabilitado={pendiente}
      />
      <CampoMunicipio deshabilitado={pendiente} />
      <CampoCategorias opciones={categorias} deshabilitado={pendiente} />
      <CampoAreaTexto
        nombre="descripcionAudiencia"
        etiqueta="Descripción de la audiencia"
        opcional
        filas={4}
        placeholder="Quién lo sigue: edades, barrios o municipios, intereses…"
        descripcion={<AyudaDescripcion />}
        deshabilitado={pendiente}
      />
    </>
  )
}

/** Formulario de alta (dentro de una `HojaLateral`). */
export function FormularioRegistrarMedio({
  categorias,
  onRegistrado,
}: {
  categorias: readonly OpcionCategoria[] | null
  onRegistrado: (medio: MedioRegistrado) => void
}) {
  const formulario = useForm({
    resolver: zodResolver(esquemaRegistrarMedio),
    defaultValues: VALORES_REGISTRO,
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: (valores: EntradaRegistrarMedio) => registrarMedio(valores),
    campos: CAMPOS_MEDIO,
    onExito: onRegistrado,
  })

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar="Registrar medio"
        iconoEnviar={RadioTower}
      >
        <CamposMedio categorias={categorias} pendiente={pendiente} />
      </FormularioHoja>
    </FormProvider>
  )
}

function valoresEdicion(medio: MedioEditable): EntradaEditarMedio {
  return {
    medioId: medio.id,
    actualizadoAt: medio.actualizadoAt,
    nombre: medio.nombre,
    tipo: medio.tipo,
    municipioCodigo: medio.municipioCodigo,
    descripcionAudiencia: medio.descripcionAudiencia ?? "",
    categoriaIds: medio.categoriaIds,
  }
}

/** Formulario de edición con bloqueo optimista (lleva el `updated_at` que se abrió). */
export function FormularioEditarMedio({
  medio,
  categorias,
  onGuardado,
}: {
  medio: MedioEditable
  categorias: readonly OpcionCategoria[]
  onGuardado: (resultado: MedioGuardado) => void
}) {
  const formulario = useForm({
    resolver: zodResolver(esquemaEditarMedio),
    defaultValues: valoresEdicion(medio),
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: (valores: EntradaEditarMedio) => editarMedio(valores),
    campos: CAMPOS_MEDIO,
    onExito: onGuardado,
  })

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar="Guardar cambios"
        iconoEnviar={Save}
        envioDeshabilitado={!sucio}
      >
        <CamposMedio categorias={categorias} pendiente={pendiente} />
      </FormularioHoja>
    </FormProvider>
  )
}
