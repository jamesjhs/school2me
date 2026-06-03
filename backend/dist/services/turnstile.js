import { env } from '../config/env.js';
export const verifyTurnstileToken = async (token, remoteIp) => {
    if (!token?.trim()) {
        return false;
    }
    try {
        const form = new URLSearchParams();
        form.set('secret', env.CF_TURNSTILE_SECRET_KEY);
        form.set('response', token);
        if (remoteIp) {
            form.set('remoteip', remoteIp);
        }
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: form
        });
        if (!response.ok) {
            return false;
        }
        const data = (await response.json());
        return data.success === true;
    }
    catch {
        return false;
    }
};
//# sourceMappingURL=turnstile.js.map