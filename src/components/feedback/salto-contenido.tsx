/**
 * Destino del skip-link: cada layout de segmento (AppShell, auth…) debe poner
 * `id={ID_CONTENIDO}` en su <main>, y conviene `tabIndex={-1}` para recibir el foco.
 */
export const ID_CONTENIDO = "contenido"

export function SaltoAlContenido() {
  return (
    <a
      href={`#${ID_CONTENIDO}`}
      className="sr-only rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]"
    >
      Saltar al contenido
    </a>
  )
}
