export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`spinner inline-block size-3 rounded-full border border-current border-t-transparent ${className}`}
    />
  );
}

interface BusyButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  busy: boolean;
  busyLabel: string;
}

/**
 * A submit button that says what it's doing. Every one of these triggers work
 * that can take a while — a Noti.st lookup, an import — so without this the
 * page looks like it has hung.
 */
export function BusyButton({
  busy,
  busyLabel,
  children,
  disabled,
  className = "",
  ...props
}: BusyButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy}
      className={`inline-flex items-center justify-center gap-2 disabled:opacity-50 ${className}`}
    >
      {busy && <Spinner />}
      {busy ? busyLabel : children}
    </button>
  );
}
