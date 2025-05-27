// API 기본 설정
const API_BASE_URL = 'http://localhost:5001';

// 전역 상태
let currentSession = {
    sessionId: null,
    userId: 'user123',
    affinity: 0,
    messageCount: 0
};

let apiLogs = [];

// DOM 요소들
const elements = {
    // 서버 상태
    serverStatus: document.getElementById('serverStatus'),
    statusIndicator: document.querySelector('.status-indicator'),
    statusText: document.querySelector('.status-text'),

    // 채팅
    userIdInput: document.getElementById('userIdInput'),
    newSessionBtn: document.getElementById('newSessionBtn'),
    chatMessages: document.getElementById('chatMessages'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),

    // 호감도
    affinityValue: document.getElementById('affinityValue'),
    affinityFill: document.getElementById('affinityFill'),
    affinityLevel: document.getElementById('affinityLevel'),

    // 모니터링
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    lastRequest: document.getElementById('lastRequest'),
    lastResponse: document.getElementById('lastResponse'),

    // 세션 정보
    currentSessionId: document.getElementById('currentSessionId'),
    currentUserId: document.getElementById('currentUserId'),
    messageCount: document.getElementById('messageCount'),
    currentAffinity: document.getElementById('currentAffinity'),
    loadSessionsBtn: document.getElementById('loadSessionsBtn'),

    // 로그
    logsContainer: document.getElementById('logsContainer'),
    clearLogsBtn: document.getElementById('clearLogsBtn'),

    // 모달
    sessionModal: document.getElementById('sessionModal'),
    closeModal: document.getElementById('closeModal'),
    sessionsList: document.getElementById('sessionsList')
};

// 초기화
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    setupEventListeners();
    checkServerStatus();
});

function initializeApp() {
    updateSessionInfo();
    updateAffinityDisplay(0);

    // 사용자 ID 입력 필드 업데이트
    elements.userIdInput.value = currentSession.userId;
}

function setupEventListeners() {
    // 새 세션 버튼
    elements.newSessionBtn.addEventListener('click', createNewSession);

    // 메시지 전송
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 사용자 ID 변경
    elements.userIdInput.addEventListener('change', function () {
        currentSession.userId = this.value;
        updateSessionInfo();
    });

    // 탭 전환
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            switchTab(this.dataset.tab);
        });
    });

    // 세션 목록 버튼
    elements.loadSessionsBtn.addEventListener('click', loadUserSessions);

    // 로그 지우기 버튼
    elements.clearLogsBtn.addEventListener('click', clearLogs);

    // 모달 닫기
    elements.closeModal.addEventListener('click', closeModal);
    elements.sessionModal.addEventListener('click', function (e) {
        if (e.target === this) closeModal();
    });
}

// 서버 상태 확인
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            updateServerStatus(true, '서버 연결됨');
        } else {
            updateServerStatus(false, '서버 오류');
        }
    } catch (error) {
        updateServerStatus(false, '서버 연결 실패');
    }

    // 5초마다 상태 확인
    setTimeout(checkServerStatus, 5000);
}

function updateServerStatus(isOnline, message) {
    elements.statusIndicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
    elements.statusText.textContent = message;
}

// API 호출 함수
async function apiCall(method, endpoint, data = null) {
    const startTime = Date.now();
    const url = `${API_BASE_URL}${endpoint}`;

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    // 요청 로깅
    logApiCall('REQUEST', method, endpoint, data);
    elements.lastRequest.textContent = JSON.stringify({
        method,
        url,
        data
    }, null, 2);

    try {
        const response = await fetch(url, options);
        const responseData = await response.json();
        const duration = Date.now() - startTime;

        // 응답 로깅
        logApiCall('RESPONSE', method, endpoint, responseData, response.status, duration);
        elements.lastResponse.textContent = JSON.stringify(responseData, null, 2);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${responseData.error || 'Unknown error'}`);
        }

        return responseData;
    } catch (error) {
        const duration = Date.now() - startTime;
        logApiCall('ERROR', method, endpoint, error.message, 0, duration);
        elements.lastResponse.textContent = `Error: ${error.message}`;
        throw error;
    }
}

function logApiCall(type, method, endpoint, data, status = null, duration = null) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
        timestamp,
        type,
        method,
        endpoint,
        data,
        status,
        duration
    };

    apiLogs.unshift(logEntry);
    if (apiLogs.length > 50) {
        apiLogs.pop();
    }

    updateLogsDisplay();
}

function updateLogsDisplay() {
    if (apiLogs.length === 0) {
        elements.logsContainer.innerHTML = '<p class="no-logs">로그가 없습니다.</p>';
        return;
    }

    const logsHtml = apiLogs.map(log => {
        const statusClass = log.status >= 200 && log.status < 300 ? 'success' : 'error';
        const statusText = log.status ? log.status : (log.type === 'ERROR' ? 'ERROR' : '');

        return `
            <div class="log-entry">
                <span class="log-timestamp">${log.timestamp}</span>
                <span class="log-method ${log.method}">${log.method}</span>
                <span class="log-url">${log.endpoint}</span>
                <span class="log-status ${statusClass}">${statusText}</span>
                ${log.duration ? `<div style="font-size: 10px; color: #999; margin-top: 4px;">${log.duration}ms</div>` : ''}
            </div>
        `;
    }).join('');

    elements.logsContainer.innerHTML = logsHtml;
}

// 새 세션 생성
async function createNewSession() {
    try {
        elements.newSessionBtn.classList.add('loading');

        const response = await apiCall('POST', '/api/chat/session', {
            userId: currentSession.userId
        });

        currentSession.sessionId = response.sessionId;
        currentSession.affinity = response.affinity || 0;
        currentSession.messageCount = 0;

        updateSessionInfo();
        updateAffinityDisplay(currentSession.affinity);
        clearChatMessages();
        addSystemMessage(response.message || '새로운 세션이 시작되었습니다.');

    } catch (error) {
        showError('세션 생성 실패: ' + error.message);
    } finally {
        elements.newSessionBtn.classList.remove('loading');
    }
}

// 메시지 전송
async function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message) return;

    try {
        elements.sendBtn.classList.add('loading');
        elements.messageInput.disabled = true;

        // 사용자 메시지 표시
        addMessage('user', message);
        elements.messageInput.value = '';

        // API 호출
        const response = await apiCall('POST', '/api/chat/message', {
            sessionId: currentSession.sessionId,
            userId: currentSession.userId,
            message
        });

        // 세션 정보 업데이트
        if (response.sessionId) {
            currentSession.sessionId = response.sessionId;
        }

        const oldAffinity = currentSession.affinity;
        currentSession.affinity = response.affinity;
        currentSession.messageCount++;

        // 서윤의 응답 표시
        addMessage('assistant', response.message, response.affinity, oldAffinity);

        // UI 업데이트
        updateSessionInfo();
        updateAffinityDisplay(response.affinity);

    } catch (error) {
        showError('메시지 전송 실패: ' + error.message);
    } finally {
        elements.sendBtn.classList.remove('loading');
        elements.messageInput.disabled = false;
        elements.messageInput.focus();
    }
}

// 메시지 추가
function addMessage(role, content, affinity = null, oldAffinity = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const timestamp = new Date().toLocaleTimeString();
    let metaHtml = `<span>${timestamp}</span>`;

    if (role === 'assistant' && affinity !== null && oldAffinity !== null) {
        const affinityChange = affinity - oldAffinity;
        if (affinityChange !== 0) {
            const changeClass = affinityChange > 0 ? 'positive' : 'negative';
            const changeSymbol = affinityChange > 0 ? '+' : '';
            metaHtml += `<span class="affinity-change ${changeClass}">${changeSymbol}${affinityChange}</span>`;
        }
    }

    messageDiv.innerHTML = `
        <div class="message-content">${content}</div>
        <div class="message-meta">${metaHtml}</div>
    `;

    elements.chatMessages.appendChild(messageDiv);

    // 웰컴 메시지 제거
    const welcomeMessage = elements.chatMessages.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    // 스크롤 하단으로
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function addSystemMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.style.cssText = 'background: #e3f2fd; color: #1976d2; align-self: center; max-width: 90%; text-align: center;';
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;

    elements.chatMessages.appendChild(messageDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function clearChatMessages() {
    elements.chatMessages.innerHTML = '';
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message system';
    errorDiv.style.cssText = 'background: #ffebee; color: #d32f2f; align-self: center; max-width: 90%; text-align: center;';
    errorDiv.innerHTML = `<div class="message-content">❌ ${message}</div>`;

    elements.chatMessages.appendChild(errorDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// 호감도 표시 업데이트
function updateAffinityDisplay(affinity) {
    elements.affinityValue.textContent = affinity;

    // 호감도 바 업데이트 (-100 ~ 100을 0 ~ 100%로 변환)
    const percentage = ((affinity + 100) / 200) * 100;
    elements.affinityFill.style.width = `${percentage}%`;

    // 호감도 레벨 업데이트
    let level;
    if (affinity <= -50) level = '매우 차가움';
    else if (affinity <= -1) level = '차가움';
    else if (affinity <= 29) level = '무관심';
    else if (affinity <= 59) level = '관심';
    else if (affinity <= 89) level = '호감';
    else level = '매우 호감';

    elements.affinityLevel.textContent = level;
}

// 세션 정보 업데이트
function updateSessionInfo() {
    elements.currentSessionId.textContent = currentSession.sessionId || '없음';
    elements.currentUserId.textContent = currentSession.userId;
    elements.messageCount.textContent = currentSession.messageCount;
    elements.currentAffinity.textContent = currentSession.affinity;
}

// 탭 전환
function switchTab(tabName) {
    // 탭 버튼 활성화
    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 탭 컨텐츠 표시
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
}

// 사용자 세션 목록 로드
async function loadUserSessions() {
    try {
        elements.loadSessionsBtn.classList.add('loading');

        const response = await apiCall('GET', `/api/chat/sessions/${currentSession.userId}`);

        if (response.sessions && response.sessions.length > 0) {
            displaySessionsList(response.sessions);
            openModal();
        } else {
            showError('세션이 없습니다.');
        }

    } catch (error) {
        showError('세션 목록 로드 실패: ' + error.message);
    } finally {
        elements.loadSessionsBtn.classList.remove('loading');
    }
}

function displaySessionsList(sessions) {
    const sessionsHtml = sessions.map(session => {
        const createdAt = new Date(session.createdAt).toLocaleString();
        const updatedAt = new Date(session.updatedAt).toLocaleString();

        return `
            <div class="session-item" onclick="selectSession('${session.sessionId}')">
                <h4>세션 ID: ${session.sessionId}</h4>
                <p>메시지 수: ${session.messageCount}</p>
                <p>호감도: ${session.currentAffinity}</p>
                <p>생성일: ${createdAt}</p>
                <p>마지막 업데이트: ${updatedAt}</p>
                ${session.lastMessage ? `<p>마지막 메시지: ${session.lastMessage.substring(0, 50)}...</p>` : ''}
            </div>
        `;
    }).join('');

    elements.sessionsList.innerHTML = sessionsHtml;
}

function selectSession(sessionId) {
    currentSession.sessionId = sessionId;
    updateSessionInfo();
    closeModal();

    // 세션 히스토리 로드
    loadSessionHistory(sessionId);
}

async function loadSessionHistory(sessionId) {
    try {
        const response = await apiCall('GET', `/api/chat/history/${sessionId}`);

        clearChatMessages();
        currentSession.affinity = response.currentAffinity;
        currentSession.messageCount = response.messageCount;

        updateSessionInfo();
        updateAffinityDisplay(response.currentAffinity);

        // 메시지 히스토리 표시
        if (response.messages && response.messages.length > 0) {
            response.messages.forEach(msg => {
                addMessage(msg.role, msg.content);
            });
        }

    } catch (error) {
        showError('세션 히스토리 로드 실패: ' + error.message);
    }
}

// 모달 관련
function openModal() {
    elements.sessionModal.classList.add('show');
}

function closeModal() {
    elements.sessionModal.classList.remove('show');
}

// 로그 지우기
function clearLogs() {
    apiLogs = [];
    updateLogsDisplay();
    elements.lastRequest.textContent = '요청 대기 중...';
    elements.lastResponse.textContent = '응답 대기 중...';
}

// 유틸리티 함수들
function formatJSON(obj) {
    return JSON.stringify(obj, null, 2);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 전역 함수로 노출 (HTML에서 사용)
window.selectSession = selectSession; 