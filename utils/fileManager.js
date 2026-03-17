const AdmZip = require('adm-zip');
const crypto = require('crypto');
const config = require('../config');

// ============ KESH TIZIMI ============
const fileCache = new Map();
const CACHE_TTL = config.CACHE_TTL_MS || 3600000;

// ============ CACHE STATISTICS ============
const cacheStats = {
    hits: 0,
    misses: 0,
    totalSize: 0,
    get hitRate() {
        const total = this.hits + this.misses;
        return total === 0 ? "0.0%" : ((this.hits / total) * 100).toFixed(1) + "%";
    }
};

const getCacheKey = (content) => {
    if (!content) return null;
    
    // Normalize string content for consistent hashing
    if (typeof content === 'string') {
        const normalized = content
            .replace(/\/\*[\s\S]*?\*\//g, "") // Block comments
            .replace(/\/\/.*/g, "") // Line comments
            .replace(/\s+/g, " ") // Whitespace
            .trim();
        return crypto.createHash('md5').update(normalized).digest('hex');
    }
    
    // Fallback for buffers
    return crypto.createHash('md5').update(content).digest('hex');
};

const getCachedResult = (key) => {
    if (!config.ENABLE_CACHING) return null;
    const cached = fileCache.get(key);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        cacheStats.hits++;
        return cached.data;
    }
    cacheStats.misses++;
    if (cached) fileCache.delete(key);
    return null;
};

const setCacheResult = (key, data) => {
    if (!config.ENABLE_CACHING) return;
    fileCache.set(key, { data, timestamp: Date.now() });
    
    // Kesh hajmini nazorat qilish
    if (fileCache.size > (config.CACHE_SIZE_LIMIT || 100)) {
        const firstKey = fileCache.keys().next().value;
        fileCache.delete(firstKey);
        console.log(`🧹 Kesh hajmi limitdan oshdi, eng eski element o'chirildi. (${fileCache.size})`);
    }
    
    cacheStats.totalSize = fileCache.size;
};

const getCacheStats = () => {
    return {
        ...cacheStats,
        currentEntries: fileCache.size
    };
};

// ============ FAYL FILTRLASH ============
const shouldSkipFile = (filePath) => {
    const lowerPath = filePath.toLowerCase();
    return config.SKIP_PATTERNS.some(pattern => lowerPath.includes(pattern.toLowerCase()));
};

const isCriticalFile = (filePath) => {
    const lowerPath = filePath.toLowerCase();
    return config.CRITICAL_PATTERNS.some(pattern => lowerPath.includes(pattern.toLowerCase()));
};

const isPriorityExtension = (filePath) => {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return config.PRIORITY_EXTENSIONS.includes(ext);
};

const isAllowedExtension = (filePath) => {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return config.ALLOWED_EXTENSIONS.includes(ext);
};

// ============ FAYL PRIORITET HISOBLASH ============
const calculatePriority = (filePath, fileSize) => {
    let priority = 50; // Boshlang'ich
    
    if (isCriticalFile(filePath)) priority += 30;
    if (isPriorityExtension(filePath)) priority += 15;
    if (fileSize < 10000) priority += 5; // Kichik fayllar tez
    
    return priority;
};

// ============ ASOSIY EXTRACTION FUNKSIYASI ============
const extractAndFilterProject = (zipBuffer) => {
    const startTime = Date.now();
    
    try {
        const zip = new AdmZip(zipBuffer);
        const zipEntries = zip.getEntries();
        
        // Statistika
        const stats = {
            totalFiles: 0,
            processedFiles: 0,
            skippedFiles: 0,
            oversizedFiles: 0,
            criticalFiles: [],
            totalSizeBytes: 0,
            processingTimeMs: 0
        };

        // Fayllarni yig'ish va tartiblash
        const fileList = [];
        
        zipEntries.forEach((entry) => {
            if (entry.isDirectory) return;
            
            const fullPath = entry.entryName;
            stats.totalFiles++;
            
            // Skip patterns tekshirish
            if (shouldSkipFile(fullPath)) {
                stats.skippedFiles++;
                return;
            }
            
            // Extension tekshirish
            if (!isAllowedExtension(fullPath)) {
                stats.skippedFiles++;
                return;
            }
            
            const fileSize = entry.header.size;
            
            // Hajm limiti
            if (fileSize > config.MAX_FILE_SIZE_KB * 1024) {
                stats.oversizedFiles++;
                console.log(`⚠️ Fayl juda katta, o'tkazib yuborildi: ${fullPath} (${(fileSize/1024).toFixed(1)}KB)`);
                return;
            }
            
            const priority = calculatePriority(fullPath, fileSize);
            
            fileList.push({
                entry,
                path: fullPath,
                size: fileSize,
                priority,
                isCritical: isCriticalFile(fullPath)
            });
        });

        // Prioritet bo'yicha tartiblash (yuqori → past)
        fileList.sort((a, b) => b.priority - a.priority);
        
        // Kod yig'ish (Array bilan - tezroq)
        const codeChunks = [];
        let currentSize = 0;
        const maxSize = config.MAX_TOTAL_CODE_SIZE_KB * 1024;
        
        for (const file of fileList) {
            // Jami hajm limitini tekshirish
            if (currentSize >= maxSize) {
                console.log(`⚠️ Jami kod limiti yetildi (${config.MAX_TOTAL_CODE_SIZE_KB}KB), qolgan fayllar o'tkazib yuborildi`);
                break;
            }
            
            try {
                let content = file.entry.getData().toString('utf8');
                
                // Agar fayl juda katta bo'lsa, qisqartirish
                if (content.length > 50000) {
                    content = content.substring(0, 50000) + '\n\n/* ... [TRUNCATED - File too large] ... */';
                }
                
                // Fayl ma'lumotini qo'shish
                const fileHeader = file.isCritical ? '🔴 CRITICAL' : '📄';
                codeChunks.push(`\n/* --- ${fileHeader} FILE: ${file.path} --- */\n${content}`);
                
                currentSize += content.length;
                stats.processedFiles++;
                stats.totalSizeBytes += content.length;
                
                if (file.isCritical) {
                    stats.criticalFiles.push(file.path);
                }
                
            } catch (err) {
                console.warn(`⚠️ Faylni o'qib bo'lmadi: ${file.path}`);
            }
        }

        stats.processingTimeMs = Date.now() - startTime;
        
        console.log(`📊 Extraction statistikasi:`);
        console.log(`   - Jami fayllar: ${stats.totalFiles}`);
        console.log(`   - Qayta ishlangan: ${stats.processedFiles}`);
        console.log(`   - O'tkazib yuborilgan: ${stats.skippedFiles}`);
        console.log(`   - Juda katta: ${stats.oversizedFiles}`);
        console.log(`   - Muhim fayllar: ${stats.criticalFiles.length}`);
        console.log(`   - Vaqt: ${stats.processingTimeMs}ms`);

        return { 
            combinedCode: codeChunks.join('\n'), 
            fileCount: stats.processedFiles,
            stats
        };
        
    } catch (e) {
        throw new Error("ZIP faylni o'qishda xatolik: " + e.message);
    }
};

// ============ CHUNKING FUNKSIYASI ============
const splitIntoChunks = (combinedCode, chunkSize = config.CHUNK_SIZE_CHARS) => {
    if (combinedCode.length <= chunkSize) {
        return [combinedCode];
    }
    
    const chunks = [];
    const files = combinedCode.split(/\n\/\* --- (?:🔴 CRITICAL |📄 )?FILE:/);
    
    let currentChunk = '';
    
    for (const file of files) {
        if (!file.trim()) continue;
        
        const fileContent = '/* --- FILE:' + file;
        
        // Agar bitta fayl juda katta bo'lsa
        if (fileContent.length > chunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            // Katta faylni bo'laklarga bo'lish
            for (let i = 0; i < fileContent.length; i += chunkSize) {
                chunks.push(fileContent.substring(i, i + chunkSize));
            }
            continue;
        }
        
        // Agar chunk limitiga yetsa
        if (currentChunk.length + fileContent.length > chunkSize) {
            chunks.push(currentChunk);
            currentChunk = fileContent;
        } else {
            currentChunk += fileContent;
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    console.log(`📦 Kod ${chunks.length} ta chunkga bo'lindi`);
    return chunks;
};

const clearCache = () => {
    fileCache.clear();
    cacheStats.hits = 0;
    cacheStats.misses = 0;
    cacheStats.totalSize = 0;
    console.log('🧹 Cache cleared successfully');
};

module.exports = { 
    extractAndFilterProject, 
    splitIntoChunks,
    getCacheKey,
    getCachedResult,
    setCacheResult,
    getCacheStats,
    clearCache
};