import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = 'cf-turnstile-script';

export function TurnstileWidget({
  siteKey,
  resetSignal,
  onTokenChange
}: {
  siteKey: string;
  resetSignal: number;
  onTokenChange: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!siteKey) {
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) {
        setLoaded(true);
      } else {
        existing.addEventListener('load', () => setLoaded(true), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, [siteKey]);

  useEffect(() => {
    if (!loaded || !siteKey || !containerRef.current || !window.turnstile || widgetIdRef.current) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onTokenChange(token),
      'expired-callback': () => onTokenChange(''),
      'error-callback': () => onTokenChange('')
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [loaded, onTokenChange, siteKey]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) {
      return;
    }

    onTokenChange('');
    window.turnstile.reset(widgetIdRef.current);
  }, [onTokenChange, resetSignal]);

  if (!siteKey) {
    return <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">Missing VITE_CF_TURNSTILE_SITE_KEY.</p>;
  }

  return <div ref={containerRef} className="min-h-[65px]" />;
}
