import React, { useState } from 'react'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import WallpaperRoundedIcon from '@mui/icons-material/WallpaperRounded'
import { DEFAULT_ITEM_ICON, ITEM_DEFAULT_ICONS, ITEM_TYPES, normalizeUrl } from '../data'
import { rasterizeIconDataUrl, useCustomIcon } from '../icons'
import IconAppearanceEditor from './IconAppearanceEditor'
import IconCropDialog from './IconCropDialog'

export default function ItemAppearancePicker ({
  pageUrl,
  itemType,
  icon,
  color,
  customIconRadius,
  iconRadius,
  iconSource,
  customIconRef,
  draftSrc,
  onChange,
  onDraft
}) {
  const existingSrc = useCustomIcon(iconSource === 'custom' ? customIconRef : null)
  const customSrc = iconSource === 'custom' ? (draftSrc || existingSrc) : null
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [cropSource, setCropSource] = useState('')
  const [cropOpen, setCropOpen] = useState(false)

  const applyImage = async (dataUrl) => {
    let next = dataUrl
    try {
      next = await rasterizeIconDataUrl(dataUrl) || dataUrl
    } catch {}
    onDraft?.(next)
    onChange?.({ iconSource: 'custom' })
    setError('')
  }

  const handleFetch = async () => {
    if (busy) return
    const normalized = normalizeUrl(pageUrl)
    if (!normalized) {
      setError('请先输入有效的网址')
      return
    }
    setBusy('fetch')
    setError('')
    try {
      const result = await window.services?.fetchSiteIcon?.(normalized)
      if (!result?.ok || !result.dataUrl) {
        setError(result?.error || '获取图标失败')
        return
      }
      await applyImage(result.dataUrl)
    } catch {
      setError('获取图标失败，请重试')
    } finally {
      setBusy('')
    }
  }

  const handleImport = () => {
    if (busy) return
    setError('')
    setCropSource(customSrc || '')
    setCropOpen(true)
  }

  // 「使用内置图标」= 回到该类型的默认内置图标（文件→文档、目录→文件夹、网址→地球…），
  // 原生图标仍是这些类型没动过设置时的默认来源
  const useBuiltin = () => {
    if (busy) return
    setError('')
    onDraft(null)
    onChange?.({
      iconSource: 'builtin',
      icon: ITEM_DEFAULT_ICONS[itemType] || DEFAULT_ITEM_ICON
    })
  }

  const useNative = () => {
    if (busy || iconSource === 'native') return
    setError('')
    onDraft(null)
    onChange?.({ iconSource: 'native' })
  }

  const isUrl = itemType === ITEM_TYPES.URL

  return (
    <>
      <Typography sx={{ mt: 3.2, mb: 1.5, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary' }}>
        外观设置
      </Typography>

      <IconAppearanceEditor
        icon={icon}
        color={color}
        customSrc={customSrc}
        customIconRadius={customIconRadius}
        iconRadius={iconRadius}
        builtinActive={iconSource === 'builtin'}
        onSelectIcon={(key) => {
          onChange?.({ icon: key, iconSource: 'builtin' })
          onDraft(null)
        }}
        onColorChange={(next) => onChange?.({ color: next })}
        onRadiusChange={(value) => onChange?.({ customIconRadius: value })}
        onIconRadiusChange={(value) => onChange?.({ iconRadius: value })}
        onImportIcon={handleImport}
        onUseBuiltinIcon={useBuiltin}
        importLabel={customSrc ? '更换图标' : '自定义图标'}
        extraActions={isUrl
          ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={busy === 'fetch'
                ? <CircularProgress size={14} color="inherit" />
                : <DownloadRoundedIcon sx={{ fontSize: 16 }} />}
              onClick={handleFetch}
              disabled={Boolean(busy)}
              sx={{ py: 0.6, px: 1.2 }}
            >
              在线获取
            </Button>
            )
          : (
            <Button
              size="small"
              variant="outlined"
              startIcon={<WallpaperRoundedIcon sx={{ fontSize: 16 }} />}
              onClick={useNative}
              disabled={Boolean(busy) || iconSource === 'native'}
              sx={{ py: 0.6, px: 1.2 }}
            >
              原生图标
            </Button>
            )}
      />

      {error && (
        <Typography sx={{ mt: 0.8, fontSize: 10.5, lineHeight: 1.4, color: 'error.main' }}>
          {error}
        </Typography>
      )}

      <IconCropDialog
        open={cropOpen}
        source={cropSource || ''}
        radius={customIconRadius}
        onRadiusChange={(value) => onChange?.({ customIconRadius: value })}
        onCancel={() => {
          setCropOpen(false)
          setCropSource('')
        }}
        onConfirm={(dataUrl) => {
          setCropOpen(false)
          setCropSource('')
          onDraft?.(dataUrl)
          onChange?.({ iconSource: 'custom' })
          setError('')
        }}
      />
    </>
  )
}
