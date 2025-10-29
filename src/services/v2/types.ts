/**
 * V2 챗봇 시뮬레이션을 위한 타입 정의
 */

// 4차원 감정 벡터 (Valence, Arousal, Trust, Attraction)
export interface EmotionVector {
  valence: number;    // 긍정-부정 (-1 ~ 1)
  arousal: number;    // 각성-이완 (-1 ~ 1)
  trust: number;      // 신뢰 (0 ~ 1)
  attraction: number; // 끌림 (0 ~ 1)
}

// 관계 핵심 지표
export interface RelationshipMetrics {
  T: number;  // Trust 신뢰 (0 ~ 1)
  K: number;  // Comfort 편안함 (0 ~ 1)
  A: number;  // Affection 호감 (0 ~ 1)
  C: number;  // 통합 관계 점수 (0 ~ 1)
}

// 관계 상태 (서윤 페르소나: stranger부터 시작)
export type RelationshipState = 'stranger' | 'friend' | 'interest' | 'flirting' | 'dating';

// 상호작용 특성
export interface InteractionFeatures {
  questionDepth: number;      // 질문 깊이 (0 ~ 1)
  empathyExpression: number;  // 공감 표현 (0 ~ 1)
  selfDisclosure: number;     // 자기개방 수준 (0 ~ 1)
  humor: number;              // 유머 (0 ~ 1)
  positivity: number;         // 긍정성 (0 ~ 1)
  conflict: number;           // 갈등/부정 (0 ~ 1)

  // 부정적 행동 특성 (추가)
  disrespect: number;         // 무례함/모욕 (0 ~ 1)
  pressure: number;           // 과도한 압박/집착 (0 ~ 1)
  harassment: number;         // 성희롱/불쾌한 언행 (0 ~ 1)
}

// 챗봇 상태 (전체 상태)
export interface ChatbotState {
  // 감정 상태
  userEmotion: EmotionVector;      // 사용자 감정 추정
  botEmotion: EmotionVector;       // 챗봇 감정

  // 관계 지표
  metrics: RelationshipMetrics;
  state: RelationshipState;

  // 상태 전이 추적
  stateDuration: number;           // 현재 상태 지속 시간 (턴 수)
  stateHistory: RelationshipState[]; // 상태 변화 이력

  // 기억/서사
  memory: {
    userFacts: string[];         // 사용자 고유 사실
    sharedJokes: string[];       // 내적 농담
    milestones: string[];        // 기념일/특별한 순간
  };

  // 상호작용 누적
  interactionCount: number;
  lastInteractionFeatures?: InteractionFeatures;
}

// 응답 정책 가중치
export interface ResponsePolicy {
  tone: number;              // 톤 (0: 차분 ~ 1: 활발)
  humor: number;             // 유머 사용 빈도
  selfDisclosure: number;    // 자기개방 수준
  questionDepth: number;     // 질문 깊이
  nicknameUse: number;       // 애칭 사용
  playfulness: number;       // 장난기
  warmth: number;            // 따뜻함
  memoryRecall: number;      // 기억 회상 빈도
}

// LLM 첫 번째 호출 결과 (분석)
export interface EmotionAnalysis {
  userEmotion: EmotionVector;
  features: InteractionFeatures;
  contentSummary: string;           // 사용자가 말한 내용 요약
  detectedFacts?: string[];         // 감지된 사용자 사실
  suggestedResponse?: string;       // 응답 제안
}

// LLM 두 번째 호출 결과 (최종 응답)
export interface FinalResponse {
  message: string;
}

// 세션 데이터
export interface Session {
  sessionId: string;
  userId: string;
  state: ChatbotState;
  createdAt: Date;
  updatedAt: Date;
  turnHistory: Turn[];
}

// 턴 기록
export interface Turn {
  turnNumber: number;
  userMessage: string;
  botResponse: string;
  analysis: EmotionAnalysis;
  stateSnapshot: ChatbotState;
  timestamp: Date;
}

