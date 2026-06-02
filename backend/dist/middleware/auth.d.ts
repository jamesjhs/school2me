import { NextFunction, Request, Response } from 'express';
import { SessionUser } from '../types/index.js';
declare global {
    namespace Express {
        interface Request {
            user?: SessionUser;
            isAdmin?: boolean;
        }
    }
}
export declare const requireUserSession: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const requireAdminSession: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map