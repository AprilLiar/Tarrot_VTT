import { Component } from 'react';
import { useT } from '../i18n.jsx';

function CrashMessage() {
  const t = useT();
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center" role="alert" data-testid="crash-screen">
      <p className="text-lg font-semibold">{t('Something went wrong.')}</p>
      <p className="max-w-sm text-sm opacity-70">{t('This page stopped working. Reloading it usually helps; nothing you saved is lost.')}</p>
      <button className="min-h-11 rounded-lg bg-violet-700 px-5 text-sm font-medium active:bg-violet-600" data-testid="crash-reload" onClick={() => window.location.reload()}>
        {t('Reload')}
      </button>
    </main>
  );
}

// A safety net around the app: a page that throws while drawing shows a Reload button instead of a blank screen, so anyone at the table
// can recover without help. (React needs a class for this.)
export class CrashScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('A page failed', error);
  }

  render() {
    return this.state.failed ? <CrashMessage /> : this.props.children;
  }
}
