import React, { useEffect, useMemo } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Button from '@mui/material/Button'
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded'
import { GroupAvatar, useFileIcons, usePluginLogos } from '../icons'
import { ITEM_TYPES } from '../data'
import { matchesSearchItem } from '../search'
import ItemIconView from './ItemIconView'

const CAN_REVEAL = new Set([ITEM_TYPES.FILE, ITEM_TYPES.FOLDER, ITEM_TYPES.APP])
const CAN_ADMIN = new Set([ITEM_TYPES.FILE, ITEM_TYPES.APP])

function ItemTypeIcon ({ item, nativeSrc }) {
  return <ItemIconView item={item} size={22} nativeSrc={nativeSrc} />
}

export default function CompactGroupPanel ({
  group,
  query,
  mode,
  surfaces,
  fading = false,
  onExpand,
  onLaunch,
  onRevealItem,
  onRunAsAdmin,
  onQueryChange
}) {
  const icons = useFileIcons(group.items)
  const pluginLogos = usePluginLogos(group.items.some((item) => item.type === ITEM_TYPES.PLUGIN))
  const adminEnabled = Boolean(window.utools?.isWindows?.())
  const filteredItems = useMemo(() => {
    const keyword = query.trim()
    if (!keyword) return group.items
    return group.items.filter((item) => matchesSearchItem(item, keyword))
  }, [group.items, query])

  useEffect(() => {
    if (fading) return undefined
    const handleKeyDown = (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (!/^[1-9]$/.test(event.key)) return
      const item = filteredItems[Number(event.key) - 1]
      if (!item) return
      event.preventDefault()
      onLaunch(item)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredItems, onLaunch, fading])

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        p: 1.2,
        bgcolor: mode === 'dark' ? '#17181b' : '#f3f5f8',
        backgroundImage: mode === 'dark'
          ? 'radial-gradient(900px 620px at 8% 0%, rgba(96, 165, 250, 0.10), transparent 62%)'
          : 'radial-gradient(900px 620px at 8% 0%, rgba(18, 118, 197, 0.07), transparent 62%)'
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
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
        <Box
          sx={{
            px: 1.6,
            py: 1.1,
            display: 'flex',
            alignItems: 'center',
            gap: 1.2,
            flexShrink: 0,
            borderBottom: '1px solid',
            borderColor: surfaces.border
          }}
        >
          <GroupAvatar group={group} size={30} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }} noWrap>
              {group.name}
            </Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.secondary', lineHeight: 1.3 }}>
              {filteredItems.length === group.items.length
                ? `${group.items.length} 项`
                : `${filteredItems.length} / ${group.items.length} 项`}
            </Typography>
          </Box>
          <Tooltip title="展开完整界面">
            <IconButton
              size="small"
              onClick={onExpand}
              aria-label="展开完整界面"
              sx={{ color: 'text.secondary' }}
            >
              <OpenInFullRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 0.8, py: 0.6 }}>
          {filteredItems.length > 0
            ? filteredItems.map((item, index) => {
                const nativeSrc = item.type === ITEM_TYPES.PLUGIN
                  ? pluginLogos[String(item.path).toLocaleLowerCase()]
                  : icons[item.path]
                const subtitle = item.type === ITEM_TYPES.PLUGIN
                  ? (item.command && item.command !== item.name ? item.command : '插件')
                  : item.path
                const showReveal = CAN_REVEAL.has(item.type)
                const showAdmin = CAN_ADMIN.has(item.type) && adminEnabled
                return (
                  <Box
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    title={item.path}
                    onClick={() => onLaunch(item)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      onLaunch(item)
                    }}
                    sx={{
                      width: '100%',
                      border: 0,
                      p: '6px 8px',
                      mb: 0.35,
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.1,
                      textAlign: 'left',
                      color: 'text.primary',
                      bgcolor: 'transparent',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: 1
                      }
                    }}
                  >
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <ItemTypeIcon item={item} nativeSrc={nativeSrc} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 550, lineHeight: 1.3 }} noWrap>
                        {item.name}
                      </Typography>
                      <Typography
                        sx={{
                          mt: 0.15,
                          fontSize: 10.5,
                          lineHeight: 1.25,
                          color: 'text.secondary'
                        }}
                        noWrap
                      >
                        {subtitle}
                      </Typography>
                    </Box>
                    {showReveal && (
                      <Tooltip title="打开所在目录">
                        <IconButton
                          size="small"
                          aria-label={`打开 ${item.name} 所在目录`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onRevealItem?.(item)
                          }}
                          sx={{
                            width: 26,
                            height: 26,
                            flexShrink: 0,
                            p: 0,
                            border: '1px dashed',
                            borderColor: 'divider',
                            color: 'text.secondary',
                            '&:hover': {
                              borderColor: 'primary.main',
                              color: 'primary.main',
                              bgcolor: 'action.hover'
                            }
                          }}
                        >
                          <FolderOpenRoundedIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {showAdmin && (
                      <Tooltip title="以管理员身份运行">
                        <IconButton
                          size="small"
                          aria-label={`以管理员身份运行 ${item.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onRunAsAdmin?.(item)
                          }}
                          sx={{
                            width: 26,
                            height: 26,
                            flexShrink: 0,
                            p: 0,
                            border: '1px dashed',
                            borderColor: 'divider',
                            color: 'text.secondary',
                            '&:hover': {
                              borderColor: 'primary.main',
                              color: 'primary.main',
                              bgcolor: 'action.hover'
                            }
                          }}
                        >
                          <AdminPanelSettingsRoundedIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {index < 9 && (
                      <Typography
                        aria-hidden
                        sx={{
                          width: 42,
                          flexShrink: 0,
                          fontSize: 10.5,
                          color: 'text.secondary',
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        Alt + {index + 1}
                      </Typography>
                    )}
                  </Box>
                )
              })
            : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.secondary',
                  gap: 0.8,
                  py: 3
                }}
              >
                <SearchOffRoundedIcon sx={{ fontSize: 30, opacity: 0.45 }} />
                <Typography sx={{ fontSize: 12.5, fontWeight: 550, color: 'text.primary' }}>
                  没有匹配结果
                </Typography>
                {query && (
                  <Button size="small" onClick={() => onQueryChange?.('')}>
                    清除搜索
                  </Button>
                )}
              </Box>
              )}
        </Box>
      </Paper>
    </Box>
  )
}
