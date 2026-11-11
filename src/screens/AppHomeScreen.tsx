import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GitBranch, MousePointer2, Star } from 'lucide-react'

const patterns = [
  { id: 'windows', Component: StackedWindows },
  { id: 'dashboard', Component: DashboardSkeleton },
  { id: 'chat', Component: ChatSkeleton },
  { id: 'orbit', Component: Orbit },
  { id: 'terminal', Component: TerminalSkeleton },
  { id: 'star', Component: StarRepo },
  { id: 'useless', Component: UselessArea },
  { id: 'vacant-lot', Component: VacantLot },
]

export default function AppHomeScreen() {
  const [searchParams] = useSearchParams()
  const requested = searchParams.get('pattern') ?? ''

  const pattern = useMemo(() => {
    return (
      patterns.find((item) => item.id === requested) ??
      patterns[Math.floor(Math.random() * patterns.length)]
    )
  }, [requested])

  const Pattern = pattern.Component

  return (
    <div
      className="bg-background relative flex min-h-[60vh] items-center justify-center overflow-hidden rounded-xl border border-dashed px-6"
      style={{
        backgroundImage:
          'radial-gradient(circle, var(--border) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
    >
      <div className="bg-foreground/5 absolute size-72 rounded-full blur-3xl" />
      <Pattern />
    </div>
  )
}

function StackedWindows() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="bg-background/70 absolute h-36 w-56 -rotate-6 rounded-xl border shadow-sm" />
      <div className="bg-background/80 absolute h-36 w-56 rotate-3 rounded-xl border shadow-sm" />

      <div className="bg-background relative flex h-36 w-56 flex-col rounded-xl border shadow-md">
        <WindowDots />
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
  )
}

function DashboardSkeleton() {
  return (
    <div className="relative">
      <div className="bg-background/70 absolute inset-0 -rotate-3 rounded-xl border shadow-sm" />

      <div className="bg-background relative flex h-40 w-64 overflow-hidden rounded-xl border shadow-md">
        <div className="flex w-14 flex-col gap-2 border-r p-3">
          <div className="bg-muted h-2 w-8 rounded-full" />
          <div className="bg-muted h-2 w-6 rounded-full" />
          <div className="bg-muted h-2 w-7 rounded-full" />
          <div className="bg-muted mt-auto h-2 w-6 rounded-full" />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-3">
          <div className="bg-muted h-2 w-1/2 rounded-full" />
          <div className="grid flex-1 grid-cols-2 gap-2">
            <div className="bg-muted rounded-md" />
            <div className="bg-muted rounded-md" />
            <div className="bg-muted rounded-md" />
            <div className="bg-muted rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ChatSkeleton() {
  return (
    <div className="flex w-64 flex-col gap-2">
      <div className="flex justify-start">
        <div className="bg-muted h-9 w-40 rounded-2xl rounded-bl-sm" />
      </div>
      <div className="flex justify-end">
        <div className="bg-foreground/80 h-9 w-32 rounded-2xl rounded-br-sm" />
      </div>
      <div className="flex justify-start">
        <div className="bg-muted flex h-10 w-44 items-center gap-1 rounded-2xl rounded-bl-sm px-3">
          <span className="bg-muted-foreground/40 size-1.5 rounded-full" />
          <span className="bg-muted-foreground/40 size-1.5 rounded-full" />
          <span className="bg-muted-foreground/40 size-1.5 rounded-full" />
        </div>
      </div>
      <div className="bg-background mt-1 flex items-center gap-2 rounded-full border px-3 py-2 shadow-sm">
        <div className="bg-muted h-2 flex-1 rounded-full" />
        <div className="bg-foreground/20 size-5 rounded-full" />
      </div>
    </div>
  )
}

function Orbit() {
  return (
    <div className="relative flex size-56 items-center justify-center">
      <div className="border-border absolute size-56 rounded-full border" />
      <div className="border-border absolute size-40 rounded-full border" />
      <div className="border-border absolute size-24 rounded-full border border-dashed" />

      <div className="bg-foreground size-3 rounded-full" />

      <div className="bg-background border-border absolute top-0 left-1/2 size-2.5 -translate-x-1/2 rounded-full border" />
      <div className="bg-foreground/60 absolute right-6 bottom-8 size-2 rounded-full" />
      <div className="bg-foreground/30 absolute top-12 left-8 size-2 rounded-full" />
    </div>
  )
}

function TerminalSkeleton() {
  return (
    <div className="bg-foreground w-64 overflow-hidden rounded-xl shadow-lg">
      <div className="flex items-center gap-1 border-b border-white/10 px-3 py-2">
        <span className="size-1.5 rounded-full bg-white/30" />
        <span className="size-1.5 rounded-full bg-white/30" />
        <span className="size-1.5 rounded-full bg-white/30" />
      </div>
      <div className="flex flex-col gap-2 p-4">
        <div className="h-1.5 w-3/4 rounded-full bg-white/20" />
        <div className="h-1.5 w-1/2 rounded-full bg-white/20" />
        <div className="h-1.5 w-2/3 rounded-full bg-white/20" />
        <div className="mt-1 h-1.5 w-1/4 animate-pulse rounded-full bg-white/60" />
      </div>
    </div>
  )
}

function VacantLot() {
  return (
    <div className="relative flex flex-col items-center">
      <div className="bg-background relative -rotate-1 rounded-sm border-2 border-foreground px-9 py-5 text-center">
        <p className="text-3xl font-bold tracking-[0.14em]">VACANT LOT</p>
        <p className="mt-1 text-sm font-semibold tracking-[0.24em]">FOR SALE</p>
        <p className="border-border text-muted-foreground mt-3 border-t pt-2 text-[10px] tracking-[0.18em]">
          USE: ANY
        </p>
      </div>

      <div className="bg-foreground/70 h-16 w-1.5" />
      <div className="bg-foreground/10 absolute -bottom-2 left-1/2 h-6 w-56 -translate-x-1/2 -skew-x-12" />
      <div className="border-border w-48 border-t border-dashed" />

      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-14">
        <span className="bg-muted-foreground/40 h-3 w-px rotate-12" />
        <span className="bg-muted-foreground/40 h-2 w-px -rotate-12" />
      </div>
    </div>
  )
}

function UselessArea() {
  return (
    <div className="relative w-full max-w-80 -rotate-2">
      <div className="bg-muted/70 absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-3 rounded-sm border" />

      <div className="bg-background w-full rounded-sm border p-6 shadow-md">
        <p className="text-lg leading-snug font-medium">
          This area is <span className="underline decoration-dotted underline-offset-4">useless</span>.
        </p>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Replace it with whatever you want.
        </p>
      </div>
    </div>
  )
}

function StarRepo() {
  return (
    <a
      href="https://github.com/katsuyukioeda-nuco/agent-wrap"
      target="_blank"
      rel="noreferrer"
      aria-label="Star katsuyukioeda-nuco/agent-wrap on GitHub"
      className="group bg-background relative flex w-full max-w-80 items-center justify-between gap-4 rounded-xl border p-4 shadow-md transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg"
    >
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch className="size-4 shrink-0" />
        <span className="text-muted-foreground truncate font-mono text-[11px]">
          katsuyukioeda-nuco/agent-wrap
        </span>
      </div>

      <div className="relative shrink-0">
        <span className="star-demo-button bg-background relative flex size-9 items-center justify-center rounded-md border shadow-xs">
          <span className="relative">
            <Star className="text-muted-foreground size-4" />
            <Star className="star-demo-fill absolute inset-0 size-4 text-foreground" />
          </span>
          <span className="star-demo-ripple pointer-events-none absolute inset-0 rounded-md border border-foreground" />
        </span>
        <MousePointer2 className="star-demo-cursor pointer-events-none absolute top-1/2 left-1/2 -mt-0.5 -ml-0.5 size-4 origin-top-left fill-white text-foreground drop-shadow" />
      </div>
    </a>
  )
}

function WindowDots() {
  return (
    <div className="flex items-center gap-1 border-b px-3 py-2">
      <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
      <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
      <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
    </div>
  )
}
