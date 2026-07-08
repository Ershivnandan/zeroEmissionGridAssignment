import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

const TOAST_ID = 'server-warmup'
const SLOW_AFTER_MS = 4000

export function useColdStartToast(isFetching: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shownRef = useRef(false)

  useEffect(() => {
    if (isFetching) {
      if (timerRef.current) return
      timerRef.current = setTimeout(() => {
        shownRef.current = true
        toast.loading('Waking up the server…', {
          id: TOAST_ID,
          description:
            'The Render backend may be sleeping. This can take up to a minute on the first request.',
          duration: Infinity,
        })
      }, SLOW_AFTER_MS)
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (shownRef.current) {
        shownRef.current = false
        toast.success('Server ready', { id: TOAST_ID, duration: 2000 })
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isFetching])
}
