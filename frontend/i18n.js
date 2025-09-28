// Global translation function for use in other scripts
let globalTranslations = {};

// Global t function for use in other scripts
function t(key, fallback = key) {
    return globalTranslations[key] || fallback;
}

document.addEventListener('DOMContentLoaded', () => {
    const languageSelectorBtn = document.getElementById('language-selector-btn');
    const languageOptions = document.getElementById('language-options');
    const currentLanguageSpan = document.getElementById('current-language');
    const languageSwitcher = document.querySelector('.language-switcher');

    const languages = {
        'en': 'English',
        'de': 'Deutsch',
        'es': 'Español',
        'fr': 'Français',
        'hi': 'हिन्दी / Hindī',
        'id': 'Bahasa Indonesia',
        'it': 'Italiano',
        'ko': '한국어',
        'ja': '日本語',
        'my': 'Myanmar (မြန်မာ)',
        'ms': 'Malay',
        'fil': 'Filipino',
        'pt': 'Português',
        'ru': 'Русский',
        'th': 'ไทย',
        'tr': 'Türkçe',
        'vi': 'Tiếng Việt',
        'zh-CN': '简体中文',
        'zh-TW': '繁體中文',
        'ar': 'عربي',
        'bn': 'বাঙালি'
    };

    let currentLang = localStorage.getItem('language') || 'en';

    async function fetchTranslations(lang) {
        try {
            const response = await fetch(`locales/${lang}.json`);
            if (!response.ok) {
                // If a specific language file is not found, fall back to English
                console.warn(`Translation file for ${lang} not found. Falling back to English.`);
                const fallbackResponse = await fetch(`locales/en.json`);
                return await fallbackResponse.json();
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching translation file:', error);
            // Fallback to English in case of any error
            const fallbackResponse = await fetch(`locales/en.json`);
            return await fallbackResponse.json();
        }
    }

    async function applyTranslations(lang) {
        let translations = await fetchTranslations(lang);
        
        // If the translation file is empty, fall back to English
        if (Object.keys(translations).length === 0 && lang !== 'en') {
            console.warn(`Translation for ${lang} is empty. Falling back to English.`);
            translations = await fetchTranslations('en');
        }

        // Update global translations for use in other scripts
        globalTranslations = translations;

        document.querySelectorAll('[data-i18n-key]').forEach(element => {
            const key = element.getAttribute('data-i18n-key');
            if (translations[key]) {
                element.innerHTML = translations[key];
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            let key = element.getAttribute('data-i18n-placeholder');
            
            // Use short placeholder for mobile screens if available
            if (window.innerWidth <= 768 && key === 'urlInputPlaceholder') {
                const shortKey = 'urlInputPlaceholderShort';
                if (translations[shortKey]) {
                    key = shortKey;
                }
            }
            
            if (translations[key]) {
                element.placeholder = translations[key];
            }
        });

        // Update the language selector button text
        currentLanguageSpan.textContent = languages[lang] || 'Language';

        // Update html lang attribute
        document.documentElement.lang = lang;

        // Handle RTL languages
        if (['ar'].includes(lang)) {
            document.body.dir = 'rtl';
        } else {
            document.body.dir = 'ltr';
        }
    }

    function setLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('language', lang);
        applyTranslations(lang);
        languageSwitcher.classList.remove('open');
    }

    // Toggle language options
    languageSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        languageSwitcher.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!languageSwitcher.contains(e.target)) {
            languageSwitcher.classList.remove('open');
        }
    });

    // Set language when an option is clicked
    languageOptions.addEventListener('click', (e) => {
        e.preventDefault();
        const target = e.target;
        if (target.tagName === 'A' && target.dataset.lang) {
            const lang = target.dataset.lang;
            setLanguage(lang);
        }
    });

    // Initial load
    setLanguage(currentLang);
});
