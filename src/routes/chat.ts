import { Router, Request, Response } from 'express';
import { conversationService } from '../services/v1/conversation';
import { logger } from '../utils/logger';

const router: Router = Router();

// 새로운 대화 세션 시작
router.post('/session', async (req: Request, res: Response) => {
    try {
        const { userId } = req.body;

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({
                error: 'User ID is required and must be a string'
            });
        }

        const sessionId = conversationService.createSession(userId);

        return res.json({
            sessionId,
            message: '서윤과의 새로운 대화가 시작되었습니다.',
            affinity: 0,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error creating chat session', error);
        return res.status(500).json({
            error: 'Failed to create chat session'
        });
    }
});

// 서윤과 대화하기
router.post('/message', async (req: Request, res: Response) => {
    try {
        const { sessionId, userId, message } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Message is required and must be a string'
            });
        }

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({
                error: 'User ID is required and must be a string'
            });
        }

        // sessionId가 없으면 새로 생성
        let actualSessionId = sessionId;
        if (!sessionId) {
            actualSessionId = conversationService.createSession(userId);
        }

        const response = await conversationService.processMessage({
            sessionId: actualSessionId,
            userId,
            message
        });

        return res.json({
            ...response,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error in chat message endpoint', error);
        return res.status(500).json({
            error: 'Failed to process message'
        });
    }
});

// 대화 내역 조회
router.get('/history/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json({
                error: 'Session ID is required'
            });
        }

        const history = conversationService.getConversationHistory(sessionId);
        const currentAffinity = conversationService.getCurrentAffinity(sessionId);

        return res.json({
            sessionId,
            messages: history,
            currentAffinity,
            messageCount: history.length
        });

    } catch (error) {
        logger.error('Error getting conversation history', error);
        return res.status(500).json({
            error: 'Failed to get conversation history'
        });
    }
});

// 사용자의 모든 세션 조회
router.get('/sessions/:userId', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                error: 'User ID is required'
            });
        }

        const sessions = conversationService.getUserSessions(userId);

        return res.json({
            userId,
            sessions: sessions.map(session => ({
                sessionId: session.sessionId,
                messageCount: session.messages.length,
                currentAffinity: session.currentAffinity,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                lastMessage: session.messages[session.messages.length - 1]?.content || null
            })),
            totalSessions: sessions.length
        });

    } catch (error) {
        logger.error('Error getting user sessions', error);
        return res.status(500).json({
            error: 'Failed to get user sessions'
        });
    }
});

// 현재 호감도 조회
router.get('/affinity/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json({
                error: 'Session ID is required'
            });
        }

        const affinity = conversationService.getCurrentAffinity(sessionId);
        const session = conversationService.getSession(sessionId);

        if (!session) {
            return res.status(404).json({
                error: 'Session not found'
            });
        }

        return res.json({
            sessionId,
            currentAffinity: affinity,
            affinityLevel: getAffinityLevel(affinity),
            lastUpdated: session.updatedAt
        });

    } catch (error) {
        logger.error('Error getting affinity', error);
        return res.status(500).json({
            error: 'Failed to get affinity'
        });
    }
});

// 세션 삭제
router.delete('/session/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json({
                error: 'Session ID is required'
            });
        }

        const deleted = conversationService.deleteSession(sessionId);

        if (!deleted) {
            return res.status(404).json({
                error: 'Session not found'
            });
        }

        return res.json({
            message: 'Session deleted successfully',
            sessionId
        });

    } catch (error) {
        logger.error('Error deleting session', error);
        return res.status(500).json({
            error: 'Failed to delete session'
        });
    }
});

// 호감도 레벨 계산 헬퍼 함수
function getAffinityLevel(affinity: number): string {
    if (affinity <= -50) return '매우 차가움';
    if (affinity <= -1) return '차가움';
    if (affinity <= 29) return '무관심';
    if (affinity <= 59) return '관심';
    if (affinity <= 89) return '호감';
    return '매우 호감';
}

export { router as chatRoutes }; 