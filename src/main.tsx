import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode's dev-only double-invoke of effects/mounts is incompatible with
// react-yandex-maps (last updated for React 17): on the Delivery Zones page it
// leaves the map's polygons unmounted/invisible in `npm run dev`, even though
// production builds (which never ran StrictMode's double-invoke) are unaffected.
createRoot(document.getElementById('root')!).render(
  <App />,
)
