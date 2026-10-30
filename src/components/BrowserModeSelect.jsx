import React, { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import AppsRoundedIcon from '@mui/icons-material/AppsRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import { BROWSER_MODES } from '../data'
import chromeIcon from '../assets/browser-icons/chrome.svg'
import edgeIcon from '../assets/browser-icons/edge.svg'
import firefoxIcon from '../assets/browser-icons/firefox.svg'
import safariIcon from '../assets/browser-icons/safari.svg'
import ieIcon from '../assets/browser-icons/ie.svg'

let browserAvailability = null
let browserAvailabilityPromise = null

function loadBrowserAvailability () {
  if (browserAvailability) return Promise.resolve(browserAvailability)
  if (!window.services?.listBrowsers) return Promise.resolve(null)
  if (!browserAvailabilityPromise) {
    browserAvailabilityPromise = Promise.resolve(window.services.listBrowsers())
      .then((list) => {
        browserAvailability = Array.isArray(list) ? list : null
        return browserAvailability
      })
      .catch(() => null)
      .finally(() => {
        browserAvailabilityPromise = null
      })
  }
  return browserAvailabilityPromise
}

function ModeIcon ({ id, size = 17 }) {
  if (id === 'default') {
    return <LanguageRoundedIcon sx={{ fontSize: size, color: 'primary.main' }} />
  }
  if (id === 'ubrowser') {
    return <RocketLaunchRoundedIcon sx={{ fontSize: size, color: '#8B5CF6' }} />
  }
  if (id === 'custom') {
    return <AppsRoundedIcon sx={{ fontSize: size, color: 'text.secondary' }} />
  }
  const src = id === 'ie'
    ? ieIcon
    : id === 'safari'
      ? safariIcon
      : id.startsWith('chrome')
        ? chromeIcon
        : id.startsWith('edge')
          ? edgeIcon
          : firefoxIcon
  return (
    <Box
      component="img"
      src={src}
      alt=""
      draggable={false}
      sx={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  )
}

export default function BrowserModeSelect ({
  value,
  onChange,
  onReset,
  customAppPath = '',
  onPickCustomApp,
  sx
}) {
  const [anchorEl, setAnchorEl] = useState(null)
  const [available, setAvailable] = useState(browserAvailability)

  useEffect(() => {
    let active = true
    loadBrowserAvailability().then((list) => {
      if (active) setAvailable(list)
    })
    return () => {
      active = false
    }
  }, [])

  const customAppName = customAppPath ? customAppPath.split(/[\\/]/).pop() : ''
  const current = BROWSER_MODES.find((mode) => mode.id === value)
  const customLabel = customAppName ? `自定义软件（${customAppName}）` : '自定义软件'
  const currentLabel = value === 'custom'
    ? (customAppName ? customLabel : '自定义软件（未选择）')
    : (current?.label || BROWSER_MODES[0].label)

  const isUnavailable = (id) => Array.isArray(available) && !available.includes(id) && id !== value

  const close = () => setAnchorEl(null)
  const choose = (id) => {
    onChange?.(id)
    close()
  }
  // 已有自定义程序且当前不在该模式 → 直接切过去；否则（还没选过、或已经在自定义模式）
  // 都交给父组件弹出软件选择器，既能选新的，也能更换已选的程序。
  const chooseCustom = () => {
    close()
    if (value !== 'custom' && customAppPath) {
      onChange?.('custom')
      return
    }
    onPickCustomApp?.()
  }

  return (
    <Box sx={{ mt: 1.6, display: 'flex', alignItems: 'center', gap: 1, ...sx }}>
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
          aria-label="打开方式"
          aria-haspopup="listbox"
          aria-expanded={Boolean(anchorEl)}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setAnchorEl(event.currentTarget)
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
            cursor: 'pointer',
            userSelect: 'none',
            '&:hover': { borderColor: 'text.secondary' },
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 1
            }
          }}
        >
          <ModeIcon id={value} />
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
            {currentLabel}
          </Typography>
          <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        </Box>
      </Box>

      {onReset && (
        <Button
          variant="outlined"
          onClick={onReset}
          disabled={value === 'default'}
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
      )}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={close}
        slotProps={{
          paper: {
            sx: {
              width: anchorEl?.clientWidth || 320,
              maxHeight: 240,
              borderRadius: '10px'
            }
          }
        }}
      >
        {BROWSER_MODES.flatMap((mode) => {
          const nodes = [
            <MenuItem
              key={mode.id}
              selected={mode.id === value}
              disabled={isUnavailable(mode.id)}
              onClick={() => choose(mode.id)}
              sx={{ gap: 1, minHeight: 34, py: 0.5, fontSize: 12.5 }}
            >
              <ModeIcon id={mode.id} />
              <Typography sx={{ flex: 1, fontSize: 12.5, lineHeight: 1.4 }}>
                {mode.label}
              </Typography>
              {mode.id === value && <CheckRoundedIcon sx={{ fontSize: 16 }} />}
            </MenuItem>
          ]
          // 「自定义软件」紧跟「系统默认浏览器打开」，其余具体浏览器排在分隔线之后
          if (mode.id === 'default') {
            nodes.push(
              <MenuItem
                key="custom-app"
                selected={value === 'custom'}
                onClick={chooseCustom}
                sx={{ gap: 1, minHeight: 34, py: 0.5, fontSize: 12.5 }}
              >
                <ModeIcon id="custom" />
                <Typography sx={{ flex: 1, fontSize: 12.5, lineHeight: 1.4 }}>
                  {customLabel}
                </Typography>
                {value === 'custom' && <CheckRoundedIcon sx={{ fontSize: 16 }} />}
              </MenuItem>,
              <Divider key="custom-app-divider" sx={{ my: 0.4 }} />
            )
          }
          return nodes
        })}
      </Menu>
    </Box>
  )
}
