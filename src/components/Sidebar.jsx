import React from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import Tooltip from '@mui/material/Tooltip'
import { GroupAvatar } from '../icons'

export default function Sidebar ({ groups, activeId, mode, surfaces, onToggleMode, onSelect, onCreate }) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: 204,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '16px',
        bgcolor: surfaces.panel,
        border: '1px solid',
        borderColor: surfaces.border,
        boxShadow: surfaces.shadow,
        backdropFilter: 'blur(18px)'
      }}
    >
      <Box sx={{ px: 1.6, pt: 1.6, pb: 1.2, display: 'flex', alignItems: 'center', gap: 1.05 }}>
        <Box
          component="img"
          src="logo.png"
          alt=""
          sx={{ width: 30, height: 30, borderRadius: '9px', display: 'block', objectFit: 'contain' }}
        />
        <Typography sx={{ minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.15, letterSpacing: 0.1 }} noWrap>
          Quick Launcher
        </Typography>
      </Box>

      <Box sx={{ px: 1.6, pt: 1, pb: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: 'text.secondary', letterSpacing: 0.7 }}>
          分组
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>
          {groups.length}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 0.8, pb: 1 }}>
        {groups.length === 0 && (
          <Typography sx={{ px: 1, py: 2, fontSize: 11.5, color: 'text.secondary', textAlign: 'center' }}>
            还没有分组
          </Typography>
        )}

        {groups.map((group) => {
          const active = group.id === activeId
          return (
            <Box
              key={group.id}
              component="button"
              type="button"
              onClick={() => onSelect(group.id)}
              sx={{
                width: '100%',
                border: 0,
                p: '6px 8px',
                mb: 0.4,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'text.primary',
                bgcolor: active ? 'action.selected' : 'transparent',
                boxShadow: active ? `inset 2px 0 0 ${group.color}` : 'none',
                cursor: 'pointer',
                transition: 'background-color 140ms ease',
                '&:hover': {
                  bgcolor: active ? 'action.selected' : 'action.hover'
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 1
                }
              }}
            >
              <GroupAvatar group={group} size={28} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 12.5,
                    fontWeight: active ? 650 : 500,
                    lineHeight: 1.25,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {group.name}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.25,
                    fontSize: 10,
                    lineHeight: 1.2,
                    color: 'text.secondary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {group.items.length === 0 ? '空分组' : `${group.items.length} 项`}
                </Typography>
              </Box>
              {group.quickLaunch && (
                <Tooltip title="已开启一键启动">
                  <RocketLaunchRoundedIcon sx={{ fontSize: 13, color: '#8B5CF6', opacity: 0.9 }} />
                </Tooltip>
              )}
              {group.keywordMatch && (
                <Tooltip title="已开启 uTools 关键词匹配">
                  <KeyboardRoundedIcon sx={{ fontSize: 13, color: 'text.secondary', opacity: 0.72 }} />
                </Tooltip>
              )}
            </Box>
          )
        })}
      </Box>

      <Box sx={{ p: 1, borderTop: '1px solid', borderColor: surfaces.border, display: 'flex', alignItems: 'center', gap: 0.35 }}>
        <Button
          size="small"
          startIcon={<AddRoundedIcon sx={{ fontSize: 17 }} />}
          onClick={onCreate}
          sx={{
            flex: 1,
            justifyContent: 'flex-start',
            color: 'text.primary',
            px: 1.1,
            py: 0.65,
            '&:hover': { bgcolor: 'action.hover' }
          }}
        >
          新建分组
        </Button>
        <Tooltip title={mode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}>
          <IconButton
            size="small"
            onClick={onToggleMode}
            aria-label={mode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            sx={{ color: 'text.secondary' }}
          >
            <Box
              className="theme-toggle-icon"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                viewTransitionName: 'theme-toggle-icon'
              }}
            >
              {mode === 'dark'
                ? <LightModeRoundedIcon sx={{ fontSize: 18 }} />
                : <DarkModeRoundedIcon sx={{ fontSize: 18 }} />}
            </Box>
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  )
}
