import { Link } from 'react-router-dom'
import { ArrowLeft, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="bg-secondary flex size-12 items-center justify-center rounded-full">
          <Bot className="size-6" />
        </div>
        <p className="text-2xl font-bold">404</p>
        <p className="text-muted-foreground text-sm">
          ページが見つかりません。URL を確認してください。
        </p>
        <Button asChild variant="outline">
          <Link to="/">
            <ArrowLeft />
            Connected Apps へ戻る
          </Link>
        </Button>
      </div>
    </div>
  )
}
