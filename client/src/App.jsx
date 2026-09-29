import { AppProvider, useApp } from './AppContext.jsx';
import Picker from './components/Picker.jsx';
import Shell from './components/Shell.jsx';
import Roster from './components/Roster.jsx';
import PlayerHome from './components/PlayerHome.jsx';

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

  return <Shell>{identity.role === 'gm' ? <Roster /> : <PlayerHome />}</Shell>;
}

export default function App() {
  return (
    <AppProvider>
      <Screen />
    </AppProvider>
  );
}
