/**
 * Component-based website generation
 * Generates websites section by section for faster results
 */

// Component definitions
const COMPONENT_TYPES = {
    navbar: { priority: 1, estimatedTime: 8, keywords: ['nav', 'menu', 'header', 'navigation'] },
    hero: { priority: 2, estimatedTime: 12, keywords: ['hero', 'banner', 'main', 'landing'] },
    features: { priority: 3, estimatedTime: 15, keywords: ['features', 'services', 'benefits'] },
    pricing: { priority: 4, estimatedTime: 10, keywords: ['pricing', 'plans', 'packages'] },
    testimonials: { priority: 5, estimatedTime: 10, keywords: ['testimonial', 'review', 'feedback', 'customer'] },
    cta: { priority: 6, estimatedTime: 8, keywords: ['cta', 'call-to-action', 'signup'] },
    footer: { priority: 7, estimatedTime: 8, keywords: ['footer', 'contact', 'links'] },
    bento: { priority: 8, estimatedTime: 12, keywords: ['bento', 'grid', 'showcase', 'gallery'] },
    content: { priority: 9, estimatedTime: 8, keywords: ['about', 'story', 'mission', 'team'] },
};

/**
 * Auto-detect components from user prompt
 */
function detectComponents(userPrompt) {
    const lowerPrompt = userPrompt.toLowerCase();
    const detected = [];
    
    for (const [compType, config] of Object.entries(COMPONENT_TYPES)) {
        // Check if any keyword matches
        const hasKeyword = config.keywords.some(kw => lowerPrompt.includes(kw));
        if (hasKeyword) {
            detected.push(compType);
        }
    }
    
    // Default: navbar + hero + footer
    if (detected.length === 0) {
        return ['navbar', 'hero', 'footer'];
    }
    
    // Always include navbar and footer if not explicitly excluded
    if (!lowerPrompt.includes('no nav') && !detected.includes('navbar')) {
        detected.unshift('navbar');
    }
    if (!lowerPrompt.includes('no footer') && !detected.includes('footer')) {
        detected.push('footer');
    }
    
    return detected;
}

/**
 * Create focused prompt for single component
 */
function createComponentPrompt(componentType, userRequest, theme = {}) {
    const { primaryColor = '#007bff', backgroundColor = '#ffffff', textColor = '#333333' } = theme;
    
    const baseInstructions = `You are creating ONLY the ${componentType} component. Return valid JSON.

Required format:
{
  "type": "${componentType}",
  "title": "Main Heading",
  "subtitle": "Sub-heading or summary",
  "text": "Detailed body text or description",
  "ctaText": "Call to action button text",
  "styles": {
    "primary": "${primaryColor}",
    "background": "${backgroundColor}"
  }
}

User requirements: ${userRequest}`;

    const templates = {
        navbar: `${baseInstructions}
Create modern, responsive navigation with: brand logo, Home, About, Features, Pricing links.`,

        hero: `${baseInstructions}
Create engaging hero with: bold title, persuasive subtitle, and clear ctaText button.`,

        features: `${baseInstructions}
Create features list (JSON: "items": [{"title": "...", "desc": "..."}]) with 3 key benefits.`,

        pricing: `${baseInstructions}
Create pricing (JSON: "plans": [{"name": "...", "price": "...", "features": ["..."]}]) with 3 tiers.`,

        testimonials: `${baseInstructions}
Create testimonials (JSON: "items": [{"name": "...", "text": "..."}]) with 3 customer quotes.`,

        cta: `${baseInstructions}
Create urgent CTA with contrasting colors and high-conversion ctaText.`,

        footer: `${baseInstructions}
Create footer with: links, social icons, and copyright info.`
    };

    return templates[componentType] || baseInstructions;
}

/**
 * Estimate total generation time
 */
function estimateGenerationTime(components) {
    const total = components.reduce((sum, comp) => {
        return sum + (COMPONENT_TYPES[comp]?.estimatedTime || 10);
    }, 0);
    
    // Parallel execution (concurrency = 2)
    return Math.ceil(total / 2);
}

module.exports = {
    COMPONENT_TYPES,
    detectComponents,
    createComponentPrompt,
    estimateGenerationTime
};
