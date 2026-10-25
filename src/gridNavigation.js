// 网格方向键导航的共用几何算法（主界面卡片视图 / 紧凑盒子视图都用这一套）
// 思路：拿到容器里每个元素的中心点，按方向找最近的一个；
// 到行尾 / 行首、列底 / 列顶时，只在**同一行 / 同一列**内回绕，不跨行、不跨列。

export function collectGridBoxes (container, attribute = 'data-item-id') {
  if (!container) return []
  return Array.from(container.querySelectorAll(`[${attribute}]`)).map((node) => {
    const rect = node.getBoundingClientRect()
    return {
      id: node.getAttribute(attribute),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }
  })
}

export function findNeighborByGeometry (boxes, currentId, direction) {
  const self = boxes.find((entry) => entry.id === currentId)
  if (!self) return null
  const others = boxes.filter((entry) => entry.id !== currentId)
  if (!others.length) return null
  const vertical = direction === 'up' || direction === 'down'
  const sameRow = others.filter((entry) => Math.abs(entry.y - self.y) < 2)
  const sameColumn = others.filter((entry) => Math.abs(entry.x - self.x) < 2)
  const nearest = (pool) => {
    if (!pool.length) return null
    return pool
      .map((entry) => ({ id: entry.id, dx: entry.x - self.x, dy: entry.y - self.y }))
      .sort((a, b) => {
        const pa = vertical ? Math.abs(a.dy) : Math.abs(a.dx)
        const pb = vertical ? Math.abs(b.dy) : Math.abs(b.dx)
        if (Math.abs(pa - pb) > 1) return pa - pb
        const ca = vertical ? Math.abs(a.dx) : Math.abs(a.dy)
        const cb = vertical ? Math.abs(b.dx) : Math.abs(b.dy)
        return ca - cb
      })[0].id
  }
  const inDirection = others.filter((entry) => (
    vertical
      ? (direction === 'up' ? entry.y < self.y - 1 : entry.y > self.y + 1)
      : (direction === 'left' ? entry.x < self.x - 1 : entry.x > self.x + 1)
  ))
  if (inDirection.length) return nearest(inDirection)
  // 到头了：同一行内 → 回到最左 / 最右；同一列内 → 回到最上 / 最下
  const wrapPool = vertical ? sameColumn : sameRow
  if (!wrapPool.length) return null
  return wrapPool.reduce((best, entry) => {
    if (vertical) {
      return (direction === 'down' ? entry.y < best.y : entry.y > best.y) ? entry : best
    }
    return (direction === 'right' ? entry.x < best.x : entry.x > best.x) ? entry : best
  }).id
}
