"use client"

import { Building2, Info, RadioTower, ShieldCheck } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import { Controller, useFormContext, useWatch } from "react-hook-form"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { TIPOS_ROL_ETIQUETA } from "../presentacion"
import { exigeOrganizacion } from "../schemas"
import type { Organizaciones, RolAsignable, TipoRol } from "../tipos"

/** Campos comunes al alta y a la edición (nombres de `esquemaDatosUsuario`). */
export type CamposComunesUsuario = {
  nombre: string
  celular: string
  rolId: string
  organizacionId: string | null
}

const ORDEN_TIPOS: readonly TipoRol[] = ["ADMIN", "ANUNCIANTE", "MEDIO"]

const ORGANIZACION = {
  ANUNCIANTE: {
    etiqueta: "Anunciante",
    Icono: Building2,
    vacio: "Aún no hay anunciantes registrados.",
    ruta: "/operacion/anunciantes",
    seccion: "Operación › Anunciantes",
  },
  MEDIO: {
    etiqueta: "Medio",
    Icono: RadioTower,
    vacio: "Aún no hay medios registrados.",
    ruta: "/operacion/medios",
    seccion: "Operación › Medios",
  },
} as const

interface CamposUsuarioProps {
  roles: readonly RolAsignable[]
  organizaciones: Organizaciones
  /** Edición de la propia cuenta: el rol no se puede cambiar (AMO_ROL_PROPIO). */
  rolBloqueado?: boolean
  deshabilitado?: boolean
}

function SelectorOrganizacion({
  tipo,
  organizaciones,
  deshabilitado,
}: {
  tipo: "ANUNCIANTE" | "MEDIO"
  organizaciones: Organizaciones
  deshabilitado?: boolean
}) {
  const { control } = useFormContext<CamposComunesUsuario>()
  const config = ORGANIZACION[tipo]
  const opciones =
    tipo === "ANUNCIANTE" ? organizaciones.anunciantes : organizaciones.medios

  if (opciones.length === 0) {
    return (
      <Alert>
        <Info aria-hidden />
        <AlertDescription>
          {config.vacio} Regístralo primero en{" "}
          <Link
            href={config.ruta as Route}
            className="font-medium underline underline-offset-3"
          >
            {config.seccion}
          </Link>{" "}
          y vuelve a invitar a su equipo.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Controller
      control={control}
      name="organizacionId"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor="usuario-organizacion">
            {config.etiqueta}
          </FieldLabel>
          <Select
            value={field.value}
            onValueChange={(valor) => field.onChange(valor)}
            items={opciones.map((opcion) => ({
              value: opcion.id,
              label: opcion.nombre,
            }))}
            disabled={deshabilitado}
          >
            <SelectTrigger
              id="usuario-organizacion"
              className="w-full"
              aria-invalid={fieldState.invalid || undefined}
            >
              <config.Icono aria-hidden />
              <SelectValue
                placeholder={`Elige el ${config.etiqueta.toLocaleLowerCase("es-CO")}`}
              />
            </SelectTrigger>
            <SelectContent>
              {opciones.map((opcion) => (
                <SelectItem key={opcion.id} value={opcion.id}>
                  {opcion.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

/**
 * Nombre, celular, rol (solo los asignables por el actor) y organización
 * (cuando el rol es de anunciante o medio). Se usan dentro de un
 * `<FormProvider>` de react-hook-form.
 */
export function CamposUsuario({
  roles,
  organizaciones,
  rolBloqueado = false,
  deshabilitado = false,
}: CamposUsuarioProps) {
  const { control, register, formState } =
    useFormContext<CamposComunesUsuario>()
  const rolId = useWatch({ control, name: "rolId" })
  const rolElegido = roles.find((rol) => rol.id === rolId)
  const tipoOrganizacion =
    rolElegido && exigeOrganizacion(rolElegido.tipo)
      ? (rolElegido.tipo as "ANUNCIANTE" | "MEDIO")
      : null
  const grupos = ORDEN_TIPOS.map((tipo) => ({
    tipo,
    roles: roles.filter((rol) => rol.tipo === tipo),
  })).filter((grupo) => grupo.roles.length > 0)

  return (
    <FieldGroup>
      <Field data-invalid={formState.errors.nombre ? true : undefined}>
        <FieldLabel htmlFor="usuario-nombre">Nombre completo</FieldLabel>
        <Input
          id="usuario-nombre"
          autoComplete="off"
          disabled={deshabilitado}
          aria-invalid={formState.errors.nombre ? true : undefined}
          {...register("nombre")}
        />
        <FieldError errors={[formState.errors.nombre]} />
      </Field>

      <Field data-invalid={formState.errors.celular ? true : undefined}>
        <FieldLabel htmlFor="usuario-celular">
          Celular{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </FieldLabel>
        <Input
          id="usuario-celular"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="+57 300 123 4567"
          disabled={deshabilitado}
          aria-invalid={formState.errors.celular ? true : undefined}
          {...register("celular")}
        />
        <FieldError errors={[formState.errors.celular]} />
      </Field>

      <Controller
        control={control}
        name="rolId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="usuario-rol">Rol</FieldLabel>
            <Select
              value={field.value || null}
              onValueChange={(valor) => field.onChange(valor ?? "")}
              items={roles.map((rol) => ({ value: rol.id, label: rol.nombre }))}
              disabled={deshabilitado || rolBloqueado}
            >
              <SelectTrigger
                id="usuario-rol"
                className="w-full"
                aria-invalid={fieldState.invalid || undefined}
              >
                {rolElegido ? (
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: rolElegido.color }}
                  />
                ) : null}
                <SelectValue placeholder="Elige un rol" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {grupos.map((grupo) => (
                  <SelectGroup key={grupo.tipo}>
                    <SelectLabel>{TIPOS_ROL_ETIQUETA[grupo.tipo]}</SelectLabel>
                    {grupo.roles.map((rol) => (
                      <SelectItem key={rol.id} value={rol.id}>
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: rol.color }}
                        />
                        {rol.nombre}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {rolBloqueado ? (
              <FieldDescription>
                No puedes cambiar tu propio rol.
              </FieldDescription>
            ) : rolElegido ? (
              <FieldDescription className="flex items-start gap-1.5">
                {rolElegido.requiereMfa ? (
                  <ShieldCheck
                    className="mt-0.5 size-3.5 shrink-0 text-success"
                    aria-hidden
                  />
                ) : null}
                <span>
                  {rolElegido.descripcion ??
                    TIPOS_ROL_ETIQUETA[rolElegido.tipo]}
                  {rolElegido.requiereMfa
                    ? " Exige verificación en dos pasos."
                    : ""}
                </span>
              </FieldDescription>
            ) : (
              <FieldDescription>
                Solo ves los roles que puedes asignar con tus permisos.
              </FieldDescription>
            )}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {tipoOrganizacion ? (
        <SelectorOrganizacion
          tipo={tipoOrganizacion}
          organizaciones={organizaciones}
          deshabilitado={deshabilitado}
        />
      ) : null}
    </FieldGroup>
  )
}

/** ¿El rol elegido necesita una organización que todavía no existe? (bloquea el envío). */
export function faltaOrganizacion(
  roles: readonly RolAsignable[],
  organizaciones: Organizaciones,
  rolId: string
): boolean {
  const tipo = roles.find((rol) => rol.id === rolId)?.tipo
  if (tipo === "ANUNCIANTE") return organizaciones.anunciantes.length === 0
  if (tipo === "MEDIO") return organizaciones.medios.length === 0
  return false
}
