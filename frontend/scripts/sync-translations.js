const fs = require('fs').promises;
const path = require('path');
const { translate } = require('@vitalets/google-translate-api');

const localesDir = path.join(__dirname, '..', 'locales');
const baseLang = 'en';
const baseLangFilePath = path.join(localesDir, `${baseLang}.json`);

const langMap = {
    'ar': 'ar', 'bn': 'bn', 'de': 'de', 'es': 'es', 'fil': 'tl', 
    'fr': 'fr', 'hi': 'hi', 'id': 'id', 'it': 'it', 'ja': 'ja', 
    'ko': 'ko', 'ms': 'ms', 'my': 'my', 'pt': 'pt', 'ru': 'ru', 
    'th': 'th', 'tr': 'tr', 'vi': 'vi', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW',
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function translateWithRetry(text, options, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            await delay(500 + (i * delayMs)); // Increase delay with each retry
            const result = await translate(text, options);
            return result;
        } catch (err) {
            if (err.message.includes('Too Many Requests') && i < retries - 1) {
                console.warn(`  ⚠️ API limit hit. Retrying in ${delayMs * (i + 1)}ms...`);
                await delay(delayMs * (i + 1));
            } else {
                throw err; // Re-throw other errors or on final retry
            }
        }
    }
}


async function syncAndTranslate() {
    try {
        console.log('🚀 Starting automatic translation process...');
        
        const baseTranslations = JSON.parse(await fs.readFile(baseLangFilePath, 'utf-8'));
        const baseKeys = Object.keys(baseTranslations);
        console.log(`✅ Found ${baseKeys.length} keys in en.json.`);

        for (const targetLang of Object.keys(langMap)) {
            const targetFilePath = path.join(localesDir, `${targetLang}.json`);
            let targetTranslations = {};
            let originalFileContent = '{}';

            try {
                const fileContent = await fs.readFile(targetFilePath, 'utf-8');
                originalFileContent = fileContent;
                if (fileContent.trim() !== '') {
                    targetTranslations = JSON.parse(fileContent);
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.warn(`⚠️ Could not read or parse ${targetLang}.json. Starting fresh.`);
                }
            }
            
            console.log(`\n---\n🔄 Processing ${targetLang}.json...`);

            const newTranslations = { ...targetTranslations };

            for (const key of baseKeys) {
                const sourceText = baseTranslations[key];
                const existingText = newTranslations[key];

                // Only translate if key is missing, empty, or the English source has changed
                // and we're not dealing with an already-translated (but different) value.
                // This logic prevents re-translating manually corrected values if the English source is stable.
                // A simple way to force re-translation is to empty the value in the target .json file.
                if (!existingText || existingText === '' || existingText === sourceText) {
                    try {
                        console.log(`  - Translating key '${key}'...`);
                        const { text } = await translateWithRetry(sourceText, { from: baseLang, to: langMap[targetLang] });
                        
                        if (text && text !== existingText) {
                            newTranslations[key] = text;
                            console.log(`    -> Translated to: "${text.substring(0, 50)}..."`);
                        }
                    } catch (err) {
                        console.error(`  ❌ Error translating key '${key}' for ${targetLang}:`, err.message);
                        if (!newTranslations[key]) {
                           newTranslations[key] = sourceText; // Fallback to English
                        }
                    }
                }
            }
            
            // Remove obsolete keys
            for (const key in newTranslations) {
                if (!baseTranslations.hasOwnProperty(key)) {
                    delete newTranslations[key];
                    console.log(`  - Removed obsolete key '${key}'`);
                }
            }

            const sortedTranslations = {};
            Object.keys(newTranslations).sort().forEach(key => {
                sortedTranslations[key] = newTranslations[key];
            });

            const newFileContent = JSON.stringify(sortedTranslations, null, 2);

            if (newFileContent !== originalFileContent) {
                await fs.writeFile(targetFilePath, newFileContent, 'utf-8');
                console.log(`💾 Saved updates for ${targetLang}.json`);
            } else {
                console.log(`👍 ${targetLang}.json is already up-to-date.`);
            }
        }

        console.log('\n---\n🎉 Automatic translation process complete!');
    } catch (error) {
        console.error('❌ An error occurred during the process:', error);
    }
}

syncAndTranslate();
