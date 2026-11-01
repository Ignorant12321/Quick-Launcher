import React, { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import Stack from '@mui/material/Stack'
import CircularProgress from '@mui/material/CircularProgress'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded'
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded'
import { GroupAvatarFace, useCustomIcon, cacheCustomIcon } from '../icons'
import IconAppearanceEditor from './IconAppearanceEditor'
import IconCropDialog from './IconCropDialog'
import SearchAppearanceDialog from './SearchAppearanceDialog'
import { usePresence, useRetainedValue } from '../usePresence'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'
import { BACKGROUND_MAX_BYTES, shrinkImageDataUrl } from '../imageScale'
import {
  clampNestedGrid,
  DEFAULT_ACTIVE_OPACITY,
  DEFAULT_BACKGROUND_BLUR,
  DEFAULT_BACKGROUND_DIM,
  DEFAULT_BOX_OPACITY,
  DEFAULT_CHROME_OPACITY,
  DEFAULT_COLOR,
  DEFAULT_HOVER_OPACITY,
  DEFAULT_ICON,
  DEFAULT_TEXT_COLOR,
  ITEM_DEFAULT_ICONS,
  ITEM_TYPES,
  DEFAULT_TEXT_OPACITY,
  MAX_ALIASES,
  MAX_BACKGROUND_BLUR,
  MAX_BACKGROUND_DIM,
  MAX_KEYWORD_LENGTH,
  MAX_NESTED_GRID,
  MIN_TEXT_OPACITY,
  normalizeIconRadius,
  normalizeSurfaceColor,
  isGroupActive,
  validateGroupKeywords,
  validateKeyword
} from '../data'

const GRID_SIZE_OPTIONS = Array.from({ length: MAX_NESTED_GRID }, (_, index) => index + 1)

// 百分比类字段的读取：非法值落到默认值，再夹在 [min, max]
function readPercent (value, fallback, min = 0, max = 100) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function makeForm (group) {
  const quickLaunch = Boolean(group?.quickLaunch)
  return {
    name: group?.name || '',
    aliases: [...(group?.aliases || [])],
    icon: group?.icon || DEFAULT_ICON,
    color: group?.color || DEFAULT_COLOR,
    // 新建分组 / 旧数据没有这两个开关时默认开启
    enabled: isGroupActive(group),
    keywordMatch: Boolean(group?.keywordMatch),
    quickLaunch,
    compactView: group?.compactView === 'list' ? 'list' : 'grid',
    // 新建分组 / 旧数据没有这个开关时默认开启
    nestedGroupView: group?.nestedGroupView === undefined ? true : Boolean(group.nestedGroupView),
    nestedBoxCols: clampNestedGrid(group?.nestedBoxCols),
    nestedBoxRows: clampNestedGrid(group?.nestedBoxRows),
    backgroundDim: readPercent(group?.backgroundDim, DEFAULT_BACKGROUND_DIM, 0, MAX_BACKGROUND_DIM),
    backgroundBlur: readPercent(group?.backgroundBlur, DEFAULT_BACKGROUND_BLUR, 0, MAX_BACKGROUND_BLUR),
    textColor: /^#[0-9a-f]{6}$/i.test(group?.textColor)
      ? group.textColor.toLowerCase()
      : DEFAULT_TEXT_COLOR,
    textOpacity: readPercent(group?.textOpacity, DEFAULT_TEXT_OPACITY, MIN_TEXT_OPACITY),
    chromeOpacity: readPercent(group?.chromeOpacity, DEFAULT_CHROME_OPACITY),
    boxOpacity: readPercent(group?.boxOpacity, DEFAULT_BOX_OPACITY),
    hoverOpacity: readPercent(group?.hoverOpacity, DEFAULT_HOVER_OPACITY),
    activeOpacity: readPercent(group?.activeOpacity, DEFAULT_ACTIVE_OPACITY),
    // 衬底底色（顶栏 / 盒子 / 悬浮 / 高亮 共用）：null = 自动（按字色明暗推导）
    surfaceColor: normalizeSurfaceColor(group?.surfaceColor),
    customIconRadius: normalizeIconRadius(group?.customIconRadius),
    iconRadius: normalizeIconRadius(group?.iconRadius)
  }
}

function SettingRow ({ icon: Icon, title, description, checked, disabled, onChange, ariaLabel }) {
  return (
    <Box
      sx={{
        px: 1.7,
        py: 1.5,
        borderRadius: '14px',
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1.6,
        bgcolor: 'action.hover',
        opacity: disabled ? 0.55 : 1
      }}
    >
      <Icon sx={{ fontSize: 22, color: 'text.secondary', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>
          {title}
        </Typography>
        {description && (
          <Typography sx={{ mt: 0.35, fontSize: 10.5, lineHeight: 1.4, color: 'text.secondary' }}>
            {description}
          </Typography>
        )}
      </Box>
      <Switch
        size="small"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        slotProps={{ input: { 'aria-label': ariaLabel } }}
        sx={{ flexShrink: 0, ml: 0.8 }}
      />
    </Box>
  )
}

// 搜索面板（紧凑视图）的外观：缩略图实时带遮罩，具体参数在弹窗里所见即所得地调
function SearchPanelSettings ({
  view,
  onViewChange,
  nestedGroupView,
  onNestedGroupViewChange,
  nestedBoxCols,
  nestedBoxRows,
  onNestedBoxGridChange,
  backgroundSrc,
  dim,
  blur,
  textColor,
  picking,
  onOpenEditor,
  onRemoveBackground
}) {
  // 盒子网格的预设：等边网格（3×3 / 4×4 / 5×5），其余组合算自定义
  const detectedPreset = nestedBoxCols === nestedBoxRows && GRID_SIZE_OPTIONS.includes(nestedBoxCols)
    ? `${nestedBoxCols}x${nestedBoxCols}`
    : 'custom'
  // 点「自定义」但当前值刚好等于某个预设时，光看数值分不出是哪个，用这个标记兜住
  const [customEditing, setCustomEditing] = useState(false)
  const boxGridPreset = customEditing ? 'custom' : detectedPreset
  const applyBoxGridPreset = (next) => {
    if (!next) return
    if (next === 'custom') {
      setCustomEditing(true)
      return
    }
    setCustomEditing(false)
    const size = Number(next.split('x')[0])
    onNestedBoxGridChange({ cols: size, rows: size })
  }
  return (
    <Box
      sx={{
        ml: 1.3,
        pl: 1.5,
        borderLeft: '2px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.1
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: 'text.secondary' }}
          >
            搜索外观设置
          </Typography>
          <Typography
            sx={{ mt: 0.3, fontSize: 10.5, lineHeight: 1.4, color: 'text.secondary' }}
          >
            设置搜索默认视图与背景，支持按分组单独切换。
          </Typography>
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_event, next) => {
            if (next) onViewChange(next)
          }}
          aria-label="默认视图"
          sx={{
            height: 26,
            flexShrink: 0,
            bgcolor: 'action.hover',
            borderRadius: '8px',
            gap: '1px',
            '& .MuiToggleButton-root': {
              width: 28,
              p: 0,
              border: 0,
              borderRadius: '7px',
              color: 'text.secondary',
              transition: 'background-color 120ms ease, color 120ms ease',
              '&:hover': { bgcolor: 'action.selected' },
              '&.Mui-selected': {
                color: 'primary.main',
                bgcolor: 'action.selected',
                '&:hover': { bgcolor: 'action.selected' }
              }
            }
          }}
        >
          <ToggleButton value="list" title="列表视图" aria-label="列表视图">
            <ViewListRoundedIcon sx={{ fontSize: 16 }} />
          </ToggleButton>
          <ToggleButton value="grid" title="盒子视图" aria-label="盒子视图">
            <GridViewRoundedIcon sx={{ fontSize: 15 }} />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
        <Box
          role="button"
          tabIndex={0}
          title={backgroundSrc ? '修改搜索外观' : '添加背景图片'}
          onClick={onOpenEditor}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onOpenEditor()
          }}
          sx={{
            position: 'relative',
            width: 56,
            height: 36,
            flexShrink: 0,
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'border-color 120ms ease',
            '&:hover': { borderColor: 'primary.main' },
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 1
            }
          }}
        >
          {backgroundSrc
            ? (
              <>
                <Box
                  component="img"
                  src={backgroundSrc}
                  alt=""
                  draggable={false}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    // 缩略图只有面板的几分之一大，模糊半径按比例折半，看起来的量级才和面板一致
                    filter: blur ? `blur(${Math.round(blur / 2)}px)` : undefined,
                    transform: blur ? 'scale(1.2)' : undefined
                  }}
                />
                {/* 缩略图同步显示遮罩浓度，拖滑杆时这里会跟着变 */}
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    bgcolor: (theme) => (theme.palette.mode === 'dark'
                      ? `rgba(17, 18, 21, ${dim / 100})`
                      : `rgba(244, 244, 245, ${dim / 100})`)
                  }}
                />
              </>
              )
            : <ImageRoundedIcon sx={{ fontSize: 17, color: 'text.disabled' }} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
            背景图片
          </Typography>
          <Typography
            sx={{ mt: 0.25, fontSize: 10.5, lineHeight: 1.4, color: 'text.secondary' }}
          >
            {backgroundSrc
              ? `遮罩 ${dim}% · 模糊 ${blur}px · 字体颜色 ${String(textColor || '').toUpperCase()}`
              : 'PNG / JPG / WebP'}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={onOpenEditor}
          disabled={picking}
          startIcon={picking ? <CircularProgress size={13} color="inherit" /> : undefined}
          sx={{ flexShrink: 0, minWidth: 0, px: 1.4, py: 0.4 }}
        >
          修改
        </Button>
        {backgroundSrc && (
          <IconButton
            size="small"
            onClick={onRemoveBackground}
            disabled={picking}
            aria-label="移除背景图片"
            title="移除背景图片"
            sx={{
              flexShrink: 0,
              color: 'error.main',
              '&:hover': { color: 'error.dark', bgcolor: 'action.hover' }
            }}
          >
            <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>

      {/* 开关与盒子网格并成一行：关掉时只有标题 + 开关，开着时中间直接选网格 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography
          title="盒子视图里把分组入口展开成盒子，直接列出里面的条目，点条目即可启动"
          sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, flexShrink: 0 }}
        >
          嵌套分组视图
        </Typography>
        {nestedGroupView && (
          <>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={boxGridPreset}
              onChange={(_event, next) => applyBoxGridPreset(next)}
              aria-label="盒子网格"
              sx={{
                height: 24,
                bgcolor: 'action.hover',
                borderRadius: '8px',
                gap: '1px',
                '& .MuiToggleButton-root': {
                  minWidth: 0,
                  px: 1,
                  py: 0,
                  border: 0,
                  borderRadius: '7px',
                  fontSize: 11,
                  lineHeight: 1,
                  color: 'text.secondary',
                  '&:hover': { bgcolor: 'action.selected' },
                  '&.Mui-selected': {
                    color: 'primary.main',
                    bgcolor: 'action.selected',
                    '&:hover': { bgcolor: 'action.selected' }
                  }
                }
              }}
            >
              <ToggleButton value="3x3">3 × 3</ToggleButton>
              <ToggleButton value="4x4">4 × 4</ToggleButton>
              <ToggleButton value="5x5">5 × 5</ToggleButton>
              <ToggleButton value="custom">自定义</ToggleButton>
            </ToggleButtonGroup>
            {boxGridPreset === 'custom' && (
              <>
                <Select
                  size="small"
                  value={nestedBoxCols}
                  onChange={(event) => onNestedBoxGridChange({
                    cols: Number(event.target.value),
                    rows: nestedBoxRows
                  })}
                  inputProps={{ 'aria-label': '盒子网格列数' }}
                  sx={{
                    height: 24,
                    fontSize: 11,
                    minWidth: 58,
                    '& .MuiSelect-select': { py: 0.3, pl: 0.8 }
                  }}
                >
                  {GRID_SIZE_OPTIONS.map((size) => (
                    <MenuItem key={size} value={size} sx={{ fontSize: 12 }}>
                      {size} 列
                    </MenuItem>
                  ))}
                </Select>
                <Select
                  size="small"
                  value={nestedBoxRows}
                  onChange={(event) => onNestedBoxGridChange({
                    cols: nestedBoxCols,
                    rows: Number(event.target.value)
                  })}
                  inputProps={{ 'aria-label': '盒子网格行数' }}
                  sx={{
                    height: 24,
                    fontSize: 11,
                    minWidth: 58,
                    '& .MuiSelect-select': { py: 0.3, pl: 0.8 }
                  }}
                >
                  {GRID_SIZE_OPTIONS.map((size) => (
                    <MenuItem key={size} value={size} sx={{ fontSize: 12 }}>
                      {size} 行
                    </MenuItem>
                  ))}
                </Select>
              </>
            )}
          </>
        )}
        <Switch
          size="small"
          checked={nestedGroupView}
          // 只对盒子视图有效，开启时顺手切到盒子视图，否则看着像没生效
          onChange={(event) => onNestedGroupViewChange(event.target.checked)}
          slotProps={{ input: { 'aria-label': '嵌套分组视图' } }}
          sx={{ ml: 'auto', flexShrink: 0 }}
        />
      </Box>
    </Box>
  )
}

export default function GroupEditorDialog ({
  open,
  group,
  groups,
  onClose,
  onSave,
  onDeleteRequest
}) {
  const [form, setForm] = useState(() => makeForm(group))
  const [aliasInput, setAliasInput] = useState('')
  const [aliasError, setAliasError] = useState('')
  const [showNameError, setShowNameError] = useState(false)
  const [formError, setFormError] = useState('')
  const [draftImage, setDraftImage] = useState(null)
  const [cropSource, setCropSource] = useState(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [removeCustomIcon, setRemoveCustomIcon] = useState(false)
  const [backgroundDraft, setBackgroundDraft] = useState(null)
  const [removeBackground, setRemoveBackground] = useState(false)
  const [backgroundPicking, setBackgroundPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const appearanceSnapshot = useRef(null)
  const contentRef = useRef(null)
  const contentFade = useScrollFade(contentRef)
  const cropPresence = usePresence(cropOpen)
  const retainedCropSource = useRetainedValue(cropSource)

  const existingIconSrc = useCustomIcon(group?.customIconRef)
  const existingBackgroundSrc = useCustomIcon(group?.backgroundRef)
  const isNew = !group || !groups.some((item) => item.id === group.id)
  const previewSrc = draftImage
    ? draftImage.dataUrl
    : (!removeCustomIcon ? existingIconSrc : null)
  const backgroundSrc = backgroundDraft
    ? backgroundDraft.dataUrl
    : (!removeBackground ? existingBackgroundSrc : null)
  const hasCustomIcon = Boolean(draftImage || (!removeCustomIcon && group?.customIconRef))
  const nameError = validateKeyword(form.name)

  useEffect(() => {
    if (!open) return
    setForm(makeForm(group))
    setAliasInput('')
    setAliasError('')
    setShowNameError(false)
    setFormError('')
    setDraftImage(null)
    setCropSource(null)
    setCropOpen(false)
    setAppearanceOpen(false)
    setRemoveCustomIcon(false)
    setBackgroundDraft(null)
    setRemoveBackground(false)
    setBackgroundPicking(false)
    setSaving(false)
    savingRef.current = false
  }, [open, group?.id])

  const updateForm = (patch) => {
    setForm((previous) => ({ ...previous, ...patch }))
    setFormError('')
  }

  const addAlias = () => {
    const alias = aliasInput.trim()
    if (!alias) return
    setAliasError('')

    const error = validateKeyword(alias)
    if (error) {
      setAliasError(error)
      return
    }
    if (form.aliases.length >= MAX_ALIASES) {
      setAliasError(`最多添加 ${MAX_ALIASES} 个别名`)
      return
    }

    const key = alias.toLocaleLowerCase()
    const duplicated = form.name.trim().toLocaleLowerCase() === key ||
      form.aliases.some((item) => item.toLocaleLowerCase() === key)
    if (duplicated) {
      setAliasError('该别名已存在')
      return
    }

    updateForm({ aliases: [...form.aliases, alias] })
    setAliasInput('')
  }

  const collectAliases = () => {
    const pending = aliasInput.trim()
    if (!pending) return [...form.aliases]

    const error = validateKeyword(pending)
    if (error) {
      setAliasError(error)
      return null
    }
    if (form.aliases.length >= MAX_ALIASES) {
      setAliasError(`最多添加 ${MAX_ALIASES} 个别名`)
      return null
    }

    const key = pending.toLocaleLowerCase()
    const duplicated = form.name.trim().toLocaleLowerCase() === key ||
      form.aliases.some((item) => item.toLocaleLowerCase() === key)
    if (duplicated) {
      setAliasError('该别名已存在')
      return null
    }

    return [...form.aliases, pending]
  }

  const selectBuiltInIcon = (icon) => {
    updateForm({ icon })
    setDraftImage(null)
    setRemoveCustomIcon(true)
  }

  const pickCustomIcon = () => {
    setFormError('')
    setCropSource(previewSrc || '')
    setCropOpen(true)
  }

  const pickBackground = async () => {
    if (backgroundPicking) return
    setFormError('')
    setBackgroundPicking(true)
    try {
      const result = await window.services?.selectCustomIcon?.('选择背景图片', {
        maxBytes: BACKGROUND_MAX_BYTES
      })
      if (result?.ok && result.dataUrl) {
        const dataUrl = await shrinkImageDataUrl(result.dataUrl)
        setBackgroundDraft({ dataUrl })
        setRemoveBackground(false)
      } else if (result && result.ok === false) {
        setFormError(result.error || '无法读取背景图片')
      }
    } catch {
      setFormError('无法读取背景图片')
    } finally {
      setBackgroundPicking(false)
    }
  }

  // 弹窗里的改动是即时的，取消要能退回打开前的状态
  const openAppearance = () => {
    appearanceSnapshot.current = {
      backgroundDim: form.backgroundDim,
      backgroundBlur: form.backgroundBlur,
      textColor: form.textColor,
      textOpacity: form.textOpacity,
      chromeOpacity: form.chromeOpacity,
      boxOpacity: form.boxOpacity,
      hoverOpacity: form.hoverOpacity,
      activeOpacity: form.activeOpacity,
      surfaceColor: form.surfaceColor,
      backgroundDraft,
      removeBackground
    }
    setAppearanceOpen(true)
  }

  // 重置外观：只回滚这些外观参数，背景图片本身保留（要删图有单独的删除按钮）
  const resetAppearance = () => {
    updateForm({
      backgroundDim: DEFAULT_BACKGROUND_DIM,
      backgroundBlur: DEFAULT_BACKGROUND_BLUR,
      textColor: DEFAULT_TEXT_COLOR,
      textOpacity: DEFAULT_TEXT_OPACITY,
      chromeOpacity: DEFAULT_CHROME_OPACITY,
      boxOpacity: DEFAULT_BOX_OPACITY,
      hoverOpacity: DEFAULT_HOVER_OPACITY,
      activeOpacity: DEFAULT_ACTIVE_OPACITY,
      surfaceColor: null
    })
  }

  const cancelAppearance = () => {
    const snapshot = appearanceSnapshot.current
    if (snapshot) {
      updateForm({
        backgroundDim: snapshot.backgroundDim,
        backgroundBlur: snapshot.backgroundBlur,
        textColor: snapshot.textColor,
        textOpacity: snapshot.textOpacity,
        chromeOpacity: snapshot.chromeOpacity,
        boxOpacity: snapshot.boxOpacity,
        hoverOpacity: snapshot.hoverOpacity,
        activeOpacity: snapshot.activeOpacity,
        surfaceColor: snapshot.surfaceColor
      })
      setBackgroundDraft(snapshot.backgroundDraft)
      setRemoveBackground(snapshot.removeBackground)
    }
    appearanceSnapshot.current = null
    setFormError('')
    setAppearanceOpen(false)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    setShowNameError(true)
    setFormError('')
    setAliasError('')

    if (nameError) return
    const aliases = collectAliases()
    if (!aliases) return

    const name = form.name.trim()
    const quickLaunch = form.quickLaunch
    const candidate = {
      ...group,
      name,
      aliases,
      icon: form.icon,
      color: form.color,
      enabled: Boolean(form.enabled),
      keywordMatch: form.keywordMatch,
      quickLaunch,
      // 搜索面板已恒开，不再提供开关
      utoolsSearch: true,
      customIconRef: group?.customIconRef || null,
      customIconRadius: form.customIconRadius,
      iconRadius: form.iconRadius,
      backgroundRef: group?.backgroundRef || null,
      backgroundDim: form.backgroundDim,
      backgroundBlur: form.backgroundBlur,
      textColor: form.textColor || DEFAULT_TEXT_COLOR,
      textOpacity: form.textOpacity,
      chromeOpacity: form.chromeOpacity,
      boxOpacity: form.boxOpacity,
      hoverOpacity: form.hoverOpacity,
      activeOpacity: form.activeOpacity,
      surfaceColor: normalizeSurfaceColor(form.surfaceColor),
      compactView: form.compactView === 'list' ? 'list' : 'grid',
      nestedGroupView: form.nestedGroupView,
      nestedBoxCols: form.nestedBoxCols,
      nestedBoxRows: form.nestedBoxRows
    }

    const keywordError = validateGroupKeywords(groups, candidate)
    if (keywordError) {
      setFormError(keywordError)
      return
    }

    savingRef.current = true
    setSaving(true)
    let importedRef = null
    let importedBackgroundRef = null

    try {
      let customIconRef = removeCustomIcon ? null : (group?.customIconRef || null)
      let backgroundRef = removeBackground ? null : (group?.backgroundRef || null)

      if (draftImage) {
        const result = await window.services.importCustomIconData(draftImage.dataUrl)
        if (!result?.ok) {
          setFormError(result?.error || '保存图片失败')
          return
        }
        importedRef = result.ref
        customIconRef = result.ref
        cacheCustomIcon(result.ref, draftImage.dataUrl)
      }

      if (backgroundDraft) {
        const result = await window.services.importCustomIconData(
          backgroundDraft.dataUrl,
          { maxBytes: BACKGROUND_MAX_BYTES }
        )
        if (!result?.ok) {
          // 图标可能已经先落盘了；背景失败时把刚写进去的图标一并回收，别留孤儿
          if (importedRef) {
            cacheCustomIcon(importedRef, null)
            window.services.deleteCustomIcon?.(importedRef)
            importedRef = null
          }
          setFormError(result?.error || '保存背景图片失败')
          return
        }
        importedBackgroundRef = result.ref
        backgroundRef = result.ref
        cacheCustomIcon(result.ref, backgroundDraft.dataUrl)
      }

      const saved = onSave({ ...candidate, customIconRef, backgroundRef })
      if (!saved) {
        if (importedRef) {
          cacheCustomIcon(importedRef, null)
          window.services.deleteCustomIcon?.(importedRef)
        }
        if (importedBackgroundRef) {
          cacheCustomIcon(importedBackgroundRef, null)
          window.services.deleteCustomIcon?.(importedBackgroundRef)
        }
        setFormError('保存失败，请重试')
        return
      }

      const previousRef = group?.customIconRef
      if (previousRef && previousRef !== customIconRef) {
        const stillUsed = groups.some((item) => (
          item.id !== group?.id && item.customIconRef === previousRef
        ))
        if (!stillUsed) {
          cacheCustomIcon(previousRef, null)
          window.services.deleteCustomIcon?.(previousRef)
        }
      }

      const previousBackgroundRef = group?.backgroundRef
      if (previousBackgroundRef && previousBackgroundRef !== backgroundRef) {
        const stillUsed = groups.some((item) => (
          item.id !== group?.id && item.backgroundRef === previousBackgroundRef
        ))
        if (!stillUsed) {
          cacheCustomIcon(previousBackgroundRef, null)
          window.services.deleteCustomIcon?.(previousBackgroundRef)
        }
      }
    } catch {
      if (importedRef) {
        cacheCustomIcon(importedRef, null)
        window.services.deleteCustomIcon?.(importedRef)
      }
      if (importedBackgroundRef) {
        cacheCustomIcon(importedBackgroundRef, null)
        window.services.deleteCustomIcon?.(importedBackgroundRef)
      }
      setFormError('保存失败，请重试')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={(event, reason) => {
        if (cropOpen) return
        if (!saving && reason !== 'backdropClick') onClose()
      }}
      fullWidth
      maxWidth={false}
      // 默认进场淡入 225ms，点击后会有明显的「等一下」感；收紧到 130ms
      transitionDuration={{ enter: 130, exit: 170 }}
      slotProps={{
        paper: {
          sx: {
            width: 620,
            maxWidth: 'calc(100vw - 40px)',
            m: 2,
            maxHeight: 'calc(100vh - 32px)',
            borderRadius: '20px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }
        }
      }}
    >
      <DialogTitle sx={{ px: 2.8, pt: 2.2, pb: 1.8, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.6 }}>
          <GroupAvatarFace
            group={{ ...form, customIconRef: null }}
            size={42}
            customSrc={previewSrc}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.3 }}>
              {isNew ? '新建分组' : '编辑分组'}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="关闭" disabled={saving}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent
        ref={contentRef}
        className="scroll-fade"
        sx={{
          px: 2.8,
          pt: '22px !important',
          pb: 2.2,
          overflowY: 'auto',
          ...scrollFadeSx(contentFade)
        }}
      >
        <Box
          sx={{
            mt: 0,
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr) 44px', sm: 'minmax(190px, 1fr) 190px 44px' },
            alignItems: 'start',
            gap: 1.2
          }}
        >
          <TextField
            autoFocus
            size="small"
            label="分组名称"
            value={form.name}
            onChange={(event) => updateForm({ name: event.target.value })}
            onBlur={() => setShowNameError(true)}
            error={showNameError && Boolean(nameError)}
            helperText={showNameError && nameError ? nameError : undefined}
            slotProps={{ htmlInput: { maxLength: MAX_KEYWORD_LENGTH } }}
            sx={{
              gridColumn: { xs: '1 / -1', sm: 'auto' },
              width: '100%',
              '& .MuiInputBase-root': { minHeight: 44 }
            }}
          />
          <TextField
            size="small"
            label="别名"
            value={aliasInput}
            onChange={(event) => {
              setAliasInput(event.target.value)
              setAliasError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addAlias()
              }
            }}
            placeholder={form.aliases.length >= MAX_ALIASES ? '已达上限' : '回车添加'}
            disabled={form.aliases.length >= MAX_ALIASES}
            error={Boolean(aliasError)}
            helperText={aliasError || undefined}
            slotProps={{ htmlInput: { maxLength: MAX_KEYWORD_LENGTH } }}
            sx={{ width: '100%', '& .MuiInputBase-root': { minHeight: 44 } }}
          />
          <IconButton
            onClick={addAlias}
            disabled={!aliasInput.trim() || form.aliases.length >= MAX_ALIASES}
            aria-label="添加别名"
            sx={{
              width: 44,
              height: 44,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '11px'
            }}
          >
            <AddRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {form.aliases.length > 0 && (
          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
            {form.aliases.map((alias) => (
              <Chip
                key={alias}
                size="small"
                label={alias}
                onDelete={() => updateForm({
                  aliases: form.aliases.filter((item) => item !== alias)
                })}
                sx={{ height: 26, bgcolor: 'action.hover', fontSize: 11 }}
              />
            ))}
          </Box>
        )}

        <Typography sx={{ mt: 3.2, mb: 1.5, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary' }}>
          外观设置
        </Typography>

        <IconAppearanceEditor
          icon={form.icon}
          color={form.color}
          customSrc={previewSrc}
          customIconRadius={form.customIconRadius}
          iconRadius={form.iconRadius}
          onSelectIcon={selectBuiltInIcon}
          onColorChange={(color) => updateForm({ color })}
          onRadiusChange={(customIconRadius) => updateForm({ customIconRadius })}
          onIconRadiusChange={(iconRadius) => updateForm({ iconRadius })}
          onImportIcon={pickCustomIcon}
          onUseBuiltinIcon={() => {
            setDraftImage(null)
            setRemoveCustomIcon(true)
            updateForm({ icon: ITEM_DEFAULT_ICONS[ITEM_TYPES.GROUP] })
          }}
          importLabel={hasCustomIcon ? '更换图标' : '自定义图标'}
        />

        <Typography sx={{ mt: 3.2, mb: 1.5, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary' }}>
          启动设置
        </Typography>

        <Stack spacing={1.4}>
          <SettingRow
            icon={PowerSettingsNewRoundedIcon}
            title="启用"
            description="关闭后不在 uTools 中出现"
            checked={form.enabled}
            onChange={(event) => updateForm({ enabled: event.target.checked })}
            ariaLabel="启用"
          />
          <SettingRow
            icon={KeyboardRoundedIcon}
            title="uTools 搜索框"
            description="输入分组名或别名即可搜到"
            checked={form.keywordMatch}
            disabled={!form.enabled}
            onChange={(event) => updateForm({ keywordMatch: event.target.checked })}
            ariaLabel="uTools 搜索框"
          />
          <SearchPanelSettings
            view={form.compactView}
            onViewChange={(compactView) => updateForm({ compactView })}
            nestedGroupView={form.nestedGroupView}
            onNestedGroupViewChange={(nestedGroupView) => updateForm({
              nestedGroupView,
              ...(nestedGroupView && form.compactView === 'list' ? { compactView: 'grid' } : {})
            })}
            nestedBoxCols={form.nestedBoxCols}
            nestedBoxRows={form.nestedBoxRows}
            onNestedBoxGridChange={({ cols, rows }) => updateForm({
              nestedBoxCols: clampNestedGrid(cols),
              nestedBoxRows: clampNestedGrid(rows)
            })}
            backgroundSrc={backgroundSrc}
            dim={form.backgroundDim}
            blur={form.backgroundBlur}
            textColor={form.textColor}
            picking={backgroundPicking}
            onOpenEditor={openAppearance}
            onRemoveBackground={() => {
              setBackgroundDraft(null)
              setRemoveBackground(true)
            }}
          />
          <SettingRow
            icon={RocketLaunchRoundedIcon}
            title="一键启动"
            description="不打开搜索面板，直接启动全部内容"
            checked={form.quickLaunch}
            disabled={!form.enabled}
            onChange={(event) => updateForm({
              quickLaunch: event.target.checked
            })}
            ariaLabel="一键启动"
          />
        </Stack>

      </DialogContent>

      {formError && (
        <Box sx={{ px: 2.8, pb: 1.2, flexShrink: 0 }}>
          <Alert severity="error" variant="outlined" sx={{ py: 0.3, fontSize: 11.5 }}>
            {formError}
          </Alert>
        </Box>
      )}

      <DialogActions
        sx={{
          px: 2.8,
          py: 1.8,
          borderTop: '1px solid',
          borderColor: 'divider',
          flexShrink: 0
        }}
      >
        {!isNew && (
          <Button
            color="error"
            size="small"
            startIcon={<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={() => onDeleteRequest(group)}
            disabled={saving}
          >
            删除分组
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={saving} sx={{ color: 'text.secondary' }}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          startIcon={saving
            ? <CircularProgress size={14} color="inherit" />
            : <SaveRoundedIcon sx={{ fontSize: 17 }} />}
          sx={{ minWidth: 92 }}
        >
          {saving ? '保存中' : (isNew ? '创建分组' : '保存修改')}
        </Button>
      </DialogActions>

      {appearanceOpen && (
        <SearchAppearanceDialog
          open={appearanceOpen}
          onCancel={cancelAppearance}
          onComplete={() => setAppearanceOpen(false)}
          group={{
            ...group,
            name: form.name,
            icon: form.icon,
            color: form.color,
            nestedGroupView: form.nestedGroupView,
            nestedBoxCols: form.nestedBoxCols,
            nestedBoxRows: form.nestedBoxRows,
            customIconRef: removeCustomIcon ? null : (group?.customIconRef || null)
          }}
          groups={groups}
          view={form.compactView}
          backgroundSrc={backgroundSrc}
          dim={form.backgroundDim}
          onDimChange={(backgroundDim) => updateForm({ backgroundDim })}
          blur={form.backgroundBlur}
          onBlurChange={(backgroundBlur) => updateForm({ backgroundBlur })}
          textColor={form.textColor}
          onTextColorChange={(textColor) => updateForm({ textColor })}
          textOpacity={form.textOpacity}
          onTextOpacityChange={(textOpacity) => updateForm({ textOpacity })}
          chromeOpacity={form.chromeOpacity}
          onChromeOpacityChange={(chromeOpacity) => updateForm({ chromeOpacity })}
          boxOpacity={form.boxOpacity}
          onBoxOpacityChange={(boxOpacity) => updateForm({ boxOpacity })}
          hoverOpacity={form.hoverOpacity}
          onHoverOpacityChange={(hoverOpacity) => updateForm({ hoverOpacity })}
          activeOpacity={form.activeOpacity}
          onActiveOpacityChange={(activeOpacity) => updateForm({ activeOpacity })}
          surfaceColor={form.surfaceColor}
          onSurfaceColorChange={(surfaceColor) => updateForm({ surfaceColor })}
          onReset={resetAppearance}
          picking={backgroundPicking}
          error={formError}
          onPickBackground={pickBackground}
          onRemoveBackground={() => {
            setBackgroundDraft(null)
            setRemoveBackground(true)
          }}
        />
      )}

      {cropPresence.mounted && (
        <IconCropDialog
          open={cropPresence.open}
          source={retainedCropSource || ''}
          radius={form.customIconRadius}
          onRadiusChange={(customIconRadius) => updateForm({ customIconRadius })}
          onCancel={() => {
            setCropOpen(false)
            setCropSource(null)
          }}
          onConfirm={(dataUrl) => {
            setDraftImage({ dataUrl })
            setRemoveCustomIcon(false)
            setCropOpen(false)
            setCropSource(null)
          }}
        />
      )}
    </Dialog>
  )
}
