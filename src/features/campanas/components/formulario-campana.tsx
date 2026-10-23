"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  CalendarRange,
  CircleCheck,
  Megaphone,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useMemo, useTransition } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  CampoAreaTexto,
  CampoCifra,
  CampoFecha,
  CampoTexto,
} from "@/features/configuracion/components/campos"
import { useEnvio } from "@/features/configuracion/components/use-envio"
import { useSalidaSinGuardar } from "@/features/mi-medio/components/guardado"
import { SeccionFormulario } from "@/features/mi-medio/components/seccion-formulario"
import { instanteDeDia } from "@/features/operacion/formato"
import { parsearFecha } from "@/lib/fechas"
import { formatearCOP, formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import { crearCampana, editarCampana } from "../actions"
import { CAMPANA_DESACTUALIZADA } from "../errores"
import { valoresEdicion, VALORES_NUEVA_CAMPANA } from "../formularios"
import { duracionVigencia } from "../presentacion"
import { RUTA_MIS_CAMPANAS, rutaMiCampana } from "../rutas"
import {
  CAMPOS_CAMPANA,
  esquemaEditarCampana,
  esquemaNuevaCampana,
  LIMITES_CAMPANA,
  type ReglasCampana,
} from "../schemas"
import type { MiCampana } from "../tipos"

function diaLargo(dia: string): string {
  return formatearFecha(instanteDeDia(dia), "largo")
}

/** El mayor de los días dados ('YYYY-MM-DD' se compara como texto). */
function mayor(...dias: (string | null | undefined)[]): string | undefined {
  return dias
    .filter((dia): dia is string => Boolean(dia && parsearFecha(dia)))
    .sort()
    .at(-1)
}

/** Otra persona guardó antes: se ofrece cargar lo vigente. */
function AvisoDesactualizado() {
  const router = useRouter()
  const [cargando, iniciar] = useTransition()
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>No guardamos tus cambios</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{CAMPANA_DESACTUALIZADA}</p>
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

function ErrorGeneral({ mensaje }: { mensaje: string | undefined }) {
  if (!mensaje) return null
  if (mensaje === CAMPANA_DESACTUALIZADA) return <AvisoDesactualizado />
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertDescription>{mensaje}</AlertDescription>
    </Alert>
  )
}

/** Duración en vivo mientras se eligen las fechas (anunciada sin interrumpir). */
function Duracion({ className }: { className?: string }) {
  const [inicio, fin] = useWatch({ name: ["fechaInicio", "fechaFin"] }) as [
    string,
    string,
  ]
  const valida =
    parsearFecha(inicio) !== null && parsearFecha(fin) !== null && fin >= inicio
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex min-h-5 items-center gap-1.5 text-sm text-muted-foreground",
        className
      )}
    >
      {valida ? (
        <>
          <CalendarRange aria-hidden className="size-4 shrink-0" />
          <span>
            La campaña dura{" "}
            <span className="font-medium cifras text-foreground">
              {duracionVigencia(inicio, fin)}
            </span>
            .
          </span>
        </>
      ) : null}
    </p>
  )
}

interface CamposProps {
  reglas: ReglasCampana
  pendiente: boolean
}

/** Los campos de la campaña, comunes a crearla y editarla. */
function CamposCampana({ reglas, pendiente }: CamposProps) {
  const fechaInicio = useWatch({ name: "fechaInicio" }) as string
  // Una campaña que ya empezó conserva su inicio aunque sea anterior a hoy.
  const minimoInicio =
    reglas.fechaInicioActual && reglas.fechaInicioActual < reglas.hoy
      ? reglas.fechaInicioActual
      : reglas.hoy
  const minimoFin = mayor(
    fechaInicio,
    reglas.fechaFinActual && reglas.fechaFinActual < reglas.hoy
      ? reglas.fechaFinActual
      : reglas.hoy,
    reglas.finMinimo
  )
  return (
    <>
      <SeccionFormulario
        icono={Megaphone}
        titulo="La campaña"
        descripcion="Cómo la reconoce tu equipo y qué quieres lograr con ella."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <CampoTexto
            nombre="nombre"
            etiqueta="Nombre de la campaña"
            placeholder="Temporada navideña 2026"
            descripcion={`Entre ${LIMITES_CAMPANA.nombreMin} y ${LIMITES_CAMPANA.nombreMax} caracteres.`}
            deshabilitado={pendiente}
          />
          <CampoTexto
            nombre="marca"
            etiqueta="Marca o producto"
            placeholder="Café Sierra Alta"
            descripcion="Lo que promociona la campaña."
            deshabilitado={pendiente}
          />
          <CampoAreaTexto
            nombre="objetivo"
            etiqueta="Objetivo"
            opcional
            filas={3}
            placeholder="Por ejemplo: dar a conocer la nueva presentación en la región Caribe y llevar visitas a la tienda en línea."
            descripcion={`Qué quieres lograr: alcance, visitas, un lanzamiento… Hasta ${LIMITES_CAMPANA.objetivoMax} caracteres.`}
            deshabilitado={pendiente}
            className="md:col-span-2"
          />
        </div>
      </SeccionFormulario>

      <SeccionFormulario
        icono={CalendarRange}
        titulo="Vigencia y presupuesto"
        descripcion="Las ofertas de la campaña se publican dentro de estas fechas y se reparten este presupuesto."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <CampoFecha
            nombre="fechaInicio"
            etiqueta="Fecha de inicio"
            minimo={minimoInicio}
            descripcion={
              reglas.inicioMaximo
                ? `Tus ofertas en revisión o publicadas se publican desde el ${diaLargo(reglas.inicioMaximo)}: la campaña debe empezar ese día o antes.`
                : undefined
            }
            deshabilitado={pendiente}
          />
          <CampoFecha
            nombre="fechaFin"
            etiqueta="Fecha de fin"
            minimo={minimoFin}
            descripcion={
              reglas.finMinimo
                ? `Tus ofertas en revisión o publicadas se publican hasta el ${diaLargo(reglas.finMinimo)}: la campaña debe terminar ese día o después.`
                : undefined
            }
            deshabilitado={pendiente}
          />
          <Duracion className="-mt-2 md:col-span-2" />
          <CampoCifra
            nombre="presupuesto"
            etiqueta="Presupuesto total"
            prefijo="$"
            placeholder="25.000.000"
            descripcion={
              reglas.presupuestoMinimo > 0
                ? `No puede quedar por debajo de ${formatearCOP(reglas.presupuestoMinimo)}, lo que ya tienen comprometido tus ofertas y los cupos aceptados.`
                : "En pesos colombianos, sin centavos. Cada oferta toma su parte de este total."
            }
            deshabilitado={pendiente}
          />
        </div>
      </SeccionFormulario>
    </>
  )
}

function Pie({
  cancelar,
  pendiente,
  texto,
  textoPendiente,
}: {
  cancelar: Route
  pendiente: boolean
  texto: string
  textoPendiente: string
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <EnlaceBoton href={cancelar} variant="ghost" className="max-sm:w-full">
        Cancelar
      </EnlaceBoton>
      <Button type="submit" disabled={pendiente} className="max-sm:w-full">
        {pendiente ? (
          <Spinner data-icon="inline-start" aria-hidden />
        ) : (
          <CircleCheck data-icon="inline-start" aria-hidden />
        )}
        {pendiente ? textoPendiente : texto}
      </Button>
    </div>
  )
}

/** Alta de una campaña (queda en BORRADOR); al crearla, va a su ficha. */
export function FormularioNuevaCampana({ reglas }: { reglas: ReglasCampana }) {
  const router = useRouter()
  const esquema = useMemo(() => esquemaNuevaCampana(reglas), [reglas])
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: VALORES_NUEVA_CAMPANA,
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: crearCampana,
    campos: CAMPOS_CAMPANA,
    onExito: ({ id }) => {
      formulario.reset(formulario.getValues())
      toast.success("Campaña creada", {
        description: "Ahora arma sus ofertas para los medios.",
      })
      router.push(rutaMiCampana(id))
    },
  })
  const dialogoSalida = useSalidaSinGuardar(sucio && !pendiente)

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        noValidate
        aria-label="Nueva campaña"
        className="flex flex-col gap-5"
      >
        <ErrorGeneral mensaje={errorGeneral} />
        <CamposCampana reglas={reglas} pendiente={pendiente} />
        <Pie
          cancelar={RUTA_MIS_CAMPANAS}
          pendiente={pendiente}
          texto="Crear campaña"
          textoPendiente="Creando…"
        />
      </form>
      {dialogoSalida}
    </FormProvider>
  )
}

/**
 * Edición de una campaña en borrador o activa. La página lo monta con
 * `key` = versión del registro: al cargar lo vigente se rehace con la BD.
 */
export function FormularioEditarCampana({
  campana,
  reglas,
}: {
  campana: MiCampana
  reglas: ReglasCampana
}) {
  const router = useRouter()
  const esquema = useMemo(() => esquemaEditarCampana(reglas), [reglas])
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: valoresEdicion(campana),
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: editarCampana,
    campos: CAMPOS_CAMPANA,
    onExito: ({ actualizadoAt }) => {
      formulario.reset(formulario.getValues())
      // La acción no escribe si nada cambió: la versión sigue siendo la misma.
      if (actualizadoAt === campana.actualizadaAt) {
        toast.info("No había cambios que guardar")
      } else {
        toast.success("Guardamos los cambios de la campaña")
      }
      router.push(rutaMiCampana(campana.id))
    },
  })
  const dialogoSalida = useSalidaSinGuardar(sucio && !pendiente)

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        noValidate
        aria-label={`Editar la campaña ${campana.nombre}`}
        className="flex flex-col gap-5"
      >
        <ErrorGeneral mensaje={errorGeneral} />
        <CamposCampana reglas={reglas} pendiente={pendiente} />
        <Pie
          cancelar={rutaMiCampana(campana.id)}
          pendiente={pendiente}
          texto="Guardar cambios"
          textoPendiente="Guardando…"
        />
      </form>
      {dialogoSalida}
    </FormProvider>
  )
}
