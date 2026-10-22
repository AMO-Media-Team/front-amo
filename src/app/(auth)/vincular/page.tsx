import type { Metadata } from "next"

import { EncabezadoAuth } from "@/features/auth/components/encabezado-auth"
import { FormularioVinculacion } from "@/features/vinculacion/components/formulario-vinculacion"
import { datosFormularioPublico } from "@/features/vinculacion/queries"

export const metadata: Metadata = {
  title: "Suma tu medio",
  description:
    "Pide que tu medio hiperlocal se una a AMO y empieza a recibir ofertas de pauta.",
}

/**
 * Solicitud pública de vinculación (MED-001). Sin sesión: figura en
 * `RUTAS_PUBLICAS` y su acción en `ACCIONES_PUBLICAS` (límite por conexión en
 * la BD y campo trampa). El territorio activo, la política de datos y el
 * umbral de seguidores llegan con la página.
 */
export default async function PaginaVincular() {
  const datos = await datosFormularioPublico()
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        titulo="Suma tu medio a AMO"
        descripcion="Cuéntanos de tu medio y tus redes. Si encaja, te invitamos a crear tu cuenta para recibir ofertas de pauta de marcas de tu región."
      />
      <FormularioVinculacion datos={datos} />
    </div>
  )
}
