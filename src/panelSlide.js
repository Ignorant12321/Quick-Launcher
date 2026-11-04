// 面板换分组时的「推屏」：换之前把旧面板整块复制一份静态 DOM 贴回窗口，朝切换方向滑走，
// 新面板同时从另一侧滑进来。
//
// 为什么是复制 DOM 而不是再渲染一个面板：面板里挂着一整套键盘监听、右键菜单、拖拽和
// 高度回报，同一时刻存在两份很容易互相打架；复制出来的那份没有事件、也不会重新取图标，
// 只是一个「画得像」的静态层，正好够这段两百毫秒用。
//
// 窗口高度是 uTools 原生改的、没法补间，所以位移只有 18px，方向感靠两份反向滑动来表达。

const DISTANCE = 18
export const PANEL_SLIDE_DURATION = 210
// 主界面 ↔ 搜索面板这种「整块换掉」的淡入淡出：比推屏短一点。
// 这一下窗口要跟着缩 / 长，两端都得等淡出走完才好动手，拖长了中间那段空白就很显眼
export const LAYER_FADE_DURATION = 170
// 位移用「先快后慢」：卡片很快就让开位置，剩下的交给淡出
const MOVE_EASING = 'cubic-bezier(0.2, 0, 0, 1)'


function reduceMotion () {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}

// 位移和透明度分开播：同一条「先快后慢」的曲线同时管两件事时，
// 旧面板会在前 40% 就把自己淡没了，剩下的滑出根本看不见 —— 又变回一次闪动
function slide (element, from, to, fadeFrom, fadeTo, fadeEasing, fadeDuration, fill = 'none') {
  element.animate(
    [
      { transform: `translateX(${from}px)` },
      { transform: `translateX(${to}px)` }
    ],
    { duration: PANEL_SLIDE_DURATION, easing: MOVE_EASING, fill }
  )
  return element.animate(
    [{ opacity: fadeFrom }, { opacity: fadeTo }],
    { duration: fadeDuration, easing: fadeEasing, fill }
  )
}

// 把一块界面复制成贴在原位的静态层：没有事件、不重新取图标，只是一个「画得像」的副本，
// 够这两百毫秒的过渡用。返回 null 表示这一下不做动画（没有尺寸 / 浏览器不支持）
function cloneLayer (source) {
  if (!source) return null
  const rect = source.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const ghost = source.cloneNode(true)
  if (!(ghost instanceof HTMLElement)) return null

  // 滚动位置不跟着克隆：按节点顺序把 scrollTop / scrollLeft 抄一遍。
  // 不抄的话，用户滚到一半再进分组时，滑出去的那份会先跳回顶部
  const from = source.querySelectorAll('*')
  const to = ghost.querySelectorAll('*')
  const count = Math.min(from.length, to.length)
  for (let index = 0; index < count; index++) {
    const node = to[index]
    if (!(node instanceof HTMLElement)) continue
    // 同一张页面上出现两个同名 view-transition-name，会让下一次主题切换的过渡失效
    if (node.style.viewTransitionName) node.style.viewTransitionName = ''
    const { scrollTop, scrollLeft } = from[index]
    if (scrollTop) node.scrollTop = scrollTop
    if (scrollLeft) node.scrollLeft = scrollLeft
  }

  ghost.classList.add('panel-slide-ghost')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('inert', '')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    zIndex: '60',
    pointerEvents: 'none',
    willChange: 'transform, opacity'
  })
  document.body.appendChild(ghost)

  // 副本会把原件身上的 CSS 动画一起复制，并在新节点上从头再播一遍：
  // 主界面根节点带 .app-enter（backwards 填充，起点是 translateY(4px) scale(0.995)），
  // 副本一上来就会整块「跳」一下再回位 —— 这正是进出面板时看着闪一下的来源；
  // 条目入场的错峰动画（.item-enter-face 等）也会重放。副本只是一张静止的画，全掐掉
  try {
    ghost.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
  } catch {
    ghost.getAnimations?.().forEach((animation) => animation.cancel())
  }
  return ghost
}

// 动画结束后把副本收掉；另留一个兜底定时器，动画被打断、窗口被隐藏时也不留鬼影
function dropWith (ghost, animation) {
  const drop = () => ghost.remove()
  animation.addEventListener('finish', drop)
  animation.addEventListener('cancel', drop)
  window.setTimeout(drop, PANEL_SLIDE_DURATION + 500)
}

// 主界面 → 搜索面板：主界面整块留在原地淡出。
// 这一下窗口要往下缩，而 uTools 的窗口高度改不了补间，缩的瞬间会把贴着窗口的副本切掉一截。
// 所以先让旧画面自己消失，等淡出走完再收窗口 —— 收的时候下面只剩页面底色，看不出跳变。
// 返回值表示这一下到底有没有走动画（没走的话调用方老老实实直接改窗口高度）
export function fadeLayerOut (source) {
  if (reduceMotion()) return false
  const ghost = cloneLayer(source)
  if (!ghost) return false
  if (typeof ghost.animate !== 'function') {
    ghost.remove()
    return false
  }
  const animation = ghost.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: LAYER_FADE_DURATION, easing: 'ease', fill: 'forwards' }
  )
  dropWith(ghost, animation)
  return true
}

// 旧面板滑出：direction 是这次导航的方向（forward = 继续往里进，back = 返回上一层）
export function slidePanelOut (source, direction) {
  if (!source || reduceMotion()) return
  const ghost = cloneLayer(source)
  if (!ghost) return

  const offset = direction === 'back' ? DISTANCE : -DISTANCE
  // 淡出用标准 ease：前 40% 还留八成，旧面板的滑出过程才看得见；
  // 太快淡没的话，新面板是「凭空出现」，看不出是在往哪边走
  const fade = slide(ghost, 0, offset, 1, 0, 'ease', PANEL_SLIDE_DURATION, 'forwards')
  dropWith(ghost, fade)
}

// 新面板滑入：位移和旧面板反向，淡入稍微早一点收尾 —— 旧面板在上面还半透明时
// 它已经实了，两张卡叠在一起的那一瞬间才不会发灰
export function slidePanelIn (element, direction) {
  if (!element || typeof element.animate !== 'function' || reduceMotion()) return
  const offset = direction === 'back' ? -DISTANCE : DISTANCE
  slide(element, offset, 0, 0, 1, 'ease-out', PANEL_SLIDE_DURATION * 0.85)
}
