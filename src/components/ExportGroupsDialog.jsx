import React, { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded'
import { GroupAvatar } from '../icons'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'

// 导出配置：先选范围（全部 / 个别分组），再确认。
// 逻辑都在 App 的 exportGroups 里，这里只负责把「导出哪些」挑出来
export default function ExportGroupsDialog ({
  open,
  groups,
  busy = false,
  onClose,
  onConfirm
}) {
  const [scope, setScope] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const listRef = useRef(null)
  const listFade = useScrollFade(listRef)

  useEffect(() => {
    if (!open) return
    // 每次打开都回到「全部」；选择模式从全选开始，取消掉几个比一个个勾更快
    setScope('all')
    setSelected(new Set(groups.map((group) => group.id)))
  }, [open])

  const picked = useMemo(
    () => groups.filter((group) => selected.has(group.id)),
    [groups, selected]
  )
  const effective = scope === 'all' ? groups : picked
  const canExport = !busy && effective.length > 0
  const allPicked = groups.length > 0 && picked.length === groups.length

  const toggleGroup = (groupId) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allPicked ? new Set() : new Set(groups.map((group) => group.id)))
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
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
              导出配置
            </Typography>
            <Typography sx={{ mt: 0.55, fontSize: 11.5, lineHeight: 1.5, color: 'text.secondary' }}>
              导出的文件可以再导入回来，图标和分组设置都会带上。
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="关闭" disabled={busy} sx={{ mt: -0.2 }}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 2.2, pt: '20px !important', pb: 1.6 }}>
        <ToggleButtonGroup
          value={scope}
          exclusive
          size="small"
          fullWidth
          onChange={(_event, next) => {
            if (next) setScope(next)
          }}
          aria-label="导出范围"
          sx={{
            mb: 1.4,
            height: 34,
            '& .MuiToggleButton-root': {
              flex: 1,
              py: 0,
              fontSize: 12,
              fontWeight: 600,
              borderColor: 'divider',
              color: 'text.secondary',
              textTransform: 'none',
              '&.Mui-selected': { color: 'primary.main', bgcolor: 'action.selected' }
            }
          }}
        >
          <ToggleButton value="all">全部分组（{groups.length}）</ToggleButton>
          <ToggleButton value="pick">选择分组</ToggleButton>
        </ToggleButtonGroup>

        {scope === 'pick' && (
          <>
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
                checked={allPicked}
                indeterminate={picked.length > 0 && !allPicked}
                onChange={toggleAll}
                sx={{ p: 0.35, ml: -0.4 }}
              />
              <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 600 }}>全选</Typography>
              <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>
                已选 {picked.length} / {groups.length}
              </Typography>
            </Box>

            <Box
              ref={listRef}
              className="scroll-fade"
              sx={{
                maxHeight: 240,
                minHeight: 72,
                overflowY: 'auto',
                mx: -0.6,
                px: 0.6,
                ...scrollFadeSx(listFade, 14)
              }}
            >
              {groups.map((group) => {
                const checked = selected.has(group.id)
                return (
                  <Box
                    key={group.id}
                    component="label"
                    sx={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.9,
                      p: '5px 8px',
                      mb: 0.35,
                      borderRadius: '11px',
                      border: '1px solid',
                      borderColor: checked ? 'divider' : 'transparent',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color 120ms ease, border-color 120ms ease',
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={checked}
                      onChange={() => toggleGroup(group.id)}
                      sx={{ p: 0.35, ml: -0.4 }}
                    />
                    <GroupAvatar group={group} size={26} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 550, lineHeight: 1.35 }} noWrap>
                        {group.name}
                      </Typography>
                      <Typography sx={{ fontSize: 10.5, lineHeight: 1.3, color: 'text.secondary' }}>
                        {group.items.length} 项
                      </Typography>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.2, py: 1.6, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Button size="small" onClick={onClose} disabled={busy} sx={{ color: 'text.secondary', fontSize: 11.5 }}>
          取消
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={!canExport}
          startIcon={busy
            ? <CircularProgress size={14} color="inherit" />
            : <FileDownloadRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={() => onConfirm?.(effective)}
          sx={{ fontSize: 11.5, py: 0.55 }}
        >
          {busy ? '导出中' : (scope === 'all' ? `导出全部（${groups.length}）` : `导出 ${picked.length} 个`)}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
