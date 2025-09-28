const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
const config = require('../config');
const { buildProxyUrl, retry, createErrorResponse } = require('../utils/helpers');

class ProxyService {
  constructor() {
    this.proxyUrl = buildProxyUrl(config.proxy);
    this.httpAgent = new HttpProxyAgent(this.proxyUrl);
    this.httpsAgent = new HttpsProxyAgent(this.proxyUrl);
    
    console.log('✅ Smartproxy 서비스 초기화됨:', {
      host: config.proxy.host,
      port: config.proxy.port,
      username: config.proxy.username
    });
  }

  /**
   * 프록시를 통한 HTTP 요청
   */
  async request(options = {}) {
    const {
      url,
      method = 'GET',
      headers = {},
      data = null,
      timeout = config.api.timeout,
      ...otherOptions
    } = options;

    // 기본 헤더 설정
    const defaultHeaders = {
      'User-Agent': config.youtube.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
      ...headers
    };

    const requestConfig = {
      url,
      method,
      headers: defaultHeaders,
      timeout,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      validateStatus: () => true, // 모든 상태 코드 허용
      maxRedirects: 5,
      ...otherOptions
    };

    if (data) {
      requestConfig.data = data;
    }

    try {
      console.log(`🌐 Smartproxy 요청: ${method} ${url}`);
      const response = await axios(requestConfig);
      
      console.log(`✅ 응답 수신: ${response.status} ${response.statusText}`);
      
      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        url: response.config.url
      };
      
    } catch (error) {
      console.error('❌ Smartproxy 요청 실패:', error.message);
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('프록시 연결 시간 초과');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('프록시 서버를 찾을 수 없음');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('프록시 서버 연결 거부');
      }
      
      throw error;
    }
  }

  /**
   * 프록시를 통한 GET 요청
   */
  async get(url, options = {}) {
    return this.request({
      url,
      method: 'GET',
      ...options
    });
  }

  /**
   * 프록시를 통한 POST 요청
   */
  async post(url, data, options = {}) {
    return this.request({
      url,
      method: 'POST',
      data,
      ...options
    });
  }

  /**
   * Playwright에서 사용할 프록시 설정 반환
   */
  getPlaywrightProxyConfig() {
    return {
      server: `${config.proxy.protocol}://${config.proxy.host}:${config.proxy.port}`,
      username: config.proxy.username,
      password: config.proxy.password
    };
  }

  /**
   * 프록시 연결 테스트
   */
  async testConnection() {
    try {
      console.log('🧪 Smartproxy 연결 테스트 시작...');
      
      // 여러 테스트 URL로 연결 확인
      const testUrls = [
        'https://httpbin.org/ip',
        'https://www.google.com',
        'https://www.youtube.com'
      ];

      const results = [];

      for (const testUrl of testUrls) {
        try {
          const startTime = Date.now();
          const response = await retry(
            () => this.get(testUrl, { timeout: 10000 }),
            2,
            1000
          );
          const responseTime = Date.now() - startTime;

          results.push({
            url: testUrl,
            status: response.status,
            responseTime,
            success: response.status >= 200 && response.status < 400
          });

          console.log(`✅ ${testUrl}: ${response.status} (${responseTime}ms)`);
          
        } catch (error) {
          results.push({
            url: testUrl,
            error: error.message,
            success: false
          });
          console.log(`❌ ${testUrl}: ${error.message}`);
        }
      }

      const successCount = results.filter(r => r.success).length;
      const isHealthy = successCount >= Math.ceil(testUrls.length / 2);

      return {
        success: isHealthy,
        results,
        proxy: {
          host: config.proxy.host,
          port: config.proxy.port,
          username: config.proxy.username
        },
        summary: {
          total: testUrls.length,
          success: successCount,
          failed: testUrls.length - successCount
        },
        message: isHealthy ? 
          `Smartproxy 연결 정상 (${successCount}/${testUrls.length} 성공)` :
          `Smartproxy 연결 불안정 (${successCount}/${testUrls.length} 성공)`
      };

    } catch (error) {
      console.error('❌ Smartproxy 테스트 실패:', error);
      
      return {
        success: false,
        error: error.message,
        proxy: {
          host: config.proxy.host,
          port: config.proxy.port,
          username: config.proxy.username
        },
        message: '프록시 연결 테스트 실패'
      };
    }
  }

  /**
   * IP 정보 조회
   */
  async getIpInfo() {
    try {
      const response = await this.get('https://httpbin.org/ip');
      
      if (response.status === 200) {
        return {
          success: true,
          ip: response.data.origin,
          proxy: true
        };
      }
      
      throw new Error(`HTTP ${response.status}`);
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// 싱글톤 인스턴스
const proxyService = new ProxyService();

module.exports = proxyService;