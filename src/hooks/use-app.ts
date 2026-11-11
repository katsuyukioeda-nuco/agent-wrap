import { useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '@/lib/app'

export function useApp(): AppOutletContext {
  return useOutletContext<AppOutletContext>()
}
