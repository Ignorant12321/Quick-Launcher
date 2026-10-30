import React from 'react'
import Box from '@mui/material/Box'
import AppsRoundedIcon from '@mui/icons-material/AppsRounded'
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded'
import { GroupAvatarFace, useCustomIcon } from '../icons'
import { ITEM_DEFAULT_COLORS, ITEM_TYPES, normalizeIconRadius } from '../data'

export default function ItemIconView ({
  item,
  size = 30,
  nativeSrc,
  customIconSrc
}) {
  const storedCustom = useCustomIcon(item?.customIconRef)
  const customSrc = customIconSrc === undefined ? storedCustom : customIconSrc
  const source = item?.iconSource || (item?.type === ITEM_TYPES.URL ? 'builtin' : 'native')

  // 分组入口直接借用分组头像（图标 / 颜色 / 自定义图一致）
  if (item?.type === ITEM_TYPES.GROUP) {
    return <GroupAvatarFace group={item} size={size} customSrc={customSrc || null} />
  }

  if (source === 'custom' && customSrc) {
    return <GroupAvatarFace group={item} size={size} customSrc={customSrc} />
  }
  if (source === 'builtin' || item?.type === ITEM_TYPES.URL) {
    return <GroupAvatarFace group={item} size={size} />
  }
  if (nativeSrc) {
    // 原生图标同样吃「图标圆角」：按图片外框裁剪。
    // 多数系统图标自带透明留白，圆角可能看不出来；图形贴边的图标才会真的被切角
    return (
      <Box
        component="img"
        src={nativeSrc}
        alt=""
        draggable={false}
        sx={{
          width: size,
          height: size,
          objectFit: 'contain',
          display: 'block',
          borderRadius: `${normalizeIconRadius(item?.iconRadius)}%`
        }}
      />
    )
  }

  const iconSize = Math.max(16, size - 3)
  // 兜底图标沿用各类型的默认色（ITEM_DEFAULT_COLORS），与新建条目时的默认外观保持同源
  if (item?.type === ITEM_TYPES.FOLDER) {
    return <FolderRoundedIcon sx={{ fontSize: iconSize, color: ITEM_DEFAULT_COLORS[ITEM_TYPES.FOLDER] }} />
  }
  if (item?.type === ITEM_TYPES.APP) {
    return <AppsRoundedIcon sx={{ fontSize: iconSize, color: ITEM_DEFAULT_COLORS[ITEM_TYPES.APP] }} />
  }
  if (item?.type === ITEM_TYPES.PLUGIN) {
    return <ExtensionRoundedIcon sx={{ fontSize: iconSize, color: ITEM_DEFAULT_COLORS[ITEM_TYPES.PLUGIN] }} />
  }
  return <InsertDriveFileRoundedIcon sx={{ fontSize: iconSize, color: 'text.secondary' }} />
}
