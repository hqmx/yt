const proxyService = require('./proxyService');
const { extractVideoId, isValidYouTubeUrl } = require('../utils/helpers');

class YouTubeStreamService {
  constructor() {
    console.log('🎬 YouTube Stream Service 초기화됨');
  }

  /**
   * YouTube 동영상의 실제 스트림 URL 추출
   */
  async getStreamUrls(videoId) {
    console.log(`🔥🔥🔥 getStreamUrls 함수 시작! videoId: ${videoId}`);
    try {
      console.log(`🔍 스트림 URL 추출 시작: ${videoId}`);
      
      // YouTube watch 페이지에서 player config 정보 추출
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      const response = await proxyService.get(videoUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'Connection': 'keep-alive',
          'Cache-Control': 'max-age=0'
        }
      });

      if (response.status !== 200 || !response.data) {
        throw new Error('YouTube 페이지를 가져올 수 없습니다');
      }

      const html = response.data;
      
      // ytInitialPlayerResponse에서 스트림 정보 추출
      console.log('🔍 HTML 크기:', html.length, '문자');
      
      // 다양한 패턴으로 시도
      let playerResponseMatch = html.match(/var ytInitialPlayerResponse = ({.*?});/);
      if (!playerResponseMatch) {
        playerResponseMatch = html.match(/window\["ytInitialPlayerResponse"\] = ({.*?});/);
      }
      if (!playerResponseMatch) {
        playerResponseMatch = html.match(/ytInitialPlayerResponse":\s*({.*?}),/);
      }
      if (!playerResponseMatch) {
        console.log('❌ 첫 1000자:', html.substring(0, 1000));
        throw new Error('플레이어 정보를 찾을 수 없습니다');
      }
      
      console.log('✅ playerResponse 패턴 매치됨');

      let playerResponse;
      try {
        playerResponse = JSON.parse(playerResponseMatch[1]);
        console.log('✅ JSON 파싱 성공');
      } catch (parseError) {
        console.error('❌ JSON 파싱 실패:', parseError.message);
        console.log('❌ 파싱 시도한 문자열 (첫 500자):', playerResponseMatch[1].substring(0, 500));
        throw parseError;
      }
      
      // 스트리밍 데이터 확인
      console.log('🔍 playerResponse 키들:', Object.keys(playerResponse));
      console.log('🔍 videoDetails 존재:', !!playerResponse?.videoDetails);
      console.log('🔍 streamingData 직접 존재:', !!playerResponse?.streamingData);
      
      const streamingData = playerResponse?.videoDetails?.streamingData || 
                          playerResponse?.streamingData;
      
      if (!streamingData) {
        console.log('❌ 스트리밍 데이터 없음. playerResponse 구조:');
        console.log(JSON.stringify(playerResponse, null, 2).substring(0, 2000));
        throw new Error('스트리밍 데이터를 찾을 수 없습니다');
      }
      
      console.log('✅ UNIQUE_STREAMING_DATA_FOUND_12345');
      
      try {
        console.log('🎯 UNIQUE_TEST_A_98765');
        const formatCount = streamingData.formats?.length || 0;
        console.log('🎯 UNIQUE_TEST_B_54321');
        const adaptiveFormatCount = streamingData.adaptiveFormats?.length || 0;
        console.log('🎯 UNIQUE_TEST_C_13579');
        console.log('🔍 Formats:', formatCount, 'AdaptiveFormats:', adaptiveFormatCount);
      } catch (logError) {
        console.error('❌ LOG_ERROR_24680:', logError.message);
      }

      // 포맷 정보 추출
      
      if (streamingData.formats?.length > 0) {
        console.log('🔍 첫 번째 format 샘플:', JSON.stringify(streamingData.formats[0], null, 2).substring(0, 500));
      }
      if (streamingData.adaptiveFormats?.length > 0) {
        console.log('🔍 첫 번째 adaptiveFormat 샘플:', JSON.stringify(streamingData.adaptiveFormats[0], null, 2).substring(0, 500));
      }
      
      const formats = [
        ...(streamingData.formats || []),
        ...(streamingData.adaptiveFormats || [])
      ];

      if (formats.length === 0) {
        throw new Error('사용 가능한 포맷을 찾을 수 없습니다');
      }
      
      console.log('🔍 합친 formats 길이:', formats.length);

      // 포맷 정보 정리
      const processedFormats = formats.map(format => {
        let downloadUrl = format.url;
        
        // signatureCipher 처리
        if (!downloadUrl && format.signatureCipher) {
          const params = new URLSearchParams(format.signatureCipher);
          const encodedUrl = params.get('url');
          if (encodedUrl) {
            downloadUrl = decodeURIComponent(encodedUrl);
            console.log(`🔓 signatureCipher 디코딩: ${format.itag}`);
          }
        }
        
        // YouTube 포맷 타입 판정
        const hasVideo = format.mimeType ? format.mimeType.includes('video') : false;
        const hasAudio = format.audioQuality ? true : (format.mimeType ? format.mimeType.includes('audio') : false);
        
        return {
          formatId: format.itag,
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
      }).filter(format => format.url); // URL이 있는 포맷만 포함

      console.log(`✅ ${processedFormats.length}개 포맷 추출 완료`);
      
      return {
        videoId,
        title: playerResponse?.videoDetails?.title || '제목 없음',
        author: playerResponse?.videoDetails?.author || '알 수 없음',
        lengthSeconds: playerResponse?.videoDetails?.lengthSeconds || 0,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        formats: processedFormats,
        availableQualities: this.extractQualityOptions(processedFormats)
      };

    } catch (error) {
      console.error('❌ 스트림 URL 추출 실패:', error.message);
      console.error('❌ 오류 스택:', error.stack);
      console.error('❌ 오류 발생 위치 추적 중...');
      
      // 빈 결과 반환 (오류 발생 시)
      return {
        videoId,
        title: '제목 없음',
        author: '알 수 없음',
        lengthSeconds: 0,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        formats: [],
        availableQualities: []
      };
    }
  }

  /**
   * 사용 가능한 품질 옵션 추출
   */
  extractQualityOptions(formats) {
    const qualities = new Set();
    
    formats.forEach(format => {
      if (format.height && format.hasVideo) {
        qualities.add(`${format.height}p`);
      }
    });

    return Array.from(qualities)
      .sort((a, b) => parseInt(b) - parseInt(a)) // 높은 품질부터
      .map(quality => ({
        label: quality,
        value: quality,
        height: parseInt(quality.replace('p', ''))
      }));
  }

  /**
   * 특정 품질의 스트림 URL 반환
   */
  getStreamUrlByQuality(formats, quality = '720p', mediaType = 'video') {
    const targetHeight = parseInt(quality.replace('p', ''));
    
    if (mediaType === 'video') {
      // 비디오+오디오 통합 포맷 우선
      const combinedFormats = formats.filter(f => 
        f.hasVideo && f.hasAudio && f.height === targetHeight
      );
      
      if (combinedFormats.length > 0) {
        const best = combinedFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        console.log(`✅ 통합 포맷 선택: ${best.formatId} (${best.qualityLabel})`);
        return {
          url: best.url,
          formatId: best.formatId,
          quality: best.qualityLabel,
          container: best.container,
          hasVideo: true,
          hasAudio: true
        };
      }
      
      // 비디오만 포맷
      const videoFormats = formats.filter(f => 
        f.hasVideo && !f.hasAudio && f.height === targetHeight
      );
      
      if (videoFormats.length > 0) {
        const best = videoFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        console.log(`✅ 비디오 포맷 선택: ${best.formatId} (${best.qualityLabel})`);
        return {
          url: best.url,
          formatId: best.formatId,
          quality: best.qualityLabel,
          container: best.container,
          hasVideo: true,
          hasAudio: false,
          requiresAudioMerge: true
        };
      }
      
      // 가장 가까운 품질 찾기
      const allVideo = formats.filter(f => f.hasVideo && f.height);
      if (allVideo.length > 0) {
        const closest = allVideo.reduce((prev, curr) => 
          Math.abs(curr.height - targetHeight) < Math.abs(prev.height - targetHeight) ? curr : prev
        );
        console.log(`⚠️ 근사 품질 선택: ${closest.formatId} (${closest.qualityLabel})`);
        return {
          url: closest.url,
          formatId: closest.formatId,
          quality: closest.qualityLabel,
          container: closest.container,
          hasVideo: true,
          hasAudio: closest.hasAudio
        };
      }
    }
    
    if (mediaType === 'audio') {
      const audioFormats = formats.filter(f => f.hasAudio && !f.hasVideo);
      
      if (audioFormats.length > 0) {
        const best = audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        console.log(`✅ 오디오 포맷 선택: ${best.formatId}`);
        return {
          url: best.url,
          formatId: best.formatId,
          quality: best.audioQuality,
          container: best.container,
          hasVideo: false,
          hasAudio: true
        };
      }
    }
    
    throw new Error(`${quality} ${mediaType} 포맷을 찾을 수 없습니다`);
  }

  /**
   * 다운로드를 위한 스트림 URL과 헤더 정보 반환
   */
  async getDownloadInfo(videoId, options = {}) {
    const { quality = '720p', mediaType = 'video', format = 'mp4' } = options;
    
    try {
      const streamData = await this.getStreamUrls(videoId);
      const streamUrl = this.getStreamUrlByQuality(streamData.formats, quality, mediaType);
      
      return {
        success: true,
        videoId,
        title: streamData.title,
        author: streamData.author,
        duration: streamData.lengthSeconds,
        thumbnail: streamData.thumbnail,
        downloadUrl: streamUrl.url,
        formatInfo: streamUrl,
        quality: quality,
        mediaType: mediaType,
        format: format,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': `https://www.youtube.com/watch?v=${videoId}`
        }
      };
      
    } catch (error) {
      console.error(`❌ 다운로드 정보 생성 실패 (${videoId}):`, error);
      throw error;
    }
  }
}

module.exports = new YouTubeStreamService();