import express, { Application, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import config from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';

/**
 * Express Application Setup
 * 
 * This class configures the Express app with:
 * - Security middleware (Helmet, CORS)
 * - Request tracking
 * - Rate limiting (per-IP)
 * - Body parsing
 * - Authentication routes
 * - Error handling
 * 
 * Middleware execution order is critical - do not reorder!
 */
class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize all middleware in correct order
   * ORDER MATTERS: Each middleware processes the request before passing to next
   */
  private initializeMiddlewares(): void {
    // Request ID tracking
    this.app.use(requestIdMiddleware);

    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10kb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10kb' }));

    // Cookie parser
    this.app.use(cookieParser());

    // Trust proxy (important for rate limiting behind reverse proxy)
    this.app.set('trust proxy', 1);

    // Per-IP rate limiter (each IP gets separate quota)
    this.app.use(rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: process.env.NODE_ENV === 'production' ? config.STRICT_RATE_LIMIT_MAX_REQUESTS : config.RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: true,
      legacyHeaders: false,
      // Each IP address gets its own limit
      keyGenerator: (req) => {
        // Use forwarded IP if behind proxy, fallback to connection IP
        return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
      },
      // Skip rate limiting for certain IPs (like health check services)
      skip: (req) => {
        const ip = req.ip || req.socket.remoteAddress;
        const skipIPs = ['127.0.0.1', '::1', 'localhost'];
        return config.NODE_ENV === 'development' && skipIPs.includes(ip || '');
      },
      handler: (req, res) => {
        const ip = req.ip || req.socket.remoteAddress;
        console.warn(`🚫 Rate limit exceeded for IP: ${ip} on ${req.path}`);
        res.status(429).json({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP. Please try again later.',
          retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000 / 60) // minutes
        });
      },
    }));
  }

  private initializeRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
      });
    });

    // API routes
    this.app.use('/auth', authRoutes);

    // 404 handler
    this.app.use(notFoundHandler);
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public listen(): void {
    this.app.listen(config.PORT, () => {
      console.log(`🚀 Server running on port ${config.PORT}`);
      console.log(`📝 Environment: ${config.NODE_ENV}`);
      console.log(`🔗 Frontend URL: ${config.FRONTEND_URL}`);
    });
  }
}

export default App;
