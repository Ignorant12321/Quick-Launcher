import React from 'react'

export function reportRendererError (error, componentStack = '') {
  const message = error?.message || String(error || '未知界面错误')
  console.error('[Quick Launcher]', error)
  try {
    window.services?.reportRendererError?.({
      message,
      stack: error?.stack || '',
      componentStack
    })?.catch(() => {})
  } catch {}
}

export default class AppErrorBoundary extends React.Component {
  state = { failed: false, error: null }

  static getDerivedStateFromError (error) { return { failed: true, error } }

  componentDidCatch (error, info) {
    reportRendererError(error, info.componentStack)
  }

  render () {
    if (!this.state.failed) return this.props.children
    const error = this.state.error
    return (
      <main className="app-error" role="alert">
        <h1>界面加载出错</h1>
        <p>请重新加载后再试。展开错误详情可以查看原因。</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
        <details>
          <summary>错误详情</summary>
          <pre>{String(error?.stack || error?.message || error).slice(0, 6000)}</pre>
        </details>
      </main>
    )
  }
}
