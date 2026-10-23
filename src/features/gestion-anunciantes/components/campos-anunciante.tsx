"use client"

import { Building2, LockKeyhole, MapPin, Receipt } from "lucide-react"
import { type ReactNode, useId } from "react"
import {
  Controller,
  useFormContext,
  useFormState,
  useWatch,
} from "react-hook-form"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { SelectorTerritorio } from "@/components/territorio/selector-territorio"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  CampoSelect,
  CampoTexto,
  type OpcionCampo,
} from "@/features/configuracion/components/campos"
import { formatearNit, normalizarNit } from "@/lib/colombia/nit"

import { type EntradaAnunciante, PAIS_COLOMBIA } from "../schemas"
import type { CatalogosAnunciante, OpcionSector } from "../tipos"
import { CamposNit } from "./campos-nit"
import { SelectorPais } from "./selector-pais"

const CAMPOS_COLOMBIA = [
  "nit",
  "digitoVerificacion",
  "municipioCodigo",
] as const
const CAMPOS_EXTRANJERO = [
  "identificacionExtranjera",
  "ciudadExtranjera",
] as const

function Seccion({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof Building2
  titulo: string
  children: ReactNode
}) {
  return (
    <FieldSet className="gap-5">
      <FieldLegend className="mb-0 flex items-center gap-2 text-sm font-semibold">
        <Icono aria-hidden className="size-4 text-primary" />
        {titulo}
      </FieldLegend>
      {children}
    </FieldSet>
  )
}

/** Sectores activos y, si ya no lo está, el que tiene hoy el anunciante. */
function opcionesSector(
  sectores: readonly OpcionSector[],
  actual: OpcionSector | null
): OpcionCampo[] {
  const opciones = sectores.map((s) => ({ valor: s.id, etiqueta: s.nombre }))
  if (actual && !sectores.some((s) => s.id === actual.id)) {
    opciones.unshift({
      valor: actual.id,
      etiqueta: `${actual.nombre} (inactivo)`,
    })
  }
  return opciones
}

function CampoPais({
  catalogos,
  deshabilitado,
}: {
  catalogos: CatalogosAnunciante
  deshabilitado?: boolean
}) {
  const { control, clearErrors } = useFormContext<EntradaAnunciante>()
  const id = useId()
  return (
    <Controller
      control={control}
      name="paisIso2"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>País</FieldLabel>
          <SelectorPais
            id={id}
            valor={field.value}
            paises={catalogos.paises}
            invalido={fieldState.invalid}
            deshabilitado={deshabilitado}
            onCambio={(iso2) => {
              // Lo escrito para el otro país se conserva (por si vuelve), sin sus errores.
              clearErrors(
                iso2 === PAIS_COLOMBIA
                  ? [...CAMPOS_EXTRANJERO]
                  : [...CAMPOS_COLOMBIA]
              )
              field.onChange(iso2)
              field.onBlur()
            }}
          />
          <FieldDescription>
            Donde está constituida la empresa.
          </FieldDescription>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

/** Sede en Colombia: departamento → municipio, solo los activos. */
function CampoMunicipio({ deshabilitado }: { deshabilitado?: boolean }) {
  const { control } = useFormContext<EntradaAnunciante>()
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  return (
    <Controller
      control={control}
      name="municipioCodigo"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <SelectorTerritorio
            modo="municipio"
            id={id}
            valor={field.value}
            invalido={fieldState.invalid}
            deshabilitado={deshabilitado}
            describedBy={fieldState.invalid ? `${idAyuda} ${idError}` : idAyuda}
            onCambio={(municipio) => {
              field.onChange(municipio?.codigo ?? "")
              field.onBlur()
            }}
          />
          <FieldDescription id={idAyuda}>
            Ciudad de la sede principal, como figura en el RUT.
          </FieldDescription>
          <FieldError id={idError} errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

function CampoCorreoFacturacion({
  deshabilitado,
}: {
  deshabilitado?: boolean
}) {
  const { control, register, getFieldState } =
    useFormContext<EntradaAnunciante>()
  const estado = useFormState({ control, name: "emailFacturacion" })
  const { error } = getFieldState("emailFacturacion", estado)
  const id = useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        Correo de facturación
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </FieldLabel>
      <Input
        id={id}
        type="email"
        inputMode="email"
        autoComplete="off"
        placeholder="facturacion@empresa.com"
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        {...register("emailFacturacion")}
      />
      <FieldDescription>
        Allí llegarán las facturas electrónicas de AMO.
      </FieldDescription>
      <FieldError errors={[error]} />
    </Field>
  )
}

/**
 * Dato de identificación que ya no se edita (empresa verificada): se lee y se
 * copia, pero no se escribe. Un `readOnly` (no `disabled`) sigue siendo
 * enfocable y conserva el contraste. Observa solo sus campos (no hace
 * repintar el resto del formulario). Si el valor guardado no pasa la
 * validación (dato heredado), el error se muestra aquí con la nota que dice a
 * quién pedir la corrección.
 */
function CampoBloqueado({
  etiqueta,
  nombres,
  mostrar = (valores) => valores.join(" "),
  idNota,
}: {
  etiqueta: string
  nombres: readonly (keyof EntradaAnunciante)[]
  /** Texto a partir de los valores de `nombres`, en el mismo orden. */
  mostrar?: (valores: readonly string[]) => string
  idNota: string
}) {
  const { control, getFieldState } = useFormContext<EntradaAnunciante>()
  const valores = useWatch({ control, name: [...nombres] }) as string[]
  const estado = useFormState({ control, name: [...nombres] })
  const error = nombres
    .map((nombre) => getFieldState(nombre, estado).error)
    .find(Boolean)
  const id = useId()
  const idError = `${id}-error`
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <InputGroup className="bg-muted/40 dark:bg-muted/30">
        <InputGroupInput
          id={id}
          value={mostrar(valores)}
          readOnly
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${idNota} ${idError}` : idNota}
        />
        <InputGroupAddon align="inline-end">
          <LockKeyhole aria-hidden />
        </InputGroupAddon>
      </InputGroup>
      <FieldError id={idError} errors={[error]} />
    </Field>
  )
}

/** Por qué la identificación es de solo lectura y a quién pedir un cambio. */
function NotaIdentificacionBloqueada({ id }: { id: string }) {
  return (
    <p
      id={id}
      className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-pretty text-muted-foreground"
    >
      <LockKeyhole
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-primary"
      />
      <span>
        La empresa ya está verificada: la razón social, el país y la
        identificación tributaria solo los corrige el equipo de AMO. Si
        cambiaron, escríbele.
      </span>
    </p>
  )
}

/**
 * Campos del anunciante (registro y edición), dentro de un `FormProvider`:
 * empresa, identificación y ubicación según el país, y facturación.
 */
export function CamposAnunciante({
  catalogos,
  sectorActual = null,
  deshabilitado,
  enfocarPrimero = false,
  identificacionBloqueada = false,
}: {
  catalogos: CatalogosAnunciante
  /** Edición: el sector vigente, aunque ya no esté activo. */
  sectorActual?: OpcionSector | null
  deshabilitado?: boolean
  enfocarPrimero?: boolean
  /**
   * Empresa verificada o suspendida que edita sus propios datos: razón
   * social, país, NIT y DV o identificación extranjera quedan de solo
   * lectura (la BD solo deja cambiarlos al equipo AMO). Sede, ciudad y lo
   * demás siguen editables.
   */
  identificacionBloqueada?: boolean
}) {
  const { control } = useFormContext<EntradaAnunciante>()
  const pais = useWatch({ control, name: "paisIso2" })
  const colombiana = pais === PAIS_COLOMBIA
  const idNota = useId()
  const bloqueada = identificacionBloqueada

  return (
    <>
      <Seccion icono={Building2} titulo="Empresa">
        {bloqueada ? (
          <>
            <NotaIdentificacionBloqueada id={idNota} />
            <CampoBloqueado
              etiqueta="Razón social"
              nombres={["razonSocial"]}
              idNota={idNota}
            />
          </>
        ) : (
          <CampoTexto
            nombre="razonSocial"
            etiqueta="Razón social"
            placeholder="Comercializadora Andina S.A.S."
            descripcion="Tal como aparece en el RUT o en el certificado de existencia."
            deshabilitado={deshabilitado}
            autoFocus={enfocarPrimero}
          />
        )}
        <CampoTexto
          nombre="nombreComercial"
          etiqueta="Nombre comercial"
          placeholder="Andina"
          descripcion="Es el nombre que ven los medios en las ofertas."
          deshabilitado={deshabilitado}
        />
        <CampoSelect
          nombre="sectorId"
          etiqueta="Sector"
          placeholder="Elige el sector"
          opciones={opcionesSector(catalogos.sectores, sectorActual)}
          descripcion="Clasifica al anunciante en los reportes y en la exclusividad de las ofertas."
          deshabilitado={deshabilitado}
        />
      </Seccion>

      <Seccion icono={MapPin} titulo="Identificación y ubicación">
        {bloqueada ? (
          <CampoBloqueado
            etiqueta="País"
            nombres={["paisIso2"]}
            mostrar={([iso2]) =>
              catalogos.paises.find((opcion) => opcion.iso2 === iso2)?.nombre ??
              iso2
            }
            idNota={idNota}
          />
        ) : (
          <CampoPais catalogos={catalogos} deshabilitado={deshabilitado} />
        )}
        {colombiana ? (
          <>
            {bloqueada ? (
              <CampoBloqueado
                etiqueta="NIT"
                nombres={["nit", "digitoVerificacion"]}
                mostrar={([nit, digito]) =>
                  formatearNit(normalizarNit(nit), digito.trim())
                }
                idNota={idNota}
              />
            ) : (
              <CamposNit deshabilitado={deshabilitado} />
            )}
            <CampoMunicipio deshabilitado={deshabilitado} />
          </>
        ) : (
          <>
            {bloqueada ? (
              <CampoBloqueado
                etiqueta="Identificación tributaria"
                nombres={["identificacionExtranjera"]}
                idNota={idNota}
              />
            ) : (
              <CampoTexto
                nombre="identificacionExtranjera"
                etiqueta="Identificación tributaria"
                placeholder="EIN, RUC, RFC, CUIT…"
                descripcion="Como figura en sus facturas o en el registro de su país."
                deshabilitado={deshabilitado}
              />
            )}
            <CampoTexto
              nombre="ciudadExtranjera"
              etiqueta="Ciudad"
              opcional
              placeholder="Miami"
              deshabilitado={deshabilitado}
            />
          </>
        )}
      </Seccion>

      <Seccion icono={Receipt} titulo="Facturación">
        <CampoCorreoFacturacion deshabilitado={deshabilitado} />
      </Seccion>
    </>
  )
}
