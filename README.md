# 서윤 - 미소녀 연애 시뮬레이션 챗봇

TypeScript와 Node.js로 구축된 OpenAI API와 Pinecone을 활용한 미소녀 연애 시뮬레이션 게임입니다.

## 주요 기능

- **미소녀 채팅**: 서윤이라는 21살 여대생 캐릭터와의 대화
- **호감도 시스템**: 대화에 따라 변화하는 호감도 (-100 ~ 100)
- **기억 시스템**: RAG를 통한 과거 대화 기억 및 조회
- **세션 관리**: 사용자별 대화 세션 관리
- **대화 내역 저장**: 모든 대화가 벡터 데이터베이스에 저장

## 기술 스택

- **Backend**: Node.js, TypeScript, Express.js
- **AI/ML**: OpenAI API (GPT-3.5/4, text-embedding-ada-002)
- **Vector DB**: Pinecone
- **Security**: Helmet, CORS
- **File Upload**: Multer

## 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 환경 변수들을 설정하세요:

```bash
# .env.template을 복사하여 .env 파일 생성
cp .env.template .env
```

그리고 `.env` 파일에서 다음 값들을 실제 API 키로 변경하세요:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-openai-api-key-here

# Pinecone Configuration
PINECONE_API_KEY=your-actual-pinecone-api-key-here
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=seoyoon-memories

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 3. Pinecone 인덱스 설정

Pinecone 콘솔에서 다음 설정으로 인덱스를 생성하세요:
- **Index Name**: `seoyoon-memories`
- **Dimension**: 1536 (OpenAI text-embedding-3-small 모델용)
- **Metric**: cosine
- **Environment**: us-east-1-aws (또는 사용 가능한 환경)

### 4. 개발 서버 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 빌드
npm run build
npm start
```

## API 엔드포인트

### 서윤과의 채팅 API (`/api/chat`)

#### 새로운 대화 세션 시작
```http
POST /api/chat/session
Content-Type: application/json

{
  "userId": "user123"
}
```

#### 서윤과 대화하기
```http
POST /api/chat/message
Content-Type: application/json

{
  "sessionId": "session_user123_1234567890", // 선택사항 (없으면 새로 생성)
  "userId": "user123",
  "message": "안녕하세요!"
}
```

#### 대화 내역 조회
```http
GET /api/chat/history/{sessionId}
```

#### 사용자의 모든 세션 조회
```http
GET /api/chat/sessions/{userId}
```

#### 현재 호감도 조회
```http
GET /api/chat/affinity/{sessionId}
```

#### 세션 삭제
```http
DELETE /api/chat/session/{sessionId}
```

### RAG API (`/api/rag`)

#### RAG 쿼리
```http
POST /api/rag/query
Content-Type: application/json

{
  "query": "문서에서 특정 정보를 찾고 싶습니다.",
  "topK": 5, // 선택사항, 기본값: 5
  "filter": {}, // 선택사항, 메타데이터 필터
  "systemPrompt": "사용자 정의 시스템 프롬프트" // 선택사항
}
```

#### 문서 추가
```http
POST /api/rag/documents
Content-Type: application/json

{
  "documents": [
    {
      "id": "doc1",
      "text": "문서 내용...",
      "metadata": {"source": "manual", "category": "guide"}
    }
  ]
}
```

#### 파일 업로드
```http
POST /api/rag/upload
Content-Type: multipart/form-data

file: [파일]
chunkSize: 1000 // 선택사항
overlap: 200 // 선택사항
```

#### 문서 삭제
```http
DELETE /api/rag/documents/{documentId}
```

#### RAG 시스템 통계
```http
GET /api/rag/stats
```

#### 텍스트 청킹 테스트
```http
POST /api/rag/chunk
Content-Type: application/json

{
  "text": "긴 텍스트 내용...",
  "chunkSize": 1000,
  "overlap": 200
}
```

### 기타 API

#### 헬스 체크
```http
GET /health
```

#### 서버 정보
```http
GET /
```

## 프로젝트 구조

```
src/
├── index.ts              # 메인 서버 엔트리 포인트
├── routes/
│   ├── chat.ts          # 채팅 라우트
│   └── rag.ts           # RAG 라우트
├── services/
│   ├── openai.ts        # OpenAI API 서비스
│   ├── pinecone.ts      # Pinecone 벡터 DB 서비스
│   └── rag.ts           # RAG 통합 서비스
├── middleware/
│   └── errorHandler.ts  # 에러 핸들링 미들웨어
└── utils/
    └── logger.ts        # 로깅 유틸리티
```

## 사용 예시

### 1. 서윤과의 대화

```javascript
// 새로운 세션 시작
const sessionResponse = await fetch('http://localhost:3000/api/chat/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123'
  })
});

const sessionData = await sessionResponse.json();
console.log('세션 ID:', sessionData.sessionId);

// 서윤과 대화하기
const chatResponse = await fetch('http://localhost:3000/api/chat/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: sessionData.sessionId,
    userId: 'user123',
    message: '안녕하세요! 처음 뵙겠습니다.'
  })
});

const chatData = await chatResponse.json();
console.log('서윤의 답변:', chatData.message);
console.log('현재 호감도:', chatData.affinity);
```

### 2. 문서 업로드 및 RAG 쿼리

```javascript
// 1. 문서 업로드
const formData = new FormData();
formData.append('file', file);

await fetch('http://localhost:3000/api/rag/upload', {
  method: 'POST',
  body: formData
});

// 2. RAG 쿼리
const ragResponse = await fetch('http://localhost:3000/api/rag/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '업로드한 문서에서 특정 정보를 찾아주세요.'
  })
});

const ragData = await ragResponse.json();
console.log(ragData.answer);
console.log(ragData.sources);
```

## 개발 가이드

### 스크립트

- `npm run dev`: 개발 서버 실행 (hot reload)
- `npm run build`: TypeScript 컴파일
- `npm start`: 프로덕션 서버 실행
- `npm test`: 테스트 실행

### 환경 설정

- 개발 환경에서는 `NODE_ENV=development`로 설정하여 디버그 로그를 활성화합니다.
- 프로덕션 환경에서는 `NODE_ENV=production`으로 설정합니다.

## 라이선스

MIT License

## 기여하기

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request 