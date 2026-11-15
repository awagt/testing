/* auth.js — sign-in, session restore, PIN change, sign-out */
const Auth = (() => {
  const KEY = 'idh.session';
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const clear = () => { try { localStorage.removeItem(KEY); } catch (e) {} };

  function apply(d) {
    API.setToken(d.token);
    App.state.user = d.user; App.state.perms = d.perms; App.state.mustChangePIN = d.mustChangePIN;
  }

  async function restore() {
    const s = load();
    if (!s || !s.token) return false;
    API.setToken(s.token);
    try {
      const me = await API.call('me');
      apply({ token: s.token, user: me.user, perms: me.perms, mustChangePIN: me.mustChangePIN });
      return true;
    } catch (e) { clear(); API.setToken(null); return false; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const err = document.getElementById('login-error'), btn = document.getElementById('login-btn');
      err.classList.add('hidden');
      const username = form.username.value.trim(), pin = form.pin.value;
      await App.withBusy(btn, async () => {
        try {
          const d = await API.call('login', { username, pin });
          apply(d); save({ token: d.token });
          form.pin.value = '';
          App.enter();
        } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
      });
    });
    document.getElementById('logout-btn').onclick = logout;
    document.getElementById('pin-btn').onclick = () => changePinModal(false);
  });

  async function logout() {
    try { await API.call('logout'); } catch (e) {}
    clear(); API.setToken(null); location.hash = ''; location.reload();
  }

  let expiring = false;
  function expired() {
    if (expiring) return; expiring = true;
    clear(); API.setToken(null);
    App.toast('Your session expired. Please sign in again.', 'err');
    setTimeout(() => { location.hash = ''; location.reload(); }, 1400);
  }

  function changePinModal(forced) {
    App.openModal({
      title: forced ? 'Set your new PIN' : 'Change PIN',
      sub: forced ? 'For security, replace the temporary PIN you were given before continuing.' : 'Use at least 4 characters. Avoid repeated or sequential digits.',
      locked: forced,
      body: App.field('Current PIN', '<input class="input" type="password" name="currentPin" autocomplete="current-password">', { req: true }) +
            App.field('New PIN', '<input class="input" type="password" name="newPin" autocomplete="new-password" inputmode="numeric">', { req: true }) +
            App.field('Confirm new PIN', '<input class="input" type="password" name="confirm" autocomplete="new-password" inputmode="numeric">', { req: true }),
      actions: (forced ? [] : [{ label: 'Cancel' }]).concat([{ label: 'Save PIN', cls: 'btn-primary', onClick: async m => {
        const f = App.formData(m);
        if (f.newPin.length < 4) { App.toast('New PIN must be at least 4 characters', 'err'); return false; }
        if (f.newPin !== f.confirm) { App.toast('PINs do not match', 'err'); return false; }
        await API.call('changePin', { currentPin: f.currentPin, newPin: f.newPin }, { write: true });
        App.state.mustChangePIN = false; App.toast('PIN updated');
      } }])
    });
  }
  return { restore, logout, expired, changePinModal };
})();
