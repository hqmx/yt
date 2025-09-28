const crypto = require('crypto');

/**
 * YouTube URL에서 비디오 ID 추출
 */
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * URL 유효성 검사
 */
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  const youtubePatterns = [
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/,
    /youtube\.com\/watch\?.*v=[a-zA-Z0-9_-]{11}/,
    /youtu\.be\/[a-zA-Z0-9_-]{11}/
  ];
  
  return youtubePatterns.some(pattern => pattern.test(url));
}

/**
 * 시간을 초로 변환 (예: "3:45" -> 225)
 */
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]; // MM:SS
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
  }
  
  return 0;
}

/**
 * 파일 크기를 사람이 읽기 쉬운 형태로 변환
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 품질 문자열을 높이(픽셀)로 변환
 */
function parseQuality(qualityStr) {
  if (!qualityStr || typeof qualityStr !== 'string') return 0;
  
  const match = qualityStr.match(/(\d+)p?/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * 고유한 작업 ID 생성
 */
function generateTaskId() {
  return crypto.randomUUID();
}

/**
 * 에러 응답 생성
 */
function createErrorResponse(message, code = 'UNKNOWN_ERROR', statusCode = 500) {
  return {
    success: false,
    error: {
      message,
      code,
      timestamp: new Date().toISOString()
    },
    statusCode
  };
}

/**
 * 성공 응답 생성
 */
function createSuccessResponse(data, message = null) {
  const response = {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
  
  if (message) {
    response.message = message;
  }
  
  return response;
}

/**
 * 프록시 URL 생성
 */
function buildProxyUrl(proxyConfig) {
  const { protocol, username, password, host, port } = proxyConfig;
  return `${protocol}://${username}:${password}@${host}:${port}`;
}

/**
 * 딜레이 함수
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 재시도 함수
 */
async function retry(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries) {
        console.warn(`시도 ${i + 1}/${maxRetries + 1} 실패, ${delayMs}ms 후 재시도:`, error.message);
        await delay(delayMs * (i + 1)); // 지수적 백오프
      }
    }
  }
  
  throw lastError;
}

/**
 * 안전한 JSON 파싱
 */
function safeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch (error) {
    return defaultValue;
  }
}

/**
 * 객체에서 민감한 정보 제거
 */
function sanitizeObject(obj, sensitiveKeys = ['password', 'token', 'key', 'secret']) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = { ...obj };
  
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

module.exports = {
  extractVideoId,
  isValidYouTubeUrl,
  parseTimeToSeconds,
  formatFileSize,
  parseQuality,
  generateTaskId,
  createErrorResponse,
  createSuccessResponse,
  buildProxyUrl,
  delay,
  retry,
  safeJsonParse,
  sanitizeObject
};