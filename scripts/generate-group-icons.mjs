import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'

import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import WorkRoundedIcon from '@mui/icons-material/WorkRounded'
import CodeRoundedIcon from '@mui/icons-material/CodeRounded'
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded'
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded'
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded'
import MusicNoteRoundedIcon from '@mui/icons-material/MusicNoteRounded'
import MovieRoundedIcon from '@mui/icons-material/MovieRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded'
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded'
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded'
import DesignServicesRoundedIcon from '@mui/icons-material/DesignServicesRounded'
import CloudRoundedIcon from '@mui/icons-material/CloudRounded'
import ChatBubbleRoundedIcon from '@mui/icons-material/ChatBubbleRounded'
import ConstructionRoundedIcon from '@mui/icons-material/ConstructionRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import BoltRoundedIcon from '@mui/icons-material/BoltRounded'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded'
import BusinessCenterRoundedIcon from '@mui/icons-material/BusinessCenterRounded'
import BrushRoundedIcon from '@mui/icons-material/BrushRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import EmailRoundedIcon from '@mui/icons-material/EmailRounded'
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded'
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded'
import PhotoLibraryRoundedIcon from '@mui/icons-material/PhotoLibraryRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded'
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded'
import SlideshowRoundedIcon from '@mui/icons-material/SlideshowRounded'
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded'
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded'
import StorageRoundedIcon from '@mui/icons-material/StorageRounded'
import WifiRoundedIcon from '@mui/icons-material/WifiRounded'
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import BuildRoundedIcon from '@mui/icons-material/BuildRounded'
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded'
import MusicVideoRoundedIcon from '@mui/icons-material/MusicVideoRounded'
import PodcastsRoundedIcon from '@mui/icons-material/PodcastsRounded'
import NewspaperRoundedIcon from '@mui/icons-material/NewspaperRounded'
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded'
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded'
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import FlightRoundedIcon from '@mui/icons-material/FlightRounded'
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded'
import RestaurantRoundedIcon from '@mui/icons-material/RestaurantRounded'
import FitnessCenterRoundedIcon from '@mui/icons-material/FitnessCenterRounded'
import PetsRoundedIcon from '@mui/icons-material/PetsRounded'
import ForestRoundedIcon from '@mui/icons-material/ForestRounded'
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import DiamondRoundedIcon from '@mui/icons-material/DiamondRounded'
import GroupRoundedIcon from '@mui/icons-material/GroupRounded'
import PublicRoundedIcon from '@mui/icons-material/PublicRounded'
import DnsRoundedIcon from '@mui/icons-material/DnsRounded'
import FolderSpecialRoundedIcon from '@mui/icons-material/FolderSpecialRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded'
import ArchitectureRoundedIcon from '@mui/icons-material/ArchitectureRounded'
import SmartphoneRoundedIcon from '@mui/icons-material/SmartphoneRounded'
import ComputerRoundedIcon from '@mui/icons-material/ComputerRounded'

const icons = {
  folder: FolderRoundedIcon,
  star: StarRoundedIcon,
  work: WorkRoundedIcon,
  code: CodeRoundedIcon,
  terminal: TerminalRoundedIcon,
  globe: LanguageRoundedIcon,
  bookmark: BookmarkRoundedIcon,
  music: MusicNoteRoundedIcon,
  movie: MovieRoundedIcon,
  image: ImageRoundedIcon,
  camera: PhotoCameraRoundedIcon,
  game: SportsEsportsRoundedIcon,
  school: SchoolRoundedIcon,
  science: ScienceRoundedIcon,
  design: DesignServicesRoundedIcon,
  cloud: CloudRoundedIcon,
  chat: ChatBubbleRoundedIcon,
  build: ConstructionRoundedIcon,
  heart: FavoriteRoundedIcon,
  bolt: BoltRoundedIcon,
  home: HomeRoundedIcon,
  explore: TravelExploreRoundedIcon,
  business: BusinessCenterRoundedIcon,
  brush: BrushRoundedIcon,
  calendar: CalendarMonthRoundedIcon,
  email: EmailRoundedIcon,
  phone: PhoneRoundedIcon,
  cart: ShoppingCartRoundedIcon,
  photos: PhotoLibraryRoundedIcon,
  videos: VideoLibraryRoundedIcon,
  document: DescriptionRoundedIcon,
  table: TableChartRoundedIcon,
  slides: SlideshowRoundedIcon,
  bug: BugReportRoundedIcon,
  chip: MemoryRoundedIcon,
  storage: StorageRoundedIcon,
  wifi: WifiRoundedIcon,
  security: SecurityRoundedIcon,
  settings: SettingsRoundedIcon,
  tools: BuildRoundedIcon,
  palette: PaletteRoundedIcon,
  musicvideo: MusicVideoRoundedIcon,
  podcast: PodcastsRoundedIcon,
  news: NewspaperRoundedIcon,
  book: MenuBookRoundedIcon,
  translate: TranslateRoundedIcon,
  calculate: CalculateRoundedIcon,
  map: MapRoundedIcon,
  place: PlaceRoundedIcon,
  flight: FlightRoundedIcon,
  car: DirectionsCarRoundedIcon,
  restaurant: RestaurantRoundedIcon,
  fitness: FitnessCenterRoundedIcon,
  pets: PetsRoundedIcon,
  eco: ForestRoundedIcon,
  idea: LightbulbRoundedIcon,
  rocket: RocketLaunchRoundedIcon,
  diamond: DiamondRoundedIcon,
  group: GroupRoundedIcon,
  public: PublicRoundedIcon,
  server: DnsRoundedIcon,
  special: FolderSpecialRoundedIcon,
  task: TaskAltRoundedIcon,
  savings: SavingsRoundedIcon,
  architecture: ArchitectureRoundedIcon,
  mobile: SmartphoneRoundedIcon,
  computer: ComputerRoundedIcon
}

const markup = {}

for (const [key, Icon] of Object.entries(icons)) {
  const html = renderToStaticMarkup(React.createElement(Icon)).trim()
  const match = /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(html)
  if (!match) throw new Error(`无法解析图标 ${key}`)
  markup[key] = match[1]
}

writeFileSync(
  new URL('../src/groupIconMarkup.json', import.meta.url),
  `${JSON.stringify(markup, null, 2)}\n`
)

console.log(`已生成 ${Object.keys(markup).length} 个分组图标`)
