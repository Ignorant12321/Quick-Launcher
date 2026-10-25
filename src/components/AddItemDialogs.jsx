import React, { useEffect, useState } from 'react'
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
import { normalizeUrl } from '../data'

const paperSx = {
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
  borderRadius: '18px'
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

  useEffect(() => {
    if (!open) return
    setName('')
    setUrl('')
    setError('')
  }, [open])

  const handleSubmit = (event) => {
    event.preventDefault()
    const normalized = normalizeUrl(url)
    if (!normalized) {
      setError('请输入有效的 http:// 或 https:// 网址')
      return
    }
    const saved = onSubmit({ name, url: normalized })
    if (saved) onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      slotProps={{ paper: { sx: paperSx } }}
    >
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DialogHeader title="添加网址" />
        <DialogContent sx={{ px: 2.2, pt: '2px !important', pb: 1 }}>
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
        </DialogContent>
        <DialogActions sx={{ px: 2.2, pb: 1.8 }}>
          <Button onClick={onClose} sx={{ color: 'text.secondary' }}>
            取消
          </Button>
          <Button type="submit" variant="contained">
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
        <DialogContent sx={{ px: 2.4, pt: '18px !important', pb: 1.6 }}>
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
