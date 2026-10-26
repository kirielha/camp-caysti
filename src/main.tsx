import '@fontsource/baloo-2/latin-700.css'
import '@fontsource/baloo-2/latin-800.css'
import '@fontsource/lexend/latin-400.css'
import '@fontsource/lexend/latin-500.css'
import '@fontsource/lexend/latin-600.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FournisseurContexte } from './contexte'
import { initialiserDonnees } from './data'
import './index.css'

initialiserDonnees().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <FournisseurContexte>
        <App />
      </FournisseurContexte>
    </StrictMode>,
  )
})
