const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const proxyPoolManager = require('./proxyPoolManager');
const speedTestService = require('./speedTestService');

class ParallelDownloader {
  constructor() {
    console.log('⬇️ Parallel Downloader 초기화됨');
    this.activeDownloads = new Map();
    this.chunkSize = 1024 * 1024; // 1MB per chunk
    this.maxConcurrentChunks = 10;
    this.retryLimit = 3;
  }

  /**
   * 파일의 총 크기 확인
   */
  async getFileSize(url, proxy) {
    try {
      const response = await axios.head(url, {
        httpsAgent: proxy.httpsAgent,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
        }
      });

      const contentLength = parseInt(response.headers['content-length']);
      const acceptsRanges = response.headers['accept-ranges'] === 'bytes';

      return {
        size: contentLength,
        supportsRanges: acceptsRanges,
        headers: response.headers
      };

    } catch (error) {
      console.error(`❌ 파일 크기 확인 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 청크 다운로드
   */
  async downloadChunk(url, proxy, start, end, chunkIndex, retryCount = 0) {
    const chunkId = `chunk_${chunkIndex}_${start}_${end}`;
    
    try {
      console.log(`📦 청크 다운로드 시작: ${chunkId} (${proxy.id})`);
      
      const startTime = Date.now();
      const response = await axios.get(url, {
        httpsAgent: proxy.httpsAgent,
        timeout: 60000,
        responseType: 'arraybuffer',
        headers: {
          'Range': `bytes=${start}-${end}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
        }
      });

      const downloadTime = Date.now() - startTime;
      const dataSize = response.data.byteLength;
      const throughput = (dataSize / 1024 / 1024) / (downloadTime / 1000);

      // 성능 정보 업데이트
      proxyPoolManager.updateProxyPerformance(proxy.id, {
        latency: downloadTime,
        throughput: throughput,
        success: true
      });

      console.log(`✅ 청크 완료: ${chunkId} - ${dataSize}바이트 (${downloadTime}ms, ${throughput.toFixed(2)}MB/s)`);

      return {
        chunkIndex: chunkIndex,
        start: start,
        end: end,
        data: Buffer.from(response.data),
        size: dataSize,
        proxyId: proxy.id,
        downloadTime: downloadTime,
        throughput: throughput
      };

    } catch (error) {
      console.error(`❌ 청크 다운로드 실패: ${chunkId} - ${error.message}`);

      // 성능 정보 업데이트 (실패)
      proxyPoolManager.updateProxyPerformance(proxy.id, {
        success: false
      });

      // 재시도 로직
      if (retryCount < this.retryLimit) {
        console.log(`🔄 청크 재시도: ${chunkId} (${retryCount + 1}/${this.retryLimit})`);
        
        // 다른 프록시 시도
        const availableProxies = proxyPoolManager.getBestProxies(5);
        const nextProxy = availableProxies.find(p => p.id !== proxy.id) || proxy;
        
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // 지수적 백오프
        
        return this.downloadChunk(url, nextProxy, start, end, chunkIndex, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * 병렬 다운로드 실행
   */
  async downloadWithMultipleProxies(url, outputPath, options = {}) {
    const downloadId = `download_${Date.now()}`;
    
    try {
      console.log(`🚀 병렬 다운로드 시작: ${downloadId}`);
      console.log(`📍 URL: ${url.substring(0, 100)}...`);
      console.log(`💾 출력: ${outputPath}`);

      // 1. 최적 프록시들 선택
      console.log('🔍 최적 프록시 선택 중...');
      let bestProxies;
      
      if (options.testProxies) {
        const speedTestResults = await speedTestService.findFastestProxy(5);
        bestProxies = speedTestResults.map(result => 
          proxyPoolManager.getAllProxies().find(p => p.id === result.proxyId)
        ).filter(Boolean);
      } else {
        bestProxies = proxyPoolManager.getBestProxies(5);
      }

      if (bestProxies.length === 0) {
        throw new Error('사용 가능한 프록시가 없습니다');
      }

      console.log(`✅ ${bestProxies.length}개 프록시 선택됨`);

      // 2. 파일 크기 및 Range 지원 확인
      console.log('📏 파일 정보 확인 중...');
      const fileInfo = await this.getFileSize(url, bestProxies[0]);
      
      if (!fileInfo.size) {
        throw new Error('파일 크기를 확인할 수 없습니다');
      }

      console.log(`📊 파일 크기: ${(fileInfo.size / 1024 / 1024).toFixed(2)}MB`);
      console.log(`🔧 Range 지원: ${fileInfo.supportsRanges ? 'Yes' : 'No'}`);

      // 3. 단일 스트림 다운로드 (Range 미지원 시)
      if (!fileInfo.supportsRanges || fileInfo.size < this.chunkSize * 2) {
        console.log('📄 단일 스트림 다운로드 실행...');
        return this.downloadSingleStream(url, outputPath, bestProxies[0]);
      }

      // 4. 청크 계산
      const numChunks = Math.min(
        Math.ceil(fileInfo.size / this.chunkSize),
        this.maxConcurrentChunks,
        bestProxies.length * 2
      );
      
      const actualChunkSize = Math.ceil(fileInfo.size / numChunks);
      
      console.log(`🧩 ${numChunks}개 청크로 분할 (청크당 ${(actualChunkSize / 1024 / 1024).toFixed(2)}MB)`);

      // 5. 청크 정보 생성
      const chunks = [];
      for (let i = 0; i < numChunks; i++) {
        const start = i * actualChunkSize;
        const end = i === numChunks - 1 ? fileInfo.size - 1 : (i + 1) * actualChunkSize - 1;
        
        chunks.push({
          index: i,
          start: start,
          end: end,
          size: end - start + 1,
          proxy: bestProxies[i % bestProxies.length] // 프록시 순환 배정
        });
      }

      // 6. 병렬 청크 다운로드
      this.activeDownloads.set(downloadId, {
        status: 'downloading',
        totalSize: fileInfo.size,
        downloadedSize: 0,
        chunks: chunks,
        startTime: Date.now()
      });

      console.log('⬇️ 병렬 청크 다운로드 시작...');
      
      const chunkPromises = chunks.map(chunk => 
        this.downloadChunk(url, chunk.proxy, chunk.start, chunk.end, chunk.index)
      );

      // 진행상황 모니터링 (옵션)
      if (options.onProgress) {
        this.monitorProgress(downloadId, chunkPromises, options.onProgress);
      }

      const chunkResults = await Promise.allSettled(chunkPromises);

      // 7. 실패한 청크 체크
      const failedChunks = chunkResults
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.status === 'rejected');

      if (failedChunks.length > 0) {
        console.error(`❌ ${failedChunks.length}개 청크 다운로드 실패`);
        throw new Error(`청크 다운로드 실패: ${failedChunks.length}/${numChunks}`);
      }

      // 8. 청크 조립
      const successfulChunks = chunkResults
        .map(result => result.value)
        .sort((a, b) => a.chunkIndex - b.chunkIndex);

      console.log('🔧 청크 조립 중...');
      await this.assembleFile(successfulChunks, outputPath);

      // 9. 다운로드 완료 처리
      const totalTime = Date.now() - this.activeDownloads.get(downloadId).startTime;
      const avgThroughput = (fileInfo.size / 1024 / 1024) / (totalTime / 1000);

      this.activeDownloads.delete(downloadId);

      const result = {
        success: true,
        downloadId: downloadId,
        filePath: outputPath,
        fileSize: fileInfo.size,
        totalTime: totalTime,
        avgThroughput: avgThroughput,
        chunksUsed: numChunks,
        proxiesUsed: bestProxies.length,
        chunkStats: successfulChunks.map(chunk => ({
          index: chunk.chunkIndex,
          size: chunk.size,
          time: chunk.downloadTime,
          throughput: chunk.throughput,
          proxyId: chunk.proxyId
        }))
      };

      console.log(`🎉 병렬 다운로드 완료: ${(fileInfo.size / 1024 / 1024).toFixed(2)}MB in ${(totalTime / 1000).toFixed(1)}s (${avgThroughput.toFixed(2)}MB/s)`);
      
      return result;

    } catch (error) {
      console.error(`❌ 병렬 다운로드 실패: ${error.message}`);
      this.activeDownloads.delete(downloadId);
      throw error;
    }
  }

  /**
   * 단일 스트림 다운로드
   */
  async downloadSingleStream(url, outputPath, proxy) {
    console.log(`📄 단일 스트림 다운로드: ${proxy.id}`);
    
    const startTime = Date.now();
    
    try {
      const response = await axios.get(url, {
        httpsAgent: proxy.httpsAgent,
        responseType: 'stream',
        timeout: 120000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
        }
      });

      // 출력 디렉토리 생성
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const writeStream = fs.createWriteStream(outputPath);
      await pipeline(response.data, writeStream);

      const totalTime = Date.now() - startTime;
      const fileStats = fs.statSync(outputPath);
      const throughput = (fileStats.size / 1024 / 1024) / (totalTime / 1000);

      // 성능 업데이트
      proxyPoolManager.updateProxyPerformance(proxy.id, {
        latency: totalTime,
        throughput: throughput,
        success: true
      });

      console.log(`✅ 단일 스트림 완료: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB (${throughput.toFixed(2)}MB/s)`);

      return {
        success: true,
        filePath: outputPath,
        fileSize: fileStats.size,
        totalTime: totalTime,
        avgThroughput: throughput,
        chunksUsed: 1,
        proxiesUsed: 1,
        method: 'single-stream'
      };

    } catch (error) {
      // 실패 기록
      proxyPoolManager.updateProxyPerformance(proxy.id, {
        success: false
      });
      
      throw error;
    }
  }

  /**
   * 청크를 파일로 조립
   */
  async assembleFile(chunks, outputPath) {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(outputPath);

    for (const chunk of chunks) {
      writeStream.write(chunk.data);
    }

    writeStream.end();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        console.log('✅ 파일 조립 완료');
        resolve();
      });
      writeStream.on('error', reject);
    });
  }

  /**
   * 진행상황 모니터링
   */
  monitorProgress(downloadId, chunkPromises, onProgress) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return;

    const interval = setInterval(() => {
      const completedPromises = chunkPromises.filter(promise => 
        promise.isFulfilled || promise.isRejected
      );

      const progress = {
        downloadId: downloadId,
        totalChunks: chunkPromises.length,
        completedChunks: completedPromises.length,
        progressPercent: (completedPromises.length / chunkPromises.length * 100).toFixed(1),
        elapsedTime: Date.now() - download.startTime
      };

      onProgress(progress);

      // 완료 시 모니터링 중단
      if (completedPromises.length === chunkPromises.length) {
        clearInterval(interval);
      }
    }, 1000);
  }

  /**
   * 활성 다운로드 상태 조회
   */
  getDownloadStatus(downloadId) {
    return this.activeDownloads.get(downloadId);
  }

  /**
   * 모든 활성 다운로드 조회
   */
  getAllActiveDownloads() {
    return Array.from(this.activeDownloads.entries()).map(([id, download]) => ({
      id,
      ...download
    }));
  }

  /**
   * 다운로드 취소
   */
  cancelDownload(downloadId) {
    if (this.activeDownloads.has(downloadId)) {
      this.activeDownloads.delete(downloadId);
      console.log(`🛑 다운로드 취소됨: ${downloadId}`);
      return true;
    }
    return false;
  }

  /**
   * 정리 작업
   */
  async cleanup() {
    console.log('🧹 Parallel Downloader 정리 중...');
    
    // 모든 활성 다운로드 취소
    for (const downloadId of this.activeDownloads.keys()) {
      this.cancelDownload(downloadId);
    }
    
    console.log('✅ Parallel Downloader 정리 완료');
  }
}

module.exports = new ParallelDownloader();