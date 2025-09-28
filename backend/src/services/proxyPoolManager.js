// axios 내장 proxy 설정을 사용하므로 외부 proxy agent 라이브러리 불필요

class ProxyPoolManager {
  constructor() {
    console.log('🌐 Proxy Pool Manager 초기화됨');
    this.proxyPool = [];
    this.performanceMetrics = new Map();
    this.sessionMap = new Map();
    this.config = {
      host: process.env.PROXY_HOST || 'proxy.smartproxy.net',
      port: process.env.PROXY_PORT || 3120,
      username: process.env.PROXY_USERNAME || 'smart-hqmx0000',
      password: process.env.PROXY_PASSWORD || 'Straight8',
      maxSessions: parseInt(process.env.PROXY_SESSION_COUNT) || 10,
      sessionDuration: parseInt(process.env.PROXY_SESSION_DURATION) || 600000, // 10분
    };
    
    this.regions = [
      { code: 'us', name: 'United States' },
      { code: 'de', name: 'Germany' },
      { code: 'gb', name: 'United Kingdom' },
      { code: 'jp', name: 'Japan' },
      { code: 'sg', name: 'Singapore' }
    ];
    
    this.initializeProxyPool();
  }

  /**
   * 프록시 풀 초기화
   */
  initializeProxyPool() {
    console.log('🔄 프록시 풀 초기화 중...');
    
    // 기본 프록시 (로테이팅)
    for (let i = 0; i < 3; i++) {
      this.proxyPool.push(this.createProxyConfig('default', i));
    }
    
    // 지역별 프록시 (Sticky 세션)
    this.regions.forEach(region => {
      this.proxyPool.push(this.createProxyConfig('regional', region.code, region));
    });
    
    console.log(`✅ ${this.proxyPool.length}개 프록시 풀 생성 완료`);
  }

  /**
   * 프록시 설정 생성
   */
  createProxyConfig(type, sessionId, region = null) {
    const sessionKey = `${type}_${sessionId}_${Date.now()}`;
    
    let username = this.config.username;
    if (region) {
      // 지역별 프록시: username-country_us
      username = `${this.config.username}-country_${region.code}`;
    } else {
      // 세션 기반 프록시: username-session-sessionId
      username = `${this.config.username}-session-${sessionKey}`;
    }

    const proxyConfig = {
      id: sessionKey,
      type: type, // 'default' | 'regional'
      region: region,
      host: this.config.host,
      port: this.config.port,
      username: username,
      password: this.config.password,
      url: `http://${username}:${this.config.password}@${this.config.host}:${this.config.port}`,
      // axios 내장 proxy 설정
      axiosProxyConfig: {
        protocol: 'http',
        host: this.config.host,
        port: this.config.port,
        auth: {
          username: username,
          password: this.config.password
        }
      },
      lastUsed: null,
      createdAt: Date.now(),
      isActive: true,
      performance: {
        latency: 0,
        throughput: 0,
        successRate: 1.0,
        totalRequests: 0,
        successfulRequests: 0
      }
    };

    return proxyConfig;
  }

  /**
   * 사용 가능한 모든 프록시 반환
   */
  getAllProxies() {
    return this.proxyPool.filter(proxy => proxy.isActive);
  }

  /**
   * 최적 프록시 선택 (성능 기반)
   */
  getBestProxies(count = 3) {
    const activeProxies = this.getAllProxies();
    
    // 성능 점수 계산 (지연시간, 처리량, 성공률 종합)
    const scoredProxies = activeProxies.map(proxy => {
      const perf = proxy.performance;
      
      // 점수 계산 (낮을수록 좋음)
      let score = 0;
      
      if (perf.totalRequests > 0) {
        // 지연시간 (ms) - 낮을수록 좋음
        score += perf.latency * 0.3;
        
        // 처리량 (MB/s) - 높을수록 좋음 (역수 사용)
        score += perf.throughput > 0 ? (1 / perf.throughput) * 100 * 0.4 : 1000;
        
        // 성공률 - 높을수록 좋음 (1-성공률 사용)
        score += (1 - perf.successRate) * 100 * 0.3;
      } else {
        // 아직 사용하지 않은 프록시는 중간 점수
        score = 100;
      }
      
      return {
        ...proxy,
        score: score
      };
    });
    
    // 점수 순으로 정렬 (낮은 점수가 더 좋음)
    scoredProxies.sort((a, b) => a.score - b.score);
    
    return scoredProxies.slice(0, count);
  }

  /**
   * 특정 지역 프록시 반환
   */
  getProxiesByRegion(regionCode) {
    return this.proxyPool.filter(proxy => 
      proxy.region && proxy.region.code === regionCode && proxy.isActive
    );
  }

  /**
   * 로테이팅 프록시 반환
   */
  getRotatingProxies() {
    return this.proxyPool.filter(proxy => 
      proxy.type === 'default' && proxy.isActive
    );
  }

  /**
   * 프록시 성능 업데이트
   */
  updateProxyPerformance(proxyId, metrics) {
    const proxy = this.proxyPool.find(p => p.id === proxyId);
    if (!proxy) return;

    const perf = proxy.performance;
    perf.totalRequests++;
    
    if (metrics.success) {
      perf.successfulRequests++;
    }
    
    // 이동 평균으로 메트릭 업데이트
    const alpha = 0.3; // 가중치
    
    if (metrics.latency) {
      perf.latency = perf.latency === 0 ? 
        metrics.latency : 
        perf.latency * (1 - alpha) + metrics.latency * alpha;
    }
    
    if (metrics.throughput) {
      perf.throughput = perf.throughput === 0 ? 
        metrics.throughput : 
        perf.throughput * (1 - alpha) + metrics.throughput * alpha;
    }
    
    // 성공률 업데이트
    perf.successRate = perf.successfulRequests / perf.totalRequests;
    
    proxy.lastUsed = Date.now();
    
    console.log(`📊 프록시 성능 업데이트: ${proxyId} - 지연: ${perf.latency.toFixed(0)}ms, 처리량: ${perf.throughput.toFixed(2)}MB/s, 성공률: ${(perf.successRate * 100).toFixed(1)}%`);
  }

  /**
   * 비활성 프록시 정리
   */
  cleanupInactiveProxies() {
    const now = Date.now();
    const maxAge = this.config.sessionDuration * 2; // 20분
    
    this.proxyPool.forEach(proxy => {
      if (proxy.lastUsed && (now - proxy.lastUsed) > maxAge) {
        proxy.isActive = false;
        console.log(`🗑️ 비활성 프록시 정리: ${proxy.id}`);
      }
    });
  }

  /**
   * 새 프록시 세션 생성
   */
  createNewSession(type = 'default', region = null) {
    const sessionId = Math.random().toString(36).substr(2, 9);
    const newProxy = this.createProxyConfig(type, sessionId, region);
    this.proxyPool.push(newProxy);
    
    console.log(`➕ 새 프록시 세션 생성: ${newProxy.id} (${type}${region ? ` - ${region.name}` : ''})`);
    return newProxy;
  }

  /**
   * 프록시 상태 보고
   */
  getStatus() {
    const activeProxies = this.getAllProxies();
    const totalRequests = activeProxies.reduce((sum, p) => sum + p.performance.totalRequests, 0);
    const avgLatency = activeProxies.reduce((sum, p) => sum + p.performance.latency, 0) / activeProxies.length;
    const avgThroughput = activeProxies.reduce((sum, p) => sum + p.performance.throughput, 0) / activeProxies.length;
    const avgSuccessRate = activeProxies.reduce((sum, p) => sum + p.performance.successRate, 0) / activeProxies.length;
    
    return {
      totalProxies: this.proxyPool.length,
      activeProxies: activeProxies.length,
      totalRequests: totalRequests,
      averageLatency: Math.round(avgLatency),
      averageThroughput: avgThroughput.toFixed(2),
      averageSuccessRate: (avgSuccessRate * 100).toFixed(1),
      regions: this.regions.map(region => ({
        code: region.code,
        name: region.name,
        proxies: this.getProxiesByRegion(region.code).length
      }))
    };
  }

  /**
   * 정리 작업
   */
  async cleanup() {
    console.log('🧹 Proxy Pool Manager 정리 중...');
    
    // 모든 프록시 비활성화
    this.proxyPool.forEach(proxy => {
      proxy.isActive = false;
    });
    
    this.proxyPool = [];
    this.performanceMetrics.clear();
    this.sessionMap.clear();
    
    console.log('✅ Proxy Pool Manager 정리 완료');
  }
}

module.exports = new ProxyPoolManager();