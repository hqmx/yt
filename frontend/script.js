document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let state = {
        currentTaskId: null,
        currentFormat: 'video',
        mediaInfo: null,
        eventSource: null
    };

    // --- CONFIGURATION ---
    // API 엔드포인트 설정
// 로컬 개발: http://localhost:5001
// 프로덕션: https://hqmx.net/api
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://hqmx.net/api';

    // --- DOM ELEMENT CACHE ---
    const dom = {
        themeToggleBtn: document.getElementById('themeToggleBtn'),
        urlInput: document.getElementById('urlInput'),
        analyzeBtn: document.getElementById('analyzeBtn'),
        analyzeBtnIcon: document.getElementById('analyzeBtn').querySelector('i'),
        analyzeBtnText: document.getElementById('analyzeBtn').querySelector('span'),
        previewSection: document.getElementById('previewSection'),
        thumbnailImg: document.getElementById('thumbnailImg'),
        mediaTitle: document.getElementById('mediaTitle'),
        mediaDuration: document.getElementById('mediaDuration'),
        formatTabs: document.querySelectorAll('.format-tab'),
        videoFormatsContainer: document.getElementById('videoFormats'),
        audioFormatsContainer: document.getElementById('audioFormats'),
        videoFormat: document.getElementById('videoFormat'),
        videoQuality: document.getElementById('videoQuality'),
        audioFormat: document.getElementById('audioFormat'),
        audioQuality: document.getElementById('audioQuality'),
        videoSizeEstimate: document.getElementById('videoSizeEstimate'),
        audioSizeEstimate: document.getElementById('audioSizeEstimate'),
        downloadBtn: document.getElementById('downloadBtn'),
        progressContainer: document.getElementById('progressSection'),
        spinner: document.querySelector('#progressSection .spinner'),
        progressStatus: document.getElementById('progressStatus'),
        progressPercentage: document.querySelector('#progressSection .progress-percentage'),
        progressBar: document.querySelector('#progressSection .progress-fill'),
    };

    // --- THEME MANAGEMENT ---
    const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.body.setAttribute('data-theme', currentTheme);

    // --- BACKGROUND IMAGE LOADING ---
    // 테마 설정 후 배경 이미지 로드
    const isMobile = window.innerWidth <= 768;
    const isDark = currentTheme === 'dark';

    let bgImage;
    if (isMobile) {
        bgImage = isDark ? 'assets/dkmbg.webp' : 'assets/mbg.webp';
    } else {
        bgImage = isDark ? 'assets/bgdk.webp' : 'assets/bg.webp';
    }

    const img = new Image();
    img.onload = () => {
        document.body.classList.add('bg-loaded');
    };
    img.onerror = () => {
        console.error('Background image failed to load:', bgImage);
        // 이미지 로드 실패해도 투명하지 않게 fallback
        document.body.classList.add('bg-loaded');
    };
    img.src = bgImage;

    function handleThemeToggle() {
        const newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    // --- EVENT LISTENERS ---
    dom.themeToggleBtn.addEventListener('click', handleThemeToggle);
    dom.analyzeBtn.addEventListener('click', handleAnalyzeClick);
    dom.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAnalyzeClick();
    });
    dom.formatTabs.forEach(tab => {
        tab.addEventListener('click', () => handleFormatSwitch(tab.dataset.mediaType));
    });
    [dom.videoFormat, dom.videoQuality, dom.audioFormat, dom.audioQuality].forEach(el => {
        el.addEventListener('change', updateSizeEstimates);
    });
    dom.downloadBtn.addEventListener('click', handleDownloadClick);

    // --- STATUS DISPLAY FUNCTION ---
    function showStatus(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        // 상태 메시지를 UI에 표시 (선택사항)
        // dom.statusDisplay && (dom.statusDisplay.textContent = message);
    }

    // --- HANDLER: Analyze URL ---
    async function handleAnalyzeClick() {
        console.log('🎯 Analyze button clicked!');
        const url = dom.urlInput.value.trim();
        console.log('🔗 URL:', url);
        
        if (!url) {
            console.log('❌ No URL provided');
            showError(t('please_enter_url'));
            return;
        }
        
        console.log('🚀 Starting analysis...');
        setAnalyzingState(true);
        resetUI();

        try {
            const currentLang = localStorage.getItem('language') || 'en';
            console.log('🌍 Language:', currentLang);
            console.log('🔄 API_BASE_URL:', API_BASE_URL);
            
            // 🚀 ULTIMATE SaveFrom 방식으로 분석 수행
            const clientAnalysisResult = await performUltimateAnalysis(url);
            console.log('✅ Analysis result:', clientAnalysisResult);
            
            state.mediaInfo = clientAnalysisResult;
            renderPreview(clientAnalysisResult);
            dom.previewSection.style.display = 'block';

        } catch (error) {
            console.error('❌ Analysis Error:', error);
            console.error('❌ Error stack:', error.stack);
            showError(t('analysis_failed', { error: error.message }));
        } finally {
            console.log('🏁 Analysis finished, resetting state...');
            setAnalyzingState(false);
        }
    }

    // --- HANDLER: Switch Format ---
    function handleFormatSwitch(type) {
        state.currentFormat = type;
        dom.formatTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mediaType === type));
        dom.videoFormatsContainer.classList.toggle('active', type === 'video');
        dom.audioFormatsContainer.classList.toggle('active', type === 'audio');
        updateSizeEstimates();
    }

    // --- HANDLER: Start Download ---
    async function handleDownloadClick() {
        if (!state.mediaInfo) {
            showError(t('please_analyze_first'));
            return;
        }
        const payload = {
            url: dom.urlInput.value.trim(),
            mediaType: state.currentFormat,
            formatType: state.currentFormat === 'video' ? dom.videoFormat.value : dom.audioFormat.value,
            quality: state.currentFormat === 'video' ? dom.videoQuality.value : dom.audioQuality.value,
            useClientIP: true
        };
        setDownloadingState(true);
        updateProgress(0, 'Requesting download...');

        try {
            const currentLang = localStorage.getItem('language') || 'en';
            const response = await fetch(`${API_BASE_URL}/download`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept-Language': currentLang
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok || !data.task_id) throw new Error(data.error || t('failed_to_start_download'));

            state.currentTaskId = data.task_id;
            startProgressMonitor(data.task_id);

        } catch (error) {
            console.error('Download Start Error:', error);
            showError(t('error_prefix', { error: error.message }));
            setDownloadingState(false);
        }
    }

    // --- REAL-TIME: Progress Monitoring via SSE ---
    function startProgressMonitor(taskId) {
        if (state.eventSource) state.eventSource.close();
        state.eventSource = new EventSource(`${API_BASE_URL}/stream-progress/${taskId}`);
        
        state.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.status === 'error') {
                   throw new Error(data.message);
                }
                updateProgress(data.percentage, data.message);
                if (data.status === 'complete') {
                   handleDownloadCompletion(taskId);
                }
            } catch (error) {
                console.error("SSE Message Error:", error)
                showError(t('error_prefix', { error: error.message }));
                handleDownloadTermination();
            }
        };
        
        state.eventSource.onerror = (err) => {
            console.error('SSE connection error:', err);
            showError(t('connection_lost_retrying'));
            setTimeout(() => fetchFinalStatus(taskId), 2000);
            handleDownloadTermination();
        };
    }
    
    // --- FINALIZATION ---
    function handleDownloadCompletion(taskId) {
        updateProgress(100, t('download_complete_transferring'));
        window.location.href = `${API_BASE_URL}/get-file/${taskId}`;
        setTimeout(() => setDownloadingState(false), 3000);
        handleDownloadTermination();
    }
    
    function handleDownloadTermination() {
        if (state.eventSource) {
            state.eventSource.close();
            state.eventSource = null;
        }
        state.currentTaskId = null;
    }

    async function fetchFinalStatus(taskId) {
        try {
            const response = await fetch(`${API_BASE_URL}/check-status/${taskId}`);
            const data = await response.json();
            if (data.status === 'complete') {
                handleDownloadCompletion(taskId);
            } else {
                showError(data.message || t('could_not_complete_task'));
                setDownloadingState(false);
            }
        } catch (error) {
            showError(t('could_not_retrieve_status'));
            setDownloadingState(false);
        }
    }

    // --- UI RENDERING & STATE ---
    function setAnalyzingState(isAnalyzing) {
        dom.analyzeBtn.disabled = isAnalyzing;
        dom.analyzeBtnIcon.className = isAnalyzing ? 'fas fa-spinner fa-spin' : 'fas fa-search';
        dom.analyzeBtnText.textContent = isAnalyzing ? t('analyzing') : t('analyze');
    }

    function setDownloadingState(isDownloading) {
        dom.downloadBtn.style.display = isDownloading ? 'none' : 'block';
        dom.progressContainer.style.display = isDownloading ? 'block' : 'none';
        if (!isDownloading) {
            updateProgress(0, '');
        }
    }
    
    function resetUI() {
        dom.previewSection.style.display = 'none';
        dom.thumbnailImg.src = '';
        dom.thumbnailImg.parentElement.classList.remove('fallback-active');
        state.mediaInfo = null;
        state.currentTaskId = null;
        setDownloadingState(false);
    }
    
    function renderPreview(info) {
        const thumbContainer = dom.thumbnailImg.parentElement;
        thumbContainer.classList.remove('fallback-active');
        dom.thumbnailImg.onerror = () => {
            thumbContainer.classList.add('fallback-active');
        };

        if (info.thumbnail) {
            dom.thumbnailImg.src = info.thumbnail;
        } else {
            thumbContainer.classList.add('fallback-active');
            dom.thumbnailImg.src = '';
        }

        dom.mediaTitle.textContent = info.title || t('mediaTitleDefault');
        
        const durationText = info.duration ? `${t('duration')}: ${formatDuration(info.duration)}` : `${t('duration')}: --:--`;
        dom.mediaDuration.innerHTML = `<i class="fas fa-clock"></i> ${durationText}`;

        populateQualityDropdowns(info);
        updateSizeEstimates();
    }
    
    function populateQualityDropdowns(info) {
        dom.videoQuality.innerHTML = '';
        
        const h264formats = info.video_formats?.filter(f => 
            f.vcodec?.startsWith('avc1') && f.height
        ) || [];

        let recommendedFormat = null;
        if (h264formats.length > 0) {
            recommendedFormat = h264formats.reduce((best, current) => 
                (current.height > best.height) ? current : best
            , h264formats[0]);
        }

        const allAvailableHeights = [...new Set(info.video_formats?.map(f => f.height).filter(h => h))].sort((a, b) => b - a);
        const addedValues = new Set();

        if (recommendedFormat) {
            const value = recommendedFormat.height.toString();
            const text = `${t('recommended')}: ${getQualityLabel(recommendedFormat.height)} (${t('fast')})`;
            dom.videoQuality.innerHTML += `<option value="${value}" selected>${text}</option>`;
            addedValues.add(value);
        }
        
        const bestOptionSelected = !recommendedFormat ? 'selected' : '';
        dom.videoQuality.innerHTML += `<option value="best" ${bestOptionSelected}>${t('bestQuality')} (${t('mayBeSlow')})</option>`;
        addedValues.add('best');

        allAvailableHeights.forEach(height => {
            const value = height.toString();
            if (!addedValues.has(value)) {
                dom.videoQuality.innerHTML += `<option value="${value}">${getQualityLabel(height)}</option>`;
                addedValues.add(value);
            }
        });
        
        const defaultAudioBitrates = [
            { value: '320', text: `320 kbps (${t('best')})` },
            { value: '256', text: `256 kbps (${t('high')})` },
            { value: '192', text: `192 kbps (${t('standard')})` },
            { value: '128', text: `128 kbps (${t('normal')})` },
        ];
        dom.audioQuality.innerHTML = '';
        defaultAudioBitrates.forEach(opt => {
            dom.audioQuality.innerHTML += `<option value="${opt.value}">${opt.text}</option>`;
        });
        dom.audioQuality.value = '192';
    }

    function updateProgress(percentage, message) {
        dom.progressContainer.style.display = 'block';
        const clampedPercentage = Math.min(100, Math.max(0, percentage));
        dom.progressBar.style.width = clampedPercentage + '%';
        dom.progressPercentage.textContent = Math.round(clampedPercentage) + '%';
        
        const cleanMessage = message.replace(/\[\d+(?:;\d+)*m/g, '');
        dom.progressStatus.textContent = cleanMessage;

        dom.spinner.style.display = clampedPercentage < 100 && clampedPercentage > 0 ? 'block' : 'none';
    }

    // --- UTILITY: Get Format Size ---
    function getFormatSize(format, duration, fallbackBitrate = 0) {
        if (!format && fallbackBitrate === 0) return 0;

        // First try to get direct size information
        const directSize = format?.filesize || format?.filesize_approx;
        if (directSize && directSize > 0) {
            return parseFloat(directSize);
        }
        
        // Calculate from bitrate and duration
        const bitrate = format?.tbr || format?.abr || format?.vbr || fallbackBitrate;
        if (bitrate && duration > 0) {
            return (parseFloat(bitrate) * 1000 / 8) * duration;
        }

        // Fallback estimation for formats with no size/bitrate info
        if (duration > 0) {
            // Estimate based on format type and quality
            let assumedBitrate = 192; // Default audio bitrate
            
            if (format?.vcodec) {
                // Video format - estimate based on resolution
                const height = format?.height || 360;
                if (height >= 1080) assumedBitrate = 8000; // 8 Mbps for 1080p+
                else if (height >= 720) assumedBitrate = 4000; // 4 Mbps for 720p
                else if (height >= 480) assumedBitrate = 2000; // 2 Mbps for 480p
                else assumedBitrate = 1000; // 1 Mbps for lower resolutions
            } else if (format?.acodec) {
                // Audio format - estimate based on quality
                const abr = format?.abr || 192;
                assumedBitrate = abr;
            }
            
            return (assumedBitrate * 1000 / 8) * duration;
        }
        
        return 0;
    }

    function updateSizeEstimates() {
        if (!state.mediaInfo) {
            console.log('No media info available');
            return;
        }

        const selectedMediaType = document.querySelector('.format-tab.active').dataset.mediaType;
        let estimatedSize = 0;
        let sizeEstimateEl;
        const duration = state.mediaInfo.duration || 0;

        console.log('Updating size estimates:', {
            selectedMediaType,
            duration,
            videoFormats: state.mediaInfo.video_formats?.length || 0,
            audioFormats: state.mediaInfo.audio_formats?.length || 0
        });

        if (selectedMediaType === 'video') {
            sizeEstimateEl = dom.videoSizeEstimate;
            const quality = dom.videoQuality.value;
            const videoFormats = state.mediaInfo.video_formats || [];
            const allAudioFormats = [...(state.mediaInfo.audio_formats || [])].sort((a, b) => (b.abr || 0) - (a.abr || 0));
            const bestAudio = allAudioFormats.length > 0 ? allAudioFormats[0] : null;

            console.log('Video size calculation:', {
                quality,
                videoFormatsCount: videoFormats.length,
                bestAudio: bestAudio ? { abr: bestAudio.abr, ext: bestAudio.ext } : null
            });

            if (quality === 'best') {
                const bestVideo = [...videoFormats].sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0))[0];
                const videoSize = getFormatSize(bestVideo, duration);
                const audioSize = getFormatSize(bestAudio, duration);
                estimatedSize = videoSize + audioSize;
                console.log('Best quality calculation:', { videoSize, audioSize, total: estimatedSize });
            } else {
                const selectedHeight = parseInt(quality);
                // First try to find a pre-merged format (video + audio)
                const premergedFormat = videoFormats.find(f => f.height === selectedHeight && f.vcodec && f.acodec);
                if (premergedFormat) {
                    estimatedSize = getFormatSize(premergedFormat, duration);
                    console.log('Pre-merged format found:', { height: premergedFormat.height, size: estimatedSize });
                } else {
                    // Find best video for selected height
                    const bestVideoForHeight = videoFormats.filter(f => f.height === selectedHeight && f.vcodec && !f.acodec).sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
                    if (bestVideoForHeight) {
                        const videoSize = getFormatSize(bestVideoForHeight, duration);
                        const audioSize = getFormatSize(bestAudio, duration);
                        estimatedSize = videoSize + audioSize;
                        console.log('Separate video+audio calculation:', { videoSize, audioSize, total: estimatedSize });
                    } else {
                        // Fallback to any video format with selected height
                        const anyVideoForHeight = videoFormats.find(f => f.height === selectedHeight);
                        const videoSize = getFormatSize(anyVideoForHeight, duration);
                        const audioSize = getFormatSize(bestAudio, duration);
                        estimatedSize = videoSize + audioSize;
                        console.log('Fallback calculation:', { videoSize, audioSize, total: estimatedSize });
                    }
                }
            }
        } else { // audio
            sizeEstimateEl = dom.audioSizeEstimate;
            const quality = dom.audioQuality.value;
            const formatType = dom.audioFormat.value;
            
            console.log('Audio size calculation:', { quality, formatType });
            
            // Find best matching audio format
            const audioFormats = state.mediaInfo.audio_formats || [];
            let bestMatch = audioFormats.find(f => f.ext === formatType) || audioFormats[0];
            
            if (bestMatch) {
                estimatedSize = getFormatSize(bestMatch, duration);
                console.log('Audio format match found:', { ext: bestMatch.ext, abr: bestMatch.abr, size: estimatedSize });
            } else {
                // Fallback calculation based on quality and format
                let fallbackBitrate = parseInt(quality);
                if (formatType === 'flac' || formatType === 'wav' || formatType === 'alac') {
                    fallbackBitrate = 1000; // Average for lossless formats
                }
                
                if (duration > 0) {
                    estimatedSize = (duration * fallbackBitrate * 1000) / 8;
                    console.log('Audio fallback calculation:', { fallbackBitrate, duration, size: estimatedSize });
                }
            }
        }

        console.log('Final estimated size:', estimatedSize);

        if (estimatedSize > 0) {
            const formattedSize = formatBytes(estimatedSize);
            sizeEstimateEl.textContent = `${t('sizeEstimateDefault').replace('--', formattedSize)}`;
            sizeEstimateEl.style.display = 'block';
            console.log('Size estimate updated:', formattedSize);
        } else {
            sizeEstimateEl.style.display = 'none';
            console.log('No size estimate available');
        }
    }
    
    // --- YouTube 분석 함수 ---
    async function performUltimateAnalysis(url) {
        console.log('🔥 Starting YouTube analysis for:', url);
        
        showStatus('🔄 YouTube 분석 중...', 'info');
        
        try {
            const response = await fetch(`${API_BASE_URL}/youtube/analyze`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept-Language': navigator.language || 'ko-KR',
                    'User-Agent': navigator.userAgent
                },
                body: JSON.stringify({ 
                    url
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                console.log('✅ YouTube analysis succeeded:', result);
                showStatus('✅ 분석 완료!', 'success');
                return {
                    success: true,
                    title: result.data.title,
                    thumbnail: result.data.thumbnail,
                    duration: result.data.duration,
                    formats: result.data.formats || [],
                    id: result.data.id,
                    original_url: url
                };
            } else {
                throw new Error(result.error?.message || 'Analysis failed');
            }
        } catch (error) {
            console.error('❌ YouTube analysis failed:', error);
            throw new Error(`분석 실패: ${error.message}`);
        }
    }

    // --- 🎭 사용자 정보 활용 고급 분석 ---
    async function performUserMimicAnalysis(url) {
        console.log('🎭 Starting user-mimic analysis for:', url);
        
        showStatus('🎭 사용자 프로필 수집 중...', 'info');
        
        // 고급 사용자 프로필 수집
        let userProfile = null;
        if (window.userProfileCollector) {
            console.log('🎭 Collecting comprehensive user profile...');
            userProfile = await window.userProfileCollector.updateProfile();
            console.log('✅ User profile collected:', {
                platform: userProfile.platform,
                language: userProfile.language,
                screen: `${userProfile.screen.width}x${userProfile.screen.height}`,
                timezone: userProfile.timezone,
                fingerprint: !!userProfile.fingerprint.canvas
            });
        }

        const requestData = {
            url: url,
            userProfile: userProfile
        };

        showStatus('🔍 SaveFrom 패턴으로 YouTube 접근 중...', 'info');

        const response = await fetch(`${API_BASE_URL}/user-mimic-analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept-Language': userProfile?.language || navigator.language,
                'User-Agent': userProfile?.userAgent || navigator.userAgent
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `User-mimic API error: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
            console.log('✅ User-mimic analysis succeeded:', result);
            
            // 성공 메시지에 사용된 프로필 정보 포함
            const profileInfo = result.profile_used ? 
                `(${result.profile_used.platform}, ${result.profile_used.language})` : '';
            
            showStatus(`✅ 고급 분석 성공! ${profileInfo} - 비디오: ${result.video_formats?.length || 0}개, 오디오: ${result.audio_formats?.length || 0}개`, 'success');
            
            // Terms of Service 준수 알림
            if (result.compliance_note) {
                console.log('📜 Compliance:', result.compliance_note);
            }
            
            return result;
        } else {
            throw new Error(result.message || 'User-mimic analysis failed');
        }
    }

    // --- UTILITY: User IP Analysis (백업용) ---
    async function performUserIPAnalysis(url) {
        console.log('Performing analysis with user IP for:', url);
        
        // 고급 사용자 정보 수집 시스템
        const userInfo = await collectComprehensiveUserData(url);
        
        // 사용자 세션 지속성 확보
        await establishPersistentSession(userInfo);
        
        console.log('User info:', userInfo);
        
        // 사용자의 고유 IP로 분석 요청
        const response = await fetch(`${API_BASE_URL}/user-analyze`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept-Language': userInfo.language
            },
            body: JSON.stringify({ 
                url, 
                userInfo: userInfo,
                analysisType: 'user_ip'
            })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'User IP analysis failed');
        
        return data;
    }
    
    // === 고급 사용자 데이터 수집 시스템 ===
    async function collectComprehensiveUserData(targetUrl) {
        const userInfo = {
            // 기본 브라우저 정보
            userAgent: navigator.userAgent,
            language: navigator.language,
            languages: navigator.languages,
            platform: navigator.platform,
            timestamp: Date.now(),
            
            // 화면 및 디스플레이 정보
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight
            },
            
            // 시간대 및 지역 정보
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezoneOffset: new Date().getTimezoneOffset(),
            
            // 고급 브라우저 핑거프린팅
            fingerprint: await generateAdvancedFingerprint(),
            
            // 쿠키 및 스토리지 정보
            cookies: document.cookie,
            localStorage: getLocalStorageData(),
            sessionStorage: getSessionStorageData(),
            
            // 네트워크 및 연결 정보
            connection: getConnectionInfo(),
            
            // 플러그인 및 확장 정보
            plugins: getPluginInfo(),
            
            // YouTube 특화 데이터
            youtubeData: await extractYouTubeData(targetUrl),
            
            // 사용자 행동 패턴
            behaviorPattern: getUserBehaviorPattern(),
            
            // 웹 비콘 데이터
            webBeaconData: await collectWebBeaconData()
        };
        
        return userInfo;
    }

    // 고급 브라우저 핑거프린팅
    async function generateAdvancedFingerprint() {
        const fingerprint = {
            // Canvas 핑거프린팅
            canvas: generateCanvasFingerprint(),
            
            // WebGL 핑거프린팅
            webgl: generateWebGLFingerprint(),
            
            // Audio Context 핑거프린팅
            audio: await generateAudioFingerprint(),
            
            // 폰트 감지
            fonts: detectInstalledFonts(),
            
            // 하드웨어 정보
            hardware: getHardwareInfo(),
            
            // 브라우저 특성
            browserFeatures: getBrowserFeatures()
        };
        
        return fingerprint;
    }

    // Canvas 핑거프린팅
    function generateCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 복잡한 그래픽 그리기
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('HQMX Canvas Fingerprint 🔒', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('Advanced Bot Detection', 4, 45);
            
            // 추가 그래픽 요소
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = 'rgb(255,0,255)';
            ctx.beginPath();
            ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();
            
            return {
                dataURL: canvas.toDataURL(),
                hash: hashString(canvas.toDataURL())
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // WebGL 핑거프린팅
    function generateWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            if (!gl) return { error: 'WebGL not supported' };
            
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            
            return {
                vendor: gl.getParameter(gl.VENDOR),
                renderer: gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
                unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
                extensions: gl.getSupportedExtensions()
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // Audio Context 핑거프린팅
    async function generateAudioFingerprint() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const analyser = audioContext.createAnalyser();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(10000, audioContext.currentTime);
            
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            
            oscillator.connect(analyser);
            analyser.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(0);
            
            const frequencyData = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(frequencyData);
            
            oscillator.stop();
            audioContext.close();
            
            return {
                sampleRate: audioContext.sampleRate,
                maxChannelCount: audioContext.destination.maxChannelCount,
                frequencyData: Array.from(frequencyData).slice(0, 50), // 처음 50개만
                hash: hashString(frequencyData.toString())
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // YouTube 특화 데이터 추출
    async function extractYouTubeData(targetUrl) {
        const youtubeData = {
            // YouTube 쿠키 추출
            youtubeCookies: extractYouTubeCookies(),
            
            // YouTube 세션 정보
            sessionInfo: getYouTubeSessionInfo(),
            
            // 사용자의 YouTube 활동 패턴
            activityPattern: getYouTubeActivityPattern(),
            
            // YouTube 관련 로컬 스토리지
            youtubeStorage: getYouTubeStorageData()
        };
        
        // 만약 대상 URL이 YouTube라면 추가 정보 수집
        if (targetUrl && targetUrl.includes('youtube.com')) {
            youtubeData.targetVideoInfo = await analyzeYouTubeUrl(targetUrl);
        }
        
        return youtubeData;
    }

    // YouTube 쿠키 추출
    function extractYouTubeCookies() {
        const cookies = document.cookie.split(';');
        const youtubeCookies = {};
        
        cookies.forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && (name.includes('youtube') || name.includes('VISITOR_INFO') || 
                       name.includes('YSC') || name.includes('PREF') || name.includes('GPS'))) {
                youtubeCookies[name] = value;
            }
        });
        
        return youtubeCookies;
    }

    // 사용자 세션 지속성 확보
    async function establishPersistentSession(userInfo) {
        // 고유 세션 ID 생성
        const sessionId = generateSessionId(userInfo);
        
        // 다양한 스토리지에 세션 정보 저장
        localStorage.setItem('hqmx_session', sessionId);
        sessionStorage.setItem('hqmx_session', sessionId);
        
        // 쿠키 설정 (1년 만료)
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = `hqmx_session=${sessionId}; expires=${expires.toUTCString()}; path=/; SameSite=None; Secure`;
        
        // IndexedDB에도 저장
        await storeInIndexedDB('hqmx_session', sessionId, userInfo);
        
        // 웹 비콘 설정
        setupWebBeacon(sessionId);
    }

    // 유틸리티 함수들
    function getLocalStorageData() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !key.includes('sensitive')) {
                data[key] = localStorage.getItem(key);
            }
        }
        return data;
    }

    function getConnectionInfo() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return connection ? {
            effectiveType: connection.effectiveType,
            downlink: connection.downlink,
            rtt: connection.rtt,
            saveData: connection.saveData
        } : null;
    }

    function getPluginInfo() {
        return Array.from(navigator.plugins).map(plugin => ({
            name: plugin.name,
            filename: plugin.filename,
            description: plugin.description
        }));
    }

    function hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    function generateSessionId(userInfo) {
        const data = JSON.stringify(userInfo) + Date.now() + Math.random();
        return hashString(data);
    }

    // 웹 비콘 설정
    function setupWebBeacon(sessionId) {
        const beacon = document.createElement('img');
        beacon.src = `${API_BASE_URL}/beacon?session=${sessionId}&timestamp=${Date.now()}`;
        beacon.style.display = 'none';
        beacon.width = 1;
        beacon.height = 1;
        document.body.appendChild(beacon);
    }

    // 누락된 함수들 구현
    function getSessionStorageData() {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && !key.includes('sensitive')) {
                data[key] = sessionStorage.getItem(key);
            }
        }
        return data;
    }

    function detectInstalledFonts() {
        const fonts = [
            'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Palatino',
            'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 'Impact'
        ];
        
        const detected = [];
        const testString = 'mmmmmmmmmmlli';
        const testSize = '72px';
        const baseFonts = ['monospace', 'sans-serif', 'serif'];
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        fonts.forEach(font => {
            let fontDetected = false; // 변수명 변경
            baseFonts.forEach(baseFont => {
                context.font = testSize + ' ' + baseFont;
                const baseWidth = context.measureText(testString).width;
                
                context.font = testSize + ' ' + font + ',' + baseFont;
                const width = context.measureText(testString).width;
                
                if (width !== baseWidth) {
                    fontDetected = true;
                }
            });
            if (fontDetected) {
                detected.push(font);
            }
        });
        
        return detected;
    }

    function getHardwareInfo() {
        return {
            hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
            deviceMemory: navigator.deviceMemory || 'unknown',
            maxTouchPoints: navigator.maxTouchPoints || 0,
            vendor: navigator.vendor || 'unknown',
            vendorSub: navigator.vendorSub || 'unknown',
            productSub: navigator.productSub || 'unknown'
        };
    }

    function getBrowserFeatures() {
        return {
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            javaEnabled: navigator.javaEnabled ? navigator.javaEnabled() : false,
            onLine: navigator.onLine,
            webdriver: navigator.webdriver || false,
            localStorage: !!window.localStorage,
            sessionStorage: !!window.sessionStorage,
            indexedDB: !!window.indexedDB,
            webGL: !!window.WebGLRenderingContext,
            webRTC: !!(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection)
        };
    }

    function getUserBehaviorPattern() {
        return {
            mouseMovements: window.mouseMovements || [],
            clickPatterns: window.clickPatterns || [],
            scrollBehavior: window.scrollBehavior || [],
            keyboardPatterns: window.keyboardPatterns || [],
            timeOnSite: Date.now() - (window.siteEntryTime || Date.now())
        };
    }

    async function collectWebBeaconData() {
        return {
            pageViews: localStorage.getItem('hqmx_page_views') || '0',
            sessionCount: localStorage.getItem('hqmx_session_count') || '0',
            lastVisit: localStorage.getItem('hqmx_last_visit') || 'never',
            referrer: document.referrer || 'direct'
        };
    }

    function getYouTubeSessionInfo() {
        return {
            hasYouTubeSession: document.cookie.includes('YSC') || document.cookie.includes('VISITOR_INFO'),
            youtubeLanguage: localStorage.getItem('yt-player-language') || 'unknown',
            youtubeQuality: localStorage.getItem('yt-player-quality') || 'unknown'
        };
    }

    function getYouTubeActivityPattern() {
        return {
            watchHistory: localStorage.getItem('yt-remote-session-app') ? 'present' : 'absent',
            searchHistory: localStorage.getItem('yt-remote-session-name') ? 'present' : 'absent',
            preferences: localStorage.getItem('yt-player-headers-readable') ? 'present' : 'absent'
        };
    }

    function getYouTubeStorageData() {
        const youtubeKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('yt-') || key.includes('youtube'))) {
                youtubeKeys.push(key);
            }
        }
        return youtubeKeys;
    }

    async function analyzeYouTubeUrl(url) {
        const videoId = extractVideoId(url);
        return {
            videoId: videoId,
            timestamp: Date.now(),
            referrer: document.referrer,
            userAgent: navigator.userAgent
        };
    }

    function extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async function storeInIndexedDB(key, value, metadata) {
        try {
            const request = indexedDB.open('HQMX_DB', 1);
            
            request.onupgradeneeded = function(event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('sessions')) {
                    db.createObjectStore('sessions', { keyPath: 'id' });
                }
            };
            
            request.onsuccess = function(event) {
                const db = event.target.result;
                const transaction = db.transaction(['sessions'], 'readwrite');
                const store = transaction.objectStore('sessions');
                
                store.put({
                    id: key,
                    value: value,
                    metadata: metadata,
                    timestamp: Date.now()
                });
            };
        } catch (e) {
            console.warn('IndexedDB storage failed:', e);
        }
    }

    // --- UTILITY: Client Side Analysis ---
    async function performClientSideAnalysis(url) {
        console.log('Performing client-side analysis for:', url);
        
        // 클라이언트 브라우저에서 직접 분석 수행
        const clientInfo = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            timestamp: Date.now(),
            screen: {
                width: screen.width,
                height: screen.height
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            cookies: document.cookie
        };
        
        console.log('Client info:', clientInfo);
        
        // 클라이언트 브라우저에서 직접 분석을 시도
        try {
            // 1. 클라이언트 브라우저에서 직접 분석 시도
            const clientAnalysisResult = await performDirectClientAnalysis(url, clientInfo);
            return clientAnalysisResult;
        } catch (clientError) {
            console.log('Client-side analysis failed, falling back to server:', clientError);
            
            // 2. 실패 시 서버에 클라이언트 정보와 함께 요청
            const response = await fetch(`${API_BASE_URL}/analyze`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept-Language': clientInfo.language
                },
                body: JSON.stringify({ 
                    url, 
                    useClientIP: true,
                    clientInfo: clientInfo
                })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Analysis failed');
            
            return data;
        }
    }
    
    // 클라이언트 브라우저에서 직접 분석 수행
    async function performDirectClientAnalysis(url, clientInfo) {
        console.log('Attempting direct client analysis...');
        
        // 클라이언트 브라우저에서 직접 분석을 시도
        // 이는 실제로는 클라이언트의 IP와 브라우저 환경을 사용
        const analysisData = {
            url,
            clientInfo,
            analysisType: 'direct_client',
            timestamp: Date.now()
        };
        
        // 클라이언트 브라우저에서 직접 분석을 수행하는 프록시 엔드포인트 호출
        const response = await fetch(`${API_BASE_URL}/client-analyze`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept-Language': clientInfo.language
            },
            body: JSON.stringify(analysisData)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Client analysis failed');
        
        return data;
    }

    // --- UTILITY FUNCTIONS ---
    function showError(message) {
        alert(message);
    }
    const formatDuration = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;
    const formatViews = (n) => n > 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n > 1000 ? `${(n/1000).toFixed(1)}K` : n.toString();
    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes'
        const k = 1024
        const dm = decimals < 0 ? 0 : decimals
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
    }
    const getQualityLabel = (h) => {
        if (h >= 3840) return `4K UHD (${h}p)`;
        if (h >= 2160) return `4K UHD (${h}p)`;
        if (h >= 1440) return `2K QHD (${h}p)`;
        if (h >= 1080) return `Full HD (${h}p)`;
        if (h >= 720) return `HD (${h}p)`;
        return `${h}p`;
    };
});
