import type { AppType } from '../../schema'
import claudeBlack from '@/assets/logos/claude-symbol-black.svg'
import claudeWhite from '@/assets/logos/claude-symbol-white.svg'
import openaiBlack from '@/assets/logos/openai-blossom-black.svg'
import openaiWhite from '@/assets/logos/openai-blossom-white.svg'
import opencodeDark from '@/assets/logos/opencode-logo-dark.svg'
import opencodeLight from '@/assets/logos/opencode-logo-light.svg'
import { cn } from '@/lib/utils'

export function AppTypeLogo({
  appType,
  inverted = false,
  className,
}: {
  appType: AppType
  inverted?: boolean
  className?: string
}) {
  const src =
    appType === 'codex'
      ? inverted
        ? openaiWhite
        : openaiBlack
      : appType === 'claude'
        ? inverted
          ? claudeWhite
          : claudeBlack
        : inverted
          ? opencodeDark
          : opencodeLight

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={cn('w-auto object-contain', className)}
    />
  )
}
