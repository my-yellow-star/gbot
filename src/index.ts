import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { chatRoutes } from './routes/chat';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

const app: express.Application = express();
const PORT = process.env.PORT || 5001;

// 미들웨어 설정
app.use(helmet());
app.use(cors({ origin: ['*'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 로깅 미들웨어
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - ${req.ip}`);
    next();
});

// 라우트 설정
app.use('/api/chat', chatRoutes);

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 정보 표시
app.get('/info', (req, res) => {
    res.json({
        message: 'Seoyoon Chatbot Server is running!',
        version: '1.0.0',
        endpoints: {
            chat: '/api/chat',
            health: '/health'
        }
    });
});

// 스태틱 페이지 라우트
app.use('/', express.static('client'));

// 에러 핸들링 미들웨어
app.use(errorHandler);

// 404 핸들러
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// 서버 시작
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app; 