export function ConfirmationMark({ label }: { label?: string }) {
  return <span className="confirmation-mark" role={label ? "img" : undefined}
    aria-label={label} aria-hidden={label ? undefined : true} />
}
