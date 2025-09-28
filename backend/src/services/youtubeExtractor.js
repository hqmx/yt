const axios = require('axios');
const proxyService = require('./proxyService');

class YouTubeExtractor {
  constructor() {
    console.log('🚀 HQMX YouTube Extractor 초기화됨');
    this.cache = new Map();
  }

  /**
   * YouTube URL에서 비디오 ID 추출
   */
  extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  /**
   * YouTube 페이지에서 초기 플레이어 응답 추출
   */
  async extractInitialPlayerResponse(videoId) {
    const cacheKey = `player_${videoId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    try {
      console.log(`🔍 YouTube 페이지 요청: ${videoUrl}`);
      
      const response = await proxyService.get(videoUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Sec-Ch-Ua': '"Not A;Brand";v="99", "Chromium";v="131", "Google Chrome";v="131"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: 페이지 로드 실패`);
      }

      const html = response.data;
      
      // ytInitialPlayerResponse 추출 - 다양한 패턴 시도
      const patterns = [
        /var ytInitialPlayerResponse = ({.+?});/,
        /window\["ytInitialPlayerResponse"\] = ({.+?});/,
        /"ytInitialPlayerResponse":\s*({.+?}),/,
        /ytInitialPlayerResponse = ({.+?});/
      ];

      let playerResponse = null;
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          try {
            playerResponse = JSON.parse(match[1]);
            console.log('✅ ytInitialPlayerResponse 추출 성공');
            break;
          } catch (parseError) {
            console.log(`⚠️ 파싱 실패, 다음 패턴 시도 중...`);
            continue;
          }
        }
      }

      if (!playerResponse) {
        throw new Error('ytInitialPlayerResponse를 찾을 수 없습니다');
      }

      // 5분간 캐시
      this.cache.set(cacheKey, playerResponse);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);

      return playerResponse;
      
    } catch (error) {
      console.error('❌ 초기 플레이어 응답 추출 실패:', error.message);
      throw error;
    }
  }

  /**
   * 스트리밍 데이터에서 포맷 정보 추출
   */
  extractFormats(streamingData) {
    if (!streamingData) {
      throw new Error('스트리밍 데이터가 없습니다');
    }

    const allFormats = [
      ...(streamingData.formats || []),
      ...(streamingData.adaptiveFormats || [])
    ];

    if (allFormats.length === 0) {
      throw new Error('사용 가능한 포맷이 없습니다');
    }

    return allFormats.map(format => {
      let downloadUrl = format.url;
      
      // signatureCipher 처리
      if (!downloadUrl && format.signatureCipher) {
        const params = new URLSearchParams(format.signatureCipher);
        const encodedUrl = params.get('url');
        if (encodedUrl) {
          downloadUrl = decodeURIComponent(encodedUrl);
        }
      }

      // 포맷 타입 판정
      const hasVideo = format.mimeType ? format.mimeType.includes('video') : false;
      const hasAudio = format.audioQuality || (format.mimeType ? format.mimeType.includes('audio') : false);
      
      return {
        itag: format.itag,
        url: downloadUrl,
        mimeType: format.mimeType,
        quality: format.quality,
        qualityLabel: format.qualityLabel,
        height: format.height,
        width: format.width,
        fps: format.fps,
        bitrate: format.bitrate,
        audioQuality: format.audioQuality,
        hasVideo: hasVideo,
        hasAudio: hasAudio,
        container: format.mimeType ? format.mimeType.split(';')[0].split('/')[1] : 'unknown',
        contentLength: format.contentLength
      };
    }).filter(format => format.url);
  }

  /**
   * 비디오 분석 - 메인 API
   */
  async analyze(videoUrl) {
    try {
      const videoId = this.extractVideoId(videoUrl);
      if (!videoId) {
        throw new Error('유효하지 않은 YouTube URL입니다');
      }

      console.log(`🎬 비디오 분석 시작: ${videoId}`);
      
      const playerResponse = await this.extractInitialPlayerResponse(videoId);
      
      // 비디오 정보 추출
      const videoDetails = playerResponse.videoDetails;
      const streamingData = playerResponse.streamingData;

      if (!videoDetails) {
        throw new Error('비디오 정보를 찾을 수 없습니다');
      }

      if (!streamingData) {
        throw new Error('스트리밍 데이터를 찾을 수 없습니다');
      }

      // 포맷 추출
      const formats = this.extractFormats(streamingData);
      
      // 품질별 분류
      const qualityOptions = this.categorizeByQuality(formats);
      
      const result = {
        videoId,
        title: videoDetails.title || '제목 없음',
        author: videoDetails.author || '알 수 없음',
        lengthSeconds: parseInt(videoDetails.lengthSeconds) || 0,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        formats: formats,
        qualityOptions: qualityOptions
      };

      console.log(`✅ 분석 완료: ${formats.length}개 포맷 발견`);
      return result;

    } catch (error) {
      console.error('❌ 비디오 분석 실패:', error.message);
      throw error;
    }
  }

  /**
   * 품질별로 포맷 분류
   */
  categorizeByQuality(formats) {
    const videoFormats = formats.filter(f => f.hasVideo);
    const audioFormats = formats.filter(f => f.hasAudio && !f.hasVideo);
    
    // 비디오 품질별 그룹화
    const qualityGroups = {};
    videoFormats.forEach(format => {
      if (format.height) {
        const quality = `${format.height}p`;
        if (!qualityGroups[quality]) {
          qualityGroups[quality] = [];
        }
        qualityGroups[quality].push(format);
      }
    });

    // 품질 옵션 생성
    const options = Object.keys(qualityGroups)
      .map(quality => ({
        quality,
        height: parseInt(quality.replace('p', '')),
        formats: qualityGroups[quality].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
      }))
      .sort((a, b) => b.height - a.height);

    return {
      video: options,
      audio: audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
    };
  }

  /**
   * 특정 품질의 다운로드 URL 반환
   */
  getDownloadUrl(formats, quality = '720p', preferAudio = false) {
    const targetHeight = parseInt(quality.replace('p', ''));
    
    if (preferAudio) {
      const audioFormats = formats.filter(f => f.hasAudio && !f.hasVideo);
      if (audioFormats.length > 0) {
        const best = audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        return {
          url: best.url,
          format: best,
          type: 'audio'
        };
      }
    }

    // 비디오+오디오 통합 포맷 우선
    const combinedFormats = formats.filter(f => 
      f.hasVideo && f.hasAudio && f.height === targetHeight
    );
    
    if (combinedFormats.length > 0) {
      const best = combinedFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      return {
        url: best.url,
        format: best,
        type: 'combined'
      };
    }
    
    // 비디오만 포맷
    const videoFormats = formats.filter(f => 
      f.hasVideo && f.height === targetHeight
    );
    
    if (videoFormats.length > 0) {
      const best = videoFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      return {
        url: best.url,
        format: best,
        type: 'video',
        requiresAudio: true
      };
    }
    
    // 가장 가까운 품질 찾기
    const allVideo = formats.filter(f => f.hasVideo && f.height);
    if (allVideo.length > 0) {
      const closest = allVideo.reduce((prev, curr) => 
        Math.abs(curr.height - targetHeight) < Math.abs(prev.height - targetHeight) ? curr : prev
      );
      return {
        url: closest.url,
        format: closest,
        type: 'fallback'
      };
    }
    
    throw new Error(`${quality} 품질을 찾을 수 없습니다`);
  }
}

module.exports = new YouTubeExtractor();