import React, { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import AppsRoundedIcon from '@mui/icons-material/AppsRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'

const appIconCache = new Map()

export default function AddSoftwareDialog ({
  open,
  onClose,
  onAdd,
  onChoose,
  mode = 'add',
  title = '添加软件'
}) {
  const choosing = mode === 'choose'
  const singleSelect = choosing || mode === 'edit'
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [icons, setIcons] = useState({})
  const [busy, setBusy] = useState(false)
  const iconRequest = useRef(0)

  const loadApps = async (force = false) => {
    setLoading(true)
    setError('')
    try {
      const result = await window.services.listInstalledApps(force)
      setApps(Array.isArray(result?.apps) ? result.apps : [])
      if (!result?.ok) setError(result?.error || '无法扫描已安装软件')
    } catch {
      setApps([])
      setError('无法扫描已安装软件')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(new Set())
    setIcons({})
    setBusy(false)
    loadApps(false)
  }, [open])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    if (!keyword) return apps
    return apps.filter((app) => (
      app.name.toLocaleLowerCase().includes(keyword) ||
      app.path.toLocaleLowerCase().includes(keyword)
    ))
  }, [apps, query])

  useEffect(() => {
    if (!open || !filtered.length) return
    const request = iconRequest.current + 1
    iconRequest.current = request

    const missing = []
    const nextIcons = {}
    filtered.slice(0, 90).forEach((app) => {
      if (appIconCache.has(app.path)) nextIcons[app.path] = appIconCache.get(app.path)
      else missing.push(app.path)
    })
    setIcons((previous) => ({ ...previous, ...nextIcons }))

    if (!missing.length || !window.services?.getFileIcons) return

    window.services.getFileIcons(missing)
      .then((result) => {
        if (iconRequest.current !== request) return
        Object.entries(result || {}).forEach(([appPath, icon]) => {
          if (icon) appIconCache.set(appPath, icon)
        })
        setIcons((previous) => ({ ...previous, ...result }))
      })
      .catch(() => {})
  }, [open, filtered])

  const toggleApp = (app) => {
    if (singleSelect) {
      onChoose?.(app.path, app)
      return
    }
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(app.path)) next.delete(app.path)
      else next.add(app.path)
      return next
    })
  }

  const handleAdd = async () => {
    if (!selected.size || busy) return
    setBusy(true)
    try {
      const saved = await onAdd([...selected])
      if (saved) onClose()
    } finally {
      setBusy(false)
    }
  }

  const handleBrowse = async () => {
    if (busy) return
    setBusy(true)
    try {
      const paths = await window.services.pickSoftware()
      if (paths?.length) {
        if (singleSelect) {
          onChoose?.(paths[0])
          return
        }
        const saved = await onAdd(paths)
        if (saved) onClose()
      }
    } catch {
      setError('无法打开程序选择器')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            width: 480,
            maxWidth: 'calc(100vw - 32px)',
            borderRadius: '18px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }
        }
      }}
    >
      <DialogTitle sx={{ px: 2.2, pt: 1.8, pb: 1, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.2 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'action.hover',
              color: 'primary.main',
              flexShrink: 0
            }}
          >
            <AppsRoundedIcon sx={{ fontSize: 21 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>
              {title}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="关闭" disabled={busy}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 2.2, pt: '2px !important', pb: 0.5, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder={singleSelect ? '搜索要选择的软件' : '搜索软件'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: query
                ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQuery('')} aria-label="清除搜索" sx={{ p: 0.25 }}>
                      <CloseRoundedIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </InputAdornment>
                  )
                : null
            }
          }}
        />

        <Box sx={{ mt: 0.9, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.8, minHeight: 24 }}>
          <Typography sx={{ flex: 1, fontSize: 10.5, color: 'text.secondary' }}>
            {loading
              ? '正在扫描…'
              : error
                ? error
                : filtered.length !== apps.length
                  ? `${filtered.length} 个匹配`
                  : `${apps.length} 个软件`}
          </Typography>
          <Tooltip title="重新扫描">
            <span>
              <IconButton
                size="small"
                onClick={() => loadApps(true)}
                disabled={loading}
                aria-label="重新扫描已安装软件"
              >
                {loading
                  ? <CircularProgress size={14} />
                  : <RefreshRoundedIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <Box
          sx={{
            flex: 1,
            minHeight: 180,
            maxHeight: 300,
            overflowY: 'auto',
            pr: 0.35,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '11px',
            p: 0.55,
            bgcolor: 'action.hover'
          }}
        >
          {!loading && filtered.length === 0 && (
            <Box sx={{ py: 5, px: 2, textAlign: 'center' }}>
              <AppsRoundedIcon sx={{ fontSize: 28, opacity: 0.32 }} />
              <Typography sx={{ mt: 1, fontSize: 11.5, color: 'text.secondary' }}>
                {apps.length ? '没有匹配的软件' : '未找到软件，可浏览本机程序'}
              </Typography>
            </Box>
          )}

          {filtered.map((app) => {
            const isSelected = !singleSelect && selected.has(app.path)
            const icon = icons[app.path]
            return (
              <Box
                key={app.path}
                component="button"
                type="button"
                title={app.path}
                onClick={() => toggleApp(app)}
                sx={{
                  width: '100%',
                  border: '1px solid',
                  borderColor: isSelected ? 'primary.main' : 'transparent',
                  borderRadius: '9px',
                  p: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.1,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  color: 'text.primary',
                  bgcolor: isSelected ? 'action.selected' : 'transparent',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -1 }
                }}
              >
                <Box sx={{ width: 27, height: 27, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {icon
                    ? <Box component="img" src={icon} alt="" sx={{ width: 25, height: 25, objectFit: 'contain', display: 'block' }} />
                    : <AppsRoundedIcon sx={{ fontSize: 22, color: 'text.secondary', opacity: 0.7 }} />}
                </Box>
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 550, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {app.name}
                </Typography>
                {isSelected && <CheckRoundedIcon sx={{ fontSize: 17, color: 'primary.main', flexShrink: 0 }} />}
              </Box>
            )
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.2, py: 1.4 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<FolderOpenRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={handleBrowse}
          disabled={busy}
          sx={{ mr: 'auto' }}
        >
          {singleSelect ? '选择其他程序…' : '浏览程序…'}
        </Button>
        <Button onClick={onClose} disabled={busy} sx={{ color: 'text.secondary' }}>
          {singleSelect ? '关闭' : '取消'}
        </Button>
        {!singleSelect && (
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={!selected.size || busy}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <AddRoundedIcon sx={{ fontSize: 17 }} />}
            sx={{ minWidth: 96 }}
          >
            {selected.size ? `添加 ${selected.size} 个` : '添加'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
