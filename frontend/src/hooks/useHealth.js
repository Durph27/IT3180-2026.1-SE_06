import { useEffect, useState } from 'react'
import axios from 'axios'
import { getHealth } from '../api/health'



export function useHealth() {
  const [state, setState] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal)
      .then((health) => {
        if (!controller.signal.aborted) {
          setState(health.status === 'UP' && health.database === 'UP' ? 'connected' : 'database-error')
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        const databaseDown = axios.isAxiosError(error)
          && error.response?.status === 503
          && error.response?.data?.database === 'DOWN'
        setState(databaseDown ? 'database-error' : 'error')
      })
    return () => controller.abort()
  }, [])

  return state
}
