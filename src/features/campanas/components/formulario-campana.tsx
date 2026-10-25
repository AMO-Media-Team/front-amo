"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Building2,
  CalendarRange,
  CircleCheck,
  Megaphone,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useId, useMemo, useTransition } from "react"
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { toast } from "sonner"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
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
import {
  RUTAS_OPERACION,
  rutaAnunciante,
  rutaCampana,
} from "@/features/operacion/rutas"
import { parsearFecha } from "@/lib/fechas"
import { formatearCOP, formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import { crearCampana, editarCampana } from "../actions"
import { CAMPANA_DESACTUALIZADA } from "../errores"
import {
  valoresEdicion,
  VALORES_NUEVA_CAMPANA,
  valoresNuevaCampanaAsistida,
} from "../formularios"
import type { OpcionAnuncianteGestion } from "../gestion"
import { duracionVigencia, type VozGestion } from "../presentacion"
import {
  esAsistido,
  GESTION_PROPIA,
  type ModoGestion,
  rutasGestion,
} from "../rutas-gestion"
import {
  CAMPOS_CAMPANA,
  CAMPOS_CAMPANA_ASISTIDA,
  esquemaEditarCampana,
  esquemaNuevaCampana,
  esquemaNuevaCampanaAsistida,
  LIMITES_CAMPANA,
  type ReglasCampana,
} from "../schemas"
import type { MiCampana } from "../tipos"
import { AvisoModoAsistido } from "./aviso-modo-asistido"
import { SelectorAnunciante } from "./selector-anunciante"

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
  /** A quién le hablan las ayudas: al anunciante o al equipo AMO por su cuenta. */
  voz?: VozGestion
}

/** Ayudas que cambian según quién llena el formulario. */
const TEXTOS_VOZ: Readonly<
  Record<
    VozGestion,
    { seccion: string; objetivo: string; ofertas: string; ofertasCifra: string }
  >
> = {
  propio: {
    seccion: "Cómo la reconoce tu equipo y qué quieres lograr con ella.",
    objetivo: "Qué quieres lograr",
    ofertas: "Tus ofertas",
    ofertasCifra: "tus ofertas",
  },
  asistido: {
    seccion: "Cómo la reconoce la empresa y qué quiere lograr con ella.",
    objetivo: "Qué quiere lograr la empresa",
    ofertas: "Sus ofertas",
    ofertasCifra: "sus ofertas",
  },
}

/** Los campos de la campaña, comunes a crearla y editarla. */
function CamposCampana({ reglas, pendiente, voz = "propio" }: CamposProps) {
  const textos = TEXTOS_VOZ[voz]
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
        descripcion={textos.seccion}
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
            descripcion={`${textos.objetivo}: alcance, visitas, un lanzamiento… Hasta ${LIMITES_CAMPANA.objetivoMax} caracteres.`}
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
                ? `${textos.ofertas} en revisión o publicadas se publican desde el ${diaLargo(reglas.inicioMaximo)}: la campaña debe empezar ese día o antes.`
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
                ? `${textos.ofertas} en revisión o publicadas se publican hasta el ${diaLargo(reglas.finMinimo)}: la campaña debe terminar ese día o después.`
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
                ? `No puede quedar por debajo de ${formatearCOP(reglas.presupuestoMinimo)}, lo que ya tienen comprometido ${textos.ofertasCifra} y los cupos aceptados.`
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
  const rutas = rutasGestion(GESTION_PROPIA)
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
      router.push(rutas.campana(id))
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
          cancelar={rutas.listado}
          pendiente={pendiente}
          texto="Crear campaña"
          textoPendiente="Creando…"
        />
      </form>
      {dialogoSalida}
    </FormProvider>
  )
}

/** Anunciante de la campaña asistida, con su ayuda y su error enlazados. */
function CampoAnunciante({
  anunciantes,
  pendiente,
}: {
  anunciantes: readonly OpcionAnuncianteGestion[]
  pendiente: boolean
}) {
  const { control } = useFormContext<{ anuncianteId: string }>()
  const id = useId()
  const idAyuda = useId()
  const idError = useId()
  return (
    <SeccionFormulario
      icono={Building2}
      titulo="Anunciante"
      descripcion="La empresa dueña de la campaña: la ve en «Mis campañas» y recibe un aviso cuando la creas, la activas o la cancelas."
    >
      <Controller
        control={control}
        name="anuncianteId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor={id}>Empresa</FieldLabel>
            <SelectorAnunciante
              ref={field.ref}
              id={id}
              valor={field.value}
              opciones={anunciantes}
              invalido={fieldState.invalid}
              descripcion={fieldState.error ? `${idAyuda} ${idError}` : idAyuda}
              deshabilitado={pendiente}
              onCambio={(anuncianteId) => {
                field.onChange(anuncianteId)
                field.onBlur()
              }}
            />
            <FieldDescription id={idAyuda}>
              Solo empresas registradas en AMO. Con cualquier estado se prepara
              la campaña en borrador; activarla exige la empresa verificada.
            </FieldDescription>
            <FieldError id={idError} errors={[fieldState.error]} />
          </Field>
        )}
      />
    </SeccionFormulario>
  )
}

/** Aviso de la gestión asistida con la empresa elegida en el formulario. */
function AvisoAnuncianteElegido({
  anunciantes,
}: {
  anunciantes: readonly OpcionAnuncianteGestion[]
}) {
  const anuncianteId = useWatch({ name: "anuncianteId" }) as string
  const elegido = anunciantes.find((opcion) => opcion.id === anuncianteId)
  return (
    <AvisoModoAsistido
      anunciante={elegido?.nombre ?? null}
      estado={elegido?.estado ?? null}
      enlace={elegido ? rutaAnunciante(elegido.id) : null}
    />
  )
}

/**
 * Alta de una campaña por cuenta de un anunciante (ADM-014): el equipo AMO
 * elige la empresa (preseleccionada si llega `?anunciante=`) y llena lo
 * mismo que el anunciante. Nace en BORRADOR, marcada como asistida, y la
 * empresa recibe un aviso; al crearla va a su ficha interna.
 */
export function FormularioNuevaCampanaAsistida({
  reglas,
  anunciantes,
  anuncianteInicial,
}: {
  reglas: ReglasCampana
  anunciantes: readonly OpcionAnuncianteGestion[]
  anuncianteInicial: string | null
}) {
  const router = useRouter()
  const esquema = useMemo(() => esquemaNuevaCampanaAsistida(reglas), [reglas])
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: valoresNuevaCampanaAsistida(
      anunciantes.some((opcion) => opcion.id === anuncianteInicial)
        ? anuncianteInicial
        : null
    ),
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: crearCampana,
    campos: CAMPOS_CAMPANA_ASISTIDA,
    onExito: ({ id }) => {
      const anunciante = anunciantes.find(
        (opcion) => opcion.id === formulario.getValues("anuncianteId")
      )
      formulario.reset(formulario.getValues())
      toast.success("Campaña creada", {
        description: anunciante
          ? `Por cuenta de ${anunciante.nombre}. Ahora arma sus ofertas.`
          : "Ahora arma sus ofertas para los medios.",
      })
      router.push(rutaCampana(id))
    },
  })
  const dialogoSalida = useSalidaSinGuardar(sucio && !pendiente)

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        noValidate
        aria-label="Nueva campaña por cuenta de un anunciante"
        className="flex flex-col gap-5"
      >
        <AvisoAnuncianteElegido anunciantes={anunciantes} />
        <ErrorGeneral mensaje={errorGeneral} />
        <CampoAnunciante anunciantes={anunciantes} pendiente={pendiente} />
        <CamposCampana reglas={reglas} pendiente={pendiente} voz="asistido" />
        <Pie
          cancelar={RUTAS_OPERACION.campanas}
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
 * En la gestión asistida (`gestion`) vuelve a la ficha interna.
 */
export function FormularioEditarCampana({
  campana,
  reglas,
  gestion = GESTION_PROPIA,
}: {
  campana: MiCampana
  reglas: ReglasCampana
  gestion?: ModoGestion
}) {
  const router = useRouter()
  const rutas = rutasGestion(gestion)
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
      router.push(rutas.campana(campana.id))
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
        <CamposCampana
          reglas={reglas}
          pendiente={pendiente}
          voz={esAsistido(gestion) ? "asistido" : "propio"}
        />
        <Pie
          cancelar={rutas.campana(campana.id)}
          pendiente={pendiente}
          texto="Guardar cambios"
          textoPendiente="Guardando…"
        />
      </form>
      {dialogoSalida}
    </FormProvider>
  )
}
