/**
 * V2 챗봇 메인 로직
 * 턴 단위 업데이트 및 전체 시뮬레이션 통합
 */

import { logger } from '../../utils/logger';
import {
  ChatbotState,
  Session,
  Turn,
  InteractionFeatures,
  RelationshipState,
} from './types';
import {
  createInitialEmotion,
  updateUserEmotion,
  updateBotEmotion,
} from './emotionState';
import {
  createInitialMetrics,
  updateRelationshipMetrics,
  transitionRelationshipState,
} from './relationshipState';
import { generateResponsePolicy } from './policy';
import { llmService } from './llm';

export class ChatbotService {
  private sessions: Map<string, Session> = new Map();

  /**
   * 새 세션 생성
   */
  createSession(userId: string): string {
    const sessionId = `session_${userId}_${Date.now()}`;

    const initialState: ChatbotState = {
      userEmotion: createInitialEmotion(),
      botEmotion: createInitialEmotion(),
      metrics: createInitialMetrics(),
      state: 'stranger',  // 서윤은 완전 낯선 사람부터 시작
      stateDuration: 0,
      stateHistory: ['stranger'],
      memory: {
        userFacts: [],
        sharedJokes: [],
        milestones: [],
      },
      interactionCount: 0,
    };

    const session: Session = {
      sessionId,
      userId,
      state: initialState,
      createdAt: new Date(),
      updatedAt: new Date(),
      turnHistory: [],
    };

    this.sessions.set(sessionId, session);
    logger.info(`새 세션 생성: ${sessionId} (사용자: ${userId})`);

    return sessionId;
  }

  /**
   * 메시지 처리 (메인 턴 로직)
   */
  async processMessage(
    sessionId: string,
    userId: string,
    userMessage: string,
  ): Promise<{
    sessionId: string;
    message: string;
    affinity: number;
    affinityUpdateReason: string;
    emotionDetail: {
      relationshipState: RelationshipState;
      trustLevel: number;
      comfortLevel: number;
      affectionLevel: number;
      userEmotionValence: number;
      userEmotionArousal: number;
      userTrust: number;
      userAttraction: number;
      botEmotionValence: number;
      botEmotionArousal: number;
      botTrust: number;
      botAttraction: number;
    };
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.userId !== userId) {
      throw new Error('Session does not belong to user');
    }

    logger.info(`메시지 처리 시작: ${sessionId}`);
    const state = session.state;

    // 대화 히스토리 구성
    const conversationHistory = session.turnHistory.slice(-5).flatMap(turn => [
      { role: 'user' as const, content: turn.userMessage },
      { role: 'assistant' as const, content: turn.botResponse },
    ]);

    // === 1단계: LLM 1차 호출 - 감정 분석 ===
    const analysis = await llmService.analyzeUserMessage(
      userMessage,
      conversationHistory,
    );

    // === 2단계: 감정 상태 업데이트 ===
    // (a) 사용자 감정 업데이트
    state.userEmotion = updateUserEmotion(state.userEmotion, analysis.userEmotion);

    // (b) 챗봇 감정 업데이트 (서윤 페르소나)
    const memoryScore = state.memory.userFacts.length * 0.1; // 간소화
    state.botEmotion = updateBotEmotion(
      state.botEmotion,
      state.userEmotion,
      analysis.features,
      memoryScore,
      state.metrics.C, // 현재 관계 점수 전달 (경계심 반영)
    );

    // === 3단계: 관계 지표 업데이트 ===
    const botSelfDisclosure = 0.3; // TODO: 실제 챗봇 응답 분석하여 계산
    state.metrics = updateRelationshipMetrics(
      state.metrics,
      state.userEmotion,
      state.botEmotion,
      analysis.features,
      botSelfDisclosure,
    );

    // === 4단계: 관계 상태 전이 ===
    const previousState = state.state;
    state.state = transitionRelationshipState(
      state.state,
      state.metrics.C,
      state.metrics.T,
      state.metrics.K,
      state.metrics.A,
      state.stateDuration,
    );

    // 상태 변경 시 duration 리셋
    if (state.state !== previousState) {
      logger.info(`관계 상태 전이: ${previousState} → ${state.state}`);
      state.stateDuration = 0;
      state.stateHistory.push(state.state);
    } else {
      state.stateDuration++;
    }

    // === 5단계: 응답 정책 생성 ===
    const policy = generateResponsePolicy(
      state.botEmotion,
      state.userEmotion,
      state.metrics,
      state.state,
      state.memory.userFacts.length + state.memory.sharedJokes.length,
    );

    // === 6단계: LLM 2차 호출 - 최종 응답 생성 (서윤 페르소나) ===
    const finalResponse = await llmService.generateFinalResponse(
      userMessage,
      analysis,
      policy,
      state.state,
      state.metrics,
      state.userEmotion,
      conversationHistory,
      state.memory,
      analysis.features, // 부정적 행동 정보 전달
    );

    // === 7단계: 기억 업데이트 ===
    if (analysis.detectedFacts && analysis.detectedFacts.length > 0) {
      state.memory.userFacts.push(...analysis.detectedFacts);
      logger.debug(`새로운 사용자 사실 추가: ${JSON.stringify(analysis.detectedFacts)}`);
    }
    // TODO: 공유된 농담, 마일스톤 감지 및 추가

    // === 8단계: 턴 기록 ===
    state.interactionCount++;
    state.lastInteractionFeatures = analysis.features;

    const turn: Turn = {
      turnNumber: state.interactionCount,
      userMessage,
      botResponse: finalResponse.message,
      analysis,
      stateSnapshot: JSON.parse(JSON.stringify(state)), // deep copy
      timestamp: new Date(),
    };

    session.turnHistory.push(turn);
    session.updatedAt = new Date();

    logger.info(`턴 ${state.interactionCount} 완료: C=${state.metrics.C.toFixed(2)}, 상태=${state.state}`);

    // V1 호환 응답 형식
    return {
      sessionId,
      message: finalResponse.message,
      affinity: Math.round(state.metrics.C * 100), // 0~1 스케일을 0~100으로 변환
      affinityUpdateReason: analysis.contentSummary,
      emotionDetail: {
        relationshipState: state.state,
        trustLevel: Math.round(state.metrics.T * 100),
        comfortLevel: Math.round(state.metrics.K * 100),
        affectionLevel: Math.round(state.metrics.A * 100),
        userEmotionValence: state.userEmotion.valence,
        userEmotionArousal: state.userEmotion.arousal,
        userTrust: state.userEmotion.trust,
        userAttraction: state.userEmotion.attraction,
        botEmotionValence: state.botEmotion.valence,
        botEmotionArousal: state.botEmotion.arousal,
        botTrust: state.botEmotion.trust,
        botAttraction: state.botEmotion.attraction,
      },
    };
  }

  /**
   * 세션 조회
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 사용자의 모든 세션 조회
   */
  getUserSessions(userId: string): Session[] {
    return Array.from(this.sessions.values()).filter(
      session => session.userId === userId,
    );
  }

  /**
   * 세션 삭제
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * 감정 벡터를 읽기 쉬운 형식으로 변환
   */
  private formatEmotion(emotion: { valence: number; arousal: number; trust: number; attraction: number }): string {
    const v = emotion.valence > 0.3 ? '긍정' : emotion.valence < -0.3 ? '부정' : '중립';
    const a = emotion.arousal > 0.3 ? '각성' : emotion.arousal < -0.3 ? '이완' : '보통';
    return `${v}/${a} (신뢰:${(emotion.trust * 100).toFixed(0)}%, 끌림:${(emotion.attraction * 100).toFixed(0)}%)`;
  }
}

export const chatbotService = new ChatbotService();

