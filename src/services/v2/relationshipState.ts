/**
 * 관계 상태 관리
 * 관계 점수(T, K, A, C) 업데이트 및 상태 머신 구현
 */

import { RelationshipMetrics, RelationshipState, InteractionFeatures, EmotionVector } from './types';
import { calculateAlignment } from './emotionState';

// 관계 업데이트 파라미터 (서윤 페르소나)
export const RELATIONSHIP_PARAMS = {
  etaT: 0.08,  // Trust 업데이트율 (서윤은 신뢰 형성이 매우 느림)
  etaK: 0.12,  // Comfort 업데이트율 (편안함도 천천히)
  etaA: 0.1,   // Affection 업데이트율 (호감도 천천히)
  zeta: 0.15,  // 통합 관계 점수 업데이트율 (관계 진전이 느림)

  // 통합 관계 점수 가중치 (서윤은 신뢰를 매우 중요하게 봄)
  weights: {
    w1: 0.2,   // Alignment (감정 정렬)
    w2: 0.35,  // Trust (신뢰 가장 중요!)
    w3: 0.15,  // Affection
    w4: 0.2,   // Comfort (편안함도 중요)
    w5: 0.05,  // Similarity (TODO)
    w6: 0.05,  // Self-disclosure balance (과도한 개방은 부담)
  },

  rMax: 0.04,  // 속도 패널티 임계값 (서윤은 급격한 변화 싫어함)
  chi: 0.8,    // 속도 패널티 강도 (더 강하게)

  // 상태 전이 임계값 (히스테리시스) - 서윤은 더 높은 임계값 필요
  thresholds: {
    strangerToFriend: { up: 0.35, down: 0.25 },   // 낯선 사람 → 친구
    friendToInterest: { up: 0.55, down: 0.45 },   // 친구 → 호감
    interestToFlirting: { up: 0.70, down: 0.60 }, // 호감 → 썸
    flirtingToDating: { up: 0.85, down: 0.77 },   // 썸 → 연애 (매우 높은 기준)
  },

  // 상태 전이 최소 지속시간 (턴 수) - 서윤은 더 오래 걸림
  minDuration: {
    stranger: 5,  // 낯선 사람 단계에서 최소 5턴
    friend: 5,    // 친구 단계를 더 오래
    interest: 8,  // 호감 단계도 더 오래
    flirting: 12, // 썸 단계는 훨씬 오래
  },
};

/**
 * T (Trust) 업데이트 (서윤 페르소나)
 * T(t+1) = (1-η_T)*T(t) + η_T*[φ1·일관성 + φ2·약속이행 + φ3·공감복구]
 * 
 * 서윤은 과거 상처로 인해 신뢰 형성이 매우 느리고 어려움.
 * 갈등에는 매우 민감하게 반응하여 신뢰가 급격히 하락.
 */
export function updateTrust(
  currentT: number,
  features: InteractionFeatures,
  // TODO: 실제로는 이전 상호작용과 비교하여 일관성, 약속이행 등을 계산해야 함
): number {
  const { etaT } = RELATIONSHIP_PARAMS;

  // 서윤은 공감과 긍정성에 조금씩 반응, 부정적 행동엔 매우 민감
  const trustContribution =
    0.5 * features.empathyExpression +  // 공감에 가장 잘 반응
    0.2 * features.positivity +         // 긍정성
    0.3 * (1 - features.conflict) -     // 갈등 회피
    0.5 * features.conflict -           // 갈등 시 신뢰 급하락
    1.5 * features.disrespect -         // 무례함에 신뢰 붕괴
    1.0 * features.pressure -           // 압박에 신뢰 하락
    2.0 * features.harassment;          // 성희롱에 신뢰 완전 붕괴

  // 부정적 행동 감지 시 하락 속도 급격히 증가
  const negativeScore = features.conflict + features.disrespect + features.pressure + features.harassment;
  let adjustedEta = etaT;

  if (features.harassment > 0.3 || features.disrespect > 0.5) {
    // 매우 심각한 부정 행동: 즉시 급락
    adjustedEta = etaT * 5;
  } else if (negativeScore > 0.5) {
    // 부정 행동: 빠르게 하락
    adjustedEta = etaT * 3;
  } else if (features.conflict > 0.3) {
    // 갈등: 조금 빠르게 하락
    adjustedEta = etaT * 2;
  }

  const newT = (1 - adjustedEta) * currentT + adjustedEta * Math.max(0, trustContribution);
  return Math.max(0, Math.min(1, newT));
}

/**
 * K (Comfort) 업데이트 (서윤 페르소나)
 * K(t+1) = (1-η_K)*K(t) + η_K*[ψ1·편안감 - ψ2·압박감]
 * 
 * 서윤은 과도한 관심이나 질문에 부담을 느낌.
 * 천천히 편안해지며, 급격한 친밀감은 오히려 불편함.
 */
export function updateComfort(
  currentK: number,
  features: InteractionFeatures,
): number {
  const { etaK } = RELATIONSHIP_PARAMS;

  // 서윤은 적당한 거리감이 편함
  // 과도한 질문, 압박, 무례함, 성희롱 모두 극도로 불편
  const pressureFactor =
    Math.max(0, features.questionDepth - 0.5) * 1.5 +  // 질문이 너무 깊으면 부담
    Math.max(0, features.selfDisclosure - 0.6) * 1.2 + // 과도한 개방도 부담
    features.conflict * 2.0 +                           // 갈등은 매우 불편
    features.pressure * 3.0 +                           // 압박/집착은 극도로 불편
    features.disrespect * 2.5 +                         // 무례함은 매우 불편
    features.harassment * 4.0;                          // 성희롱은 참을 수 없음

  const comfort =
    features.positivity * 0.4 +
    features.empathyExpression * 0.3 +
    Math.max(0, 1 - pressureFactor) * 0.3;

  // 부정적 행동 시 편안함 급격히 하락
  const adjustedEta = (features.harassment > 0.3 || features.disrespect > 0.5) ? etaK * 3 : etaK;

  const newK = (1 - adjustedEta) * currentK + adjustedEta * Math.max(0, comfort);
  return Math.max(0, Math.min(1, newK));
}

/**
 * A (Affection) 업데이트 (서윤 페르소나)
 * A(t+1) = (1-η_A)*A(t) + η_A*[ρ1·긍정상호작용 + ρ2·신선함 - ρ3·부정충돌]
 * 
 * 서윤은 천천히 호감을 느끼지만, 공감과 배려에는 잘 반응.
 * 유머나 긍정성보다는 진심 어린 태도에 끌림.
 */
export function updateAffection(
  currentA: number,
  features: InteractionFeatures,
): number {
  const { etaA } = RELATIONSHIP_PARAMS;

  // 서윤은 공감과 배려에 더 반응
  // 무례함, 압박, 성희롱은 호감을 완전히 없앰
  const affectionContribution =
    0.4 * features.empathyExpression +  // 공감이 가장 중요
    0.3 * features.positivity +         // 긍정성
    0.2 * features.humor +              // 유머는 보너스
    -0.5 * features.conflict +          // 갈등은 호감 급감
    -1.5 * features.disrespect +        // 무례함에 호감 급락
    -1.2 * features.pressure +          // 압박에 호감 하락
    -3.0 * features.harassment;         // 성희롱에 호감 완전 상실

  // 부정적 행동 시 호감 빠르게 하락
  const adjustedEta = (features.harassment > 0.3 || features.disrespect > 0.5) ? etaA * 4 : etaA;

  const newA = (1 - adjustedEta) * currentA + adjustedEta * Math.max(0, affectionContribution);
  return Math.max(0, Math.min(1, newA));
}

/**
 * C (통합 관계 점수) 업데이트
 * C(t+1) = (1-ζ)*C(t) + ζ*[w1*Align + w2*T + w3*A + w4*K + w5*S + w6*SD_bal] - χ*speed_penalty
 */
export function updateRelationshipScore(
  currentC: number,
  metrics: RelationshipMetrics,
  alignment: number,
  selfDisclosureBalance: number,
  similarity: number = 0.5, // TODO: 취향·가치 유사도 계산 구현 필요
): number {
  const { zeta, weights, rMax, chi } = RELATIONSHIP_PARAMS;
  const { T, K, A } = metrics;

  // 통합 점수 계산
  const integratedScore =
    weights.w1 * alignment +
    weights.w2 * T +
    weights.w3 * A +
    weights.w4 * K +
    weights.w5 * similarity +
    weights.w6 * Math.max(0, 1 - Math.abs(selfDisclosureBalance));

  const newC = (1 - zeta) * currentC + zeta * integratedScore;

  // 속도 패널티
  const deltaC = Math.abs(newC - currentC);
  const speedPenalty = deltaC > rMax ? chi * (deltaC - rMax) : 0;

  const finalC = newC - speedPenalty;
  return Math.max(0, Math.min(1, finalC));
}

/**
 * 관계 상태 전이 (히스테리시스 적용) - 서윤 페르소나
 * 
 * @param A 호감도/끌림 (Affection/Attraction) - 연애 관계로 갈수록 중요
 */
export function transitionRelationshipState(
  currentState: RelationshipState,
  C: number,
  T: number,
  K: number,
  A: number,
  stateDuration: number,
): RelationshipState {
  const { thresholds, minDuration } = RELATIONSHIP_PARAMS;

  // 상향 전이

  // stranger → friend: 신뢰와 편안함만 중요 (호감 불필요)
  if (currentState === 'stranger' &&
    C > thresholds.strangerToFriend.up &&
    T > 0.15 && K > 0.25 &&
    stateDuration >= minDuration.stranger) {
    return 'friend';
  }

  // friend → interest: 호감이 생겨야 함!
  if (currentState === 'friend' &&
    C > thresholds.friendToInterest.up &&
    T > 0.30 && K > 0.35 &&
    A > 0.20 &&  // 호감 필수 조건 추가
    stateDuration >= minDuration.friend) {
    return 'interest';
  }

  // interest → flirting: 끌림이 높아야 함!
  if (currentState === 'interest' &&
    C > thresholds.interestToFlirting.up &&
    T > 0.50 && K > 0.45 &&
    A > 0.40 &&  // 끌림 필수 조건 추가
    stateDuration >= minDuration.interest) {
    return 'flirting';
  }

  // flirting → dating: 가장 높은 기준, 끌림 매우 중요
  if (currentState === 'flirting' &&
    C > thresholds.flirtingToDating.up &&
    T > 0.70 && K > 0.60 &&
    A > 0.65 &&  // 높은 끌림 필수 조건 추가
    stateDuration >= minDuration.flirting) {
    return 'dating';
  }

  // 하향 전이 (히스테리시스)

  // 모든 상태 → stranger: 심각한 신뢰 붕괴 (성희롱, 심각한 무례함)
  if (T < 0.05 || K < 0.05) {
    return 'stranger';
  }

  // friend → stranger: 심각한 갈등이나 신뢰 붕괴
  if (currentState === 'friend' &&
    (C < thresholds.strangerToFriend.down || T < 0.10)) {
    return 'stranger';
  }

  // interest → stranger: 심각한 배신이나 불쾌한 행동
  if (currentState === 'interest' && T < 0.10) {
    return 'stranger';
  }

  // interest → friend: 호감 급락 시
  if (currentState === 'interest' &&
    (C < thresholds.friendToInterest.down || A < 0.10)) {  // 호감 급락 조건 추가
    return 'friend';
  }

  // flirting → interest: 끌림 급락 시
  if (currentState === 'flirting' &&
    (C < thresholds.interestToFlirting.down || A < 0.25)) {  // 끌림 급락 조건 추가
    return 'interest';
  }

  // dating → flirting: 끌림 급락 시
  if (currentState === 'dating' &&
    (C < thresholds.flirtingToDating.down || A < 0.45)) {  // 끌림 급락 조건 추가
    return 'flirting';
  }

  // TODO: 갈등 누적, 신뢰 급하락 시 하향 전이 추가 필요

  return currentState;
}

/**
 * 초기 관계 지표 생성 (서윤 페르소나)
 * 
 * 서윤은 처음 만난 사람에게 매우 경계심이 강함.
 * 고등학교 때 상처로 인해 방어적이고 쉽게 마음을 열지 않음.
 */
export function createInitialMetrics(): RelationshipMetrics {
  return {
    T: 0.05,  // 매우 낮은 신뢰 (낯선 사람, 경계심)
    K: 0.2,   // 낮은 편안함 (불편함, 긴장)
    A: 0.0,   // 호감 없음 (무관심)
    C: 0.15,  // 매우 낮은 초기 관계 점수 (철벽녀)
  };
}

/**
 * 관계 지표 업데이트 (통합)
 */
export function updateRelationshipMetrics(
  metrics: RelationshipMetrics,
  userEmotion: EmotionVector,
  botEmotion: EmotionVector,
  features: InteractionFeatures,
  botSelfDisclosure: number,
): RelationshipMetrics {
  const T = updateTrust(metrics.T, features);
  const K = updateComfort(metrics.K, features);
  const A = updateAffection(metrics.A, features);

  const alignment = calculateAlignment(userEmotion, botEmotion);
  const sdBalance = features.selfDisclosure - botSelfDisclosure;

  const C = updateRelationshipScore(
    metrics.C,
    { T, K, A, C: metrics.C },
    alignment,
    sdBalance
  );

  return { T, K, A, C };
}

