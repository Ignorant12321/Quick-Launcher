// A stalled image/attachment must release its slot so later updates can proceed.
export function withTimeout (promise, milliseconds, message = '图标加载超时') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds)
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

// Replacing a snapshot drops queued work, shares running work with the same
// version, and prevents an obsolete result from updating the current snapshot.
export function createLatestTaskQueue (concurrency = 4) {
  let desired = new Map()
  let pending = []
  const running = new Map()
  const pump = () => {
    while (running.size < concurrency) {
      const index = pending.findIndex((task) => !running.has(task.id))
      if (index < 0) return
      const [task] = pending.splice(index, 1)
      running.set(task.id, task)
      Promise.resolve().then(task.run).then((result) => {
        const current = desired.get(task.id)
        if (current?.version === task.version) current.onResult?.(result)
      }, () => {}).catch(() => {}).finally(() => {
        running.delete(task.id)
        pump()
      })
    }
  }
  return {
    replace (tasks) {
      desired = new Map(tasks.map((task) => [task.id, task]))
      pending = [...desired.values()].filter((task) => running.get(task.id)?.version !== task.version)
      pump()
    }
  }
}
