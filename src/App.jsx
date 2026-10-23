import { useEffect, useState } from 'react'
import Hello from './Hello'
import ReadText from './ReadText'

export default function App () {
  const [enterAction, setEnterAction] = useState({})
  const [route, setRoute] = useState('')

  useEffect(() => {
    window.utools.onPluginEnter((action) => {
      setRoute(action.code)
      setEnterAction(action)
    })

    window.utools.onPluginOut((isKill) => {
      setRoute('')
    })
  }, [])

  if (route === 'hello') {
    return <Hello enterAction={enterAction} />
  }

  if (route === 'read-text') {
    return <ReadText enterAction={enterAction} />
  }

  return null
}
