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
            console.warn('Turnstile verification returned non-OK response', {
                status: response.status,
                statusText: response.statusText,
                remoteIp: remoteIp ?? null
            });
            return false;
        }
        const data = (await response.json());
        if (data.success !== true) {
            console.warn('Turnstile verification rejected token', {
                remoteIp: remoteIp ?? null,
                errorCodes: data['error-codes'] ?? []
            });
        }
        return data.success === true;
    }
    catch (error) {
        console.error('Turnstile verification request failed', {
            remoteIp: remoteIp ?? null,
            message: error instanceof Error ? error.message : String(error)
        });
        return false;
    }
};
//# sourceMappingURL=turnstile.js.map