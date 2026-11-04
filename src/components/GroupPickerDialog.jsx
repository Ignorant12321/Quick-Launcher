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
import Checkbox from '@mui/material/Checkbox'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import CreateNewFolderRoundedIcon from '@mui/icons-material/CreateNewFolderRounded'
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded'
import { GroupAvatar } from '../icons'
import { matchesText } from '../search'
import { getVisibleGroupItems } from '../data'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'

export default function GroupPickerDialog ({
  open,
  title,
  description,
  groups,
  excludeGroupId = '',
  allowCreate = false,
  actionLabel = '复制到此分组',
  // 多选模式：勾选多个分组后一次确认（「添加分组」就是这种，一次塞进好几个入口）
  multiple = false,
  confirmLabel = '加入分组',
  emptyText,
  // 候选里因为「分组被关闭」而被排除时的说明（由 App 决定要不要给）
  disabledHint,
  onClose,
  onSelect,
  onCreateRequest
}) {
  const [keyword, setKeyword] = useState('')
  const [checked, setChecked] = useState(() => new Set())
  const listRef = useRef(null)
  const listFade = useScrollFade(listRef)

  useEffect(() => {
    if (!open) return
    setKeyword('')
    setChecked(new Set())
  }, [open])

  const candidates = useMemo(
    () => groups.filter((group) => group.id !== excludeGroupId),
    [groups, excludeGroupId]
  )
  // 候选分组的 id → 分组：项数要按可见条目算（见下面列表里的「N 项」）
  const byId = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups]
  )
  const options = useMemo(
    () => candidates.filter((group) => (
      matchesText(group.name, keyword) ||
      (group.aliases || []).some((alias) => matchesText(alias, keyword))
    )),
    [candidates, keyword]
  )

  const pickedIds = useMemo(
    () => candidates.filter((group) => checked.has(group.id)).map((group) => group.id),
    [candidates, checked]
  )
  const checkedVisible = options.filter((group) => checked.has(group.id)).length
  const allChecked = options.length > 0 && checkedVisible === options.length

  const toggleGroup = (groupId) => {
    setChecked((previous) => {
      const next = new Set(previous)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  // 全选只作用于「当前筛出来的」这些，搜索时不会把看不见的一起点上/取消
  const toggleAll = () => {
    setChecked((previous) => {
      const next = new Set(previous)
      if (allChecked) options.forEach((group) => next.delete(group.id))
      else options.forEach((group) => next.add(group.id))
      return next
    })
  }

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
            if (multiple) {
              // 多选时回车 = 确认；一个都没勾就先勾上第一个，省得回车没反应
              if (pickedIds.length) onSelect?.(pickedIds)
              else if (options[0]) toggleGroup(options[0].id)
              return
            }
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

        {multiple && (
          <Box
            component="label"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.8,
              px: 1,
              py: 0.5,
              mb: 0.6,
              borderRadius: '10px',
              bgcolor: 'action.hover',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <Checkbox
              size="small"
              checked={allChecked}
              indeterminate={checkedVisible > 0 && !allChecked}
              onChange={toggleAll}
              sx={{ p: 0.35, ml: -0.4 }}
            />
            <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 600 }}>全选</Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>
              已选 {pickedIds.length} / {candidates.length}
            </Typography>
          </Box>
        )}

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
          {options.map((group) => {
            const isChecked = multiple && checked.has(group.id)
            return (
              <Box
                key={group.id}
                {...(multiple
                  ? { component: 'label' }
                  : {
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => onSelect?.(group.id),
                      onKeyDown: (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        onSelect?.(group.id)
                      }
                    })}
                title={group.name}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: multiple ? 0.9 : 1.1,
                  p: multiple ? '6px 8px' : '7px 8px',
                  mb: 0.35,
                  borderRadius: '11px',
                  border: '1px solid',
                  borderColor: multiple && isChecked ? 'divider' : 'transparent',
                  textAlign: 'left',
                  color: 'text.primary',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  userSelect: multiple ? 'none' : undefined,
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
                {multiple && (
                  <Checkbox
                    size="small"
                    checked={isChecked}
                    onChange={() => toggleGroup(group.id)}
                    sx={{ p: 0.35, ml: -0.4 }}
                  />
                )}
                <GroupAvatar group={group} size={26} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 550, lineHeight: 1.35 }} noWrap>
                    {group.name}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, lineHeight: 1.3, color: 'text.secondary' }}>
                    {/* 项数按可见条目算：指向已关闭分组的入口在目标分组里根本画不出来 */}
                    {getVisibleGroupItems(group, byId).length} 项
                  </Typography>
                </Box>
                {!multiple && (
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
                )}
              </Box>
            )
          })}

          {options.length === 0 && (
            <Box
              sx={{
                height: 96,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.6,
                px: 2,
                color: 'text.secondary'
              }}
            >
              <SearchOffRoundedIcon sx={{ fontSize: 26, opacity: 0.4 }} />
              <Typography sx={{ fontSize: 12, fontWeight: 550, color: 'text.primary' }}>
                {groups.length
                  ? (keyword ? '没有匹配分组' : '没有可用分组')
                  : (emptyText || '还没有分组')}
              </Typography>
              {groups.length === 0 && disabledHint && (
                <Typography sx={{ fontSize: 10.5, lineHeight: 1.4, textAlign: 'center' }}>
                  {disabledHint}
                </Typography>
              )}
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
        {multiple && (
          <Button
            variant="contained"
            size="small"
            disabled={pickedIds.length === 0}
            onClick={() => onSelect?.(pickedIds)}
            sx={{ fontSize: 11.5, py: 0.55 }}
          >
            {pickedIds.length ? `${confirmLabel}（${pickedIds.length}）` : confirmLabel}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
