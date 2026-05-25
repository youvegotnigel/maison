import type { JwtPayload } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | null;
      tokenInvalid?: boolean;
    }
  }
}

export {};