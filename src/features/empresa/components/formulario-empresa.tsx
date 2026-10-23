"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Building2, Landmark, RefreshCw, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useTransition } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EstadoError } from "@/components/feedback/estado-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  CampoInterruptor,
  CampoSelect,
} from "@/features/configuracion/components/campos"
import { useEnvio } from "@/features/configuracion/components/use-envio"
import { CamposAnunciante } from "@/features/gestion-anunciantes/components/campos-anunciante"
import { PAIS_COLOMBIA } from "@/features/gestion-anunciantes/schemas"
import type { CatalogosAnunciante } from "@/features/gestion-anunciantes/tipos"
import {
  BarraGuardar,
  useSalidaSinGuardar,
} from "@/features/mi-medio/components/guardado"
import { SeccionFormulario } from "@/features/mi-medio/components/seccion-formulario"

import { editarMiEmpresa, type EmpresaGuardada } from "../actions"
import {
  EMPRESA_DESACTUALIZADA,
  IDENTIFICACION_YA_VERIFICADA,
} from "../errores"
import { opcionesRegimen, valoresMiEmpresa } from "../filas"
import { ANCLA_DATOS } from "../rutas"
import {
  CAMPOS_MI_EMPRESA,
  type EntradaMiEmpresa,
  esquemaMiEmpresa,
} from "../schemas"
import type { EmpresaPropia } from "../tipos"

/** Otra persona (o AMO) cambió lo mismo antes: se ofrece cargar lo vigente. */
function AvisoDesactualizado({
  mensaje,
  onCargar,
}: {
  mensaje: string
  onCargar: () => void
}) {
  const router = useRouter()
  const [cargando, iniciar] = useTransition()
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>No guardamos tus cambios</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{mensaje}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cargando}
          onClick={() => {
            onCargar()
            iniciar(() => router.refresh())
          }}
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

/** Sin sectores no hay formulario: se ofrece reintentar (vuelve a pedir la página). */
function CatalogosNoDisponibles() {
  const router = useRouter()
  return (
    <EstadoError
      compacto
      nivelTitulo="h3"
      titulo="No pudimos preparar el formulario"
      descripcion="No se pudieron leer los sectores. Revisa tu conexión y reintenta en unos segundos."
      onReintentar={() => router.refresh()}
    />
  )
}

/** Régimen de IVA y responsabilidades que Finanzas usa al facturar (solo Colombia). */
function CamposTributarios({
  regimenActual,
  deshabilitado,
}: {
  regimenActual: string | null
  deshabilitado: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <CampoSelect
        nombre="regimen"
        etiqueta="Régimen de IVA"
        placeholder="Elige el régimen"
        opciones={opcionesRegimen(regimenActual)}
        descripcion="Como figura en el RUT (responsabilidad 48 o 49)."
        deshabilitado={deshabilitado}
      />
      <CampoInterruptor
        nombre="granContribuyente"
        etiqueta="Gran contribuyente"
        descripcion="Responsabilidad O-13 en el RUT."
        deshabilitado={deshabilitado}
      />
      <CampoInterruptor
        nombre="autorretenedor"
        etiqueta="Autorretenedor"
        descripcion="Responsabilidad O-15 en el RUT."
        deshabilitado={deshabilitado}
      />
    </div>
  )
}

/**
 * Datos de la propia empresa (ANU-001): los mismos campos del registro del
 * equipo AMO (`CamposAnunciante`), con la razón social y la identificación de
 * solo lectura una vez verificada, y la condición tributaria. Mientras no haya
 * cambios sin guardar, refleja lo que trae el servidor (otra pestaña, el
 * equipo AMO, el envío a verificación); con cambios, los conserva y la acción
 * compara con lo que había al empezar para no pisar a nadie.
 */
export function FormularioEmpresa({
  empresa,
  catalogos,
  identificacionBloqueada,
}: {
  empresa: EmpresaPropia
  /** `null` si no se pudieron leer los sectores. */
  catalogos: CatalogosAnunciante | null
  identificacionBloqueada: boolean
}) {
  const valoresServidor = useMemo(() => valoresMiEmpresa(empresa), [empresa])
  const original = useRef<EntradaMiEmpresa>(valoresServidor)
  const formulario = useForm({
    resolver: zodResolver(esquemaMiEmpresa),
    defaultValues: valoresServidor,
    mode: "onTouched",
  })
  const restablecer = useCallback(
    (valores: EntradaMiEmpresa) => {
      original.current = valores
      formulario.reset(valores)
    },
    [formulario]
  )
  const accion = useCallback(
    (valores: EntradaMiEmpresa) => editarMiEmpresa(valores, original.current),
    []
  )
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion,
    campos: CAMPOS_MI_EMPRESA,
    onExito: ({ actualizadoAt }: EmpresaGuardada) => {
      restablecer({ ...formulario.getValues(), actualizadoAt })
      toast.success("Datos de la empresa guardados")
    },
  })
  const dialogoSalida = useSalidaSinGuardar(sucio && !pendiente)
  const pais = useWatch({ control: formulario.control, name: "paisIso2" })

  // Sin cambios pendientes, el formulario sigue a la BD (no hay `key` que lo
  // rehaga: un cambio de otras columnas no debe borrar lo que se escribe).
  useEffect(() => {
    if (!sucio && !pendiente) restablecer(valoresServidor)
  }, [sucio, pendiente, valoresServidor, restablecer])

  const desactualizado =
    errorGeneral === EMPRESA_DESACTUALIZADA ||
    errorGeneral === IDENTIFICACION_YA_VERIFICADA

  return (
    <FormProvider {...formulario}>
      <form
        id={ANCLA_DATOS}
        onSubmit={enviar}
        noValidate
        aria-label="Datos de la empresa"
        className="flex scroll-mt-20 flex-col gap-5"
      >
        {desactualizado && errorGeneral ? (
          <AvisoDesactualizado
            mensaje={errorGeneral}
            onCargar={() => restablecer(valoresServidor)}
          />
        ) : errorGeneral ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        ) : null}

        <SeccionFormulario
          icono={Building2}
          titulo="Datos de la empresa"
          descripcion="Así aparece tu empresa en AMO, en tus ofertas y en tus facturas. Revisa que coincidan con tu RUT."
        >
          {catalogos ? (
            <div className="flex flex-col gap-8">
              <CamposAnunciante
                catalogos={catalogos}
                sectorActual={empresa.sector}
                deshabilitado={pendiente}
                identificacionBloqueada={identificacionBloqueada}
              />
            </div>
          ) : (
            <CatalogosNoDisponibles />
          )}
        </SeccionFormulario>

        {catalogos && pais === PAIS_COLOMBIA ? (
          <SeccionFormulario
            icono={Landmark}
            titulo="Condición tributaria"
            descripcion="Con esto el equipo de AMO te factura con los impuestos y retenciones que corresponden."
          >
            <CamposTributarios
              regimenActual={empresa.facturacion.regimen}
              deshabilitado={pendiente}
            />
          </SeccionFormulario>
        ) : null}

        <BarraGuardar
          visible={sucio || pendiente}
          pendiente={pendiente}
          onDescartar={() => formulario.reset()}
          textoGuardar="Guardar datos"
        />
      </form>
      {dialogoSalida}
    </FormProvider>
  )
}
