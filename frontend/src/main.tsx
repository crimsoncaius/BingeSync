import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './theme'
import './style.css'

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
)
