import { useEffect, useRef, useState } from 'react';
import AuthScreen from './AuthScreen.jsx';
import Workspace from './Workspace.jsx';
import { ToastContext } from './ui.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [toast, setToast] = useState(null);
  const toastId = useRef(0);

  const showToast = (message, type = 'success') => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, type });
  };

  useEffect(() => {
    let active = true;
    const auth = window.bulkMail?.auth;
    if (!auth) {
      setStartupError('The secure application bridge is unavailable.');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    auth
      .currentUser()
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        if (active) setUser(result.user);
      })
      .catch((error) => {
        if (active) {
          setStartupError(
            error instanceof Error
              ? error.message
              : 'The application could not start.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    const timer = setInterval(() => {
      window.bulkMail.auth
        .currentUser()
        .then((result) => {
          if (active && result.ok) setUser(result.user);
        })
        .catch(() => {});
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [signedIn]);

  const handleSignOut = async () => {
    const result = await window.bulkMail.auth.logout();
    if (!result.ok) throw new Error(result.error || 'Could not sign out.');
    setUser(null);
  };

  return (
    <ToastContext.Provider value={showToast}>
      {loading ? (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
          Loading your workspace…
        </main>
      ) : startupError ? (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <section className="max-w-lg rounded-2xl border border-rose-200 bg-white p-6">
            <h1 className="font-semibold text-rose-700">
              Application startup failed
            </h1>
            <p className="mt-2 text-sm text-slate-600">{startupError}</p>
            <button
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => window.location.reload()}
              type="button"
            >
              Retry connection
            </button>
          </section>
        </main>
      ) : user ? (
        <Workspace user={user} onSignOut={handleSignOut} />
      ) : (
        <AuthScreen onAuthenticated={setUser} />
      )}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-xl ${toast.type === 'error' ? 'border-rose-200 text-rose-700' : 'border-emerald-200 text-emerald-700'}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
