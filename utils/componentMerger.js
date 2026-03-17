/**
 * Merge individual components into cohesive page
 */

function mergeComponents(componentResults, userTheme = {}, metadata = {}) {
    // Extract theme from first component if not provided
    const theme = {
        primary: userTheme.primaryColor || componentResults[0]?.styles?.primary || '#007bff',
        background: userTheme.backgroundColor || componentResults[0]?.styles?.background || '#ffffff',
        text: userTheme.textColor || '#333333'
    };
    
    // Map components to sections
    const sections = componentResults
        .filter(comp => comp && comp.type) // Filter out failed components
        .map(comp => ({
            id: comp.type,
            type: comp.type,
            html: comp.html || `<div class="${comp.type}">Error generating component</div>`,
            styles: comp.styles || theme
        }));
    
    // Build full page structure
    const fullPage = {
        theme: theme,
        layout: 'vertical',
        sections: sections,
        metadata: {
            generated: new Date().toISOString(),
            method: 'chunked',
            componentsCount: sections.length,
            ...metadata
        }
    };
    
    return fullPage;
}

/**
 * Validate component result
 */
function validateComponent(component) {
    if (!component) return false;
    if (!component.type) return false;
    if (!component.html || component.html.trim().length === 0) return false;
    return true;
}

module.exports = {
    mergeComponents,
    validateComponent
};
