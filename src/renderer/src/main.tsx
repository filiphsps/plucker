import './index.css'
import './i18n'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import { ConsoleWindow } from './console-window'
import { TooltipProvider } from './ui/tooltip'
import { initAccent } from './theme'

initAccent()

// The same bundle backs both the main window and the floating console window;
// the `#console` hash selects which root to mount.
const isConsoleWindow = window.location.hash === '#console'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>{isConsoleWindow ? <ConsoleWindow /> : <App />}</TooltipProvider>
  </StrictMode>
)
