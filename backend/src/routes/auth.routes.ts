import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { rateLimit } from 'express-rate-limit';
import config from '../config/env';

const router = Router();
const authController = new AuthController();

// Per-IP rate limiter for auth endpoints (stricter limits)
const authLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  // Each IP address gets its own limit - more robust IP detection
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  // Skip rate limiting for localhost in development
  skip: (req) => {
    const ip = req.ip || req.socket.remoteAddress;
    const skipIPs = ['127.0.0.1', '::1', 'localhost'];
    return config.NODE_ENV === 'development' && skipIPs.includes(ip || '');
  },
  handler: (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    // Log auth rate limiting for security monitoring
    console.warn(`🛡️  Auth rate limit exceeded for IP: ${ip} on ${req.path} - Potential brute force attack`);
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts from this IP. Please try again later.',
      retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000 / 60) // minutes
    });
  },
});

// Public routes
router.post('/register', authLimiter, (req, res, next) => 
  authController.register(req, res, next)
);

router.post('/login', authLimiter, (req, res, next) => 
  authController.login(req, res, next)
);

router.post('/logout', (req, res) => 
  authController.logout(req, res)
);

router.post('/forgot-password', authLimiter, (req, res, next) => 
  authController.forgotPassword(req, res, next)
);

router.post('/reset-password', authLimiter, (req, res, next) => 
  authController.resetPassword(req, res, next)
);

// OAuth routes
router.get('/google/url', (req, res, next) => 
  authController.getGoogleAuthUrl(req, res, next)
);

router.get('/google/callback', (req, res, next) => 
  authController.handleGoogleCallback(req, res, next)
);

// Protected route
router.get('/me', (req, res, next) => 
  authController.getCurrentUser(req, res, next)
);

export default router;
