"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Bell,
  BellRing,
  Braces,
  ChevronRight,
  History,
  Mail,
  Search,
  TriangleAlert,
} from "lucide-react"
import { useRef, useState } from "react"
import { FormProvider, useForm, useFormState, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"
import { formatearRelativo } from "@/lib/format"
import { normalizarNombreGeo } from "@/lib/geo/normalizar"
import { cn } from "@/lib/utils"

import { guardarPlantilla } from "../actions"
import { valoresPlantilla } from "../formularios"
import { agruparPlantillas, ejemploDe, revisarVariables } from "../plantillas"
import { NOMBRES_CANAL, pluralizar } from "../presentacion"
import { type EntradaPlantilla, esquemaPlantilla } from "../schemas"
import type { CanalNotificacion, Plantilla } from "../tipos"
import { Bloque, CELDA_DIVIDIDA, CUADRICULA_DIVIDIDA } from "./bloque"
import { CampoInterruptor, CampoTexto } from "./campos"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import {
  CuerpoHoja,
  FormularioHoja,
  HojaLateral,
  useHojaLateral,
} from "./hoja-lateral"
import { Insignia } from "./insignias"
import { useEnvio } from "./use-envio"
import { VistaMarkdown } from "./vista-markdown"

const CAMPOS = [
  "nombre",
  "asunto",
  "cuerpo",
] as const satisfies readonly (keyof EntradaPlantilla)[]

const ICONOS_CANAL: Readonly<Record<CanalNotificacion, typeof Mail>> = {
  EMAIL: Mail,
  APP: Bell,
  WHATSAPP: BellRing,
  PUSH: BellRing,
}

/**
 * Plantillas de los avisos que reciben las personas (en la aplicación y por
 * correo). Se editan el texto y el asunto con sus variables `{{x}}`; la
 * vista previa usa valores de ejemplo. Las plantillas nuevas llegan por
 * migración (no se crean aquí).
 */
export function PlantillasNotificacion({
  plantillas,
}: {
  plantillas: readonly Plantilla[]
}) {
  const [busqueda, setBusqueda] = useState("")
  const [elegida, setElegida] = useState<Plantilla | null>(null)
  const [abierta, setAbierta] = useState(false)
  const permisos = usePermisosConfiguracion()
  const texto = normalizarNombreGeo(busqueda)
  const filtradas = plantillas.filter(
    (p) =>
      !texto ||
      normalizarNombreGeo(p.nombre).includes(texto) ||
      p.clave.includes(busqueda.trim().toLowerCase())
  )
  const grupos = agruparPlantillas(filtradas)
  const inactivas = plantillas.filter((p) => !p.activa).length

  return (
    <Bloque
      id="plantillas"
      titulo="Plantillas de notificación"
      descripcion={`${pluralizar(plantillas.length, "plantilla", "plantillas")}${inactivas > 0 ? ` · ${pluralizar(inactivas, "desactivada", "desactivadas")}` : ""}. Elige una para ${permisos.catalogos ? "editarla" : "ver su texto"}.`}
      icono={BellRing}
    >
      {plantillas.length === 0 ? (
        <EstadoVacio
          icono={BellRing}
          variante="simple"
          titulo="Sin plantillas"
          descripcion="Las plantillas se crean con las migraciones de notificaciones."
          className="py-8"
        />
      ) : (
        <>
          <div className="border-b px-4 py-3 sm:px-5">
            <InputGroup className="sm:max-w-72">
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Buscar por nombre o clave…"
                aria-label="Buscar plantillas"
              />
            </InputGroup>
          </div>
          {grupos.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Ninguna plantilla coincide con «{busqueda}».
            </p>
          ) : (
            <div className="@container">
              <div className={cn(CUADRICULA_DIVIDIDA, "@2xl:grid-cols-2")}>
                {grupos.map((grupo) => (
                  <section
                    key={grupo.dominio}
                    aria-labelledby={`plantillas-${grupo.dominio}`}
                    className={CELDA_DIVIDIDA}
                  >
                    <h4
                      id={`plantillas-${grupo.dominio}`}
                      className="px-4 pt-3 pb-1 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase sm:px-5"
                    >
                      {grupo.titulo}
                    </h4>
                    <ul className="flex flex-col pb-2">
                      {grupo.plantillas.map((plantilla) => {
                        const Icono = ICONOS_CANAL[plantilla.canal]
                        return (
                          <li key={`${plantilla.clave}:${plantilla.canal}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setElegida(plantilla)
                                setAbierta(true)
                              }}
                              className="group/plantilla flex w-full items-center gap-3 px-4 py-2 text-left outline-none hover:bg-muted/50 focus-visible:anillo-foco sm:px-5"
                            >
                              <span
                                aria-hidden
                                className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                              >
                                <Icono className="size-4" />
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span
                                  className={cn(
                                    "flex items-center gap-2 truncate text-sm font-medium",
                                    !plantilla.activa && "text-muted-foreground"
                                  )}
                                >
                                  <span className="truncate">
                                    {plantilla.nombre}
                                  </span>
                                  {plantilla.activa ? null : (
                                    <Insignia tono="neutro">
                                      Desactivada
                                    </Insignia>
                                  )}
                                </span>
                                {/* Si no cabe, se recorta la clave técnica; el canal siempre se lee. */}
                                <span className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                                  <span className="truncate font-mono">
                                    {plantilla.clave}
                                  </span>
                                  <span aria-hidden>·</span>
                                  <span className="shrink-0">
                                    {NOMBRES_CANAL[plantilla.canal]}
                                  </span>
                                </span>
                              </span>
                              <ChevronRight
                                aria-hidden
                                className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/plantilla:opacity-100"
                              />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <HojaLateral
        abierta={abierta}
        onAbiertaChange={setAbierta}
        icono={elegida?.canal === "EMAIL" ? Mail : Bell}
        titulo={elegida?.nombre ?? "Plantilla"}
        descripcion={
          elegida ? (
            <span className="font-mono text-xs">
              {elegida.clave} · {NOMBRES_CANAL[elegida.canal]}
            </span>
          ) : undefined
        }
        ancho="xl"
      >
        {elegida ? (
          permisos.catalogos ? (
            <FormularioPlantilla plantilla={elegida} />
          ) : (
            <CuerpoHoja>
              <VistaPrevia
                canal={elegida.canal}
                asunto={elegida.asunto}
                cuerpo={elegida.cuerpo}
              />
            </CuerpoHoja>
          )
        ) : null}
      </HojaLateral>
    </Bloque>
  )
}

function FormularioPlantilla({ plantilla }: { plantilla: Plantilla }) {
  const { cerrar } = useHojaLateral()
  const abrirHistorial = useHistorial()
  const area = useRef<HTMLTextAreaElement | null>(null)
  const formulario = useForm({
    resolver: zodResolver(esquemaPlantilla),
    defaultValues: valoresPlantilla(plantilla),
    mode: "onTouched",
  })
  const { control, register, setValue, getValues } = formulario
  const { errors } = useFormState({ control, name: "cuerpo" })
  const [asunto, cuerpo] = useWatch({ control, name: ["asunto", "cuerpo"] })
  const revision = revisarVariables(plantilla.variables, asunto, cuerpo ?? "")
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarPlantilla,
    campos: CAMPOS,
    onExito: () => {
      toast.success("Plantilla guardada", { description: plantilla.nombre })
      cerrar()
    },
  })
  const { ref, ...campoCuerpo } = register("cuerpo")

  function insertar(variable: string) {
    const elemento = area.current
    const actual = getValues("cuerpo") ?? ""
    const ficha = `{{${variable}}}`
    const inicio = elemento?.selectionStart ?? actual.length
    const fin = elemento?.selectionEnd ?? actual.length
    setValue(
      "cuerpo",
      `${actual.slice(0, inicio)}${ficha}${actual.slice(fin)}`,
      {
        shouldDirty: true,
        shouldValidate: true,
      }
    )
    requestAnimationFrame(() => {
      elemento?.focus()
      elemento?.setSelectionRange(inicio + ficha.length, inicio + ficha.length)
    })
  }

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar="Guardar plantilla"
        envioDeshabilitado={revision.desconocidas.length > 0}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-5">
            <CampoTexto
              nombre="nombre"
              etiqueta="Nombre interno"
              deshabilitado={pendiente}
            />
            {plantilla.canal === "EMAIL" ? (
              <CampoTexto
                nombre="asunto"
                etiqueta="Asunto del correo"
                deshabilitado={pendiente}
              />
            ) : null}
            <Field data-invalid={errors.cuerpo ? true : undefined}>
              <FieldLabel htmlFor="plantilla-cuerpo">
                Texto del aviso
              </FieldLabel>
              <Textarea
                id="plantilla-cuerpo"
                rows={9}
                disabled={pendiente}
                aria-invalid={errors.cuerpo ? true : undefined}
                className="resize-y font-mono text-[0.8125rem]"
                {...campoCuerpo}
                ref={(elemento) => {
                  ref(elemento)
                  area.current = elemento
                }}
              />
              <FieldDescription>
                Markdown sencillo: **negrita**, listas con guion.
              </FieldDescription>
              <FieldError errors={[errors.cuerpo]} />
            </Field>
            {plantilla.variables.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Braces aria-hidden className="size-3.5" />
                  Variables disponibles (clic para insertar)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {plantilla.variables.map((variable) => (
                    <Button
                      key={variable}
                      type="button"
                      variant="outline"
                      size="xs"
                      className={cn(
                        "font-mono",
                        revision.sinUsar.includes(variable) &&
                          "border-dashed text-muted-foreground"
                      )}
                      disabled={pendiente}
                      onClick={() => insertar(variable)}
                      title={`Ejemplo: ${ejemploDe(variable)}`}
                    >
                      {`{{${variable}}}`}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {revision.desconocidas.length > 0 ? (
              <p
                role="alert"
                className="flex gap-2 rounded-lg bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
              >
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  {revision.desconocidas.map((v) => `{{${v}}}`).join(", ")}{" "}
                  {revision.desconocidas.length === 1
                    ? "no es una variable"
                    : "no son variables"}{" "}
                  de esta plantilla: el sistema no{" "}
                  {revision.desconocidas.length === 1 ? "la" : "las"}{" "}
                  reemplazaría.
                </span>
              </p>
            ) : null}
            <CampoInterruptor
              nombre="activa"
              etiqueta="Plantilla activa"
              descripcion="Desactivada, este aviso deja de enviarse por este canal."
              deshabilitado={pendiente}
            />
            {abrirHistorial ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 self-start text-muted-foreground"
                onClick={() =>
                  abrirHistorial({
                    entidad: "plantillas_notificacion",
                    entidadId: plantilla.clave,
                    titulo: plantilla.nombre,
                    // La creación (semilla) guarda la fila entera: basta lo editable.
                    camposCreacion: ["nombre", "asunto", "cuerpo", "activa"],
                  })
                }
              >
                <History data-icon="inline-start" aria-hidden />
                Ver historial · actualizada{" "}
                {formatearRelativo(plantilla.actualizadoAt)}
              </Button>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-0 lg:self-start">
            <span className="text-xs font-medium text-muted-foreground">
              Vista previa con datos de ejemplo
            </span>
            <VistaPrevia
              canal={plantilla.canal}
              asunto={asunto ?? null}
              cuerpo={cuerpo ?? ""}
            />
          </div>
        </div>
      </FormularioHoja>
    </FormProvider>
  )
}

/** Cómo se vería el aviso: correo (asunto + cuerpo) o notificación en la aplicación. */
function VistaPrevia({
  canal,
  asunto,
  cuerpo,
}: {
  canal: CanalNotificacion
  asunto: string | null
  cuerpo: string
}) {
  const reemplazar = (texto: string) =>
    texto.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (_, variable: string) =>
      ejemploDe(variable.toLowerCase())
    )

  if (canal === "EMAIL") {
    return (
      <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
        <div className="flex flex-col gap-0.5 border-b bg-muted/40 px-4 py-3">
          {/* Sin dirección: el remitente real se configura en el servicio de correo. */}
          <span className="text-xs text-muted-foreground">De: AMO</span>
          <span className="text-sm font-semibold">
            {asunto ? reemplazar(asunto) : "(sin asunto)"}
          </span>
        </div>
        <div className="px-4 py-4">
          <VistaMarkdown texto={cuerpo} valores={ejemploDe} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-3 rounded-xl border bg-background p-4 shadow-xs">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary"
      >
        <Bell className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <VistaMarkdown texto={cuerpo} valores={ejemploDe} />
        <span className="text-xs text-muted-foreground">Hace un momento</span>
      </div>
    </div>
  )
}
