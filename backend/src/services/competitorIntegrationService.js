const saveFromExtractor = require('./extractors/saveFromExtractor');
const ssyoutubeExtractor = require('./extractors/ssyoutubeExtractor');
const playwrightExtractor = require('./extractors/playwrightExtractor');
const curlExtractor = require('./extractors/curlExtractor');
const youtube4kdownloaderExtractor = require('./extractors/youtube4kdownloaderExtractor');
const proxyPoolManager = require('./proxyPoolManager');
const parallelDownloader = require('./parallelDownloader');

class CompetitorIntegrationService {
  constructor() {
    console.log('🏢 Competitor Integration Service 초기화됨');
    
    this.extractors = {
      youtube4k: youtube4kdownloaderExtractor,
      curl: curlExtractor,
      playwright: playwrightExtractor,
      savefrom: saveFromExtractor,
      ssyoutube: ssyoutubeExtractor
    };
    
    this.defaultTimeout = 45000; // 45초
    this.retryLimit = 2;
  }

  /**
   * 여러 경쟁사 서비스를 통한 YouTube URL 추출 (Promise.race 방식)
   */
  async extractYouTubeDownloadUrl(videoUrl, options = {}) {
    const { quality = '720p', timeout = this.defaultTimeout, preferredService = null } = options;
    
    console.log(`🎯 경쟁사 URL 추출 시작: ${videoUrl} (${quality})`);
    console.log(`⚙️ 옵션: timeout=${timeout}ms, preferred=${preferredService || 'auto'}`);

    try {
      // 1. 사용 가능한 추출기 확인
      const availableExtractors = await this.getAvailableExtractors();
      
      if (availableExtractors.length === 0) {
        throw new Error('사용 가능한 추출 서비스가 없습니다');
      }

      console.log(`✅ ${availableExtractors.length}개 추출 서비스 사용 가능`);

      // 2. 선호 서비스가 지정된 경우 우선 시도
      if (preferredService && availableExtractors.includes(preferredService)) {
        console.log(`🎯 선호 서비스 우선 시도: ${preferredService}`);
        
        try {
          const result = await this.extractSingle(preferredService, videoUrl, quality, timeout);
          if (result.success) {
            return result;
          }
        } catch (error) {
          console.warn(`⚠️ 선호 서비스 실패: ${error.message}, 다른 서비스 시도...`);
        }
      }

      // 3. Promise.race() 방식으로 동시 시도
      console.log('🏁 여러 서비스 동시 시도 중...');
      
      const extractionPromises = availableExtractors.map(service => 
        this.extractSingle(service, videoUrl, quality, timeout)
          .then(result => ({ ...result, service }))
          .catch(error => ({ 
            success: false, 
            error: error.message, 
            service 
          }))
      );

      // 타임아웃과 함께 Promise.race 실행
      const racePromise = Promise.race(extractionPromises);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('추출 타임아웃')), timeout)
      );

      const result = await Promise.race([racePromise, timeoutPromise]);

      if (result.success) {
        console.log(`🎉 ${result.service} 추출 성공!`);
        return result;
      }

      // 4. 모든 서비스 실패 시 상세 결과 대기
      console.warn('🔄 첫 번째 시도 실패, 모든 결과 대기 중...');
      const allResults = await Promise.allSettled(extractionPromises);
      
      // 성공한 결과가 있는지 확인
      for (const settledResult of allResults) {
        if (settledResult.status === 'fulfilled' && settledResult.value.success) {
          console.log(`🎉 지연된 ${settledResult.value.service} 추출 성공!`);
          return settledResult.value;
        }
      }

      // 모든 서비스 실패
      const errors = allResults
        .filter(r => r.status === 'fulfilled')
        .map(r => `${r.value.service}: ${r.value.error}`)
        .join(', ');

      throw new Error(`모든 추출 서비스 실패: ${errors}`);

    } catch (error) {
      console.error(`❌ 경쟁사 URL 추출 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 단일 서비스를 통한 추출
   */
  async extractSingle(service, videoUrl, quality, timeout) {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 ${service} 추출 시작...`);
      
      let result;
      switch (service) {
        case 'youtube4k':
          result = await youtube4kdownloaderExtractor.extractDownloadUrl(videoUrl, quality, true);
          break;
        case 'curl':
          result = await curlExtractor.extractViaSSYouTube(videoUrl, quality, true);
          if (!result.success) {
            result = await curlExtractor.extractViaSaveFrom(videoUrl, quality, true);
          }
          break;
        case 'playwright':
          result = await playwrightExtractor.extractYouTubeDownloadUrl(videoUrl, { quality });
          break;
        case 'ssyoutube':
          result = await ssyoutubeExtractor.extractDownloadUrl(videoUrl, quality);
          break;
        case 'savefrom':
          result = await saveFromExtractor.extractDownloadUrl(videoUrl, quality);
          break;
        default:
          throw new Error(`지원하지 않는 서비스: ${service}`);
      }

      const extractionTime = Date.now() - startTime;
      console.log(`⏱️ ${service} 추출 시간: ${extractionTime}ms`);

      return {
        ...result,
        service: service,
        extractionTime: extractionTime
      };

    } catch (error) {
      const extractionTime = Date.now() - startTime;
      console.error(`❌ ${service} 추출 실패 (${extractionTime}ms): ${error.message}`);
      throw error;
    }
  }

  /**
   * 사용 가능한 추출기 목록 반환
   */
  async getAvailableExtractors() {
    const extractors = ['youtube4k', 'curl', 'playwright', 'ssyoutube', 'savefrom']; // youtube4k 최우선
    
    // 임시로 상태 체크를 우회하고 모든 추출기를 사용 가능으로 처리
    console.log('⚠️ 임시: 서비스 상태 체크 우회, 모든 추출기 활성화');
    return extractors;
    
    /*
    // 향후 다른 추출기 추가 시 여기서 상태 체크
    const availableExtractors = [];
    
    for (const extractor of extractors) {
      try {
        // 추출기 상태 체크 (간단한 테스트)
        if (extractor === 'savefrom') {
          const status = await saveFromExtractor.checkServiceStatus();
          if (status.available) {
            availableExtractors.push(extractor);
          }
        }
      } catch (error) {
        console.warn(`⚠️ ${extractor} 상태 체크 실패: ${error.message}`);
      }
    }
    
    return availableExtractors;
    */
  }

  /**
   * 경쟁사 서비스를 통한 전체 다운로드 프로세스
   */
  async downloadViaCompetitors(videoUrl, outputPath, options = {}) {
    const downloadId = `competitor_${Date.now()}`;
    
    try {
      console.log(`🚀 경쟁사 통합 다운로드 시작: ${downloadId}`);
      console.log(`📍 URL: ${videoUrl}`);
      console.log(`💾 출력: ${outputPath}`);

      // 1. 다운로드 URL 추출
      console.log('🔍 다운로드 URL 추출 중...');
      const extractResult = await this.extractYouTubeDownloadUrl(videoUrl, options);
      
      if (!extractResult.success) {
        throw new Error(`URL 추출 실패: ${extractResult.error}`);
      }

      console.log(`✅ URL 추출 성공: ${extractResult.service}`);
      console.log(`🔗 다운로드 URL: ${extractResult.downloadUrl.substring(0, 100)}...`);

      // 2. curl을 이용한 다운로드 (프록시 포함)
      console.log('⬇️ curl 파일 다운로드 시작...');
      
      let downloadResult;
      if (extractResult.service && (extractResult.service.includes('YouTube4KDownloader') || extractResult.service === 'youtube4k')) {
        // YouTube4K 추출기를 사용한 경우 전용 curl로 다운로드
        downloadResult = await youtube4kdownloaderExtractor.downloadWithCurl(
          extractResult.downloadUrl,
          outputPath,
          true, // 프록시 사용
          options.onProgress
        );
      } else if (extractResult.service && extractResult.service.includes('curl')) {
        // curl 추출기를 사용한 경우 curl로 다운로드
        downloadResult = await curlExtractor.downloadWithCurl(
          extractResult.downloadUrl,
          outputPath,
          true, // 프록시 사용
          options.onProgress
        );
      } else {
        // 기존 방식 (axios)
        downloadResult = await this.simpleDirectDownload(
          extractResult.downloadUrl,
          outputPath,
          options.onProgress
        );
      }

      console.log(`🎉 경쟁사 통합 다운로드 완료: ${outputPath}`);

      return {
        success: true,
        downloadId: downloadId,
        filePath: outputPath,
        extractionService: extractResult.service,
        extractionTime: extractResult.extractionTime,
        downloadStats: downloadResult,
        quality: options.quality || '720p',
        totalTime: (extractResult.extractionTime || 0) + (downloadResult.totalTime || 0)
      };

    } catch (error) {
      console.error(`❌ 경쟁사 통합 다운로드 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 지원되는 품질 옵션 반환
   */
  getSupportedQualities() {
    return ['1080p', '720p', '480p', '360p'];
  }

  /**
   * 간단한 직접 다운로드 (프록시 없이)
   */
  async simpleDirectDownload(downloadUrl, outputPath, onProgress = null) {
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    
    console.log(`📥 간단 다운로드: ${downloadUrl.substring(0, 100)}...`);
    console.log(`💾 출력 경로: ${outputPath}`);
    
    try {
      const startTime = Date.now();
      
      // 출력 디렉토리 생성
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // axios를 사용한 스트림 다운로드
      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*'
        }
      });

      const totalSize = parseInt(response.headers['content-length']) || 0;
      let downloadedSize = 0;

      // 파일 쓰기 스트림 생성
      const writeStream = fs.createWriteStream(outputPath);
      
      // 진행률 추적 (옵션)
      if (onProgress && totalSize > 0) {
        response.data.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progressPercent = ((downloadedSize / totalSize) * 100).toFixed(1);
          onProgress({
            downloadedSize,
            totalSize,
            progressPercent,
            elapsedTime: Date.now() - startTime
          });
        });
      }

      // 스트림 파이프라인
      response.data.pipe(writeStream);

      // 완료 대기
      return new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          const totalTime = Date.now() - startTime;
          const fileStats = fs.statSync(outputPath);
          const avgThroughput = (fileStats.size / 1024 / 1024) / (totalTime / 1000);
          
          console.log(`✅ 간단 다운로드 완료: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB (${avgThroughput.toFixed(2)}MB/s)`);
          
          resolve({
            success: true,
            filePath: outputPath,
            fileSize: fileStats.size,
            totalTime: totalTime,
            avgThroughput: avgThroughput,
            chunksUsed: 1,
            proxiesUsed: 0,
            method: 'direct-download'
          });
        });

        writeStream.on('error', (error) => {
          console.error(`❌ 간단 다운로드 실패: ${error.message}`);
          reject(error);
        });

        response.data.on('error', (error) => {
          console.error(`❌ 다운로드 스트림 오류: ${error.message}`);
          reject(error);
        });
      });

    } catch (error) {
      console.error(`❌ 간단 다운로드 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 서비스 상태 리포트
   */
  async getServiceStatus() {
    console.log('📊 경쟁사 서비스 상태 확인 중...');
    
    const services = ['playwright', 'savefrom'];
    const statusReports = [];

    for (const service of services) {
      try {
        let status;
        switch (service) {
          case 'playwright':
            status = { available: true, reason: 'Playwright browser automation available', responseTime: '<1000ms' };
            break;
          case 'savefrom':
            status = await saveFromExtractor.checkServiceStatus();
            break;
          default:
            status = { available: false, reason: 'Not implemented' };
        }

        statusReports.push({
          service: service,
          ...status,
          checkedAt: new Date().toISOString()
        });

      } catch (error) {
        statusReports.push({
          service: service,
          available: false,
          reason: error.message,
          checkedAt: new Date().toISOString()
        });
      }
    }

    return {
      totalServices: services.length,
      availableServices: statusReports.filter(s => s.available).length,
      services: statusReports,
      proxyStatus: proxyPoolManager.getStatus()
    };
  }
}

module.exports = new CompetitorIntegrationService();