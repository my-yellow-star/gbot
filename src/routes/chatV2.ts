/**
 * V2 챗봇 API 라우터
 */

import { Router, Request, Response } from 'express';
import { chatbotService } from '../services/v2';
import { logger } from '../utils/logger';

const router: Router = Router();

/**
 * 새로운 대화 세션 시작
 */
router.post('/session', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        error: 'User ID is required and must be a string'
      });
    }

    const sessionId = chatbotService.createSession(userId);
    const session = chatbotService.getSession(sessionId);

    // V1 호환 응답 형식
    return res.json({
      sessionId,
      message: '새로운 대화가 시작되었습니다.',
      affinity: session ? Math.round(session.state.metrics.C * 100) : 15,
      emotionDetail: session ? {
        relationshipState: session.state.state,
        trustLevel: Math.round(session.state.metrics.T * 100),
        comfortLevel: Math.round(session.state.metrics.K * 100),
        affectionLevel: Math.round(session.state.metrics.A * 100),
        userEmotionValence: session.state.userEmotion.valence,
        userEmotionArousal: session.state.userEmotion.arousal,
        userTrust: session.state.userEmotion.trust,
        userAttraction: session.state.userEmotion.attraction,
        botEmotionValence: session.state.botEmotion.valence,
        botEmotionArousal: session.state.botEmotion.arousal,
        botTrust: session.state.botEmotion.trust,
        botAttraction: session.state.botEmotion.attraction,
      } : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('V2 세션 생성 오류', error);
    return res.status(500).json({
      error: 'Failed to create chat session'
    });
  }
});

/**
 * 메시지 전송
 */
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
      actualSessionId = chatbotService.createSession(userId);
    }

    const response = await chatbotService.processMessage(
      actualSessionId,
      userId,
      message
    );

    // V1 호환 응답 형식 반환
    return res.json({
      sessionId: response.sessionId,
      message: response.message,
      affinity: response.affinity,
      affinityUpdateReason: response.affinityUpdateReason,
      emotionDetail: response.emotionDetail,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('V2 메시지 처리 오류', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process message'
    });
  }
});

/**
 * 대화 내역 조회
 */
router.get('/history/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required'
      });
    }

    const session = chatbotService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    return res.json({
      sessionId,
      userId: session.userId,
      state: session.state.state,
      metrics: session.state.metrics,
      turnHistory: session.turnHistory.map(turn => ({
        turnNumber: turn.turnNumber,
        userMessage: turn.userMessage,
        botResponse: turn.botResponse,
        analysis: turn.analysis, // 턴 분석 정보 추가
        timestamp: turn.timestamp,
      })),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

  } catch (error) {
    logger.error('V2 히스토리 조회 오류', error);
    return res.status(500).json({
      error: 'Failed to get conversation history'
    });
  }
});

/**
 * 사용자의 모든 세션 조회
 */
router.get('/sessions/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required'
      });
    }

    const sessions = chatbotService.getUserSessions(userId);

    return res.json({
      userId,
      sessions: sessions.map(session => ({
        sessionId: session.sessionId,
        state: session.state.state,
        metrics: session.state.metrics,
        turnCount: session.turnHistory.length,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
      totalSessions: sessions.length
    });

  } catch (error) {
    logger.error('V2 사용자 세션 조회 오류', error);
    return res.status(500).json({
      error: 'Failed to get user sessions'
    });
  }
});

/**
 * 세션 상세 상태 조회
 */
router.get('/status/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required'
      });
    }

    const session = chatbotService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    return res.json({
      sessionId,
      state: session.state.state,
      metrics: session.state.metrics,
      stateDuration: session.state.stateDuration,
      stateHistory: session.state.stateHistory,
      memoryCount: {
        userFacts: session.state.memory.userFacts.length,
        sharedJokes: session.state.memory.sharedJokes.length,
        milestones: session.state.memory.milestones.length,
      },
      interactionCount: session.state.interactionCount,
      lastUpdated: session.updatedAt,
    });

  } catch (error) {
    logger.error('V2 상태 조회 오류', error);
    return res.status(500).json({
      error: 'Failed to get session status'
    });
  }
});

/**
 * 세션 삭제
 */
router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required'
      });
    }

    const deleted = chatbotService.deleteSession(sessionId);

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
    logger.error('V2 세션 삭제 오류', error);
    return res.status(500).json({
      error: 'Failed to delete session'
    });
  }
});

export { router as chatV2Routes };

