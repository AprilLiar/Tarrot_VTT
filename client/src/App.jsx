import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppProvider, useApp } from './AppContext.jsx';
import { useState } from 'react';
import Picker from './components/Picker.jsx';
import Settings from './components/Settings.jsx';
import { useT } from './i18n.jsx';
import Shell from './components/Shell.jsx';
import Roster from './components/Roster.jsx';
import SheetPage from './components/sheet/SheetPage.jsx';
import ScenePage from './components/scene/ScenePage.jsx';
import ArcanePage from './components/arcane/ArcanePage.jsx';
import { useIsDesktop } from './lib/useMedia.js';
import { MusicProvider } from './music/MusicContext.jsx';
import MusicBar from './music/MusicBar.jsx';

function GmSheetRoute() {
  const { id } = useParams();
  const characterId = Number(id);
  return Number.isInteger(characterId) ? <SheetPage characterId={characterId} /> : <Navigate to="/" replace />;
}

// The scene fills the space under the top bar.
const SceneFrame = () => (
  <div className="h-[calc(100dvh-3.5rem)]">
    <ScenePage />
  </div>
);

function Screen() {
  const { ready, identity, switchIdentity } = useApp();
  const desktop = useIsDesktop();
  const t = useT();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!ready) {
    return (
      <main className="flex h-full items-center justify-center">
        <p data-testid="status" className="text-sm opacity-70">
          {t('Connecting...')}
        </p>
      </main>
    );
  }
  if (!identity) return settingsOpen ? <Settings onBack={() => setSettingsOpen(false)} /> : <Picker onSettings={() => setSettingsOpen(true)} />;

  // The Display Screen: only the scene, no menus, no chat.
  if (identity.role === 'display') {
    return (
      <div className="h-[100dvh]">
        <ScenePage chrome={false} onExit={switchIdentity} />
        {/* Top right, and see-through everywhere else so it never blocks the scene. */}
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-end p-2">
          <MusicBar />
        </div>
      </div>
    );
  }

  // A player sees their own sheet, and the scene on a desktop screen.
  if (identity.role === 'player') {
    return (
      <Shell>
        <Routes>
          <Route path="/" element={<SheetPage characterId={identity.characterId} />} />
          {desktop && <Route path="/scene" element={<SceneFrame />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    );
  }
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Roster />} />
        <Route path="/character/:id" element={<GmSheetRoute />} />
        <Route path="/scene" element={<SceneFrame />} />
        <Route path="/arcane" element={<main className="mx-auto max-w-3xl p-3"><ArcanePage s={null} /></main>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MusicProvider>
        <Screen />
      </MusicProvider>
    </AppProvider>
  );
}
