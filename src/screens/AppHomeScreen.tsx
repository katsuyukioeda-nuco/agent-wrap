export default function AppHomeScreen() {
  return (
    <div
      className="bg-background relative flex min-h-[60vh] items-center justify-center overflow-hidden rounded-xl border border-dashed"
      style={{
        backgroundImage:
          'radial-gradient(circle, var(--border) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
    >
      <div className="bg-foreground/5 absolute size-72 rounded-full blur-3xl" />

      <div className="relative flex items-center justify-center">
        <div className="bg-background/70 absolute h-36 w-56 -rotate-6 rounded-xl border shadow-sm" />
        <div className="bg-background/80 absolute h-36 w-56 rotate-3 rounded-xl border shadow-sm" />

        <div className="bg-background relative flex h-36 w-56 flex-col rounded-xl border shadow-md">
          <div className="flex items-center gap-1 border-b px-3 py-2">
            <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
            <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
            <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
          </div>
          <div className="flex flex-1 flex-col justify-center gap-2 px-4">
            <div className="bg-muted h-2 w-2/3 rounded-full" />
            <div className="bg-muted h-2 w-1/2 rounded-full" />
            <div className="flex gap-2 pt-1">
              <div className="bg-muted h-8 flex-1 rounded-md" />
              <div className="bg-muted h-8 flex-1 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
