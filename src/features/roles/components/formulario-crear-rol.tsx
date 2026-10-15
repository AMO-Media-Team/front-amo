"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  CircleAlert,
  CopyPlus,
  Info,
  RotateCcw,
  ShieldPlus,
} from "lucide-react"
import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react"
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form"

import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SheetClose, SheetFooter } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"

import { crearRol, type RolCreado } from "../actions"
import { derivarClave, normalizarClave } from "../clave"
import { COLOR_ROL_POR_DEFECTO } from "../paleta"
import {
  DESCRIPCION_TIPO,
  ORDEN_TIPOS,
  pluralizar,
  TIPOS_ROL_ETIQUETA,
} from "../presentacion"
import { permisosClonables } from "../reglas"
import {
  type EntradaCrearRol,
  esquemaCrearRol,
  mfaObligatoria,
} from "../schemas"
import type { ActorRoles, RolListado, TipoRol } from "../tipos"
import {
  CampoDescripcion,
  CampoMfa,
  SelectorColor,
  VistaPreviaRol,
} from "./campos-rol"
import { ICONOS_TIPO } from "./iconos"

const CAMPOS = [
  "nombre",
  "clave",
  "descripcion",
  "tipo",
  "color",
  "requiereMfa",
  "clonarDesde",
] as const

const SIN_ORIGEN = ""

function valoresIniciales(origen: RolListado | undefined): EntradaCrearRol {
  if (!origen) {
    return {
      nombre: "",
      clave: "",
      descripcion: "",
      tipo: "ADMIN",
      color: COLOR_ROL_POR_DEFECTO,
      requiereMfa: true,
      clonarDesde: SIN_ORIGEN,
    }
  }
  const nombre = `${origen.nombre} (copia)`.slice(0, 60)
  return {
    nombre,
    clave: derivarClave(nombre),
    descripcion: origen.descripcion ?? "",
    tipo: origen.tipo,
    color: origen.color,
    requiereMfa: origen.requiereMfa,
    clonarDesde: origen.id,
  }
}

function esTipoRol(valor: unknown): valor is TipoRol {
  return (ORDEN_TIPOS as readonly unknown[]).includes(valor)
}

function OpcionTipo({ tipo }: { tipo: TipoRol }) {
  const Icono = ICONOS_TIPO[tipo]
  const id = `rol-tipo-${tipo.toLowerCase()}`
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal">
        <Icono className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <FieldContent>
          <FieldTitle>{TIPOS_ROL_ETIQUETA[tipo]}</FieldTitle>
          <FieldDescription>{DESCRIPCION_TIPO[tipo]}</FieldDescription>
        </FieldContent>
        <RadioGroupItem value={tipo} id={id} />
      </Field>
    </FieldLabel>
  )
}

function AvisoOmitidos({ children }: { children: ReactNode }) {
  return (
    <Alert className="border-warning/40 bg-warning/8 py-2">
      <Info className="text-warning" aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

function ResumenClonado({
  origen,
  actor,
  tipo,
}: {
  origen: RolListado
  actor: ActorRoles
  tipo: TipoRol
}) {
  const { copiables, sinAlcance, noAplicables } = permisosClonables(
    origen.permisos,
    actor,
    tipo
  )
  return (
    <div className="flex flex-col gap-2">
      <FieldDescription className="flex items-start gap-1.5">
        <CopyPlus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Copiará {pluralizar(copiables.length, "permiso", "permisos")} de «
          {origen.nombre}». Después podrás ajustarlos.
        </span>
      </FieldDescription>
      {noAplicables.length > 0 ? (
        <AvisoOmitidos>
          {pluralizar(
            noAplicables.length,
            "permiso no se copiará",
            "permisos no se copiarán"
          )}{" "}
          porque un rol de tipo «{TIPOS_ROL_ETIQUETA[tipo]}» no los admite.
        </AvisoOmitidos>
      ) : null}
      {sinAlcance.length > 0 ? (
        <AvisoOmitidos>
          {pluralizar(
            sinAlcance.length,
            "permiso no se copiará",
            "permisos no se copiarán"
          )}{" "}
          porque tú no los tienes.
        </AvisoOmitidos>
      ) : null}
    </div>
  )
}

/**
 * Alta de un rol personalizado: la clave se deriva del nombre hasta que la
 * persona la edita; el tipo del equipo interno fuerza la verificación en dos
 * pasos; "a partir de" copia los permisos de otro rol que el actor tenga.
 */
export function FormularioCrearRol({
  roles,
  actor,
  origenInicial,
  onCreado,
  onSucio,
}: {
  roles: readonly RolListado[]
  actor: ActorRoles
  origenInicial: string | null
  onCreado: (resultado: RolCreado) => void
  onSucio: (sucio: boolean) => void
}) {
  const inicial = useMemo(
    () => valoresIniciales(roles.find((rol) => rol.id === origenInicial)),
    [roles, origenInicial]
  )
  const formulario = useForm({
    resolver: zodResolver(esquemaCrearRol),
    defaultValues: inicial,
    mode: "onTouched",
  })
  const {
    control,
    register,
    formState,
    handleSubmit,
    getValues,
    setValue,
    setError,
  } = formulario
  const [claveManual, setClaveManual] = useState(false)
  // Si la persona eligió el tipo (aunque sea el predeterminado), el rol de
  // origen ya no lo cambia.
  const [tipoManual, setTipoManual] = useState(false)
  // Si la persona no tocó el interruptor de MFA, sigue al tipo (y al rol de origen).
  const [mfaManual, setMfaManual] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const [tipo, clave, clonarDesde] = useWatch({
    control,
    name: ["tipo", "clave", "clonarDesde"],
  })
  const origen = roles.find((rol) => rol.id === clonarDesde)
  const errorServidor = formState.errors.root?.servidor?.message
  const sucio = formState.isDirty

  // La hoja pide confirmación antes de cerrarse con cambios sin guardar.
  useEffect(() => onSucio(sucio), [sucio, onSucio])

  const enviar = handleSubmit(() =>
    iniciar(async () => {
      const resultado = await crearRol(getValues())
      if (!resultado.ok) {
        aplicarErroresServidor(setError, resultado, CAMPOS)
        return
      }
      onSucio(false)
      onCreado(resultado.datos)
    })
  )

  function sugerirClave(nombre: string) {
    if (claveManual) return
    setValue("clave", derivarClave(nombre), {
      shouldValidate: Boolean(formState.touchedFields.clave),
    })
  }

  function restablecerClave() {
    setClaveManual(false)
    setValue("clave", derivarClave(getValues("nombre")), {
      shouldValidate: true,
    })
  }

  function ajustarMfa(tipoElegido: TipoRol, sugerida: boolean) {
    if (mfaObligatoria(tipoElegido)) setValue("requiereMfa", true)
    else if (!mfaManual) setValue("requiereMfa", sugerida)
  }

  function elegirTipo(tipoElegido: TipoRol) {
    setTipoManual(true)
    setValue("tipo", tipoElegido, { shouldDirty: true, shouldTouch: true })
    ajustarMfa(tipoElegido, false)
  }

  function elegirOrigen(id: string) {
    setValue("clonarDesde", id, { shouldDirty: true })
    const elegido = roles.find((rol) => rol.id === id)
    // Sugerencia: el mismo tipo del rol de origen, si aún no se eligió uno.
    if (elegido && !tipoManual) {
      setValue("tipo", elegido.tipo)
      ajustarMfa(elegido.tipo, elegido.requiereMfa)
    }
  }

  const gruposOrigen = ORDEN_TIPOS.map((grupo) => ({
    tipo: grupo,
    roles: roles.filter((rol) => rol.tipo === grupo),
  })).filter((grupo) => grupo.roles.length > 0)

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        aria-describedby={errorServidor ? "crear-rol-error" : undefined}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          <VistaPreviaRol clave={clave} tipo={tipo} />

          {errorServidor ? (
            <Alert variant="destructive" id="crear-rol-error">
              <CircleAlert aria-hidden />
              <AlertDescription>{errorServidor}</AlertDescription>
            </Alert>
          ) : null}

          <Field data-invalid={formState.errors.nombre ? true : undefined}>
            <FieldLabel htmlFor="rol-nombre">Nombre</FieldLabel>
            <Input
              id="rol-nombre"
              autoComplete="off"
              autoFocus
              maxLength={60}
              placeholder="Ej.: Analista de campañas"
              disabled={pendiente}
              aria-invalid={formState.errors.nombre ? true : undefined}
              {...register("nombre", {
                onChange: (evento) => sugerirClave(evento.target.value),
              })}
            />
            <FieldError errors={[formState.errors.nombre]} />
          </Field>

          <Field data-invalid={formState.errors.clave ? true : undefined}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="rol-clave">Clave</FieldLabel>
              {claveManual ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={restablecerClave}
                  disabled={pendiente}
                >
                  <RotateCcw data-icon="inline-start" aria-hidden />
                  Usar la sugerida
                </Button>
              ) : null}
            </div>
            <Input
              id="rol-clave"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              placeholder="ANALISTA_DE_CAMPANAS"
              disabled={pendiente}
              aria-invalid={formState.errors.clave ? true : undefined}
              className="font-mono text-[0.8125rem] tracking-wide uppercase"
              {...register("clave", {
                onChange: (evento) => {
                  const normalizada = normalizarClave(evento.target.value)
                  setValue("clave", normalizada)
                  setClaveManual(normalizada !== "")
                },
              })}
            />
            <FieldDescription>
              Identificador permanente para integraciones y la bitácora: no se
              puede cambiar después de crear el rol.
            </FieldDescription>
            <FieldError errors={[formState.errors.clave]} />
          </Field>

          <CampoDescripcion
            deshabilitado={pendiente}
            error={formState.errors.descripcion}
          />

          <Controller
            control={control}
            name="tipo"
            render={({ field, fieldState }) => (
              <FieldSet data-invalid={fieldState.invalid || undefined}>
                <FieldLegend variant="label">Tipo de usuario</FieldLegend>
                <FieldDescription>
                  Define el alcance de los datos que verá. No se puede cambiar
                  después.
                </FieldDescription>
                <RadioGroup
                  value={field.value}
                  onValueChange={(valor) => {
                    if (esTipoRol(valor)) elegirTipo(valor)
                  }}
                  onBlur={field.onBlur}
                  disabled={pendiente}
                >
                  {ORDEN_TIPOS.map((opcion) => (
                    <OpcionTipo key={opcion} tipo={opcion} />
                  ))}
                </RadioGroup>
                <FieldError errors={[fieldState.error]} />
              </FieldSet>
            )}
          />

          <CampoMfa
            tipo={tipo}
            deshabilitado={pendiente}
            onCambio={() => setMfaManual(true)}
          />

          <SelectorColor deshabilitado={pendiente} />

          <Field data-invalid={formState.errors.clonarDesde ? true : undefined}>
            <FieldLabel htmlFor="rol-origen">Permisos iniciales</FieldLabel>
            <Select
              value={clonarDesde ?? SIN_ORIGEN}
              onValueChange={(valor) => elegirOrigen(valor ?? SIN_ORIGEN)}
              items={[
                { value: SIN_ORIGEN, label: "Empezar sin permisos" },
                ...roles.map((rol) => ({
                  value: rol.id,
                  label: `Copiar de ${rol.nombre}`,
                })),
              ]}
              disabled={pendiente}
            >
              <SelectTrigger id="rol-origen" className="w-full">
                {origen ? (
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: origen.color }}
                  />
                ) : (
                  <ShieldPlus aria-hidden />
                )}
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={SIN_ORIGEN}>Empezar sin permisos</SelectItem>
                <SelectSeparator />
                {gruposOrigen.map((grupo) => (
                  <SelectGroup key={grupo.tipo}>
                    <SelectLabel>{TIPOS_ROL_ETIQUETA[grupo.tipo]}</SelectLabel>
                    {grupo.roles.map((rol) => (
                      <SelectItem key={rol.id} value={rol.id}>
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: rol.color }}
                        />
                        Copiar de {rol.nombre}
                        <span className="ml-auto pl-3 text-xs cifras text-muted-foreground">
                          {rol.permisos.length}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {origen ? (
              <ResumenClonado origen={origen} actor={actor} tipo={tipo} />
            ) : (
              <FieldDescription>
                Crea el rol vacío y elige sus permisos en la matriz, o parte de
                un rol existente.
              </FieldDescription>
            )}
            <FieldError errors={[formState.errors.clonarDesde]} />
          </Field>
        </div>

        <SheetFooter className="border-t bg-muted/30 sm:flex-row sm:justify-end">
          <SheetClose
            render={
              <Button variant="outline" type="button" disabled={pendiente} />
            }
          >
            Cancelar
          </SheetClose>
          <Button type="submit" disabled={pendiente}>
            {pendiente ? (
              <Spinner aria-label="Creando" data-icon="inline-start" />
            ) : (
              <ShieldPlus data-icon="inline-start" aria-hidden />
            )}
            Crear rol
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  )
}
