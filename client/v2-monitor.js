/**
 * V2 챗봇 모니터링 클라이언트
 */
const API_BASE = `${window.location.origin}/api/v2/chat`;

// 전역 상태
let currentSessionId = null;
let currentUserId = null;
let metricHistory = {
    T: [],
    K: [],
    A: [],
    C: []
};
let lastTurnData = null;

// DOM 요소
const elements = {
    userId: document.getElementById('userId'),
    createSession: document.getElementById('createSession'),
    loadSession: document.getElementById('loadSession'),
    currentSessionId: document.getElementById('currentSessionId'),
    turnCount: document.getElementById('turnCount'),
    chatContainer: document.getElementById('chatContainer'),
    messageInput: document.getElementById('messageInput'),
    sendMessage: document.getElementById('sendMessage'),
    debugLogs: document.getElementById('debugLogs'),
    clearLogs: document.getElementById('clearLogs'),
};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    addLog('시스템 초기화 완료', 'info');
});

// 이벤트 리스너 설정
function setupEventListeners() {
    elements.createSession.addEventListener('click', createNewSession);
    elements.loadSession.addEventListener('click', loadExistingSession);
    elements.sendMessage.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    elements.clearLogs.addEventListener('click', () => {
        elements.debugLogs.innerHTML = '';
        addLog('로그 초기화', 'info');
    });
}

// 새 세션 생성
async function createNewSession() {
    const userId = elements.userId.value.trim();
    if (!userId) {
        addLog('사용자 ID를 입력해주세요', 'error');
        return;
    }

    try {
        addLog(`새 세션 생성 중... (사용자: ${userId})`, 'info');

        const response = await fetch(`${API_BASE}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '세션 생성 실패');
        }

        currentSessionId = data.sessionId;
        currentUserId = userId;
        elements.currentSessionId.textContent = currentSessionId;
        elements.turnCount.textContent = '0';

        // 초기 상태 표시 (chatV2.ts 응답 형식에 맞게 수정)
        if (data.emotionDetail) {
            updateStateDisplay(data.emotionDetail.relationshipState);
            updateMetricsDisplay({
                T: data.emotionDetail.trustLevel / 100,
                K: data.emotionDetail.comfortLevel / 100,
                A: data.emotionDetail.affectionLevel / 100,
                C: data.affinity / 100
            });
        }

        addLog(`✅ 세션 생성 완료: ${currentSessionId}`, 'success');
        if (data.emotionDetail) {
            addLog(`초기 상태: ${data.emotionDetail.relationshipState}, C=${(data.affinity / 100).toFixed(2)}`, 'info');
        }

        // 대화 영역 초기화
        elements.chatContainer.innerHTML = '<div class="welcome-msg">💬 대화를 시작하세요!</div>';
    } catch (error) {
        addLog(`❌ 세션 생성 오류: ${error.message}`, 'error');
    }
}

// 기존 세션 불러오기
async function loadExistingSession() {
    const userId = elements.userId.value.trim();
    if (!userId) {
        addLog('사용자 ID를 입력해주세요', 'error');
        return;
    }

    try {
        addLog(`세션 불러오는 중... (사용자: ${userId})`, 'info');

        const response = await fetch(`${API_BASE}/sessions/${userId}`);
        const data = await response.json();

        if (!response.ok || data.sessions.length === 0) {
            addLog('세션을 찾을 수 없습니다. 새 세션을 생성하세요.', 'warning');
            return;
        }

        // 가장 최근 세션 선택
        const latestSession = data.sessions[0];
        currentSessionId = latestSession.sessionId;
        currentUserId = userId;

        elements.currentSessionId.textContent = currentSessionId;
        elements.turnCount.textContent = latestSession.turnCount;

        // 세션 상태 로드
        await loadSessionStatus();
        await loadSessionHistory();

        addLog(`✅ 세션 로드 완료: ${currentSessionId}`, 'success');
    } catch (error) {
        addLog(`❌ 세션 로드 오류: ${error.message}`, 'error');
    }
}

// 세션 상태 로드
async function loadSessionStatus() {
    try {
        const response = await fetch(`${API_BASE}/status/${currentSessionId}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '상태 로드 실패');
        }

        updateStateDisplay(data.state);
        updateMetricsDisplay(data.metrics);
        updateMemoryDisplay(data.memoryCount);

        document.getElementById('stateDuration').textContent = data.stateDuration;

        // 상태 이력 표시
        const historyContainer = document.getElementById('stateHistory');
        historyContainer.innerHTML = data.stateHistory.map((state, idx) =>
            `<div class="timeline-item">${idx + 1}. ${getStateLabel(state)}</div>`
        ).join('');

        addLog(`상태 로드 완료: ${data.state} (${data.stateDuration}턴)`, 'info');
    } catch (error) {
        addLog(`상태 로드 오류: ${error.message}`, 'error');
    }
}

// 대화 내역 로드
async function loadSessionHistory() {
    try {
        const response = await fetch(`${API_BASE}/history/${currentSessionId}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '히스토리 로드 실패');
        }

        // 대화 표시
        elements.chatContainer.innerHTML = '';
        data.turnHistory.forEach(turn => {
            addMessageToChat('user', turn.userMessage, false);
            addMessageToChat('bot', turn.botResponse, false);
        });

        addLog(`대화 내역 로드 완료: ${data.turnHistory.length}턴`, 'info');
    } catch (error) {
        addLog(`히스토리 로드 오류: ${error.message}`, 'error');
    }
}

// 메시지 전송
async function sendMessage() {
    if (!currentSessionId) {
        addLog('먼저 세션을 생성하거나 불러오세요', 'warning');
        return;
    }

    const message = elements.messageInput.value.trim();
    if (!message) return;

    // UI에 메시지 추가
    addMessageToChat('user', message);
    elements.messageInput.value = '';
    elements.messageInput.disabled = true;
    elements.sendMessage.disabled = true;

    try {
        addLog(`📤 메시지 전송: "${message}"`, 'info');

        const response = await fetch(`${API_BASE}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: currentSessionId,
                userId: currentUserId,
                message
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '메시지 전송 실패');
        }

        // UI 업데이트 (chatV2.ts 응답 형식에 맞게 수정)
        addMessageToChat('bot', data.message);

        // emotionDetail에서 필요한 정보 추출
        if (data.emotionDetail) {
            updateStateDisplay(data.emotionDetail.relationshipState);
            updateMetricsDisplay({
                T: data.emotionDetail.trustLevel / 100,
                K: data.emotionDetail.comfortLevel / 100,
                A: data.emotionDetail.affectionLevel / 100,
                C: data.affinity / 100
            });
            updateEmotionDisplay({
                user: `V:${data.emotionDetail.userEmotionValence.toFixed(2)} A:${data.emotionDetail.userEmotionArousal.toFixed(2)}`,
                bot: `V:${data.emotionDetail.botEmotionValence.toFixed(2)} A:${data.emotionDetail.botEmotionArousal.toFixed(2)}`
            });
        }

        // 턴 수 증가
        const currentTurn = parseInt(elements.turnCount.textContent) + 1;
        elements.turnCount.textContent = currentTurn;

        // 응답 정책 즉시 업데이트 (상태 기반 추정)
        if (data.emotionDetail) {
            const metrics = {
                T: data.emotionDetail.trustLevel / 100,
                K: data.emotionDetail.comfortLevel / 100,
                A: data.emotionDetail.affectionLevel / 100,
                C: data.affinity / 100
            };
            const policy = estimatePolicy(data.emotionDetail.relationshipState, metrics);
            updatePolicyDisplay(policy, data.emotionDetail.relationshipState);
        }

        // 상태 정보 로드 (분석 상세 등)
        await loadSessionStatus();

        addLog(`✅ 응답 수신: ${data.message.substring(0, 50)}...`, 'success');
        if (data.emotionDetail) {
            addLog(`상태: ${data.emotionDetail.relationshipState}, C=${(data.affinity / 100).toFixed(3)}, T=${(data.emotionDetail.trustLevel / 100).toFixed(3)}`, 'info');
        }

        // 상태 전이 감지
        if (data.emotionDetail) {
            if (lastTurnData && lastTurnData.emotionDetail &&
                lastTurnData.emotionDetail.relationshipState !== data.emotionDetail.relationshipState) {
                addLog(`🎉 관계 상태 전이! ${getStateLabel(lastTurnData.emotionDetail.relationshipState)} → ${getStateLabel(data.emotionDetail.relationshipState)}`, 'success');
            }

            lastTurnData = data;

            // 메트릭 히스토리에 추가
            metricHistory.T.push(data.emotionDetail.trustLevel / 100);
            metricHistory.K.push(data.emotionDetail.comfortLevel / 100);
            metricHistory.A.push(data.emotionDetail.affectionLevel / 100);
            metricHistory.C.push(data.affinity / 100);
        }

        // 차트 업데이트 (간단한 텍스트 표시)
        updateMetricChart();

    } catch (error) {
        addLog(`❌ 메시지 전송 오류: ${error.message}`, 'error');
    } finally {
        elements.messageInput.disabled = false;
        elements.sendMessage.disabled = false;
        elements.messageInput.focus();
    }
}

// 대화에 메시지 추가
function addMessageToChat(role, content, scroll = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    messageDiv.innerHTML = `
        <div class="message-header">${role === 'user' ? '👤 사용자' : '🤖 챗봇'} • ${time}</div>
        <div class="message-content">${content}</div>
    `;

    elements.chatContainer.appendChild(messageDiv);

    if (scroll) {
        elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    }
}

// 상태 표시 업데이트
function updateStateDisplay(state) {
    const stateBadge = document.getElementById('stateBadge');
    stateBadge.textContent = getStateLabel(state);
    stateBadge.className = `state-badge ${state}`;
}

// 관계 지표 표시 업데이트
function updateMetricsDisplay(metrics) {
    // T, K, A, C 업데이트
    updateMetricBar('T', metrics.T);
    updateMetricBar('K', metrics.K);
    updateMetricBar('A', metrics.A);
    updateMetricBar('C', metrics.C);
}

function updateMetricBar(name, value) {
    const fill = document.getElementById(`metric${name}`);
    const valueSpan = document.getElementById(`value${name}`);

    const percentage = (value * 100).toFixed(0);
    fill.style.width = `${percentage}%`;
    valueSpan.textContent = value.toFixed(3);

    // 색상 조정
    if (value < 0.3) {
        fill.style.background = 'linear-gradient(90deg, #f56565, #fc8181)';
    } else if (value < 0.6) {
        fill.style.background = 'linear-gradient(90deg, #ed8936, #f6ad55)';
    } else {
        fill.style.background = 'linear-gradient(90deg, #48bb78, #68d391)';
    }
}

// 감정 표시 업데이트
function updateEmotionDisplay(emotion) {
    // emotion.user와 emotion.bot은 문자열 형태
    // 실제 벡터 데이터를 가져오려면 상태 API 호출 필요
    addLog(`감정: 사용자=${emotion.user}, 봇=${emotion.bot}`, 'info');
}

// 기억 표시 업데이트
function updateMemoryDisplay(memoryCount) {
    document.getElementById('factsCount').textContent = memoryCount.userFacts || 0;
    document.getElementById('jokesCount').textContent = memoryCount.sharedJokes || 0;
    document.getElementById('milestonesCount').textContent = memoryCount.milestones || 0;
}

// 메트릭 차트 업데이트 (간단한 버전)
function updateMetricChart() {
    const chartDiv = document.getElementById('metricChart');
    if (!chartDiv) return;

    const recent = 10;
    const dataT = metricHistory.T.slice(-recent);
    const dataC = metricHistory.C.slice(-recent);

    chartDiv.innerHTML = `
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 15px;">
            <strong>최근 ${dataC.length}턴 추이</strong>
            <div style="display: flex; gap: 5px; margin-top: 5px;">
                ${dataC.map((c, idx) => `
                    <div style="flex: 1; text-align: center;">
                        <div style="height: 60px; display: flex; flex-direction: column; justify-content: flex-end;">
                            <div style="background: var(--primary-color); height: ${c * 60}px; border-radius: 3px;"></div>
                        </div>
                        <div style="font-size: 9px; margin-top: 3px;">${idx + 1}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// 로그 추가
function addLog(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;

    const time = new Date().toLocaleTimeString('ko-KR');
    logEntry.innerHTML = `
        <span class="log-timestamp">[${time}]</span>
        <span class="log-message">${message}</span>
    `;

    elements.debugLogs.appendChild(logEntry);
    elements.debugLogs.scrollTop = elements.debugLogs.scrollHeight;
}

// 유틸리티: 상태 레이블
function getStateLabel(state) {
    const labels = {
        stranger: '낯선 사람',
        friend: '친구',
        interest: '호감',
        flirting: '썸',
        dating: '연애'
    };
    return labels[state] || state;
}

// 주기적으로 상세 분석 정보 가져오기
let detailUpdateInterval = null;

async function startDetailMonitoring() {
    if (!currentSessionId) return;

    detailUpdateInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/history/${currentSessionId}`);
            const data = await response.json();

            if (!response.ok || !data.turnHistory || data.turnHistory.length === 0) return;

            // 최근 턴 분석 표시
            const latestTurn = data.turnHistory[data.turnHistory.length - 1];
            if (latestTurn && latestTurn.analysis) {
                updateAnalysisDisplay(latestTurn.analysis);
            }

            // 감정 벡터 표시
            if (latestTurn && latestTurn.stateSnapshot) {
                updateEmotionVectors(
                    latestTurn.stateSnapshot.userEmotion,
                    latestTurn.stateSnapshot.botEmotion
                );

                // 기억 업데이트
                if (latestTurn.stateSnapshot.memory) {
                    updateMemoryLists(latestTurn.stateSnapshot.memory);
                }

                // 정책 표시
                const policy = estimatePolicy(
                    latestTurn.stateSnapshot.state,
                    latestTurn.stateSnapshot.metrics
                );
                updatePolicyDisplay(policy, latestTurn.stateSnapshot.state);
            }
        } catch (error) {
            // 조용히 실패
        }
    }, 2000); // 2초마다 업데이트
}

// 분석 상세 표시
function updateAnalysisDisplay(analysis) {
    const analysisDiv = document.getElementById('analysisDetail');
    if (!analysisDiv) return;

    analysisDiv.innerHTML = `
        <div class="analysis-section">
            <strong>📝 내용 요약</strong>
            <div>${analysis.contentSummary || '-'}</div>
        </div>
        
        <div class="analysis-section">
            <strong>🎭 사용자 감정 (추정)</strong>
            <div class="analysis-features">
                <div class="feature-item">
                    <span class="label">Valence</span>
                    <span class="value">${analysis.userEmotion?.valence?.toFixed(2) || '?'}</span>
                </div>
                <div class="feature-item">
                    <span class="label">Arousal</span>
                    <span class="value">${analysis.userEmotion?.arousal?.toFixed(2) || '?'}</span>
                </div>
                <div class="feature-item">
                    <span class="label">Trust</span>
                    <span class="value">${analysis.userEmotion?.trust?.toFixed(2) || '?'}</span>
                </div>
                <div class="feature-item">
                    <span class="label">Attraction</span>
                    <span class="value">${analysis.userEmotion?.attraction?.toFixed(2) || '?'}</span>
                </div>
            </div>
        </div>

        <div class="analysis-section">
            <strong>⚡ 상호작용 특성</strong>
            <div class="analysis-features">
                <div class="feature-item">
                    <span class="label">질문 깊이</span>
                    <span class="value">${analysis.features?.questionDepth?.toFixed(2) || '?'}</span>
                </div>
                <div class="feature-item">
                    <span class="label">공감 표현</span>
                    <span class="value">${analysis.features?.empathyExpression?.toFixed(2) || '?'}</span>
                </div>
                <div class="feature-item">
                    <span class="label">자기개방</span>
                    <span class="value">${analysis.features?.selfDisclosure?.toFixed(2) || '?'}</span>
                </div>
                <div class="feature-item">
                    <span class="label">유머</span>
                    <span class="value">${analysis.features?.humor?.toFixed(2) || '?'}</span>
                </div>
                <div class="feature-item">
                    <span class="label">긍정성</span>
                    <span class="value">${analysis.features?.positivity?.toFixed(2) || '?'}</span>
                </div>
                <div class="feature-item">
                    <span class="label">갈등</span>
                    <span class="value">${analysis.features?.conflict?.toFixed(2) || '?'}</span>
                </div>
            </div>
        </div>

        ${analysis.detectedFacts && analysis.detectedFacts.length > 0 ? `
            <div class="analysis-section">
                <strong>💡 감지된 사실</strong>
                <div class="detected-facts">
                    ${analysis.detectedFacts.map(fact => `<span class="fact-tag">${fact}</span>`).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

// 감정 벡터 표시
function updateEmotionVectors(userEmotion, botEmotion) {
    if (!userEmotion || !botEmotion) return;

    // 사용자 감정
    updateEmotionSlider('userEmotion', 'valence', userEmotion.valence);
    updateEmotionSlider('userEmotion', 'arousal', userEmotion.arousal);
    updateEmotionSlider('userEmotion', 'trust', userEmotion.trust);
    updateEmotionSlider('userEmotion', 'attraction', userEmotion.attraction);

    // 챗봇 감정
    updateEmotionSlider('botEmotion', 'valence', botEmotion.valence);
    updateEmotionSlider('botEmotion', 'arousal', botEmotion.arousal);
    updateEmotionSlider('botEmotion', 'trust', botEmotion.trust);
    updateEmotionSlider('botEmotion', 'attraction', botEmotion.attraction);
}

function updateEmotionSlider(containerId, type, value) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const items = container.querySelectorAll('.emotion-item');
    let targetItem = null;

    items.forEach(item => {
        const slider = item.querySelector(`.slider-fill[data-type="${type}"]`);
        if (slider) targetItem = item;
    });

    if (!targetItem) return;

    const slider = targetItem.querySelector('.slider-fill');
    const valueSpan = targetItem.querySelector('.emotion-value');

    // -1 ~ 1 범위를 0 ~ 100%로 변환
    let percentage;
    if (type === 'valence' || type === 'arousal') {
        // -1 ~ 1 → 0 ~ 100%
        percentage = ((value + 1) / 2) * 100;
        slider.style.left = '0';
        slider.style.width = `${percentage}%`;
    } else {
        // 0 ~ 1 → 0 ~ 100%
        percentage = value * 100;
        slider.style.left = '0';
        slider.style.width = `${percentage}%`;
    }

    valueSpan.textContent = value.toFixed(2);

    // 색상
    if (value < 0) {
        slider.style.background = '#f56565';
    } else if (value < 0.5) {
        slider.style.background = '#ed8936';
    } else {
        slider.style.background = '#48bb78';
    }
}

// 기억 리스트 업데이트
function updateMemoryLists(memory) {
    const factsUl = document.getElementById('userFacts');
    const jokesUl = document.getElementById('sharedJokes');
    const milestonesUl = document.getElementById('milestones');

    if (factsUl) {
        factsUl.innerHTML = memory.userFacts?.map(fact => `<li>${fact}</li>`).join('') || '';
    }

    if (jokesUl) {
        jokesUl.innerHTML = memory.sharedJokes?.map(joke => `<li>${joke}</li>`).join('') || '';
    }

    if (milestonesUl) {
        milestonesUl.innerHTML = memory.milestones?.map(ms => `<li>${ms}</li>`).join('') || '';
    }
}

// 세션 생성 시 모니터링 시작
const originalCreateSession = createNewSession;
createNewSession = async function () {
    await originalCreateSession();
    if (currentSessionId) {
        startDetailMonitoring();
    }
};

const originalLoadSession = loadExistingSession;
loadExistingSession = async function () {
    await originalLoadSession();
    if (currentSessionId) {
        startDetailMonitoring();
    }
};

// 정책 추정 (클라이언트 버전)
function estimatePolicy(state, metrics) {
    const { C, T, K, A } = metrics;

    const basePolicy = {
        tone: 0.5,
        humor: 0.3,
        selfDisclosure: 0.2,
        questionDepth: 0.3,
        nicknameUse: 0.1,
        playfulness: 0.3,
        warmth: 0.5,
        memoryRecall: 0.2,
    };

    // 관계 상태별 조정 (서윤 페르소나)
    if (state === 'stranger') {
        // 완전 초면: 극도로 차갑고 무관심
        basePolicy.tone = 0.1;
        basePolicy.humor = 0.0;
        basePolicy.selfDisclosure = 0.0;
        basePolicy.questionDepth = 0.0;
        basePolicy.nicknameUse = 0.0;
        basePolicy.playfulness = 0.0;
        basePolicy.warmth = 0.05;
        basePolicy.memoryRecall = 0.0;
    } else if (state === 'friend') {
        // 친구 단계: 조금씩 마음을 열기 시작
        basePolicy.tone = 0.3;
        basePolicy.humor = 0.2;
        basePolicy.selfDisclosure = 0.2;
        basePolicy.questionDepth = 0.3;
        basePolicy.warmth = 0.4;
        basePolicy.memoryRecall = 0.3;
    } else if (state === 'interest') {
        basePolicy.tone = 0.6;
        basePolicy.humor = 0.5;
        basePolicy.selfDisclosure = 0.5;
        basePolicy.questionDepth = 0.5;
        basePolicy.nicknameUse = 0.3;
        basePolicy.warmth = 0.6;
        basePolicy.memoryRecall = 0.5;
    } else if (state === 'flirting') {
        basePolicy.tone = 0.7;
        basePolicy.humor = 0.6;
        basePolicy.selfDisclosure = 0.6;
        basePolicy.questionDepth = 0.6;
        basePolicy.nicknameUse = 0.6;
        basePolicy.playfulness = 0.7;
        basePolicy.warmth = 0.7;
        basePolicy.memoryRecall = 0.6;
    } else if (state === 'dating') {
        basePolicy.tone = 0.8;
        basePolicy.humor = 0.7;
        basePolicy.selfDisclosure = 0.8;
        basePolicy.questionDepth = 0.7;
        basePolicy.nicknameUse = 0.8;
        basePolicy.playfulness = 0.7;
        basePolicy.warmth = 0.9;
        basePolicy.memoryRecall = 0.8;
    }

    // 지표 기반 미세 조정
    if (A > 0.6) {
        basePolicy.playfulness = Math.min(1, basePolicy.playfulness + 0.1);
        basePolicy.selfDisclosure = Math.min(1, basePolicy.selfDisclosure + 0.1);
    }

    if (T < 0.4) {
        basePolicy.questionDepth = Math.min(1, basePolicy.questionDepth + 0.2);
        basePolicy.playfulness = Math.max(0, basePolicy.playfulness - 0.2);
        basePolicy.warmth = Math.min(1, basePolicy.warmth + 0.2);
    }

    if (K < 0.4) {
        basePolicy.questionDepth = Math.max(0, basePolicy.questionDepth - 0.2);
        basePolicy.selfDisclosure = Math.max(0, basePolicy.selfDisclosure - 0.1);
        basePolicy.warmth = Math.min(1, basePolicy.warmth + 0.2);
        basePolicy.tone = Math.max(0, basePolicy.tone - 0.1);
    }

    basePolicy.memoryRecall = Math.min(1, C * 0.8);

    return basePolicy;
}

// 정책 표시 업데이트
function updatePolicyDisplay(policy, state) {
    const policyDiv = document.getElementById('policyDisplay');
    if (!policyDiv) return;

    const stateLabels = {
        stranger: '낯선 사람',
        friend: '친구',
        interest: '호감',
        flirting: '썸',
        dating: '연애'
    };

    policyDiv.innerHTML = `
        <div class="policy-grid">
            <div class="policy-item">
                <span class="label">톤 (활발함)</span>
                <span class="value" style="color: ${getColorByValue(policy.tone)}">${(policy.tone * 100).toFixed(0)}%</span>
            </div>
            <div class="policy-item">
                <span class="label">유머 사용</span>
                <span class="value" style="color: ${getColorByValue(policy.humor)}">${(policy.humor * 100).toFixed(0)}%</span>
            </div>
            <div class="policy-item">
                <span class="label">자기개방</span>
                <span class="value" style="color: ${getColorByValue(policy.selfDisclosure)}">${(policy.selfDisclosure * 100).toFixed(0)}%</span>
            </div>
            <div class="policy-item">
                <span class="label">질문 깊이</span>
                <span class="value" style="color: ${getColorByValue(policy.questionDepth)}">${(policy.questionDepth * 100).toFixed(0)}%</span>
            </div>
            <div class="policy-item">
                <span class="label">애칭 사용</span>
                <span class="value" style="color: ${getColorByValue(policy.nicknameUse)}">${(policy.nicknameUse * 100).toFixed(0)}%</span>
            </div>
            <div class="policy-item">
                <span class="label">장난기</span>
                <span class="value" style="color: ${getColorByValue(policy.playfulness)}">${(policy.playfulness * 100).toFixed(0)}%</span>
            </div>
            <div class="policy-item">
                <span class="label">따뜻함</span>
                <span class="value" style="color: ${getColorByValue(policy.warmth)}">${(policy.warmth * 100).toFixed(0)}%</span>
            </div>
            <div class="policy-item">
                <span class="label">기억 회상</span>
                <span class="value" style="color: ${getColorByValue(policy.memoryRecall)}">${(policy.memoryRecall * 100).toFixed(0)}%</span>
            </div>
        </div>
        <div style="margin-top: 15px; padding: 10px; background: var(--bg-dark); border-radius: 6px; font-size: 12px;">
            <strong>💬 현재 말투 특징 (${stateLabels[state]})</strong><br>
            ${getPolicyDescription(state, policy)}
        </div>
    `;
}

// 값에 따른 색상
function getColorByValue(value) {
    if (value < 0.3) return '#f56565';
    if (value < 0.6) return '#ed8936';
    return '#48bb78';
}

// 정책 설명
function getPolicyDescription(state, policy) {
    const descriptions = [];

    if (state === 'stranger') {
        if (policy.warmth < 0.1) {
            descriptions.push('극도로 차갑고 무관심');
            descriptions.push('대답 거의 안 함 ("..." / "네.")');
        } else {
            descriptions.push('매우 경계하며 짧게 대답');
            descriptions.push('시선 회피, 무표정');
        }
    } else if (state === 'friend') {
        if (policy.warmth < 0.5) {
            descriptions.push('무뚝뚝하고 시크한 태도');
        } else {
            descriptions.push('조금씩 마음을 여는 중');
        }
    } else if (state === 'interest') {
        descriptions.push('친근한 반말 사용 시작');
        descriptions.push('관심사에 대해 조금 더 말함');
    } else if (state === 'flirting') {
        descriptions.push('감정 표현이 자연스러워짐');
        descriptions.push('먼저 약속 제안도 함');
    } else if (state === 'dating') {
        descriptions.push('애정 어린 말투');
        descriptions.push('감정을 솔직하게 표현');
    }

    if (policy.tone > 0.7) {
        descriptions.push('활발하고 생기있게');
    } else if (policy.tone < 0.4) {
        descriptions.push('차분하고 조용하게');
    }

    if (policy.playfulness > 0.6) {
        descriptions.push('장난스럽고 귀여운 표현');
    }

    if (policy.memoryRecall > 0.5) {
        descriptions.push('이전 대화 내용 자연스럽게 언급');
    }

    return descriptions.map(d => `• ${d}`).join('<br>');
}

