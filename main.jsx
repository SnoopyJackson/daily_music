import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './music-daily.css'
import App from './music-daily.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
