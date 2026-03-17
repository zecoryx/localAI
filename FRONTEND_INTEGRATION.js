// Frontend Integration Example
// How to use the new streaming /generate-chunked endpoint

// ============ METHOD 1: Server-Sent Events (Recommended) ============

function generateWebsiteStreaming(prompt, components = null, theme = {}) {
    const eventSource = new EventSource(
        'http://192.168.100.97:7777/generate-chunked',
        {
            headers: {
                'x-api-key': 'z3c0ryx',
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({
                prompt: prompt,
                components: components, // null = auto-detect
                theme: {
                    primaryColor: theme.primary || '#007bff',
                    backgroundColor: theme.bg || '#ffffff',
                    textColor: theme.text || '#333333'
                }
            })
        }
    );

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
            case 'start':
                console.log('🎨 Starting generation:', data.components);
                console.log('⏱️  Estimated time:', data.estimatedTime + 's');
                // Show loading with component list
                showLoadingScreen(data.components, data.estimatedTime);
                break;
                
            case 'progress':
                console.log(`🔄 Generating: ${data.component} (${data.progress}%)`);
                // Update progress bar
                updateProgress(data.progress, data.component);
                break;
                
            case 'component':
                console.log(`✅ Component ready: ${data.data.type}`);
                // RENDER IMMEDIATELY - don't wait for others!
                renderComponent(data.data, data.index);
                updateProgress(data.progress);
                break;
                
            case 'complete':
                console.log('✅ All done!', data.stats);
                eventSource.close();
                // Final cleanup, show success
                onGenerationComplete(data.data, data.stats);
                break;
                
            case 'error':
                console.error('❌ Error:', data.error);
                if (data.component) {
                    showComponentError(data.component, data.error);
                }
                break;
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        eventSource.close();
        showError('Connection lost');
    };
}

// Usage example:
generateWebsiteStreaming(
    'Create a modern SaaS landing page with pricing and testimonials',
    null, // Auto-detect components
    { primary: '#6366f1', bg: '#ffffff', text: '#1f2937' }
);


// ============ METHOD 2: Axios/Fetch with streaming (Advanced) ============

async function generateWebsiteAxiosStream(prompt) {
    const response = await fetch('http://192.168.100.97:7777/generate-chunked', {
        method: 'POST',
        headers: {
            'x-api-key': 'z3c0ryx',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: prompt,
            components: ['navbar', 'hero', 'features', 'footer']
        })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = JSON.parse(line.substring(6));
                
                if (data.type === 'component') {
                    // Render immediately!
                    renderComponent(data.data);
                }
            }
        }
    }
}


// ============ METHOD 3: Old /generate (Non-streaming) ============

async function generateWebsiteNonStreaming(prompt) {
    // CSS filtering happens automatically now!
    const response = await axios.post('http://192.168.100.97:7777/generate', {
        prompt: prompt,  // No need to remove CSS manually
        role: 'designer'
    }, {
        headers: { 'x-api-key': 'z3c0ryx' }
    });
    
    return response.data.data;
}


// ============ HELPER FUNCTIONS ============

function renderComponent(component, index) {
    const container = document.getElementById('preview');
    
    // Create component wrapper
    const wrapper = document.createElement('div');
    wrapper.className = component.type;
    wrapper.innerHTML = component.html;
    
    // Apply styles
    if (component.styles) {
        wrapper.style.setProperty('--primary', component.styles.primary);
        wrapper.style.setProperty('--background', component.styles.background);
    }
    
    // Insert at correct position
    if (index !== undefined) {
        const existing = container.children[index];
        if (existing) {
            container.insertBefore(wrapper, existing);
        } else {
            container.appendChild(wrapper);
        }
    } else {
        container.appendChild(wrapper);
    }
    
    // Animate in
    wrapper.style.opacity = '0';
    wrapper.style.transform = 'translateY(20px)';
    setTimeout(() => {
        wrapper.style.transition = 'all 0.3s ease';
        wrapper.style.opacity = '1';
        wrapper.style.transform = 'translateY(0)';
    }, 50);
}

function updateProgress(percent, component = '') {
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status-text');
    
    progressBar.style.width = percent + '%';
    statusText.textContent = component ? `Generating ${component}... ${percent}%` : `${percent}%`;
}

function showLoadingScreen(components, estimatedTime) {
    console.log('Components to generate:', components);
    console.log('Estimated time:', estimatedTime + ' seconds');
    // Show UI with component list and progress bar
}

function onGenerationComplete(fullPage, stats) {
    console.log('✅ Generation complete!');
    console.log('Stats:', stats);
    // Hide loading, show success message
}


// ============ COMPARISON ============

/*
OLD WAY (slow, timeout):
- Send 30KB prompt
- Wait 180s (or timeout)
- Get result or error
- User sees NOTHING during generation

NEW WAY (fast, progressive):
- CSS auto-removed (30KB → 3KB)
- Components stream as ready:
  * Navbar ready after 8s → SHOW IT!
  * Hero ready after 20s → SHOW IT!
  * Features ready after 35s → SHOW IT!
- User sees progress in REAL TIME
- Total: 35s instead of 180s
*/
