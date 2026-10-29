import React, { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import { DEFAULT_COLOR, DEFAULT_ICON_RADIUS, DEFAULT_ITEM_ICON, ITEM_TYPES, normalizeUrl } from '../data'
import { cacheCustomIcon } from '../icons'
import ItemAppearancePicker from './ItemAppearancePicker'
import ItemIconView from './ItemIconView'
import BrowserModeSelect from './BrowserModeSelect'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'

const paperSx = {
  width: 620,
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100vh - 32px)',
  m: 2,
  borderRadius: '18px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
}

function DialogHeader ({ title }) {
  return (
    <DialogTitle sx={{ px: 2.2, pt: 1.8, pb: 1.1 }}>
      <Typography sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </Typography>
    </DialogTitle>
  )
}

export function AddUrlDialog ({ open, onClose, onSubmit }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [browserMode, setBrowserMode] = useState('default')
  const [iconDraft, setIconDraft] = useState(null)
  const [appearance, setAppearance] = useState({
    icon: DEFAULT_ITEM_ICON,
    color: DEFAULT_COLOR,
    iconSource: 'builtin',
    customIconRadius: DEFAULT_ICON_RADIUS,
    iconRadius: DEFAULT_ICON_RADIUS
  })
  const [saving, setSaving] = useState(false)
  const contentRef = useRef(null)
  const contentFade = useScrollFade(contentRef)

  useEffect(() => {
    if (!open) return
    setName('')
    setUrl('')
    setError('')
    setBrowserMode('default')
    setIconDraft(null)
    setAppearance({
      icon: DEFAULT_ITEM_ICON,
      color: DEFAULT_COLOR,
      iconSource: 'builtin',
      customIconRadius: DEFAULT_ICON_RADIUS,
      iconRadius: DEFAULT_ICON_RADIUS
    })
    setSaving(false)
  }, [open])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const normalized = normalizeUrl(url)
    if (!normalized) {
      setError('请输入有效的 http:// 或 https:// 网址')
      return
    }
    setError('')
    setSaving(true)
    let importedRef = null
    try {
      let customIconRef = null
      if (iconDraft) {
        const result = await window.services?.importCustomIconData?.(iconDraft)
        if (!result?.ok || !result.ref) {
          setError(result?.error || '图标保存失败')
          return
        }
        importedRef = result.ref
        customIconRef = result.ref
        cacheCustomIcon(result.ref, iconDraft)
      }

      const saved = onSubmit({
        name,
        url: normalized,
        customIconRef,
        browserMode,
        icon: appearance.icon,
        color: appearance.color,
        iconSource: appearance.iconSource,
        customIconRadius: appearance.customIconRadius,
        iconRadius: appearance.iconRadius
      })
      if (!saved) {
        if (importedRef) {
          cacheCustomIcon(importedRef, null)
          window.services?.deleteCustomIcon?.(importedRef)
        }
        return
      }
      onClose()
    } catch {
      if (importedRef) {
        cacheCustomIcon(importedRef, null)
        window.services?.deleteCustomIcon?.(importedRef)
      }
      setError('添加失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      slotProps={{ paper: { sx: paperSx } }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <DialogTitle sx={{ px: 2.8, pt: 2.2, pb: 1.8, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.6 }}>
            <ItemIconView
              item={{ type: ITEM_TYPES.URL, ...appearance }}
              size={42}
              customIconSrc={appearance.iconSource === 'custom' ? iconDraft : null}
            />
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: 700, lineHeight: 1.3 }}>
              添加网址
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
            pb: 1,
            overflowY: 'auto',
            minHeight: 0,
            ...scrollFadeSx(contentFade)
          }}
        >
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="网址"
            placeholder="https://example.com"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setError('')
            }}
            error={Boolean(error)}
            helperText={error || undefined}
          />
          <TextField
            fullWidth
            size="small"
            label="显示名称"
            placeholder="默认使用域名"
            value={name}
            onChange={(event) => setName(event.target.value)}
            sx={{ mt: 1.2 }}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <BrowserModeSelect value={browserMode} onChange={setBrowserMode} />
          <ItemAppearancePicker
            pageUrl={url}
            itemType={ITEM_TYPES.URL}
            icon={appearance.icon}
            color={appearance.color}
            customIconRadius={appearance.customIconRadius}
            iconRadius={appearance.iconRadius}
            iconSource={appearance.iconSource}
            draftSrc={iconDraft}
            onChange={(patch) => setAppearance((previous) => ({ ...previous, ...patch }))}
            onDraft={setIconDraft}
          />
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
          <Button onClick={onClose} disabled={saving} sx={{ color: 'text.secondary' }}>
            取消
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
          >
            添加
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

export function AddPluginDialog ({ open, onClose, onSubmit, mode = 'add', initialItem = null }) {
  const editing = mode === 'edit'
  const [plugins, setPlugins] = useState([])
  const [loading, setLoading] = useState(false)
  const [scanError, setScanError] = useState('')
  const [selectedPlugin, setSelectedPlugin] = useState(null)
  const [pluginInput, setPluginInput] = useState('')
  const [command, setCommand] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const contentRef = useRef(null)
  const contentFade = useScrollFade(contentRef)

  const loadPlugins = async (force = false) => {
    setLoading(true)
    setScanError('')
    try {
      const result = await window.services.listUtoolsPlugins(force)
      setPlugins(Array.isArray(result?.plugins) ? result.plugins : [])
      if (!result?.ok) setScanError(result?.error || '无法读取已安装的插件')
    } catch {
      setPlugins([])
      setScanError('无法读取已安装的插件')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setSelectedPlugin(null)
    setPluginInput(initialItem?.path || '')
    setCommand(initialItem?.command || initialItem?.path || '')
    setName(initialItem?.name || '')
    setError('')
    loadPlugins(false)
  }, [open, initialItem, mode])

  useEffect(() => {
    if (!open || !editing || !initialItem || !plugins.length) return
    const target = String(initialItem.path || '').toLocaleLowerCase()
    if (!target || pluginInput.toLocaleLowerCase() !== target) return
    const match = plugins.find((plugin) => (
      plugin.pluginName.toLocaleLowerCase() === target
    ))
    if (!match) return
    setSelectedPlugin(match)
    setPluginInput(match.pluginName)
    setCommand(initialItem.command || match.commands?.[0] || match.pluginName)
  }, [open, editing, initialItem, plugins, pluginInput])

  const commands = selectedPlugin?.commands || []

  const handlePluginChange = (_event, value) => {
    setError('')
    if (!value) {
      setSelectedPlugin(null)
      setPluginInput('')
      setCommand('')
      return
    }
    if (typeof value === 'string') {
      setSelectedPlugin(null)
      setPluginInput(value)
      setCommand(value)
      return
    }
    setSelectedPlugin(value)
    setPluginInput(value.pluginName)
    setCommand(value.commands?.[0] || value.pluginName)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const pluginName = (selectedPlugin?.pluginName || pluginInput).trim()
    if (!pluginName) {
      setError('请选择插件，或输入 uTools 指令名称')
      return
    }
    const unchangedPath = editing &&
      pluginName === String(initialItem?.path || '').trim()
    const commandValue = selectedPlugin
      ? (command.trim() || selectedPlugin.pluginName)
      : (unchangedPath ? (command.trim() || pluginName) : pluginName)
    const saved = onSubmit({
      pluginName,
      command: commandValue,
      name: name.trim()
    })
    if (saved) onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            width: 460,
            maxWidth: 'calc(100vw - 32px)',
            borderRadius: '18px'
          }
        }
      }}
    >
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DialogHeader title={editing ? '编辑 uTools 插件' : '添加 uTools 插件'} />
        <DialogContent
          ref={contentRef}
          className="scroll-fade"
          sx={{ px: 2.4, pt: '18px !important', pb: 1.6, ...scrollFadeSx(contentFade) }}
        >
          <Autocomplete
            freeSolo
            options={plugins}
            loading={loading}
            noOptionsText={loading ? '正在识别已安装插件…' : '未识别到插件，可直接输入指令名称'}
            value={selectedPlugin}
            inputValue={pluginInput}
            onChange={handlePluginChange}
            onInputChange={(_event, value) => {
              setPluginInput(value)
              if (selectedPlugin && value !== selectedPlugin.pluginName) {
                setSelectedPlugin(null)
              }
              setError('')
            }}
            getOptionLabel={(option) => (
              typeof option === 'string' ? option : (option?.pluginName || '')
            )}
            isOptionEqualToValue={(option, value) => (
              option.pluginName === value?.pluginName
            )}
            renderOption={(props, option) => {
              const { key, ...other } = props
              return (
                <Box component="li" key={key} {...other} sx={{ display: 'flex', alignItems: 'center', gap: 1.1 }}>
                  {option.logo
                    ? (
                      <Box
                        component="img"
                        src={option.logo}
                        alt=""
                        sx={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }}
                      />
                      )
                    : <ExtensionRoundedIcon sx={{ fontSize: 22, color: 'text.secondary', flexShrink: 0 }} />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 11.8, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {option.pluginName}
                    </Typography>
                    <Typography sx={{ fontSize: 9.8, color: 'text.secondary', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {option.version ? `v${option.version}` : ''}
                      {option.description ? `${option.version ? ' · ' : ''}${option.description}` : ''}
                    </Typography>
                  </Box>
                </Box>
              )
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                autoFocus
                label="uTools 插件 / 指令"
                placeholder="选择插件，或直接输入指令名称"
                error={Boolean(error)}
                helperText={error || undefined}
                slotProps={{
                  ...params.slotProps,
                  htmlInput: { ...params.slotProps?.htmlInput, maxLength: 60 }
                }}
              />
            )}
          />

          <Box sx={{ mt: 0.7, minHeight: 24, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ flex: 1, fontSize: 10.5, lineHeight: 1.4, color: 'text.secondary' }}>
              {loading
                ? '正在识别已安装的插件…'
                : scanError
                  ? scanError
                  : plugins.length
                    ? `已识别 ${plugins.length} 个插件，也可直接输入指令名称`
                    : '未识别到插件，可直接输入 uTools 指令名称'}
            </Typography>
            <Tooltip title="重新扫描已安装插件">
              <span>
                <IconButton
                  size="small"
                  onClick={() => loadPlugins(true)}
                  disabled={loading}
                  aria-label="重新扫描已安装插件"
                  sx={{ p: 0.4 }}
                >
                  {loading
                    ? <CircularProgress size={13} />
                    : <RefreshRoundedIcon sx={{ fontSize: 15 }} />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          {selectedPlugin && (
            <Autocomplete
              freeSolo
              autoHighlight
              options={commands}
              value={command}
              inputValue={command}
              onChange={(_event, value) => setCommand(value || '')}
              onInputChange={(_event, value) => setCommand(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="指令"
                  placeholder="默认使用插件名称"
                  sx={{ mt: 1.9 }}
                  slotProps={{
                    ...params.slotProps,
                    htmlInput: { ...params.slotProps?.htmlInput, maxLength: 80 }
                  }}
                />
              )}
            />
          )}

          <TextField
            fullWidth
            size="small"
            label="显示名称"
            placeholder="默认使用插件名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            sx={{ mt: 1.6 }}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.2, pb: 1.8 }}>
          <Button onClick={onClose} sx={{ color: 'text.secondary' }}>
            取消
          </Button>
          <Button type="submit" variant="contained">
            {editing ? '保存修改' : '添加'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
