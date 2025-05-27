import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface CustomError extends Error {
    statusCode?: number;
    code?: string;
}

export const errorHandler = (
    err: CustomError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    logger.error(`Error occurred: ${err.message}`, err);

    // 기본 에러 상태 코드
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // OpenAI API 에러 처리
    if (err.message?.includes('OpenAI')) {
        statusCode = 503;
        message = 'AI service is temporarily unavailable';
    }

    // Pinecone 에러 처리
    if (err.message?.includes('Pinecone')) {
        statusCode = 503;
        message = 'Vector database service is temporarily unavailable';
    }

    // 유효성 검사 에러
    if (err.message?.includes('validation')) {
        statusCode = 400;
    }

    // 인증 에러
    if (err.message?.includes('unauthorized') || err.message?.includes('authentication')) {
        statusCode = 401;
        message = 'Authentication required';
    }

    res.status(statusCode).json({
        error: {
            message,
            status: statusCode,
            timestamp: new Date().toISOString(),
            path: req.path
        }
    });
}; 