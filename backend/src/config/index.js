require('dotenv').config();

const config = {
  // 서버 설정
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Smartproxy 설정 (절대 변경 불가)
  proxy: {
    host: process.env.PROXY_HOST || 'proxy.smartproxy.net',
    port: parseInt(process.env.PROXY_PORT) || 3120,
    username: process.env.PROXY_USERNAME || 'smart-hqmx0000',
    password: process.env.PROXY_PASSWORD || 'Straight8',
    protocol: 'http'
  },
  
  // CORS 설정
  cors: {
    origins: process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',') : 
      ['http://localhost:3000', 'https://hqmx.net']
  },
  
  // API 설정
  api: {
    timeout: parseInt(process.env.API_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15분
      max: 100 // 최대 100 요청
    }
  },
  
  // YouTube 설정
  youtube: {
    baseUrl: 'https://www.youtube.com',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    timeout: 30000, // 30초로 증가 (프록시를 고려)
    maxRetries: 2
  },
  
  // 다운로드 설정
  download: {
    timeout: 30000, // 30초 제한 (요구사항)
    maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB 제한
    allowedFormats: ['mp4', 'webm', 'mp3', 'm4a', 'wav', 'flac']
  },
  
  // 로깅
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

module.exports = config;