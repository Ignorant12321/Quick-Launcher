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
import Tooltip from '@mui/material/Tooltip'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import Stack from '@mui/material/Stack'
import Slider from '@mui/material/Slider'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import ColorizeRoundedIcon from '@mui/icons-material/ColorizeRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import { GROUP_ICONS, GroupAvatarFace, GroupGlyph, useCustomIcon, cacheCustomIcon } from '../icons'
import IconCropDialog from './IconCropDialog'
import { usePresence, useRetainedValue } from '../usePresence'
import {
  DEFAULT_COLOR,
  DEFAULT_ICON,
  GROUP_COLORS,
  MAX_ALIASES,
  MAX_ICON_RADIUS,
  MAX_KEYWORD_LENGTH,
  getReadableColor,
  validateGroupKeywords,
  validateKeyword
} from '../data'

function makeForm (group) {
  const quickLaunch = Boolean(group?.quickLaunch)
  return {
    name: group?.name || '',
    aliases: [...(group?.aliases || [])],
    icon: group?.icon || DEFAULT_ICON,
    color: group?.color || DEFAULT_COLOR,
    keywordMatch: Boolean(group?.keywordMatch),
    quickLaunch,
    utoolsSearch: !quickLaunch && Boolean(group?.utoolsSearch),
    customIconRadius: Number(group?.customIconRadius) || 0
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
  const [removeCustomIcon, setRemoveCustomIcon] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const cropPresence = usePresence(Boolean(cropSource))
  const retainedCropSource = useRetainedValue(cropSource)

  const existingIconSrc = useCustomIcon(group?.customIconRef)
  const isNew = !group || !groups.some((item) => item.id === group.id)
  const previewSrc = draftImage
    ? draftImage.dataUrl
    : (!removeCustomIcon ? existingIconSrc : null)
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
    setRemoveCustomIcon(false)
    setImageBusy(false)
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

  const pickCustomIcon = async () => {
    setImageBusy(true)
    setFormError('')
    try {
      const result = await window.services.selectCustomIcon()
      if (!result) return
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setCropSource(result.dataUrl)
    } catch {
      setFormError('无法读取图片，请重试')
    } finally {
      setImageBusy(false)
    }
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
    const quickLaunch = form.keywordMatch && form.quickLaunch
    const utoolsSearch = form.keywordMatch && !quickLaunch && form.utoolsSearch
    const candidate = {
      ...group,
      name,
      aliases,
      icon: form.icon,
      color: form.color,
      keywordMatch: form.keywordMatch,
      quickLaunch,
      utoolsSearch,
      customIconRef: group?.customIconRef || null,
      customIconRadius: form.customIconRadius
    }

    const keywordError = validateGroupKeywords(groups, candidate)
    if (keywordError) {
      setFormError(keywordError)
      return
    }

    savingRef.current = true
    setSaving(true)
    let importedRef = null

    try {
      let customIconRef = removeCustomIcon ? null : (group?.customIconRef || null)

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

      const saved = onSave({ ...candidate, customIconRef })
      if (!saved) {
        if (importedRef) {
          cacheCustomIcon(importedRef, null)
          window.services.deleteCustomIcon?.(importedRef)
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
    } catch {
      if (importedRef) {
        cacheCustomIcon(importedRef, null)
        window.services.deleteCustomIcon?.(importedRef)
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
        if (cropSource) return
        if (!saving && reason !== 'backdropClick') onClose()
      }}
      fullWidth
      maxWidth={false}
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

      <DialogContent sx={{ px: 2.8, pt: '22px !important', pb: 2.2, overflowY: 'auto' }}>
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4, flexWrap: 'wrap' }}>
          <Box
            sx={{
              flex: 1,
              minWidth: 250,
              display: 'flex',
              alignItems: 'center',
              gap: 1.1,
              flexWrap: 'wrap'
            }}
          >
            {GROUP_COLORS.map((color) => {
              const selected = form.color.toLocaleLowerCase() === color.toLocaleLowerCase()
              return (
                <Tooltip key={color} title={color.toUpperCase()}>
                  <Box
                    component="button"
                    type="button"
                    aria-label={`颜色 ${color}`}
                    onClick={() => updateForm({ color })}
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      border: '2px solid',
                      borderColor: selected ? 'text.primary' : 'transparent',
                      bgcolor: color,
                      cursor: 'pointer',
                      p: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.24)',
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: 2
                      }
                    }}
                  >
                    {selected && <CheckRoundedIcon sx={{ fontSize: 16, color: '#fff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.28))' }} />}
                  </Box>
                </Tooltip>
              )
            })}

            <Tooltip title="自定义颜色">
              <Box
                component="label"
                sx={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'conic-gradient(#e05252, #d4a72c, #46a35e, #2f9e9e, #1276C5, #8b5cf6, #e05252)',
                  border: '2px solid transparent',
                  '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 }
                }}
              >
                <ColorizeRoundedIcon sx={{ fontSize: 14, color: '#fff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }} />
                <Box
                  component="input"
                  type="color"
                  aria-label="自定义颜色"
                  value={form.color}
                  onChange={(event) => updateForm({ color: event.target.value })}
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    width: '100%',
                    height: '100%',
                    p: 0,
                    border: 0
                  }}
                />
              </Box>
            </Tooltip>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, ml: 'auto', flexShrink: 0 }}>
            <Button
              size="small"
              variant="outlined"
              title="PNG / JPG / WebP / SVG，最大 2 MB"
              startIcon={imageBusy ? <CircularProgress size={14} /> : <ImageRoundedIcon sx={{ fontSize: 16 }} />}
              onClick={pickCustomIcon}
              disabled={imageBusy}
              sx={{ py: 0.75, px: 1.4 }}
            >
              {hasCustomIcon ? '更换图标' : '自定义图标'}
            </Button>
            {hasCustomIcon && (
              <Button
                size="small"
                onClick={() => {
                  setDraftImage(null)
                  setRemoveCustomIcon(true)
                }}
                sx={{ color: 'text.secondary', px: 1 }}
              >
                使用内置图标
              </Button>
            )}
          </Box>
        </Box>

        {hasCustomIcon && (
          <Box sx={{ mt: 1.6, display: 'flex', alignItems: 'center', gap: 1.4 }}>
            <Typography sx={{ width: 56, flexShrink: 0, fontSize: 10.5, color: 'text.secondary' }}>
              图标圆角
            </Typography>
            <Slider
              size="small"
              min={0}
              max={MAX_ICON_RADIUS}
              step={1}
              value={form.customIconRadius}
              onChange={(_event, value) => updateForm({ customIconRadius: value })}
              aria-label="图标圆角"
              sx={{ flex: 1, py: 0.5 }}
            />
            <Typography
              sx={{
                width: 38,
                flexShrink: 0,
                fontSize: 10.5,
                color: 'text.secondary',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {form.customIconRadius === 0 ? '无' : `${form.customIconRadius}%`}
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            mt: 1.8,
            display: 'grid',
            gridAutoFlow: 'column',
            gridTemplateRows: 'repeat(3, 38px)',
            gridAutoColumns: '38px',
            gap: 0.8,
            overflowX: 'auto',
            overflowY: 'hidden',
            pb: 0.8,
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { height: 5 },
            '&::-webkit-scrollbar-thumb': {
              borderRadius: '999px',
              bgcolor: 'action.disabled'
            }
          }}
        >
          {GROUP_ICONS.map(({ key, label }) => {
            const selected = !hasCustomIcon && form.icon === key
            return (
              <Tooltip key={key} title={label}>
                <IconButton
                  onClick={() => selectBuiltInIcon(key)}
                  aria-label={label}
                  sx={{
                    width: 38,
                    height: 38,
                    flexShrink: 0,
                    borderRadius: '10px',
                    color: (theme) => getReadableColor(form.color, theme.palette.mode),
                    opacity: selected ? 1 : 0.72,
                    bgcolor: selected
                      ? (theme) => (
                          theme.palette.mode === 'dark'
                            ? `color-mix(in srgb, ${form.color} 20%, transparent)`
                            : `${form.color}18`
                        )
                      : 'transparent',
                    border: '1px solid',
                    borderColor: selected ? `${form.color}38` : 'transparent',
                    '&:hover': { bgcolor: `${form.color}14`, opacity: 1 }
                  }}
                >
                  <GroupGlyph iconKey={key} size={21} />
                </IconButton>
              </Tooltip>
            )
          })}
        </Box>

        <Typography sx={{ mt: 3.2, mb: 1.5, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary' }}>
          启动设置
        </Typography>

        <Stack spacing={1.4}>
          <SettingRow
            icon={KeyboardRoundedIcon}
            title="关键词匹配"
            description="输入分组名或别名即可在 uTools 中打开"
            checked={form.keywordMatch}
            onChange={(event) => {
              const checked = event.target.checked
              const quickLaunch = checked ? form.quickLaunch : false
              updateForm({
                keywordMatch: checked,
                quickLaunch,
                utoolsSearch: checked ? !quickLaunch : false
              })
            }}
            ariaLabel="关键词匹配"
          />
          <SettingRow
            icon={SearchRoundedIcon}
            title="在 uTools 搜索中显示网址、文件夹等项目"
            description="开启后，输入关键词即可列出分组里的项目"
            checked={form.utoolsSearch}
            disabled={!form.keywordMatch}
            onChange={(event) => updateForm({
              utoolsSearch: event.target.checked,
              quickLaunch: event.target.checked ? false : form.quickLaunch
            })}
            ariaLabel="在 uTools 搜索中显示网址、文件夹等项目"
          />
          <SettingRow
            icon={RocketLaunchRoundedIcon}
            title="一键启动"
            description="不打开分区搜索，一键打开分区内的所有内容"
            checked={form.quickLaunch}
            disabled={!form.keywordMatch}
            onChange={(event) => updateForm({
              quickLaunch: event.target.checked,
              utoolsSearch: !event.target.checked
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

      {cropPresence.mounted && retainedCropSource && (
        <IconCropDialog
          open={cropPresence.open}
          source={retainedCropSource}
          onCancel={() => setCropSource(null)}
          onConfirm={(dataUrl) => {
            setDraftImage({ dataUrl })
            setRemoveCustomIcon(false)
            setCropSource(null)
          }}
        />
      )}
    </Dialog>
  )
}
