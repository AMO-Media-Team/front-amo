"use client"

import { Pencil, Plus, RadioTower } from "lucide-react"
import { useRouter } from "next/navigation"
import { useQueryState } from "nuqs"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  HojaLateral,
  useHojaLateral,
} from "@/features/configuracion/components/hoja-lateral"

import {
  PARAMETRO_REGISTRAR,
  rutaTrasRegistro,
  VALOR_REGISTRAR,
} from "../presentacion"
import type {
  MedioEditable,
  MedioGuardado,
  MedioRegistrado,
  OpcionCategoria,
} from "../tipos"
import {
  FormularioEditarMedio,
  FormularioRegistrarMedio,
} from "./formularios-medio"

/**
 * «Registrar medio» del listado. `?registrar=1` (el aviso de la hoja de
 * usuarios enlaza así) abre la hoja al llegar; cerrarla quita el parámetro.
 * Al registrar lleva a la ficha, donde se invita a su equipo.
 */
export function BotonRegistrarMedio({
  categorias,
  invitarTrasRegistro,
}: {
  /** `null`: no se pudieron cargar; el registro sigue disponible sin ellas. */
  categorias: readonly OpcionCategoria[] | null
  /** Ve e invita usuarios: tras registrar, abre la pestaña «Usuarios» de la ficha. */
  invitarTrasRegistro: boolean
}) {
  const router = useRouter()
  const [parametro, setParametro] = useQueryState(PARAMETRO_REGISTRAR)
  const [abiertaLocal, setAbiertaLocal] = useState(false)
  const abierta = abiertaLocal || parametro === VALOR_REGISTRAR

  function cambiarAbierta(valor: boolean) {
    setAbiertaLocal(valor)
    if (!valor && parametro !== null) void setParametro(null)
  }

  async function alRegistrar({ id, advertencia }: MedioRegistrado) {
    setAbiertaLocal(false)
    // Se limpia antes de navegar: «Atrás» no debe reabrir la hoja.
    if (parametro !== null) await setParametro(null)
    if (advertencia) {
      toast.warning("Medio registrado con un pendiente", {
        description: advertencia,
      })
    } else {
      toast.success("Medio registrado", {
        description: invitarTrasRegistro
          ? "Queda en verificación. Invita a su equipo para que complete el perfil."
          : "Queda en verificación hasta que su equipo complete el perfil y los documentos.",
      })
    }
    router.push(rutaTrasRegistro(id, invitarTrasRegistro))
  }

  return (
    <>
      <Button onClick={() => cambiarAbierta(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Registrar medio
      </Button>
      <HojaLateral
        abierta={abierta}
        onAbiertaChange={cambiarAbierta}
        icono={RadioTower}
        titulo="Registrar medio"
        descripcion="Nace en verificación (Pendiente). Después se invita a su equipo para que complete el perfil, las cuentas sociales y los documentos."
        ancho="lg"
      >
        <FormularioRegistrarMedio
          categorias={categorias}
          onRegistrado={(medio) => void alRegistrar(medio)}
        />
      </HojaLateral>
    </>
  )
}

/** Formulario de edición que cierra su hoja al guardar. */
function EdicionConCierre({
  medio,
  categorias,
}: {
  medio: MedioEditable
  categorias: readonly OpcionCategoria[]
}) {
  const { cerrar } = useHojaLateral()
  function alGuardar({ advertencia }: MedioGuardado) {
    cerrar()
    if (advertencia) {
      toast.warning("Cambios guardados con un pendiente", {
        description: advertencia,
      })
    } else {
      toast.success("Datos del medio actualizados")
    }
  }
  return (
    <FormularioEditarMedio
      medio={medio}
      categorias={categorias}
      onGuardado={alGuardar}
    />
  )
}

/** «Editar datos» de la ficha: misma hoja que el registro, con los valores actuales. */
export function BotonEditarMedio({
  medio,
  categorias,
}: {
  medio: MedioEditable
  categorias: readonly OpcionCategoria[]
}) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setAbierta(true)}>
        <Pencil data-icon="inline-start" aria-hidden />
        Editar datos
      </Button>
      <HojaLateral
        abierta={abierta}
        onAbiertaChange={setAbierta}
        icono={Pencil}
        titulo="Editar datos del medio"
        descripcion={`${medio.nombre}. Los cambios quedan en la bitácora con tu nombre.`}
        ancho="lg"
      >
        {/* La hoja monta el formulario al abrir: cada apertura parte de lo vigente. */}
        <EdicionConCierre medio={medio} categorias={categorias} />
      </HojaLateral>
    </>
  )
}
