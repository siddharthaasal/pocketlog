import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '../components/ui'

/** Shows a banner when a new version is deployed; the update applies on reload. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface p-3 pl-4 shadow-lg ring-1 ring-border md:bottom-6">
      <p className="flex-1 text-[14px]">A new version is available.</p>
      <Button variant="ghost" className="h-9" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button className="h-9" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  )
}
