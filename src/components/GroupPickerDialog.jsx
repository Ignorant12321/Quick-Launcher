import React, { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import CreateNewFolderRoundedIcon from '@mui/icons-material/CreateNewFolderRounded'
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded'
import { GroupAvatar } from '../icons'
import { matchesText } from '../search'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'

export default function GroupPickerDialog ({
  open,
  title,
  description,
  groups,
  excludeGroupId = '',
  allowCreate = false,
  actionLabel = '复制到此分组',
  emptyText,
  onClose,
  onSelect,
  onCreateRequest
}) {
  const [keyword, setKeyword] = useState('')
  const listRef = useRef(null)
  const listFade = useScrollFade(listRef)

  useEffect(() => {
    if (!open) return
    setKeyword('')
  }, [open])

  const options = useMemo(() => (
    groups
      .filter((group) => group.id !== excludeGroupId)
      .filter((group) => matchesText(group.name, keyword))
  ), [groups, excludeGroupId, keyword])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: 386,
            maxWidth: 'calc(100vw - 32px)',
            m: 2,
            borderRadius: '18px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }
        }
      }}
    >
      <DialogTitle sx={{ px: 2.2, pt: 1.8, pb: 1.2, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>
              {title}
            </Typography>
            {description && (
              <Typography sx={{ mt: 0.55, fontSize: 11.5, lineHeight: 1.5, color: 'text.secondary' }}>
                {description}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="关闭" sx={{ mt: -0.2 }}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 2.2, pt: '20px !important', pb: 1.6 }}>
        <TextField
          autoFocus
          size="small"
          placeholder="搜索分组名称"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            const first = options[0]
            if (first) onSelect?.(first.id)
          }}
          slotProps={{
            htmlInput: { 'aria-label': '搜索分组' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: keyword
                ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="清除分组搜索"
                      onClick={() => setKeyword('')}
                      edge="end"
                      sx={{ p: 0.25 }}
                    >
                      <CloseRoundedIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </InputAdornment>
                  )
                : null
            }
          }}
          sx={{
            width: '100%',
            mb: 1.2,
            '& .MuiInputBase-root': { minHeight: 38 },
            '& .MuiInputBase-input': { fontSize: 12 },
            '& fieldset': { borderRadius: '11px' }
          }}
        />

        <Box
          ref={listRef}
          className="scroll-fade"
          sx={{
            maxHeight: 264,
            minHeight: 96,
            overflowY: 'auto',
            mx: -0.6,
            px: 0.6,
            ...scrollFadeSx(listFade, 14)
          }}
        >
          {options.map((group) => (
            <Box
              key={group.id}
              role="button"
              tabIndex={0}
              title={group.name}
              onClick={() => onSelect?.(group.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelect?.(group.id)
              }}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.1,
                p: '7px 8px',
                mb: 0.35,
                borderRadius: '11px',
                border: '1px solid transparent',
                textAlign: 'left',
                color: 'text.primary',
                fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'background-color 120ms ease, border-color 120ms ease',
                '&:hover': {
                  bgcolor: 'action.hover',
                  borderColor: 'divider',
                  '& .group-picker-action': { opacity: 1 }
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 1
                }
              }}
            >
              <GroupAvatar group={group} size={26} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 550, lineHeight: 1.35 }} noWrap>
                  {group.name}
                </Typography>
                <Typography sx={{ fontSize: 10.5, lineHeight: 1.3, color: 'text.secondary' }}>
                  {group.items.length} 项
                </Typography>
              </Box>
              <Box
                className="group-picker-action"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.4,
                  flexShrink: 0,
                  opacity: 0,
                  transition: 'opacity 120ms ease',
                  fontSize: 11,
                  color: 'text.secondary'
                }}
              >
                {actionLabel}
                <ChevronRightRoundedIcon sx={{ fontSize: 15 }} />
              </Box>
            </Box>
          ))}

          {options.length === 0 && (
            <Box
              sx={{
                height: 96,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.6,
                color: 'text.secondary'
              }}
            >
              <SearchOffRoundedIcon sx={{ fontSize: 26, opacity: 0.4 }} />
              <Typography sx={{ fontSize: 12, fontWeight: 550, color: 'text.primary' }}>
                {groups.length
                  ? (keyword ? '没有匹配分组' : '没有可用分组')
                  : (emptyText || '还没有分组')}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.2, py: 1.6, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        {allowCreate && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<CreateNewFolderRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={() => onCreateRequest?.()}
            sx={{ fontSize: 11.5, py: 0.5 }}
          >
            新建分组
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={onClose} sx={{ color: 'text.secondary', fontSize: 11.5 }}>
          取消
        </Button>
      </DialogActions>
    </Dialog>
  )
}
