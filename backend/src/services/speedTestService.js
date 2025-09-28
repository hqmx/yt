const axios = require('axios');
const proxyPoolManager = require('./proxyPoolManager');

class SpeedTestService {
  constructor() {
    console.log('⚡ Speed Test Service 초기화됨');
    this.testUrls = [
      'https://httpbin.org/bytes/10240', // 10KB test
      'https://httpbin.org/bytes/102400', // 100KB test
      'https://httpbin.org/bytes/1048576', // 1MB test
    ];
    this.testResults = new Map();
  }

  /**
   * 단일 프록시 속도 테스트
   */
  async testSingleProxy(proxy, testSize = 'medium') {
    const testUrl = this.getTestUrl(testSize);
    const startTime = Date.now();
    
    try {
      console.log(`🔍 프록시 속도 테스트 시작: ${proxy.id} (${proxy.region?.name || 'Default'})`);
      
      // 지연시간 측정 (GET 요청으로 변경)
      const latencyStart = Date.now();
      await axios.get('https://httpbin.org/status/200', {
        httpsAgent: proxy.httpsAgent,
        timeout: 10000,
      });
      const latency = Date.now() - latencyStart;
      
      // 처리량 측정 (GET 요청)
      const throughputStart = Date.now();
      const response = await axios.get(testUrl, {
        httpsAgent: proxy.httpsAgent,
        timeout: 30000,
        responseType: 'arraybuffer'
      });
      const throughputTime = Date.now() - throughputStart;
      
      // 처리량 계산 (MB/s)
      const dataSize = response.data.byteLength;
      const throughput = (dataSize / 1024 / 1024) / (throughputTime / 1000);
      
      const testResult = {
        proxyId: proxy.id,
        latency: latency,
        throughput: throughput,
        dataSize: dataSize,
        testTime: throughputTime,
        success: true,
        timestamp: Date.now(),
        region: proxy.region?.code || null
      };
      
      // 프록시 풀 매니저에 성능 업데이트
      proxyPoolManager.updateProxyPerformance(proxy.id, {
        latency: latency,
        throughput: throughput,
        success: true
      });
      
      console.log(`✅ 속도 테스트 완료: ${proxy.id} - 지연: ${latency}ms, 처리량: ${throughput.toFixed(2)}MB/s`);
      
      return testResult;
      
    } catch (error) {
      console.error(`❌ 속도 테스트 실패: ${proxy.id} - ${error.message}`);
      
      // 실패 기록
      proxyPoolManager.updateProxyPerformance(proxy.id, {
        success: false
      });
      
      return {
        proxyId: proxy.id,
        latency: 9999,
        throughput: 0,
        success: false,
        error: error.message,
        timestamp: Date.now(),
        region: proxy.region?.code || null
      };
    }
  }

  /**
   * 모든 프록시 병렬 속도 테스트
   */
  async testAllProxies(testSize = 'medium') {
    const proxies = proxyPoolManager.getAllProxies();
    console.log(`🚀 ${proxies.length}개 프록시 병렬 속도 테스트 시작...`);
    
    const testPromises = proxies.map(proxy => 
      this.testSingleProxy(proxy, testSize)
    );
    
    try {
      const results = await Promise.allSettled(testPromises);
      
      const successfulResults = results
        .filter(result => result.status === 'fulfilled' && result.value.success)
        .map(result => result.value);
      
      const failedResults = results
        .filter(result => result.status === 'rejected' || !result.value.success);
      
      console.log(`📊 속도 테스트 결과: 성공 ${successfulResults.length}/${proxies.length}`);
      
      // 결과 저장
      this.testResults.set('latest', {
        timestamp: Date.now(),
        successful: successfulResults,
        failed: failedResults.length,
        total: proxies.length
      });
      
      return this.analyzeResults(successfulResults);
      
    } catch (error) {
      console.error('❌ 병렬 속도 테스트 실패:', error);
      throw error;
    }
  }

  /**
   * 가장 빠른 프록시 찾기 (Race 방식)
   */
  async findFastestProxy(count = 3) {
    const proxies = proxyPoolManager.getBestProxies(10); // 상위 10개 후보
    console.log(`🏁 ${proxies.length}개 프록시로 속도 경쟁 시작...`);
    
    const racePromises = proxies.map(async (proxy, index) => {
      try {
        const result = await this.testSingleProxy(proxy, 'small');
        return {
          ...result,
          rank: index + 1,
          score: this.calculateScore(result)
        };
      } catch (error) {
        return null;
      }
    });
    
    try {
      // Promise.allSettled 사용하여 모든 결과 대기
      const raceResults = await Promise.allSettled(racePromises);
      
      const validResults = raceResults
        .filter(result => result.status === 'fulfilled' && result.value && result.value.success)
        .map(result => result.value)
        .sort((a, b) => a.score - b.score); // 낮은 점수가 더 좋음
      
      const winners = validResults.slice(0, count);
      
      console.log(`🏆 상위 ${winners.length}개 프록시 선정:`);
      winners.forEach((winner, index) => {
        console.log(`  ${index + 1}. ${winner.proxyId} - 점수: ${winner.score.toFixed(2)} (지연: ${winner.latency}ms, 처리량: ${winner.throughput.toFixed(2)}MB/s)`);
      });
      
      return winners;
      
    } catch (error) {
      console.error('❌ 프록시 속도 경쟁 실패:', error);
      throw error;
    }
  }

  /**
   * 지역별 최적 프록시 찾기
   */
  async findBestProxiesByRegion() {
    const regions = ['us', 'de', 'gb', 'jp', 'sg'];
    const regionalResults = {};
    
    console.log('🌍 지역별 최적 프록시 테스트 시작...');
    
    for (const regionCode of regions) {
      const regionalProxies = proxyPoolManager.getProxiesByRegion(regionCode);
      
      if (regionalProxies.length === 0) {
        console.log(`⚠️ ${regionCode.toUpperCase()} 지역 프록시 없음`);
        continue;
      }
      
      try {
        const testPromises = regionalProxies.map(proxy => 
          this.testSingleProxy(proxy, 'medium')
        );
        
        const results = await Promise.allSettled(testPromises);
        const successfulResults = results
          .filter(result => result.status === 'fulfilled' && result.value.success)
          .map(result => result.value);
        
        if (successfulResults.length > 0) {
          // 가장 좋은 프록시 선택
          const bestProxy = successfulResults.reduce((best, current) => 
            this.calculateScore(current) < this.calculateScore(best) ? current : best
          );
          
          regionalResults[regionCode] = bestProxy;
          console.log(`🌟 ${regionCode.toUpperCase()} 최적 프록시: ${bestProxy.proxyId} (지연: ${bestProxy.latency}ms)`);
        }
        
      } catch (error) {
        console.error(`❌ ${regionCode.toUpperCase()} 지역 테스트 실패:`, error);
      }
    }
    
    return regionalResults;
  }

  /**
   * 테스트 URL 선택
   */
  getTestUrl(size) {
    switch (size) {
      case 'small': return this.testUrls[0]; // 10KB
      case 'medium': return this.testUrls[1]; // 100KB
      case 'large': return this.testUrls[2]; // 1MB
      default: return this.testUrls[1];
    }
  }

  /**
   * 성능 점수 계산 (낮을수록 좋음)
   */
  calculateScore(result) {
    if (!result.success) return 9999;
    
    // 가중 점수: 지연시간(40%) + 처리량 역수(60%)
    const latencyScore = result.latency * 0.4;
    const throughputScore = result.throughput > 0 ? (1 / result.throughput) * 100 * 0.6 : 1000;
    
    return latencyScore + throughputScore;
  }

  /**
   * 결과 분석
   */
  analyzeResults(results) {
    if (results.length === 0) {
      return {
        summary: 'No successful tests',
        recommendations: []
      };
    }
    
    // 통계 계산
    const latencies = results.map(r => r.latency);
    const throughputs = results.map(r => r.throughput);
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
    const minLatency = Math.min(...latencies);
    const maxThroughput = Math.max(...throughputs);
    
    // 상위 프록시 선정
    const topProxies = results
      .map(result => ({ ...result, score: this.calculateScore(result) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
    
    // 지역별 성능 분석
    const regionalAnalysis = {};
    results.forEach(result => {
      const region = result.region || 'default';
      if (!regionalAnalysis[region]) {
        regionalAnalysis[region] = [];
      }
      regionalAnalysis[region].push(result);
    });
    
    const analysis = {
      summary: {
        totalTested: results.length,
        averageLatency: Math.round(avgLatency),
        averageThroughput: avgThroughput.toFixed(2),
        bestLatency: minLatency,
        bestThroughput: maxThroughput.toFixed(2),
      },
      topProxies: topProxies,
      regional: Object.keys(regionalAnalysis).map(region => ({
        region: region,
        count: regionalAnalysis[region].length,
        avgLatency: Math.round(regionalAnalysis[region].reduce((sum, r) => sum + r.latency, 0) / regionalAnalysis[region].length),
        avgThroughput: (regionalAnalysis[region].reduce((sum, r) => sum + r.throughput, 0) / regionalAnalysis[region].length).toFixed(2)
      })),
      recommendations: this.generateRecommendations(topProxies)
    };
    
    console.log('📋 속도 테스트 분석 완료:', analysis.summary);
    return analysis;
  }

  /**
   * 추천사항 생성
   */
  generateRecommendations(topProxies) {
    const recommendations = [];
    
    if (topProxies.length > 0) {
      const best = topProxies[0];
      recommendations.push(`최고 성능: ${best.proxyId} (지연: ${best.latency}ms, 처리량: ${best.throughput.toFixed(2)}MB/s)`);
      
      if (best.region) {
        recommendations.push(`${best.region.toUpperCase()} 지역이 현재 최적 성능을 보입니다`);
      }
      
      if (best.latency < 200) {
        recommendations.push('지연시간이 우수합니다 (200ms 이하)');
      } else if (best.latency > 500) {
        recommendations.push('지연시간 개선이 필요합니다 (500ms 초과)');
      }
      
      if (best.throughput > 5) {
        recommendations.push('처리량이 우수합니다 (5MB/s 이상)');
      } else if (best.throughput < 1) {
        recommendations.push('처리량 개선이 필요합니다 (1MB/s 이하)');
      }
    }
    
    return recommendations;
  }

  /**
   * 테스트 결과 조회
   */
  getLatestResults() {
    return this.testResults.get('latest');
  }

  /**
   * 정리 작업
   */
  async cleanup() {
    console.log('🧹 Speed Test Service 정리 중...');
    this.testResults.clear();
    console.log('✅ Speed Test Service 정리 완료');
  }
}

module.exports = new SpeedTestService();