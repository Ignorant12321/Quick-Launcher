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
import CircularProgress from '@mui/material/CircularProgress'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import AppsRoundedIcon from '@mui/icons-material/AppsRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import AddSoftwareDialog from './AddSoftwareDialog'
import ItemAppearancePicker from './ItemAppearancePicker'
import ItemIconView from './ItemIconView'
import BrowserModeSelect from './BrowserModeSelect'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'
import {
  DEFAULT_COLOR,
  DEFAULT_ITEM_ICON,
  ITEM_DEFAULT_COLORS,
  ITEM_DEFAULT_ICONS,
  isApplicationTarget,
  normalizeBrowserMode,
  normalizeUrl,
  ITEM_TYPES
} from '../data'
import { cacheCustomIcon, useCustomIcon, useFileIcons } from '../icons'
import { usePresence } from '../usePresence'

const ITEM_TYPE_NAMES = {
  [ITEM_TYPES.URL]: '网址',
  [ITEM_TYPES.FILE]: '文件',
  [ITEM_TYPES.FOLDER]: '目录',
  [ITEM_TYPES.APP]: '软件',
  [ITEM_TYPES.PLUGIN]: '插件'
}

function browseLabel (type) {
  if (type === ITEM_TYPES.APP) return '选择软件…'
  if (type === ITEM_TYPES.FOLDER) return '选择目录…'
  return '选择文件…'
}

export default function EditItemDialog ({ open, item, onClose, onSave, onDelete }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [path, setPath] = useState('')
  const [browserMode, setBrowserMode] = useState('default')
  const [openWith, setOpenWith] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [iconDraft, setIconDraft] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [appearance, setAppearance] = useState({
    icon: DEFAULT_ITEM_ICON,
    color: DEFAULT_COLOR,
    iconSource: 'builtin',
    customIconRadius: 0
  })
  const [softwarePickerOpen, setSoftwarePickerOpen] = useState(false)
  const pickerPresence = usePresence(softwarePickerOpen)
  const [openWithPickerOpen, setOpenWithPickerOpen] = useState(false)
  const openWithPickerPresence = usePresence(openWithPickerOpen)
  const contentRef = useRef(null)
  const contentFade = useScrollFade(contentRef)

  const typeName = ITEM_TYPE_NAMES[item?.type] || '条目'
  const isPathItem = Boolean(item && [
    ITEM_TYPES.FILE,
    ITEM_TYPES.FOLDER,
    ITEM_TYPES.APP
  ].includes(item.type))
  const openWithName = openWith ? openWith.split(/[\\/]/).pop() : ''
  const fileIcons = useFileIcons(isPathItem && item ? [item] : [])
  const nativeSrc = isPathItem ? fileIcons[item?.path] : ''
  const existingIconSrc = useCustomIcon(
    appearance.iconSource === 'custom' ? item?.customIconRef : null
  )
  const previewIconSrc = appearance.iconSource === 'custom'
    ? (iconDraft || existingIconSrc)
    : null

  const handleDeleteConfirm = () => {
    setConfirmDelete(false)
    onDelete?.(item)
    onClose()
  }

  useEffect(() => {
    if (!open || !item) return
    setName(item.name || '')
    setUrl(item.type === ITEM_TYPES.URL ? item.path : '')
    setPath(item.path || '')
    setOpenWith(item.openWith || '')
    setBrowserMode(
      normalizeBrowserMode(item.browserMode) ||
      (item.openWith ? 'custom' : 'default')
    )
    setError('')
    setSaving(false)
    setIconDraft(null)
    setConfirmDelete(false)
    setAppearance({
      icon: item.icon || ITEM_DEFAULT_ICONS[item.type] || DEFAULT_ITEM_ICON,
      color: /^#[0-9a-f]{6}$/i.test(item.color || '')
        ? item.color
        : (ITEM_DEFAULT_COLORS[item.type] || DEFAULT_COLOR),
      iconSource: item.iconSource ||
        (item.customIconRef ? 'custom' : (item.type === ITEM_TYPES.URL ? 'builtin' : 'native')),
      customIconRadius: Number(item.customIconRadius) || 0
    })
    setSoftwarePickerOpen(false)
    setOpenWithPickerOpen(false)
  }, [open, item])

  const handleBrowse = async () => {
    if (!item || saving) return
    if (item.type === ITEM_TYPES.APP) {
      setSoftwarePickerOpen(true)
      return
    }
    try {
      const paths = item.type === ITEM_TYPES.FOLDER
        ? await window.services.pickFolders()
        : await window.services.pickFiles()
      if (paths?.[0]) {
        setPath(paths[0])
        setError('')
      }
    } catch {
      setError('无法打开选择器')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!item || saving) return
    setError('')

    const nextName = name.trim()
    if (!nextName) {
      setError('请输入名称')
      return
    }

    const patch = { name: nextName, ...appearance }
    setSaving(true)
    let importedRef = null
    let success = false

    try {
      if (item.type === ITEM_TYPES.URL) {
        const normalized = normalizeUrl(url)
        if (!normalized) {
          setError('请输入有效的网址')
          return
        }
        patch.path = normalized
        patch.browserMode = browserMode === 'custom' ? '' : browserMode
        patch.openWith = browserMode === 'custom' ? (item.openWith || '') : ''
      } else if (isPathItem) {
        const nextPath = path.trim()
        if (!nextPath) {
          setError('请输入路径')
          return
        }
        const [described] = await window.services.describePaths([nextPath]) || []
        if (!described || described.error) {
          setError('路径不存在或无法访问')
          return
        }
        if (item.type === ITEM_TYPES.APP && described.isDirectory && !isApplicationTarget(described)) {
          setError('软件路径不能是目录')
          return
        }
        patch.path = described.path
        if (item.type === ITEM_TYPES.FILE || item.type === ITEM_TYPES.FOLDER) {
          patch.type = isApplicationTarget(described)
            ? ITEM_TYPES.APP
            : (described.isDirectory ? ITEM_TYPES.FOLDER : ITEM_TYPES.FILE)
        }
        patch.openWith = openWith
      }

      if (appearance.iconSource === 'custom') {
        if (iconDraft) {
          const result = await window.services.importCustomIconData(iconDraft)
          if (!result?.ok || !result.ref) {
            setError(result?.error || '图标保存失败')
            return
          }
          importedRef = result.ref
          patch.customIconRef = result.ref
          cacheCustomIcon(result.ref, iconDraft)
        } else {
          patch.customIconRef = item.customIconRef || null
        }
      } else {
        patch.customIconRef = null
      }

      if (!onSave?.(patch)) {
        setError('保存失败，请重试')
        return
      }
      success = true
      onClose()
    } catch {
      setError('保存失败，请重试')
    } finally {
      if (!success && importedRef) {
        cacheCustomIcon(importedRef, null)
        window.services?.deleteCustomIcon?.(importedRef)
      }
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="xs"
        slotProps={{
          paper: {
            sx: {
              width: 620,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100vh - 32px)',
              m: 2,
              borderRadius: '18px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }
          }
        }}
      >
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
          <DialogTitle sx={{ px: 2.8, pt: 2.2, pb: 1.8, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.6 }}>
              <ItemIconView
                item={{ ...item, ...appearance }}
                size={42}
                nativeSrc={nativeSrc}
                customIconSrc={previewIconSrc}
              />
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: 700, lineHeight: 1.3 }}>
                编辑{typeName}
              </Typography>
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
              pt: '18px !important',
              pb: 1.4,
              overflowY: 'auto',
              minHeight: 0,
              ...scrollFadeSx(contentFade)
            }}
          >
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="显示名称"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError('')
              }}
              sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />

            {item?.type === ITEM_TYPES.URL && (
              <>
                <TextField
                  fullWidth
                  size="small"
                  label="网址"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    setError('')
                  }}
                  sx={{ mt: 1.6, '& .MuiInputBase-root': { minHeight: 44 } }}
                  slotProps={{ htmlInput: { maxLength: 2048 } }}
                />
                <BrowserModeSelect
                  value={browserMode}
                  onChange={setBrowserMode}
                  onReset={() => setBrowserMode('default')}
                  customAppPath={item.openWith}
                />
              </>
            )}

            {isPathItem && (
              <Box sx={{ mt: 1.6, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="路径"
                  value={path}
                  onChange={(event) => {
                    setPath(event.target.value)
                    setError('')
                  }}
                  sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
                  slotProps={{ htmlInput: { maxLength: 2048 } }}
                />
                <Button
                  variant="outlined"
                  onClick={handleBrowse}
                  disabled={saving}
                  sx={{ height: 44, flexShrink: 0, px: 1.6 }}
                >
                  {browseLabel(item.type)}
                </Button>
              </Box>
            )}

            {isPathItem && (
              <Box sx={{ mt: 1.6, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <Typography
                    component="span"
                    sx={{
                      position: 'absolute',
                      top: -8,
                      left: 10,
                      px: 0.6,
                      bgcolor: 'background.paper',
                      fontSize: 10.5,
                      lineHeight: 1.2,
                      color: 'text.secondary',
                      zIndex: 1,
                      pointerEvents: 'none'
                    }}
                  >
                    打开方式
                  </Typography>
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-label="选择打开方式"
                    aria-haspopup="dialog"
                    onClick={() => {
                      if (!saving) setOpenWithPickerOpen(true)
                    }}
                    onKeyDown={(event) => {
                      if (saving) return
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      setOpenWithPickerOpen(true)
                    }}
                    sx={{
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.6,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: '10px',
                      cursor: saving ? 'default' : 'pointer',
                      userSelect: 'none',
                      '&:hover': {
                        borderColor: saving ? 'divider' : 'text.secondary'
                      },
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: 1
                      }
                    }}
                  >
                    <AppsRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
                    <Typography
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {openWithName || '默认应用'}
                    </Typography>
                    <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </Box>
                </Box>
                <Button
                  variant="outlined"
                  onClick={() => setOpenWith('')}
                  disabled={saving || !openWith}
                  sx={{
                    height: 44,
                    flexShrink: 0,
                    px: 1.8,
                    color: 'text.secondary',
                    borderColor: 'divider',
                    '&:hover': { borderColor: 'text.secondary' },
                    '&.Mui-disabled': { borderColor: 'divider', color: 'text.disabled' }
                  }}
                >
                  重置
                </Button>
              </Box>
            )}

            {item && (
              <ItemAppearancePicker
                pageUrl={url}
                itemType={item.type}
                icon={appearance.icon}
                color={appearance.color}
                customIconRadius={appearance.customIconRadius}
                iconSource={appearance.iconSource}
                customIconRef={item.customIconRef}
                draftSrc={iconDraft}
                nativeSrc={nativeSrc}
                onChange={(next) => setAppearance((previous) => ({ ...previous, ...next }))}
                onDraft={setIconDraft}
              />
            )}

            {error && (
              <Typography sx={{ mt: 1.2, fontSize: 11, color: 'error.main' }}>
                {error}
              </Typography>
            )}
          </DialogContent>
          <DialogActions
            sx={{
              px: 2.8,
              py: 1.8,
              borderTop: '1px solid',
              borderColor: 'divider',
              flexShrink: 0
            }}
          >
            {item && (
              <Button
                color="error"
                size="small"
                startIcon={<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                删除{typeName}
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            <Button onClick={onClose} disabled={saving} sx={{ color: 'text.secondary' }}>
              取消
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving}
              startIcon={saving
                ? <CircularProgress size={14} color="inherit" />
                : <SaveRoundedIcon sx={{ fontSize: 17 }} />}
              sx={{ minWidth: 92 }}
            >
              保存修改
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: '16px',
              maxWidth: 390
            }
          }
        }}
      >
        <DialogTitle sx={{ fontSize: 15.5, fontWeight: 700, pb: 0.8 }}>
          删除{typeName}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 12.5, lineHeight: 1.7, color: 'text.secondary' }}>
            确定删除「{item?.name}」？此操作只会移除分组内的条目。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.2, pb: 1.8 }}>
          <Button onClick={() => setConfirmDelete(false)} sx={{ color: 'text.secondary' }}>
            取消
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {pickerPresence.mounted && (
        <AddSoftwareDialog
          open={pickerPresence.open}
          mode="edit"
          title="修改软件"
          onClose={() => setSoftwarePickerOpen(false)}
          onChoose={(selectedPath, app) => {
            if (selectedPath) {
              setPath(selectedPath)
              setError('')
              if (app?.name && name.trim() === (item?.name || '').trim()) {
                setName(app.name)
              }
            }
            setSoftwarePickerOpen(false)
          }}
        />
      )}

      {openWithPickerPresence.mounted && (
        <AddSoftwareDialog
          open={openWithPickerPresence.open}
          mode="choose"
          title={`选择打开「${item?.name || typeName}」的应用`}
          onClose={() => setOpenWithPickerOpen(false)}
          onChoose={(selectedPath) => {
            setOpenWith(selectedPath || '')
            setOpenWithPickerOpen(false)
          }}
        />
      )}
    </>
  )
}
