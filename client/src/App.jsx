import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppProvider, useApp } from './AppContext.jsx';
import Picker from './components/Picker.jsx';
import Shell from './components/Shell.jsx';
import Roster from './components/Roster.jsx';
import SheetPage from './components/sheet/SheetPage.jsx';
import ScenePage from './components/scene/ScenePage.jsx';
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

  if (!ready) {
    return (
      <main className="flex h-full items-center justify-center">
        <p data-testid="status" className="text-sm opacity-70">
          Connecting...
        </p>
      </main>
    );
  }
  if (!identity) return <Picker />;

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
