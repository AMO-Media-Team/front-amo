import { FileCheck2 } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"

import { COLAS_VERIFICACION } from "../colas"
import { colaDocumentos, hoyBogota } from "../queries"
import { PaginacionCola } from "./paginacion-cola"
import { RevisorDocumentos } from "./revisor-documentos"

/** Documentos cargados que esperan revisión, el más antiguo primero. */
export async function ColaDocumentos({ pagina }: { pagina: number }) {
  const cola = await colaDocumentos(pagina)
  if (cola.filas.length === 0) {
    return (
      <EstadoVacio
        icono={FileCheck2}
        titulo={COLAS_VERIFICACION.documentos.vacia}
        descripcion="Cuando un medio cargue un documento para su nivel, aparecerá aquí para que lo revises."
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-pretty text-muted-foreground">
        Al aprobar o rechazar uno se abre el siguiente, para atender la cola de
        corrido.
      </p>
      <RevisorDocumentos documentos={cola.filas} hoy={hoyBogota()} />
      <PaginacionCola
        cola="documentos"
        pagina={cola.pagina}
        total={cola.total}
      />
    </div>
  )
}
