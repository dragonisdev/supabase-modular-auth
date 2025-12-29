import express, { Application, Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import config from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import { csrfProtection } from "./middleware/csrf.middleware.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import * as SecurityLogger from "./utils/logger.js";

/**
 * Express Application Setup
 *
 * This class configures the Express app with:
 * - Security middleware (Helmet, CORS)
 * - Request tracking and timeout
 * - Rate limiting (per-IP)
 * - Body parsing with size limits
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
    // Request ID tracking - first, so all logs have correlation ID
    this.app.use(requestIdMiddleware);

    // Request timeout to prevent slow loris attacks
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.setTimeout(config.REQUEST_TIMEOUT_MS, () => {
        SecurityLogger.logSecurityEvent("REQUEST_TIMEOUT", req);
        res.status(408).json({
          success: false,
          error: "REQUEST_TIMEOUT",
          message: "Request timeout",
        });
      });
      next();
    });

    // Security headers with strict configuration
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            ...(config.NODE_ENV === "production" && { upgradeInsecureRequests: [] }),
          },
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: { policy: "same-origin" },
        crossOriginResourcePolicy: { policy: "same-origin" },
        dnsPrefetchControl: { allow: false },
        hsts: {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        },
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: { permittedPolicies: "none" },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        xssFilter: true,
      }),
    );

    // Additional security headers not covered by Helmet
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      // Prevent caching of sensitive data
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");

      // Additional protections
      res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
      res.removeHeader("X-Powered-By"); // Already done by Helmet, but ensure

      next();
    });

    // CORS configuration - strict in production
    const allowedOrigins = [config.FRONTEND_URL];
    // Add backend URL if different (for OAuth callbacks)
    if (config.BACKEND_URL && config.BACKEND_URL !== config.FRONTEND_URL) {
      allowedOrigins.push(config.BACKEND_URL);
    }

    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps or Postman) in development only
          if (!origin) {
            if (config.NODE_ENV === "development") {
              return callback(null, true);
            }
            return callback(new Error("CORS: Origin required"));
          }

          if (allowedOrigins.includes(origin)) {
            return callback(null, true);
          }

          SecurityLogger.warn(`CORS rejected origin: ${origin}`);
          return callback(new Error("CORS: Not allowed"));
        },
        credentials: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-CSRF-Token"],
        exposedHeaders: ["X-Request-ID"],
        maxAge: 86400, // 24 hours - cache preflight requests
        optionsSuccessStatus: 204,
      }),
    );

    // Body parsing with strict size limits
    this.app.use(
      express.json({
        limit: config.MAX_REQUEST_SIZE,
        strict: true, // Only accept arrays and objects
      }),
    );
    this.app.use(
      express.urlencoded({
        extended: false, // Use simple algorithm for security
        limit: config.MAX_REQUEST_SIZE,
        parameterLimit: 10, // Limit number of parameters
      }),
    );

    // Cookie parser
    this.app.use(cookieParser());

    // CSRF protection (Double Submit Cookie pattern)
    // Must come after cookie parser
    this.app.use(csrfProtection);

    // Trust proxy configuration for correct IP detection
    // Be careful with this setting - see https://expressjs.com/en/guide/behind-proxies.html
    if (config.TRUST_PROXY !== false) {
      this.app.set("trust proxy", config.TRUST_PROXY);
    }

    // Per-IP rate limiter (each IP gets separate quota)
    const globalRateLimiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max:
        config.NODE_ENV === "production"
          ? config.STRICT_RATE_LIMIT_MAX_REQUESTS
          : config.RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: "draft-7", // Use RateLimit header standard
      legacyHeaders: false,
      // Each IP address gets its own limit - robust IP detection
      keyGenerator: (req) => {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        return ipKeyGenerator(ip);
      },
      // Skip rate limiting for health checks only (not localhost in dev)
      skip: (req) => {
        return req.path === "/health";
      },
      handler: (req, res) => {
        const ip = req.ip || req.socket.remoteAddress;
        SecurityLogger.logSecurityEvent("RATE_LIMIT_EXCEEDED", req, {
          path: req.path,
          ip,
        });
        res.status(429).json({
          success: false,
          error: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000 / 60),
        });
      },
    });

    this.app.use(globalRateLimiter);
  }

  private initializeRoutes(): void {
    // Health check - minimal info, no auth required
    this.app.get("/health", (_req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        message: "OK",
        timestamp: new Date().toISOString(),
      });
    });

    // API routes
    this.app.use("/auth", authRoutes);

    // 404 handler
    this.app.use(notFoundHandler);
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public listen(): void {
    const server = this.app.listen(config.PORT, () => {
      console.log(`🚀 Server running on port ${config.PORT}`);
      console.log(`📝 Environment: ${config.NODE_ENV}`);
      console.log(`🔗 Frontend URL: ${config.FRONTEND_URL}`);
      if (config.NODE_ENV === "production") {
        console.log("🔒 Production mode - strict security enabled");
      }
    });

    // Set server timeout
    server.timeout = config.REQUEST_TIMEOUT_MS;
    server.keepAliveTimeout = 65000; // Slightly higher than ALB's 60s
    server.headersTimeout = 66000; // Slightly higher than keepAlive
  }
}

export default App;
