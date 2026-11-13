export function normalizePhone(value) {
  const raw = String(value).trim();
  if (!/^[+\d\s().-]+$/.test(raw)) throw new Error('Enter a valid mobile number.');
  const digits = raw.replace(/\D/g, '');
  const phone = raw.startsWith('+') ? '+' + digits : digits.length === 10 ? '+1' + digits : digits.length === 11 && digits[0] === '1' ? '+' + digits : '';
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter your mobile number with its country code, such as +1.');
  return phone;
}
export function createPhoneAuth({ client, captcha, linking = false, now = Date.now }) {
  let pending = null, nextSend = 0, busy = false;
  return {
    remaining: () => Math.max(0, Math.ceil((nextSend - now()) / 1000)),
    async send(value, createAccount = false) {
      if (busy) throw new Error('Please wait for the current request.');
      if (now() < nextSend) throw new Error('Wait a moment before requesting another code.');
      const phone = normalizePhone(value);
      const captchaToken = captcha?.getToken();
      if (!linking && captcha?.enabled && !captchaToken) throw new Error('Complete the security check first.');
      busy = true;
      try {
        let userId = null;
        if (linking) {
          const { data, error } = await client.auth.getUser();
          if (error || !data.user) throw new Error('Sign in with your existing account before linking a number.');
          userId = data.user.id;
        }
        const result = linking
          ? await client.auth.updateUser({ phone })
          : await client.auth.signInWithOtp({ phone, options: { shouldCreateUser: createAccount, captchaToken } });
        if (result.error) throw result.error;
        pending = { phone, userId };
        nextSend = now() + 60_000;
        return phone;
      } finally { busy = false; captcha?.reset(); }
    },
    async verify(value) {
      if (busy) throw new Error('Please wait for the current request.');
      if (!pending) throw new Error('Request a code first.');
      const token = String(value).replace(/\s/g, '');
      if (!/^\d{6}$/.test(token)) throw new Error('Enter the 6-digit code from your text.');
      busy = true;
      try {
        if (linking) {
          const { data, error } = await client.auth.getUser();
          if (error || data.user?.id !== pending.userId) throw new Error('Your account changed. Sign in again before linking your number.');
        }
        const result = await client.auth.verifyOtp({ phone: pending.phone, token, type: linking ? 'phone_change' : 'sms' });
        if (result.error) throw result.error;
        pending = null;
        return result.data;
      } finally { busy = false; }
    }
  };
}
export async function mountPhoneAuth(host, { getClient, getCaptcha, onSuccess = () => {}, linking = false, beforeSend = async () => {} }) {
  if (!host || window.DRESSUP_CONFIG?.smsLoginEnabled !== true) return;
  host.hidden = false;
  host.classList.add('sms-auth');
  host.innerHTML = `<h3>${linking ? 'Add text login to this account.' : 'Continue with a text.'}</h3>
    <form data-send><label>Mobile number<input type="tel" autocomplete="tel" inputmode="tel" placeholder="(206) 555-0123" required data-phone></label>
    ${linking ? '<p>Your drafts, credits and membership stay on this account.</p>' : '<label class="sms-new"><input type="checkbox" data-new> I’m new here—create my free Studio account.</label><p class="small">Already signed up by email? Use email once, then add text login in your account to keep your work and membership.</p>'}
    <button class="primary" type="submit" data-send-button>${linking ? 'Text me a linking code' : 'Text me a code'}</button>
    <p class="small">We’ll text a sign-in code to this number. This does not sign you up for marketing texts. Message and data rates may apply.</p></form>
    <form data-verify hidden><label>6-digit code<input type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required data-code></label><button class="primary" type="submit" data-verify-button>${linking ? 'Verify number' : 'Verify & continue'}</button></form>
    <p role="status" aria-live="polite" data-status></p>`;
  const q = s => host.querySelector(s), status = text => { q('[data-status]').textContent = text; };
  let controller, interval;
  const getController = async () => controller ||= createPhoneAuth({ client: await getClient(), captcha: getCaptcha?.(), linking });
  q('[data-send]').addEventListener('submit', async event => {
    event.preventDefault(); q('[data-send-button]').disabled = true;
    try {
      await beforeSend();
      const c = await getController(), phone = await c.send(q('[data-phone]').value, !!q('[data-new]')?.checked);
      q('[data-verify]').hidden = false; q('[data-code]').value = ''; q('[data-code]').focus();
      status(`Code sent to ${phone}. Enter it here to continue.`);
      clearInterval(interval);
      interval = setInterval(() => { const remaining = c.remaining(); q('[data-send-button]').disabled = remaining > 0; q('[data-send-button]').textContent = remaining ? `Resend in ${remaining}s` : 'Send another code'; if (!remaining) clearInterval(interval); }, 1000);
    } catch (error) { status(error.message); q('[data-send-button]').disabled = false; }
  });
  q('[data-verify]').addEventListener('submit', async event => {
    event.preventDefault(); q('[data-verify-button]').disabled = true;
    try {
      await (await getController()).verify(q('[data-code]').value);
      clearInterval(interval); q('[data-code]').value = ''; q('[data-verify]').hidden = true;
      q('[data-send-button]').disabled = false; q('[data-send-button]').textContent = linking ? 'Text me a linking code' : 'Text me a code';
      status(linking ? 'Text login is linked to this account.' : 'Signed in. Continuing your item…');
      await onSuccess();
    } catch (error) { status(error.message); }
    finally { q('[data-verify-button]').disabled = false; }
  });
}
