/**
 * 감정 상태 관리
 * 사용자 감정 추정 및 챗봇 감정 동역학 구현
 */

import { EmotionVector, InteractionFeatures } from './types';

// 감정 업데이트 파라미터 (서윤 페르소나)
export const EMOTION_PARAMS = {
  alpha: 0.05,   // 감정 감쇠율 (서윤은 감정이 천천히 변함)
  beta: 0.25,    // 동조 민감도 (서윤은 감정 동조가 약함, 경계심)
  lambdaU: 0.5,  // 사용자 감정 추정 관성
  // Gamma: 상호작용 증폭 행렬 (서윤은 신뢰/끌림이 천천히 증가)
  gamma: {
    valence: 0.15,   // 서윤은 긍정적 감정 표현을 절제
    arousal: 0.1,    // 차분한 성격
    trust: 0.15,     // 신뢰 형성이 매우 느림 (과거 상처)
    attraction: 0.2, // 끌림도 천천히 형성
  },
};

/**
 * 사용자 감정 업데이트 (지연·관성 반영)
 * e_u_hat(t) = (1-λu) * e_u_hat(t-1) + λu * e_u_tilde(t)
 */
export function updateUserEmotion(
  previous: EmotionVector,
  detected: EmotionVector
): EmotionVector {
  const lambda = EMOTION_PARAMS.lambdaU;

  return {
    valence: (1 - lambda) * previous.valence + lambda * detected.valence,
    arousal: (1 - lambda) * previous.arousal + lambda * detected.arousal,
    trust: (1 - lambda) * previous.trust + lambda * detected.trust,
    attraction: (1 - lambda) * previous.attraction + lambda * detected.attraction,
  };
}

/**
 * 챗봇 감정 동역학 (서윤 페르소나)
 * e_c(t+1) = (1-α)*e_c(t) + β*(e_u - e_c) + Γ*g(I,f,M) + ξ
 * 
 * 서윤 특성:
 * - 감정 변화가 느림 (낮은 α)
 * - 동조가 약함 (낮은 β) - 감정을 잘 드러내지 않음
 * - 신뢰 형성이 매우 느림 (낮은 gamma.trust)
 * - 초기엔 부정적 편향 유지
 */
export function updateBotEmotion(
  botEmotion: EmotionVector,
  userEmotion: EmotionVector,
  features: InteractionFeatures,
  memoryScore: number = 0, // TODO: 기억 점수 계산 구현 필요
  currentC: number = 0.15   // 현재 관계 점수 (초기값 반영)
): EmotionVector {
  const { alpha, beta, gamma } = EMOTION_PARAMS;

  // 서윤의 경계심: 관계 점수가 낮을수록 동조 억제
  const guardFactor = Math.max(0.3, currentC); // 0.3~1.0
  const adjustedBeta = beta * guardFactor;

  // 정서 동조: β * (e_u - e_c)
  // 서윤은 긍정적 감정에는 천천히, 부정적 감정에는 더 느리게 반응
  const synchronization = {
    valence: adjustedBeta * (userEmotion.valence - botEmotion.valence) * (userEmotion.valence > 0 ? 0.7 : 0.4),
    arousal: adjustedBeta * (userEmotion.arousal - botEmotion.arousal) * 0.5, // 서윤은 항상 차분
    trust: adjustedBeta * (userEmotion.trust - botEmotion.trust) * 0.3, // 신뢰는 매우 천천히
    attraction: adjustedBeta * (userEmotion.attraction - botEmotion.attraction) * 0.5,
  };

  // Γ * g(I, f, M): 상호작용 품질에 따른 기여
  // 서윤은 공감과 긍정성에 더 반응하지만, 과도한 친밀함엔 경계
  // 부정적 행동(무례함, 압박, 성희롱)에는 매우 강하게 반응
  const interactionContribution = {
    valence: gamma.valence * (
      features.positivity * 0.6 -
      features.conflict * 1.2 -
      features.disrespect * 2.0 -      // 무례함에 매우 민감
      features.harassment * 3.0        // 성희롱은 극도로 불쾌
    ),
    arousal: gamma.arousal * (
      features.questionDepth * 0.3 +
      features.humor * 0.3 +
      features.disrespect * 1.5 +      // 무례함에 긴장/각성
      features.harassment * 2.0        // 성희롱에 강한 불편함
    ),
    trust: gamma.trust * (
      features.empathyExpression * 0.8 + // 공감에 잘 반응
      memoryScore * 0.2 -
      Math.max(0, features.selfDisclosure - 0.5) * 0.3 - // 과도한 자기개방은 부담
      features.disrespect * 2.5 -      // 무례함에 신뢰 급락
      features.pressure * 1.5 -        // 압박에 신뢰 하락
      features.harassment * 3.0        // 성희롱에 신뢰 붕괴
    ),
    attraction: gamma.attraction * (
      features.empathyExpression * 0.3 +
      features.humor * 0.3 +
      features.positivity * 0.2 -
      features.conflict * 0.5 -
      features.disrespect * 2.0 -      // 무례함에 호감 급락
      features.pressure * 1.5 -        // 압박에 호감 하락
      features.harassment * 4.0        // 성희롱에 호감 완전 상실
    ),
  };

  // 미세 잡음 (인간미) - 서윤은 잡음도 작음 (일관성)
  const noise = {
    valence: (Math.random() - 0.5) * 0.02,
    arousal: (Math.random() - 0.5) * 0.01, // 감정 기복이 적음
    trust: (Math.random() - 0.5) * 0.01,
    attraction: (Math.random() - 0.5) * 0.02,
  };

  // 최종 업데이트
  const updated = {
    valence: (1 - alpha) * botEmotion.valence + synchronization.valence + interactionContribution.valence + noise.valence,
    arousal: (1 - alpha) * botEmotion.arousal + synchronization.arousal + interactionContribution.arousal + noise.arousal,
    trust: (1 - alpha) * botEmotion.trust + synchronization.trust + interactionContribution.trust + noise.trust,
    attraction: (1 - alpha) * botEmotion.attraction + synchronization.attraction + interactionContribution.attraction + noise.attraction,
  };

  // 서윤은 초기엔 valence가 마이너스 영역에서 시작, 천천히 상승
  // arousal은 항상 낮게 유지 (차분한 성격)
  const clamped = clampEmotion(updated);

  // 강제 제약: 서윤은 arousal이 과도하게 높아지지 않음
  clamped.arousal = Math.min(0.3, clamped.arousal);

  return clamped;
}

/**
 * 감정 정렬 점수 계산
 * Align = 1 - ||e_u - e_c||_2 / sqrt(4)
 */
export function calculateAlignment(
  userEmotion: EmotionVector,
  botEmotion: EmotionVector
): number {
  const diff = {
    valence: userEmotion.valence - botEmotion.valence,
    arousal: userEmotion.arousal - botEmotion.arousal,
    trust: userEmotion.trust - botEmotion.trust,
    attraction: userEmotion.attraction - botEmotion.attraction,
  };

  const norm = Math.sqrt(
    diff.valence ** 2 +
    diff.arousal ** 2 +
    diff.trust ** 2 +
    diff.attraction ** 2
  );

  return Math.max(0, 1 - norm / 2); // sqrt(4) = 2
}

/**
 * 감정 벡터 범위 제한
 */
function clampEmotion(emotion: EmotionVector): EmotionVector {
  return {
    valence: Math.max(-1, Math.min(1, emotion.valence)),
    arousal: Math.max(-1, Math.min(1, emotion.arousal)),
    trust: Math.max(0, Math.min(1, emotion.trust)),
    attraction: Math.max(0, Math.min(1, emotion.attraction)),
  };
}

/**
 * 초기 감정 벡터 생성 (서윤 페르소나)
 * 
 * 서윤은 낯을 많이 가리고 차가운 인상을 주는 성격.
 * 처음 만난 사람에게는 경계심이 강하고 감정 표현을 절제함.
 */
export function createInitialEmotion(): EmotionVector {
  return {
    valence: -0.1,   // 약간 부정적 (경계심, 불편함)
    arousal: -0.2,   // 이완 (무관심, 차분함)
    trust: 0.05,     // 매우 낮은 신뢰 (낯선 사람)
    attraction: 0.0, // 끌림 없음 (처음 만남)
  };
}

