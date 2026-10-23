import { createTheme } from '@mui/material/styles'

const FONT_FAMILY = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"SF Pro Text"',
  '"Segoe UI"',
  '"PingFang SC"',
  '"Microsoft YaHei"',
  'sans-serif'
].join(', ')

export function createAppTheme (mode) {
  const dark = mode === 'dark'

  return createTheme({
    palette: {
      mode,
      primary: {
        main: dark ? '#90caf9' : '#1276C5'
      },
      background: {
        default: 'transparent',
        paper: dark ? '#2b2c2f' : '#ffffff'
      },
      divider: dark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(17, 24, 39, 0.09)',
      text: {
        primary: dark ? 'rgba(255, 255, 255, 0.92)' : '#1c2633',
        secondary: dark ? 'rgba(255, 255, 255, 0.56)' : '#6c7580'
      }
    },
    shape: {
      borderRadius: 11
    },
    typography: {
      fontFamily: FONT_FAMILY,
      fontSize: 13.5,
      button: {
        textTransform: 'none',
        fontWeight: 600
      }
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true
        },
        styleOverrides: {
          root: {
            borderRadius: 10,
            paddingInline: 14,
            whiteSpace: 'nowrap'
          }
        }
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 9
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 500
          }
        }
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none'
          }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: 11.5,
            borderRadius: 6,
            padding: '5px 8px'
          }
        }
      }
    }
  })
}

export function getSurfaces (mode) {
  if (mode === 'dark') {
    return {
      panel: 'rgba(37, 38, 41, 0.86)',
      card: 'rgba(49, 50, 54, 0.78)',
      cardHover: 'rgba(57, 58, 63, 0.94)',
      inset: 'rgba(255, 255, 255, 0.045)',
      border: 'rgba(255, 255, 255, 0.085)',
      hint: 'rgba(255, 255, 255, 0.028)',
      shadow: '0 1px 2px rgba(0, 0, 0, 0.16)'
    }
  }

  return {
    panel: 'rgba(255, 255, 255, 0.70)',
    card: 'rgba(255, 255, 255, 0.92)',
    cardHover: '#ffffff',
    inset: 'rgba(17, 24, 39, 0.035)',
    border: 'rgba(17, 24, 39, 0.075)',
    hint: 'rgba(255, 255, 255, 0.42)',
    shadow: '0 1px 2px rgba(31, 45, 61, 0.045)'
  }
}
