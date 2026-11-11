import { useState } from 'react'
import { GitBranch, Star } from 'lucide-react'

const patterns = [
  StackedWindows,
  DashboardSkeleton,
  ChatSkeleton,
  Orbit,
  TerminalSkeleton,
  StarRepo,
]

export default function AppHomeScreen() {
  const [patternIndex] = useState(() =>
    Math.floor(Math.random() * patterns.length),
  )
  const Pattern = patterns[patternIndex]

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

function StarRepo() {
  return (
    <a
      href="https://github.com/katsuyukioeda-nuco/agent-wrap"
      target="_blank"
      rel="noreferrer"
      className="group bg-background relative flex w-72 flex-col gap-4 rounded-xl border p-4 shadow-md transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg"
    >
      <div className="flex items-center gap-2">
        <GitBranch className="size-4" />
        <span className="text-muted-foreground truncate font-mono text-xs">
          katsuyukioeda-nuco/agent-wrap
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-bold tracking-tight">Star NOW!!</span>
        <span className="border-border bg-background flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-xs transition-colors group-hover:bg-secondary">
          <Star className="size-3.5 text-amber-500 transition-transform group-hover:scale-110 group-hover:fill-amber-500" />
          Star
        </span>
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
