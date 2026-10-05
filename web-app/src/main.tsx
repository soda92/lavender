import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { I18nProvider } from './game/i18n'

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}
