import "server-only"

import type { VersionCreativo } from "./tipos"

/** STUB DEL LÍDER (fase 2): el paquete CR lo implementa. Vigente, pendiente e historial, de la más nueva a la más vieja. */
export async function creativosDeOferta(
  _ofertaId: string
): Promise<VersionCreativo[]> {
  return []
}
