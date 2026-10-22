"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Globe, RefreshCw, Store, Tags, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useTransition } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  CampoAreaTexto,
  CampoSelect,
  CampoTexto,
} from "@/features/configuracion/components/campos"
import { useEnvio } from "@/features/configuracion/components/use-envio"
import { TIPOS_MEDIO_BD } from "@/features/gestion-medios/schemas"
import { TIPOS_MEDIO } from "@/features/operacion/estados"

import { guardarPerfilMedio, type PerfilGuardado } from "../actions"
import { PERFIL_DESACTUALIZADO } from "../errores"
import { valoresPerfil } from "../formularios"
import { CAMPOS_PERFIL, esquemaPerfilMedio } from "../schemas"
import type { PerfilEditable } from "../tipos"
import {
  AyudaDescripcionAudiencia,
  CampoAudienciaPaises,
  CampoCategoriasMedio,
  CampoMunicipioMedio,
} from "./campos-perfil"
import { BarraGuardar, useSalidaSinGuardar } from "./guardado"
import { SeccionFormulario } from "./seccion-formulario"

const OPCIONES_TIPO = TIPOS_MEDIO_BD.map((tipo) => ({
  valor: tipo,
  etiqueta: TIPOS_MEDIO[tipo],
}))

/** Otra pestaña o el equipo AMO guardó antes: se ofrece cargar lo vigente. */
function AvisoDesactualizado() {
  const router = useRouter()
  const [cargando, iniciar] = useTransition()
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>No guardamos tus cambios</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{PERFIL_DESACTUALIZADO}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cargando}
          onClick={() => iniciar(() => router.refresh())}
        >
          {cargando ? (
            <Spinner data-icon="inline-start" aria-hidden />
          ) : (
            <RefreshCw data-icon="inline-start" aria-hidden />
          )}
          Cargar los datos vigentes
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Perfil del medio (MED-002): identidad, temas, descripción y origen de la
 * audiencia. Mismo esquema zod que la acción, armado con lo verificado por
 * AMO (que el medio no edita). La página lo monta con `key` = versión del
 * registro: al guardar (o al cargar lo vigente) se rehace con lo de la BD.
 */
export function FormularioPerfilMedio({ perfil }: { perfil: PerfilEditable }) {
  const esquema = useMemo(
    () => esquemaPerfilMedio(perfil.audienciaFija),
    [perfil.audienciaFija]
  )
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: valoresPerfil(perfil),
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarPerfilMedio,
    campos: CAMPOS_PERFIL,
    onExito: ({ actualizadoAt, advertencia }: PerfilGuardado) => {
      formulario.reset({ ...formulario.getValues(), actualizadoAt })
      if (advertencia) toast.warning(advertencia)
      else toast.success("Perfil guardado")
    },
  })
  const dialogoSalida = useSalidaSinGuardar(sucio && !pendiente)

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        noValidate
        aria-label="Perfil del medio"
        className="flex flex-col gap-5"
      >
        {errorGeneral === PERFIL_DESACTUALIZADO ? (
          <AvisoDesactualizado />
        ) : errorGeneral ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        ) : null}

        <SeccionFormulario
          icono={Store}
          titulo="Tu medio"
          descripcion="Así te reconocen el equipo de AMO y las marcas que pautan contigo."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <CampoTexto
              nombre="nombre"
              etiqueta="Nombre del medio"
              placeholder="Noticias del Sur"
              descripcion="Como lo conoce tu audiencia en redes."
              deshabilitado={pendiente}
            />
            <CampoSelect
              nombre="tipo"
              etiqueta="Tipo de medio"
              opciones={OPCIONES_TIPO}
              placeholder="Elige el tipo"
              deshabilitado={pendiente}
            />
            <div className="md:col-span-2">
              <CampoMunicipioMedio deshabilitado={pendiente} />
            </div>
          </div>
        </SeccionFormulario>

        <SeccionFormulario
          icono={Tags}
          titulo="Tu contenido y tu audiencia"
          descripcion="Con esto te mostramos ofertas afines a lo que publicas y a quién te sigue."
        >
          <CampoCategoriasMedio
            opciones={perfil.categorias}
            deshabilitado={pendiente}
          />
          <CampoAreaTexto
            nombre="descripcionAudiencia"
            etiqueta="Describe a tu audiencia"
            filas={4}
            placeholder="Por ejemplo: jóvenes de 18 a 34 años del sur de Cali que siguen el fútbol local y los eventos del barrio."
            descripcion={<AyudaDescripcionAudiencia />}
            deshabilitado={pendiente}
          />
        </SeccionFormulario>

        <SeccionFormulario
          icono={Globe}
          titulo="Origen de tu audiencia"
          descripcion="Si tienes seguidores fuera de Colombia, cuéntanos de dónde son."
        >
          <CampoAudienciaPaises
            paises={perfil.paises}
            verificadas={perfil.audienciaVerificada}
            porcentajeFijo={perfil.audienciaFija.porcentaje}
            deshabilitado={pendiente}
          />
        </SeccionFormulario>

        <BarraGuardar
          visible={sucio || pendiente}
          pendiente={pendiente}
          onDescartar={() => formulario.reset()}
          textoGuardar="Guardar perfil"
        />
      </form>
      {dialogoSalida}
    </FormProvider>
  )
}
