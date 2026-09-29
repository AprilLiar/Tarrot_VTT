import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppProvider, useApp } from './AppContext.jsx';
import Picker from './components/Picker.jsx';
import Shell from './components/Shell.jsx';
import Roster from './components/Roster.jsx';
import SheetPage from './components/sheet/SheetPage.jsx';

function GmSheetRoute() {
  const { id } = useParams();
  const characterId = Number(id);
  return Number.isInteger(characterId) ? <SheetPage characterId={characterId} /> : <Navigate to="/" replace />;
}

function Screen() {
  const { ready, identity } = useApp();

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

  // A player only ever sees their own sheet; the GM has the roster and any sheet.
  if (identity.role === 'player') {
    return (
      <Shell>
        <SheetPage characterId={identity.characterId} />
      </Shell>
    );
  }
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Roster />} />
        <Route path="/character/:id" element={<GmSheetRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Screen />
    </AppProvider>
  );
}
