"use client"

import { FileCheck2 } from "lucide-react"
import { useId, useRef, useState, useTransition } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { serializarFecha } from "@/lib/fechas"
import { desdeErrorZod } from "@/lib/result"

import { registrarDocumentoExpedido } from "../actions"
import {
  esquemaCamposExpedido,
  LARGO_CUDS,
  MENSAJES_CAMPOS,
  normalizarCuds,
  type ValoresExpedido,
} from "../schemas"
import { CampoPdf } from "./campo-pdf"
import { DialogoFormulario } from "./dialogo-formulario"
import { usePdfDocumento } from "./use-pdf-documento"

type Campo = "prefijo" | "consecutivo" | "fechaEmision" | "cuds" | "archivo"

const ORDEN: readonly Campo[] = [
  "prefijo",
  "consecutivo",
  "fechaEmision",
  "cuds",
  "archivo",
]

const VACIO: ValoresExpedido = {
  prefijo: "",
  consecutivo: "",
  fechaEmision: "",
  cuds: "",
}

type Fase = "editando" | "subiendo" | "registrando"

function erroresDe(
  erroresCampo: Readonly<Record<string, string[]>> | undefined
): Partial<Record<Campo, string>> {
  return Object.fromEntries(
    ORDEN.flatMap((campo) => {
      const mensaje =
        erroresCampo?.[campo]?.[0] ??
        (campo === "archivo" ? erroresCampo?.archivoPath?.[0] : undefined)
      return mensaje ? [[campo, mensaje]] : []
    })
  )
}

export interface DialogoDocumentoExpedidoProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  liquidacionId: string
  focoAlCerrar?: () => HTMLElement | null | false
  onRegistrado: (numero: string) => void
}

/**
 * «Registrar documento expedido» (numeración del proveedor tecnológico, D75): el prefijo y el número que
 * asignó dentro de una resolución vigente, la fecha de emisión, el CUDS y su PDF. El PDF se sube primero
 * (a la carpeta del documento en borrador) y se registra todo junto; si el registro falla por un campo,
 * el PDF ya subido se reutiliza al corregirlo.
 */
export function DialogoDocumentoExpedido({
  abierto,
  onAbiertoChange,
  liquidacionId,
  focoAlCerrar,
  onRegistrado,
}: DialogoDocumentoExpedidoProps) {
  const [valores, setValores] = useState<ValoresExpedido>(VACIO)
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>("editando")
  const [, iniciar] = useTransition()
  const pdf = usePdfDocumento(liquidacionId, "expedido")
  const pendiente = fase !== "editando"

  const id = useId()
  const ids = {
    prefijo: `${id}-prefijo`,
    consecutivo: `${id}-consecutivo`,
    fecha: `${id}-fecha`,
    cuds: `${id}-cuds`,
    ayudaPrefijo: `${id}-ayuda-prefijo`,
    ayudaCuds: `${id}-ayuda-cuds`,
  }
  const campoPrefijo = useRef<HTMLInputElement>(null)
  const campoConsecutivo = useRef<HTMLInputElement>(null)
  const campoFecha = useRef<HTMLInputElement>(null)
  const campoCuds = useRef<HTMLTextAreaElement>(null)
  const botonQuitar = useRef<HTMLButtonElement>(null)
  const zonaPdf = useRef<HTMLDivElement>(null)

  function reiniciar() {
    setValores(VACIO)
    setErrores({})
    setErrorGeneral(null)
    setFase("editando")
    pdf.quitar()
  }

  function cambiarAbierto(valor: boolean) {
    if (!valor) reiniciar()
    onAbiertoChange(valor)
  }

  function cambiar(campo: keyof ValoresExpedido, valor: string) {
    setValores((previos) => ({ ...previos, [campo]: valor }))
    if (errores[campo]) {
      setErrores(({ [campo]: _, ...resto }) => resto)
    }
  }

  function enfocar(campos: Partial<Record<Campo, string>>) {
    switch (ORDEN.find((campo) => campos[campo])) {
      case "prefijo":
        return campoPrefijo.current?.focus()
      case "consecutivo":
        return campoConsecutivo.current?.focus()
      case "fechaEmision":
        return campoFecha.current?.focus()
      case "cuds":
        return campoCuds.current?.focus()
      case "archivo":
        return (
          botonQuitar.current ??
          zonaPdf.current?.querySelector<HTMLElement>("button")
        )?.focus()
    }
  }

  // Tras un error, los campos vuelven a estar habilitados en el siguiente render.
  function mostrarErrores(campos: Partial<Record<Campo, string>>) {
    setErrores(campos)
    window.setTimeout(() => enfocar(campos), 0)
  }

  function enviar() {
    const validacion = esquemaCamposExpedido.safeParse(valores)
    const campos = validacion.success
      ? {}
      : erroresDe(desdeErrorZod(validacion.error).erroresCampo)
    if (!pdf.archivo) campos.archivo = MENSAJES_CAMPOS.archivoRequerido
    setErrorGeneral(null)
    if (Object.keys(campos).length > 0) {
      mostrarErrores(campos)
      return
    }
    setErrores({})
    iniciar(async () => {
      setFase("subiendo")
      const carga = await pdf.asegurar()
      if (!carga.ok) {
        setFase("editando")
        setErrorGeneral(
          carga.cancelada
            ? "Cancelaste la subida del PDF. Pulsa «Registrar documento» cuando quieras subirlo."
            : "No pudimos subir el PDF (el motivo está junto al archivo). Pulsa «Registrar documento» para intentarlo de nuevo."
        )
        return
      }
      const cargado = carga.datos
      setFase("registrando")
      const resultado = await registrarDocumentoExpedido({
        ...valores,
        documentoId: cargado.documentoId,
        archivoPath: cargado.ruta,
      })
      setFase("editando")
      if (!resultado.ok) {
        const porCampo = erroresDe(resultado.erroresCampo)
        if (porCampo.archivo) pdf.olvidarCarga()
        if (Object.keys(porCampo).length > 0) mostrarErrores(porCampo)
        else setErrorGeneral(resultado.error)
        return
      }
      onRegistrado(resultado.datos.numero)
      cambiarAbierto(false)
    })
  }

  const hoy = serializarFecha(new Date())
  const largoCuds = normalizarCuds(valores.cuds).length
  const describir = (ayuda: string | null, campo: Campo) =>
    [errores[campo] ? `${id}-error-${campo}` : null, ayuda]
      .filter(Boolean)
      .join(" ") || undefined
  const mensaje = (campo: Campo) =>
    errores[campo] ? (
      <p
        id={`${id}-error-${campo}`}
        role="alert"
        className="text-sm text-destructive"
      >
        {errores[campo]}
      </p>
    ) : null

  return (
    <DialogoFormulario
      abierto={abierto}
      onAbiertoChange={cambiarAbierto}
      icono={FileCheck2}
      titulo="Registrar documento expedido"
      descripcion="Registra el documento soporte que expediste en el software del proveedor tecnológico, con el número que asignó dentro de una resolución de documento soporte vigente."
      textoConfirmar="Registrar documento"
      textoPendiente={fase === "subiendo" ? "Subiendo el PDF…" : "Registrando…"}
      pendiente={pendiente}
      errorGeneral={errorGeneral}
      focoAlCerrar={focoAlCerrar}
      onEnviar={enviar}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <Label htmlFor={ids.prefijo}>Prefijo</Label>
          <Input
            ref={campoPrefijo}
            id={ids.prefijo}
            value={valores.prefijo}
            onChange={(evento) => cambiar("prefijo", evento.target.value)}
            maxLength={4}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={pendiente}
            className="uppercase"
            aria-invalid={errores.prefijo ? true : undefined}
            aria-describedby={describir(ids.ayudaPrefijo, "prefijo")}
          />
          <p id={ids.ayudaPrefijo} className="text-xs text-muted-foreground">
            Vacío si la resolución no tiene.
          </p>
          {mensaje("prefijo")}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={ids.consecutivo}>Número</Label>
          <Input
            ref={campoConsecutivo}
            id={ids.consecutivo}
            value={valores.consecutivo}
            onChange={(evento) => cambiar("consecutivo", evento.target.value)}
            inputMode="numeric"
            autoComplete="off"
            disabled={pendiente}
            className="cifras"
            aria-invalid={errores.consecutivo ? true : undefined}
            aria-describedby={describir(null, "consecutivo")}
          />
          {mensaje("consecutivo")}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={ids.fecha}>Fecha de emisión</Label>
        <Input
          ref={campoFecha}
          id={ids.fecha}
          type="date"
          max={hoy}
          value={valores.fechaEmision}
          onChange={(evento) => cambiar("fechaEmision", evento.target.value)}
          disabled={pendiente}
          className="h-10 w-full sm:h-8 sm:w-48"
          aria-invalid={errores.fechaEmision ? true : undefined}
          aria-describedby={describir(null, "fechaEmision")}
        />
        {mensaje("fechaEmision")}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={ids.cuds}>CUDS</Label>
        <Textarea
          ref={campoCuds}
          id={ids.cuds}
          value={valores.cuds}
          onChange={(evento) => cambiar("cuds", evento.target.value)}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          disabled={pendiente}
          className="font-mono text-xs break-all"
          aria-invalid={errores.cuds ? true : undefined}
          aria-describedby={describir(ids.ayudaCuds, "cuds")}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <p id={ids.ayudaCuds} className="text-pretty">
            El código único que asignó el proveedor al transmitirlo a la DIAN (
            {LARGO_CUDS} caracteres).
          </p>
          <span className="shrink-0 cifras" aria-hidden>
            {largoCuds}/{LARGO_CUDS}
          </span>
        </div>
        {mensaje("cuds")}
      </div>

      <CampoPdf
        pdf={pdf}
        titulo="PDF del documento"
        ayuda="El PDF que expidió el proveedor tecnológico (hasta 10 MB)."
        error={errores.archivo}
        deshabilitado={pendiente}
        refQuitar={botonQuitar}
        refZona={zonaPdf}
      />
    </DialogoFormulario>
  )
}
