import { CircleAlert, Info } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

interface AlertaFormularioProps {
  mensaje?: string
  titulo?: string
  tono?: "error" | "info"
  className?: string
}

/**
 * Mensaje general de un formulario. Los errores usan `role="alert"` (se
 * anuncian al aparecer); los avisos, `role="status"` (sin interrumpir).
 */
export function AlertaFormulario({
  mensaje,
  titulo,
  tono = "error",
  className,
}: AlertaFormularioProps) {
  if (!mensaje) return null
  const esError = tono === "error"
  const Icono = esError ? CircleAlert : Info

  return (
    <Alert
      role={esError ? "alert" : "status"}
      variant={esError ? "destructive" : "default"}
      className={cn(
        "motion-safe:animate-aparecer-arriba",
        esError
          ? "border-destructive/30 bg-destructive/5"
          : "border-primary/25 bg-primary/5",
        className
      )}
    >
      <Icono aria-hidden className={esError ? undefined : "text-primary"} />
      {titulo ? <AlertTitle>{titulo}</AlertTitle> : null}
      <AlertDescription className={esError ? undefined : "text-foreground/80"}>
        {mensaje}
      </AlertDescription>
    </Alert>
  )
}
