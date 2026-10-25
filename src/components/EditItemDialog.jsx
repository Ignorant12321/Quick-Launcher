import React, { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import AddSoftwareDialog from './AddSoftwareDialog'
import { isApplicationTarget, normalizeUrl, ITEM_TYPES } from '../data'
import { usePresence } from '../usePresence'

function browseLabel (type) {
  if (type === ITEM_TYPES.APP) return '选择软件…'
  if (type === ITEM_TYPES.FOLDER) return '选择文件夹…'
  return '选择文件…'
}

export default function EditItemDialog ({ open, item, onClose, onSave }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [softwarePickerOpen, setSoftwarePickerOpen] = useState(false)
  const pickerPresence = usePresence(softwarePickerOpen)

  const isPathItem = Boolean(item && [
    ITEM_TYPES.FILE,
    ITEM_TYPES.FOLDER,
    ITEM_TYPES.APP
  ].includes(item.type))

  useEffect(() => {
    if (!open || !item) return
    setName(item.name || '')
    setUrl(item.type === ITEM_TYPES.URL ? item.path : '')
    setPath(item.path || '')
    setError('')
    setSaving(false)
    setSoftwarePickerOpen(false)
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

    const patch = { name: nextName }

    if (item.type === ITEM_TYPES.URL) {
      const normalized = normalizeUrl(url)
      if (!normalized) {
        setError('请输入有效的网址')
        return
      }
      patch.path = normalized
    } else if (isPathItem) {
      const nextPath = path.trim()
      if (!nextPath) {
        setError('请输入路径')
        return
      }
      setSaving(true)
      try {
        const [described] = await window.services.describePaths([nextPath]) || []
        if (!described || described.error) {
          setError('路径不存在或无法访问')
          return
        }
        if (item.type === ITEM_TYPES.APP && described.isDirectory && !isApplicationTarget(described)) {
          setError('软件路径不能是文件夹')
          return
        }
        patch.path = described.path
        if (item.type === ITEM_TYPES.FILE || item.type === ITEM_TYPES.FOLDER) {
          patch.type = isApplicationTarget(described)
            ? ITEM_TYPES.APP
            : (described.isDirectory ? ITEM_TYPES.FOLDER : ITEM_TYPES.FILE)
        }
      } catch {
        setError('路径不存在或无法访问')
        return
      } finally {
        setSaving(false)
      }
    }

    if (onSave?.(patch)) onClose()
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
              width: 480,
              maxWidth: 'calc(100vw - 32px)',
              borderRadius: '18px'
            }
          }
        }}
      >
        <Box component="form" onSubmit={handleSubmit}>
          <DialogTitle sx={{ px: 2.4, pt: 2, pb: 1, fontSize: 15.5, fontWeight: 700 }}>
            编辑条目
          </DialogTitle>
          <DialogContent sx={{ px: 2.4, pt: '12px !important', pb: 1.4 }}>
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

            {error && (
              <Typography sx={{ mt: 1.2, fontSize: 11, color: 'error.main' }}>
                {error}
              </Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 2.4, pb: 1.8 }}>
            <Button onClick={onClose} disabled={saving} sx={{ color: 'text.secondary' }}>
              取消
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
            >
              保存修改
            </Button>
          </DialogActions>
        </Box>
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
    </>
  )
}
