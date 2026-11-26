import './index.css';
import { mountWorkspace } from './renderer/workspace.js';

const app = document.querySelector('#app');
const authApi = window.bulkMail?.auth;

const logo = `
  <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/50">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" class="h-6 w-6">
      <path d="M3.75 6.75h16.5v10.5H3.75z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="m4.5 7.5 7.5 6 7.5-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
`;

const loginFields = `
  <label class="block text-sm font-medium text-slate-300" for="username">Username</label>
  <input id="username" name="username" required minlength="3" maxlength="30" autocomplete="username" class="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10" placeholder="Enter your username" />
  <label class="mt-5 block text-sm font-medium text-slate-300" for="password">Password</label>
  <div class="relative mt-2">
    <input id="password" name="password" type="password" required maxlength="128" autocomplete="current-password" class="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-20 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10" placeholder="Enter your password" />
    <button class="absolute inset-y-0 right-3 my-auto h-9 px-2 text-sm font-medium text-slate-400 hover:text-white" type="button" data-password-toggle="password">Show</button>
  </div>
`;

const registrationFields = `
  <label class="block text-sm font-medium text-slate-300" for="fullName">Full name</label>
  <input id="fullName" name="fullName" required minlength="2" maxlength="100" autocomplete="name" class="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10" placeholder="Your name" />
  <label class="mt-4 block text-sm font-medium text-slate-300" for="username">Username</label>
  <input id="username" name="username" required minlength="3" maxlength="30" pattern="[A-Za-z0-9._-]+" autocomplete="username" class="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10" placeholder="Choose a username" />
  <label class="mt-4 block text-sm font-medium text-slate-300" for="email">Email address</label>
  <input id="email" name="email" type="email" required maxlength="254" autocomplete="email" class="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10" placeholder="name@example.com" />
  <label class="mt-4 block text-sm font-medium text-slate-300" for="password">Password</label>
  <div class="relative mt-2">
    <input id="password" name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" class="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-20 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10" placeholder="12+ characters, mixed case and a symbol" />
    <button class="absolute inset-y-0 right-3 my-auto h-9 px-2 text-sm font-medium text-slate-400 hover:text-white" type="button" data-password-toggle="password">Show</button>
  </div>
  <label class="mt-4 block text-sm font-medium text-slate-300" for="confirmPassword">Confirm password</label>
  <div class="relative mt-2">
    <input id="confirmPassword" name="confirmPassword" type="password" required minlength="12" maxlength="128" autocomplete="new-password" class="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-20 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10" placeholder="Enter the password again" />
    <button class="absolute inset-y-0 right-3 my-auto h-9 px-2 text-sm font-medium text-slate-400 hover:text-white" type="button" data-password-toggle="confirmPassword">Show</button>
  </div>
`;

function showMessage(message, type = 'error') {
  const element = document.querySelector('#form-message');
  if (!element) return;

  element.textContent = message;
  element.className =
    type === 'success'
      ? 'mt-4 min-h-5 text-sm text-emerald-300'
      : 'mt-4 min-h-5 text-sm text-rose-300';
}

function renderAuth(
  mode,
  { username = '', notice = '', noticeType = 'success' } = {},
) {
  const isRegistration = mode === 'register';

  app.innerHTML = `
    <main class="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
      <section class="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/40 lg:grid-cols-[1.05fr_0.95fr]">
        <aside class="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 p-10 lg:flex">
          <div>${logo}<p class="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">Bulk Mail Sender</p></div>
          <div>
            <h1 class="max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">Thoughtful email campaigns start here.</h1>
            <p class="mt-4 max-w-md leading-7 text-indigo-100/80">A private desktop workspace for organizing contacts and managing permission-based email campaigns.</p>
          </div>
          <p class="text-sm text-indigo-200/70">Your workspace data stays on this device.</p>
        </aside>
        <div class="p-6 sm:p-10 lg:p-12">
          <div class="lg:hidden">${logo}</div>
          <p class="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-300">${isRegistration ? 'Create workspace access' : 'Secure workspace'}</p>
          <h2 class="mt-2 text-3xl font-semibold tracking-tight text-white">${isRegistration ? 'Create your account' : 'Welcome back'}</h2>
          <p class="mt-2 text-sm leading-6 text-slate-400">${isRegistration ? 'Create an account to begin setting up your local workspace.' : 'Sign in to continue to your email campaign workspace.'}</p>
          <form id="auth-form" class="mt-8" novalidate>
            ${isRegistration ? registrationFields : loginFields}
            <p id="form-message" class="mt-4 min-h-5 text-sm" role="status" aria-live="polite"></p>
            <button id="submit-button" class="mt-3 flex w-full items-center justify-center rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-400/30 disabled:cursor-wait disabled:opacity-60" type="submit">${isRegistration ? 'Create account' : 'Sign in'}</button>
          </form>
          <p class="mt-7 text-center text-sm text-slate-400">
            ${isRegistration ? 'Already have an account?' : 'New to Bulk Mail Sender?'}
            <button class="ml-1 font-semibold text-indigo-300 hover:text-indigo-200" id="mode-toggle" type="button">${isRegistration ? 'Sign in' : 'Create an account'}</button>
          </p>
          <p class="mt-8 border-t border-slate-800 pt-5 text-center text-xs leading-5 text-slate-500">The first account created on this device becomes the super administrator. New self-registered accounts have viewer access.</p>
        </div>
      </section>
    </main>
  `;

  const usernameInput = document.querySelector('#username');
  if (usernameInput) usernameInput.value = username;
  if (notice) showMessage(notice, noticeType);

  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      const showing = input.type === 'password';
      input.type = showing ? 'text' : 'password';
      button.textContent = showing ? 'Hide' : 'Show';
      button.setAttribute(
        'aria-label',
        `${showing ? 'Hide' : 'Show'} password`,
      );
    });
  });

  document.querySelector('#mode-toggle').addEventListener('click', () => {
    const currentUsername = document.querySelector('#username')?.value ?? '';
    renderAuth(isRegistration ? 'login' : 'register', {
      username: currentUsername,
    });
  });

  document
    .querySelector('#auth-form')
    .addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());

      if (!form.reportValidity()) return;

      if (isRegistration && values.password !== values.confirmPassword) {
        showMessage('Passwords do not match.');
        return;
      }

      const submitButton = document.querySelector('#submit-button');
      submitButton.disabled = true;
      submitButton.textContent = isRegistration
        ? 'Creating account…'
        : 'Signing in…';

      try {
        if (isRegistration) {
          const result = await authApi.register(values);
          if (!result.ok) {
            showMessage(result.error);
            return;
          }

          renderAuth('login', {
            username: values.username,
            notice: `Account created with ${result.user.role.replace('_', ' ')} access. Sign in to continue.`,
          });
          return;
        }

        const result = await authApi.login(values);
        if (!result.ok) {
          showMessage(result.error);
          return;
        }
        renderWorkspace(result.user);
      } catch (error) {
        showMessage(
          error instanceof Error
            ? error.message
            : 'The request could not be completed. Please try again.',
        );
      } finally {
        if (submitButton.isConnected) {
          submitButton.disabled = false;
          submitButton.textContent = isRegistration
            ? 'Create account'
            : 'Sign in';
        }
      }
    });
}

function renderWorkspace(user) {
  mountWorkspace(app, user, authApi);
}

async function start() {
  if (!app || !authApi) {
    throw new Error('The secure application bridge is unavailable.');
  }

  const session = await authApi.currentUser();
  if (session.user) {
    renderWorkspace(session.user);
  } else {
    renderAuth('login');
  }
}

start().catch((error) => {
  console.error('Could not initialize the application UI.', error);
  if (app) {
    app.textContent = 'The application could not start. Please restart it.';
  }
});
