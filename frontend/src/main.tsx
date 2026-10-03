import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { AppRoutes } from '@/routes/AppRoutes';
import { DemoBanner } from '@/demo/DemoBanner';
import { IS_DEMO } from '@/demo/flags';
import '@fontsource-variable/archivo/wdth.css';
import './index.css';

async function bootstrap() {
  // Version de démonstration (GitHub Pages) : l'API est simulée dans le navigateur.
  if (IS_DEMO) {
    const { installDemoApi } = await import('@/demo/mockServer');
    installDemoApi();
  }

  // En démo (hébergement statique), le routage par « # » évite les erreurs 404 au rechargement.
  const Router = IS_DEMO ? HashRouter : BrowserRouter;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <AuthProvider>
            {IS_DEMO && <DemoBanner />}
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </Router>
    </StrictMode>,
  );
}

void bootstrap();
