import { useState } from 'react';
import { Logo } from './ui.jsx';

const initialForm = {
  fullName: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [busy, setBusy] = useState(false);

  const isRegistration = mode === 'register';
  const update = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    if (!event.currentTarget.reportValidity()) return;
    if (isRegistration && form.password !== form.confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const credentials = Object.fromEntries(
        Object.entries(form).filter(([key]) => key !== 'confirmPassword'),
      );
      const result = isRegistration
        ? await window.bulkMail.auth.register(credentials)
        : await window.bulkMail.auth.login(credentials);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      if (isRegistration) {
        setForm({ ...initialForm, username: form.username });
        setMode('login');
        setMessageType('success');
        setMessage(
          `Account created with ${result.user.role.replaceAll('_', ' ')} access. Sign in to continue.`,
        );
        return;
      }
      onAuthenticated(result.user);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The request could not be completed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 sm:px-8">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/40 lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 p-10 lg:flex">
          <div>
            <Logo />
            <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">
              Bulk Mail Sender
            </p>
          </div>
          <div>
            <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
              Thoughtful email campaigns start here.
            </h1>
            <p className="mt-4 max-w-md leading-7 text-indigo-100/80">
              A private desktop workspace for organizing contacts and managing
              permission-based email campaigns.
            </p>
          </div>
          <p className="text-sm text-indigo-200/70">
            Your workspace data stays on this device.
          </p>
        </aside>

        <div className="p-6 sm:p-10 lg:p-12">
          <div className="lg:hidden">
            <Logo />
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-300">
            {isRegistration ? 'Create workspace access' : 'Secure workspace'}
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {isRegistration ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {isRegistration
              ? 'Create an account to begin setting up your local workspace.'
              : 'Sign in to continue to your email campaign workspace.'}
          </p>

          <form className="mt-8" onSubmit={submit}>
            {isRegistration && (
              <>
                <label
                  className="block text-sm font-medium text-slate-300"
                  htmlFor="fullName"
                >
                  Full name
                </label>
                <input
                  id="fullName"
                  className={inputClass}
                  name="fullName"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                  value={form.fullName}
                  onChange={update}
                />
                <label
                  className="mt-4 block text-sm font-medium text-slate-300"
                  htmlFor="email"
                >
                  Email address
                </label>
                <input
                  id="email"
                  className={inputClass}
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={form.email}
                  onChange={update}
                />
              </>
            )}

            <label
              className={`${isRegistration ? 'mt-4' : ''} block text-sm font-medium text-slate-300`}
              htmlFor="username"
            >
              Username
            </label>
            <input
              id="username"
              className={inputClass}
              name="username"
              autoComplete="username"
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9._-]+"
              required
              value={form.username}
              onChange={update}
            />

            <label
              className="mt-5 block text-sm font-medium text-slate-300"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              className={inputClass}
              name="password"
              type="password"
              autoComplete={
                isRegistration ? 'new-password' : 'current-password'
              }
              minLength={isRegistration ? 12 : undefined}
              maxLength={128}
              required
              value={form.password}
              onChange={update}
            />

            {isRegistration && (
              <>
                <p className="mt-2 text-xs text-slate-500">
                  Use at least 12 characters with mixed case and a symbol.
                </p>
                <label
                  className="mt-4 block text-sm font-medium text-slate-300"
                  htmlFor="confirmPassword"
                >
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  className={inputClass}
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={form.confirmPassword}
                  onChange={update}
                />
              </>
            )}

            <p
              className={`mt-4 min-h-5 text-sm ${messageType === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
            <button
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-400/30 disabled:cursor-wait disabled:opacity-60"
              type="submit"
              disabled={busy}
            >
              {busy
                ? 'Please wait…'
                : isRegistration
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-400">
            {isRegistration
              ? 'Already have an account?'
              : 'New to Bulk Mail Sender?'}
            <button
              className="ml-1 font-semibold text-indigo-300 hover:text-indigo-200"
              type="button"
              onClick={() => {
                setMode(isRegistration ? 'login' : 'register');
                setMessage('');
                setMessageType('error');
              }}
            >
              {isRegistration ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <p className="mt-8 border-t border-slate-800 pt-5 text-center text-xs leading-5 text-slate-500">
            The first account created on this device becomes the super
            administrator. New self-registered accounts have viewer access.
          </p>
        </div>
      </section>
    </main>
  );
}
