"use client"

import {
  BadgeCheck,
  EllipsisVertical,
  ExternalLink,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { type ReactNode, useCallback, useId, useState } from "react"
import { toast } from "sonner"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SheetClose } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { PLATAFORMAS } from "@/features/operacion/estados"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearCOP, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { quitarCuenta } from "../actions"
import { MENSAJES_CUENTAS } from "../errores"
import { ESTADOS_CUENTA_MEDIO, type EstadoCuenta } from "../estado-cuenta"
import { urlLegible } from "../perfil-red"
import { accionPrincipal, avisoCuenta, textoVigencia } from "../presentacion"
import type {
  CodigoGenerado,
  CuentaMedio,
  FranjaSeguidores,
  ParametrosVerificacion,
  VerificacionCuentaMedio,
} from "../tipos"
import { AvisoCuenta } from "./aviso-cuenta"
import { type CuentaExistente, FormularioCuenta } from "./formulario-cuenta"
import { HistorialVerificaciones } from "./historial-verificaciones"
import { HojaCuenta } from "./hoja-cuenta"
import { HojaVerificacion } from "./hoja-verificacion"
import { useCargaCaptura } from "./use-carga-captura"
import { VisorCaptura } from "./visor-captura"

export interface TarjetaCuentaProps {
  cuenta: CuentaMedio
  estado: EstadoCuenta
  ahora: Date
  ahoraServidor: number
  franjas: readonly FranjaSeguidores[]
  parametros: ParametrosVerificacion
  existentes: readonly CuentaExistente[]
  verificacionAbierta: boolean
  onVerificacionAbierta: (abierta: boolean) => void
}

function Dato({
  termino,
  children,
  className,
}: {
  termino: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{termino}</dt>
      <dd className="text-sm font-medium cifras text-pretty">{children}</dd>
    </div>
  )
}

function textoFranja(
  cuenta: Pick<CuentaMedio, "franja" | "seguidoresVerificados">,
  umbral: number
): string {
  if (cuenta.franja) return cuenta.franja.nombre
  if (cuenta.seguidoresVerificados === null) return "Se asigna al verificarla"
  return cuenta.seguidoresVerificados < umbral
    ? `Menos de ${formatearNumero(umbral)}`
    : "Sin franja"
}

function bloqueoPerfil(
  estado: EstadoCuenta,
  verificada: boolean
): string | null {
  if (estado.acciones.editarPerfil) return null
  return verificada
    ? MENSAJES_CUENTAS.perfilBloqueadoVerificada
    : MENSAJES_CUENTAS.perfilBloqueadoRevision
}

/**
 * Una cuenta social del medio: red, usuario y enlace, estado de la
 * verificación (con su aviso: qué pasa y qué hacer), seguidores, franja,
 * vigencia y tarifa de referencia; la acción que toca ahora, el menú
 * (editar, reverificar antes de tiempo, quitar) y el historial de intentos.
 */
export function TarjetaCuenta({
  cuenta,
  estado,
  ahora,
  ahoraServidor,
  franjas,
  parametros,
  existentes,
  verificacionAbierta,
  onVerificacionAbierta,
}: TarjetaCuentaProps) {
  const ids = useId()
  const idTitulo = `${ids}-titulo`
  const idFormulario = `${ids}-editar`
  const handle = formatearHandle(cuenta.handle)
  const plataforma = PLATAFORMAS[cuenta.plataforma]
  const [codigo, setCodigo] = useState<CodigoGenerado | null>(null)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [quitando, setQuitando] = useState(false)
  const [captura, setCaptura] = useState<VerificacionCuentaMedio | null>(null)
  const [viendoCaptura, setViendoCaptura] = useState(false)

  const alEnviarCaptura = useCallback(() => {
    setCodigo(null)
    onVerificacionAbierta(false)
    toast.success("Recibimos tu verificación", {
      description: `Revisaremos ${handle} y te avisaremos cuando la resolvamos.`,
    })
  }, [handle, onVerificacionAbierta])
  const carga = useCargaCaptura(cuenta.id, alEnviarCaptura)

  const aviso = avisoCuenta(estado, cuenta, parametros)
  const accion = accionPrincipal(estado)
  const reverificarAntes =
    accion === null &&
    estado.acciones.verificar === "reverificar" &&
    estado.enCurso === null

  function verCaptura(verificacion: VerificacionCuentaMedio) {
    setCaptura(verificacion)
    setViendoCaptura(true)
  }

  return (
    <article
      aria-labelledby={idTitulo}
      className="flex animate-aparecer-arriba flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <header className="flex items-start gap-3">
        {/* Decorativa: el título ya nombra la red para el lector de pantalla. */}
        <span aria-hidden className="mt-0.5 shrink-0">
          <MarcaPlataforma
            plataforma={cuenta.plataforma}
            className="[&>span:first-child]:size-8 [&>span:first-child]:rounded-lg [&>span:first-child]:text-[0.6875rem]"
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2
            id={idTitulo}
            className="truncate text-base leading-tight font-semibold"
            title={handle}
          >
            <span className="sr-only">{plataforma}: </span>
            {handle}
          </h2>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <InsigniaEstado
              catalogo={ESTADOS_CUENTA_MEDIO}
              estado={estado.principal}
              className="shrink-0"
            />
            <a
              href={cuenta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-6 max-w-full min-w-0 items-center gap-1 rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:anillo-foco"
            >
              <span className="truncate">{urlLegible(cuenta.url)}</span>
              <ExternalLink aria-hidden className="size-3 shrink-0" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`Más acciones para ${handle}`}
                className="-mt-1 -mr-2 shrink-0"
              />
            }
          >
            <EllipsisVertical aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => setEditando(true)}>
              <Pencil aria-hidden />
              {estado.acciones.editarPerfil ? "Editar cuenta" : "Editar tarifa"}
            </DropdownMenuItem>
            {reverificarAntes ? (
              <DropdownMenuItem onClick={() => onVerificacionAbierta(true)}>
                <RotateCcw aria-hidden />
                Reverificar ahora
              </DropdownMenuItem>
            ) : null}
            {estado.acciones.quitar ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setQuitando(true)}
                >
                  <Trash2 aria-hidden />
                  Quitar cuenta
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Dato termino="Seguidores verificados">
          {cuenta.seguidoresVerificados === null
            ? "—"
            : formatearNumero(cuenta.seguidoresVerificados)}
        </Dato>
        <Dato termino="Franja">
          {textoFranja(cuenta, parametros.umbralSeguidores)}
        </Dato>
        <Dato termino="Verificación" className="col-span-2 sm:col-span-1">
          {textoVigencia(estado)}
        </Dato>
        <Dato
          termino="Tarifa de referencia"
          className="col-span-2 sm:col-span-1"
        >
          {cuenta.tarifaReferencia === null
            ? "Sin definir"
            : formatearCOP(cuenta.tarifaReferencia)}
        </Dato>
      </dl>

      {aviso ? (
        <AvisoCuenta aviso={aviso} ahoraServidor={ahoraServidor} />
      ) : null}

      {carga.elemento && !verificacionAbierta ? (
        <ListaSubidas
          elementos={[carga.elemento]}
          etiqueta={`Envío de la captura de ${handle}`}
          onReintentar={() => void carga.reintentar()}
          onCancelar={() => carga.subida.cancelar()}
          onQuitar={() => carga.descartar()}
        />
      ) : null}

      {accion ? (
        <Button
          type="button"
          size="lg"
          variant={accion.destacada ? "default" : "outline"}
          onClick={() => onVerificacionAbierta(true)}
          className="w-full sm:w-fit"
        >
          {accion.tipo === "reverificar" || accion.tipo === "pedir_codigo" ? (
            <RotateCcw data-icon="inline-start" aria-hidden />
          ) : (
            <BadgeCheck data-icon="inline-start" aria-hidden />
          )}
          {accion.etiqueta}
        </Button>
      ) : null}

      <HistorialVerificaciones
        verificaciones={cuenta.verificaciones}
        ahora={ahora}
        onVerCaptura={verCaptura}
      />

      <HojaVerificacion
        abierta={verificacionAbierta}
        onAbiertaChange={onVerificacionAbierta}
        cuenta={cuenta}
        estado={estado}
        franjas={franjas}
        parametros={parametros}
        carga={carga}
        codigo={codigo}
        onCodigo={setCodigo}
      />

      <HojaCuenta
        abierta={editando}
        onAbiertaChange={(abierta) => {
          if (!guardando) setEditando(abierta)
        }}
        icono={<Pencil />}
        titulo={`Editar ${handle}`}
        descripcion={plataforma}
        pie={
          <>
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={guardando}
                />
              }
            >
              Cancelar
            </SheetClose>
            <Button
              type="submit"
              form={idFormulario}
              size="lg"
              disabled={guardando}
            >
              {guardando ? (
                <Spinner data-icon="inline-start" aria-hidden />
              ) : null}
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        }
      >
        <FormularioCuenta
          id={idFormulario}
          edicion={{
            cuenta,
            perfilBloqueado: bloqueoPerfil(estado, cuenta.verificada),
          }}
          existentes={existentes}
          onPendiente={setGuardando}
          onGuardada={() => {
            setEditando(false)
            toast.success("Cambios guardados")
          }}
        />
      </HojaCuenta>

      <DialogoConfirmacion
        abierto={quitando}
        onAbiertoChange={setQuitando}
        titulo={`¿Quitar ${handle}?`}
        descripcion={`La cuenta de ${plataforma} dejará de aparecer en tu medio. Podrás registrarla de nuevo cuando quieras.`}
        textoConfirmar="Quitar cuenta"
        destructivo
        onConfirmar={async () => {
          const resultado = await quitarCuenta({ cuentaId: cuenta.id })
          if (resultado.ok) toast.success(`Quitamos ${handle}`)
          return resultado
        }}
      />

      <VisorCaptura
        verificacion={captura}
        abierta={viendoCaptura}
        onAbiertaChange={setViendoCaptura}
        handle={handle}
      />
    </article>
  )
}
