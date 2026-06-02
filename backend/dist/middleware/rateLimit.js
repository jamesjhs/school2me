export const createRateLimiter = ({ windowMs, maxRequests }) => {
    const hits = new Map();
    return (req, res, next) => {
        const key = req.ip || 'unknown';
        const now = Date.now();
        const entry = hits.get(key);
        if (!entry || now - entry.windowStart >= windowMs) {
            hits.set(key, { count: 1, windowStart: now });
            return next();
        }
        if (entry.count >= maxRequests) {
            return res.status(429).json({ error: 'Too many requests' });
        }
        entry.count += 1;
        hits.set(key, entry);
        return next();
    };
};
//# sourceMappingURL=rateLimit.js.map