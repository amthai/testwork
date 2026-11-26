import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/fira-sans-condensed/400.css'
import '@fontsource/fira-sans-condensed/500.css'
import '@fontsource/fira-sans-condensed/600.css'
import '@fontsource/fira-sans-condensed/700.css'
import { FluidProvider } from '@/lib/fluid-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={350}>
      <FluidProvider shape="pill">
        <App />
      </FluidProvider>
    </TooltipProvider>
  </StrictMode>,
)
