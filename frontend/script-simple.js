document.addEventListener('DOMContentLoaded', () => {
    // API 설정
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'http://hqmx.net/api';
    
    // DOM 요소
    const urlInput = document.getElementById('urlInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const previewSection = document.getElementById('previewSection');
    const thumbnailImg = document.getElementById('thumbnailImg');
    const mediaTitle = document.getElementById('mediaTitle');
    const mediaDuration = document.getElementById('mediaDuration');
    
    // 분석 버튼 클릭 이벤트
    analyzeBtn.addEventListener('click', handleAnalyze);
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAnalyze();
    });
    
    async function handleAnalyze() {
        const url = urlInput.value.trim();
        
        if (!url) {
            alert('URL을 입력해주세요.');
            return;
        }
        
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
            alert('YouTube URL을 입력해주세요.');
            return;
        }
        
        // 분석 시작
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>분석 중...</span>';
        
        try {
            console.log('🔄 Starting analysis for:', url);
            console.log('🔗 API URL:', API_BASE_URL + '/youtube/analyze');
            
            const response = await fetch(API_BASE_URL + '/youtube/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            });
            
            console.log('📊 Response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('✅ Analysis result:', result);
            
            if (result.success) {
                displayResult(result.data);
            } else {
                throw new Error(result.error?.message || 'Analysis failed');
            }
            
        } catch (error) {
            console.error('❌ Analysis failed:', error);
            alert('분석 실패: ' + error.message);
        } finally {
            // 버튼 복구
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-search"></i> <span>Analyze</span>';
        }
    }
    
    function displayResult(data) {
        console.log('🎬 Displaying result:', data);
        
        // 기본 정보 표시
        if (data.title) {
            mediaTitle.textContent = data.title;
        }
        
        if (data.thumbnail) {
            thumbnailImg.src = data.thumbnail;
            thumbnailImg.style.display = 'block';
        }
        
        if (data.duration && data.duration > 0) {
            const minutes = Math.floor(data.duration / 60);
            const seconds = data.duration % 60;
            mediaDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // 미리보기 섹션 표시
        previewSection.style.display = 'block';
        
        console.log('✅ Result displayed successfully');
    }
});