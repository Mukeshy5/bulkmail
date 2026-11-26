import { useEffect, useState } from 'react';
import { ArrowUpRight, Eye, EyeOff, Mail, ShieldCheck } from 'lucide-react';

const blank = {
  fullName: '',
  username: '',
  email: '',
  password: '',
  confirm: '',
  code: '',
  remember: false,
};

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(blank);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    window.bulkMail.auth
      .needsSetup()
      .then((result) => {
        if (active) setMode(result.needsSetup ? 'setup' : 'login');
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const setup = mode === 'setup';
  const reset = mode === 'reset';
  const title = setup
    ? 'Set up your workspace'
    : reset
      ? 'Reset your password'
      : 'Sign in';
  const text = (name) => ({
    value: form[name],
    onChange: (e) => setForm({ ...form, [name]: e.target.value }),
  });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (mode !== 'login' && form.confirm !== form.password) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await (setup
        ? window.bulkMail.auth.register(form)
        : reset
          ? window.bulkMail.workspace.resetPassword({
              code: form.code,
              password: form.password,
            })
          : window.bulkMail.auth.login(form));
      if (!result.ok) throw new Error(result.error);
      if (mode === 'login') {
        onAuthenticated(result.user);
        return;
      }
      setForm({ ...blank, username: setup ? form.username : '' });
      setMode('login');
      setMessage(
        setup
          ? 'Super Admin account created. Sign in to continue.'
          : 'Password reset. Sign in with your new password.',
      );
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <div className="auth-brand">
          <Mail size={23} /> Bulk Mail Sender Pro
        </div>
        <div>
          <h1>
            Your email campaigns.
            <br />
            One workspace.
          </h1>
          <p>
            Design emails, organize subscribers, and track campaign activity
            from your desktop.
          </p>
        </div>
        <div className="auth-foot">
          <ShieldCheck size={18} /> Local workspace · SQLite
        </div>
      </aside>
      <section className="auth-content">
        <div className="auth-brand auth-small-brand">
          <Mail size={23} /> Bulk Mail Sender Pro
        </div>
        {!mode ? (
          <p role="status">{error || 'Checking workspace setup…'}</p>
        ) : (
          <>
            <h2>{title}</h2>
            <p>
              {setup
                ? 'Create the first Super Admin account for this workspace.'
                : reset
                  ? 'Use a recovery code from your account settings or contact your workspace administrator.'
                  : 'Enter your workspace credentials.'}
            </p>
            <form className="auth-form" onSubmit={submit}>
              {setup && (
                <label>
                  Full name
                  <input
                    {...text('fullName')}
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                  />
                </label>
              )}
              {!reset && (
                <label>
                  {setup ? 'Username' : 'Username or email'}
                  <input
                    {...text('username')}
                    required
                    maxLength={setup ? 30 : 254}
                    minLength={setup ? 3 : 1}
                    autoComplete="username"
                  />
                </label>
              )}
              {setup && (
                <label>
                  Email address
                  <input
                    {...text('email')}
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                  />
                </label>
              )}
              {reset && (
                <label>
                  Recovery code
                  <input
                    {...text('code')}
                    required
                    minLength={32}
                    maxLength={32}
                    autoComplete="off"
                  />
                </label>
              )}
              <label>
                {reset ? 'New password' : 'Password'}
                <span className="auth-password">
                  <input
                    {...text('password')}
                    type={visible ? 'text' : 'password'}
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    minLength={mode === 'login' ? 1 : 12}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
              {mode !== 'login' && (
                <label>
                  Confirm password
                  <input
                    {...text('confirm')}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={72}
                  />
                </label>
              )}
              {mode === 'login' && (
                <div className="auth-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={form.remember}
                      onChange={(e) =>
                        setForm({ ...form, remember: e.target.checked })
                      }
                    />{' '}
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset');
                      setForm(blank);
                      setError('');
                      setMessage('');
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              {error && (
                <p role="alert" className="studio-error">
                  {error}
                </p>
              )}
              {message && <p role="status">{message}</p>}
              <button
                className="studio-button studio-primary auth-submit"
                disabled={busy}
              >
                {busy
                  ? 'Please wait…'
                  : setup
                    ? 'Create workspace'
                    : reset
                      ? 'Reset password'
                      : 'Sign in'}{' '}
                <ArrowUpRight size={18} />
              </button>
              {reset && (
                <button
                  className="studio-button"
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setForm(blank);
                    setError('');
                  }}
                >
                  Back to sign in
                </button>
              )}
            </form>
          </>
        )}
      </section>
    </main>
  );
}
