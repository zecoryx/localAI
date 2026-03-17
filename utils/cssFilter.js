const crypto = require('crypto');

/**
 * CSS va keraksiz kod bloklarini promptdan tozalash
 */
function cleanDesignerPrompt(prompt) {
    let cleaned = prompt;
    const originalSize = prompt.length;
    
    // 1. Tailwind CSS
    cleaned = cleaned.replace(/\/\*!?\s*tailwindcss\s+v[\d.]+.*?\*\//gis, '');
    cleaned = cleaned.replace(/@layer\s+[\w-]+\s*\{[^}]*\}/gs, '');
    cleaned = cleaned.replace(/@supports\s*\([^)]+\)\s*\{[^}]*\}/gs, '');
    
    // 2. Bootstrap
    cleaned = cleaned.replace(/\/\*!?\s*Bootstrap\s+v[\d.]+.*?\*\//gis, '');
    
    // 3. Katta CSS bloklar (>500 char)
    cleaned = cleaned.replace(/\.[\w-]+\s*\{[^}]{500,}\}/g, '/* [Large CSS block removed] */');
    
    // 4. @import statements
    cleaned = cleaned.replace(/@import\s+.*?(bootstrap|tailwind|bulma|foundation)[^;]*;/gi, '');
    
    // 5. Vendor prefixes (-webkit-, -moz-, etc.)
    cleaned = cleaned.replace(/(-webkit-|-moz-|-ms-|-o-)[\w-]+\s*:[^;]+;/g, '');
    
    // 6. CSS variables declarations (if very long)
    cleaned = cleaned.replace(/:root\s*\{[^}]{1000,}\}/g, '/* [CSS variables removed] */');
    
    // 7. Normalize/Reset CSS
    cleaned = cleaned.replace(/\/\*!?\s*normalize\.css.*?\*\//gis, '');
    
    // 8. Multiple whitespaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/\n\s*\n/g, '\n');
    
    const removedSize = originalSize - cleaned.length;
    
    if (removedSize > 1000) {
        console.log(`🧹 CSS tozalandi: ${(removedSize/1024).toFixed(1)}KB olib tashlandi`);
        console.log(`   Oldin: ${(originalSize/1024).toFixed(1)}KB → Keyin: ${(cleaned.length/1024).toFixed(1)}KB`);
    }
    
    return cleaned.trim();
}

/**
 * Prompt uchun hash yaratish (kesh uchun)
 */
function getPromptHash(prompt) {
    return crypto.createHash('md5').update(prompt).digest('hex').substring(0, 8);
}

module.exports = {
    cleanDesignerPrompt,
    getPromptHash
};
