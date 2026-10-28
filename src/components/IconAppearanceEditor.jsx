import React from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ColorizeRoundedIcon from '@mui/icons-material/ColorizeRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import WheelSlider from './WheelSlider'
import { GROUP_ICONS, GroupGlyph } from '../icons'
import { GROUP_COLORS, MAX_ICON_RADIUS, getReadableColor } from '../data'

const ROW_LABEL_SX = {
  width: 56,
  flexShrink: 0,
  fontSize: 10.5,
  lineHeight: 1.35,
  color: 'text.secondary'
}

function Row ({ label, labelSx, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
      <Typography sx={{ ...ROW_LABEL_SX, ...labelSx }}>{label}</Typography>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.9, flexWrap: 'wrap' }}>
        {children}
      </Box>
    </Box>
  )
}

export default function IconAppearanceEditor ({
  icon,
  color,
  customSrc,
  customIconRadius = 0,
  builtinActive = true,
  onSelectIcon,
  onColorChange,
  onRadiusChange,
  onImportIcon,
  onRemoveCustom,
  importLabel = '自定义图标',
  importBusy = false,
  importTitle = 'PNG / JPG / WebP / SVG，最大 2 MB',
  extraActions = null
}) {
  const hasCustomIcon = Boolean(customSrc)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.3 }}>
      <Row label="颜色">
        {GROUP_COLORS.map((entry) => {
          const selected = color.toLocaleLowerCase() === entry.toLocaleLowerCase()
          return (
            <Tooltip key={entry} title={entry.toUpperCase()}>
              <Box
                component="button"
                type="button"
                aria-label={`颜色 ${entry}`}
                onClick={() => onColorChange?.(entry)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: selected ? 'text.primary' : 'transparent',
                  bgcolor: entry,
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
                {selected && <CheckRoundedIcon sx={{ fontSize: 15, color: '#fff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.28))' }} />}
              </Box>
            </Tooltip>
          )
        })}

        <Tooltip title="自定义颜色">
          <Box
            component="label"
            sx={{
              width: 28,
              height: 28,
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
            <ColorizeRoundedIcon sx={{ fontSize: 13, color: '#fff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }} />
            <Box
              component="input"
              type="color"
              aria-label="自定义颜色"
              value={color}
              onChange={(event) => onColorChange?.(event.target.value)}
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
      </Row>

      <Row label="图片">
        {extraActions}
        <Button
          size="small"
          variant="outlined"
          title={importTitle}
          startIcon={importBusy ? <CircularProgress size={14} /> : <ImageRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={onImportIcon}
          disabled={importBusy}
          sx={{ py: 0.6, px: 1.2 }}
        >
          {importLabel}
        </Button>
        {hasCustomIcon && (
          <Button
            size="small"
            onClick={onRemoveCustom}
            sx={{ color: 'text.secondary', px: 1 }}
          >
            使用内置图标
          </Button>
        )}
      </Row>

      {hasCustomIcon && (
        <Row label="图片圆角">
          <WheelSlider
            min={0}
            max={MAX_ICON_RADIUS}
            step={1}
            value={customIconRadius}
            onChange={(value) => onRadiusChange?.(value)}
            aria-label="图片圆角"
            sx={{ flex: 1, py: 0.5 }}
          />
          <Typography
            sx={{
              width: 34,
              flexShrink: 0,
              fontSize: 10.5,
              color: 'text.secondary',
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {customIconRadius === 0 ? '无' : `${customIconRadius}%`}
          </Typography>
        </Row>
      )}

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.4 }}>
        <Typography sx={{ ...ROW_LABEL_SX, pt: '9px' }}>内置图标</Typography>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'grid',
            gridAutoFlow: 'column',
            gridTemplateRows: 'repeat(3, 36px)',
            gridAutoColumns: '36px',
            gap: 0.7,
            overflowX: 'auto',
            overflowY: 'hidden',
            pb: 0.6,
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { height: 4 },
            '&::-webkit-scrollbar-thumb': {
              borderRadius: '999px',
              bgcolor: 'action.disabled'
            }
          }}
        >
          {GROUP_ICONS.map(({ key, label }) => {
            const selected = builtinActive && !hasCustomIcon && icon === key
            return (
              <Tooltip key={key} title={label}>
                <IconButton
                  onClick={() => onSelectIcon?.(key)}
                  aria-label={label}
                  sx={{
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    borderRadius: '10px',
                    color: (theme) => getReadableColor(color, theme.palette.mode),
                    opacity: selected ? 1 : 0.72,
                    bgcolor: selected
                      ? (theme) => (
                          theme.palette.mode === 'dark'
                            ? `color-mix(in srgb, ${color} 20%, transparent)`
                            : `${color}18`
                        )
                      : 'transparent',
                    border: '1px solid',
                    borderColor: selected ? `${color}38` : 'transparent',
                    '&:hover': { bgcolor: `${color}14`, opacity: 1 }
                  }}
                >
                  <GroupGlyph iconKey={key} size={20} />
                </IconButton>
              </Tooltip>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
