// Global Event Handlers - Clicks, Drag & Drop

// Main click delegation for login, navigation, and entry interactions
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }
    // Login & Navigation
    if (target.closest('#loginBtn')) {
        const email = document.getElementById('emailInput').value;
        if (email) {
            enterApp(`User: ${email}`, false);
        } else {
            alert("Please enter an email to log in!");
        }
        return;
    }
    // Guest mode button
    if (target.closest('#guestBtn')) {
        enterApp('Guest mode: data will not be saved', true);
        return;
    }
    // Navigation buttons
    if (target.closest('#navMap')) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.map-container').style.display = 'block';
        document.getElementById('entryDetailPanel').classList.remove('active');
        updateMobileNavState('navMap');
        return;
    }
    if (target.closest('#navList')) {
        document.getElementById('sidebar').classList.add('active');
        document.querySelector('.map-container').style.display = 'none';
        updateMobileNavState('navList');
        return;
    }
    if (target.closest('#navProfile')) {
        // Profile view - for now, just show the sidebar
        document.getElementById('sidebar').classList.add('active');
        document.querySelector('.map-container').style.display = 'none';
        updateMobileNavState('navProfile');
        return;
    }
    // Entry Modal buttons
    if (target.closest('#cancelEntryBtn')) {
        closeEntryModal();
        return;
    }
    // Detail Panel buttons
    if (target.closest('#saveEntryBtn')) {
        saveEntry();
        return;
    }
    if (target.closest('#closeDetailBtn')) {
        closeDetailPanel();
        return;
    }
    // Editor formatting buttons
    const editorBtn = target.closest('.editor-btn');
    if (editorBtn) {
        applyEditorCommand(editorBtn.getAttribute('data-cmd'));
        return;
    }

    const sidebarTitle = target.closest('.entry-title-link');
    if (sidebarTitle) {
        const entryId = parseInt(sidebarTitle.getAttribute('data-entry-id'), 10);
        if (!Number.isFinite(entryId)) {
            return;
        }
        const pointRecord = findPointRecordByEntryId(entryId);
        if (!pointRecord) {
            return;
        }
        const entry = findEntryById(pointRecord, entryId);
        if (!entry) {
            return;
        }
        openEntryModal('edit', pointRecord, entry);
        return;
    }
    
    // Image removal button
    if (target.closest('#removeImageBtn')) {
        currentEntryImage = null;
        document.getElementById('imagePreview').innerHTML = '';
        document.getElementById('entryImageInput').value = '';
        document.getElementById('removeImageBtn').style.display = 'none';
        return;
    }
});

// Story-related click listeners
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('#storiesBtn')) { openStoriesModal(); return; }
    if (target.closest('#closeStoriesBtn')) { document.getElementById('storiesModal').style.display = 'none'; return; }
    if (target.closest('#createNewStoryBtn')) { openStoryEditModal(null); return; }
    if (target.closest('#cancelStoryBtn')) { document.getElementById('storyEditModal').style.display = 'none'; return; }
    if (target.closest('#saveStoryBtn')) { saveStory(); return; }

    if (target.closest('.add-to-story-btn')) { moveEntryToStory(parseInt(target.getAttribute('data-id'), 10)); }
    if (target.closest('.remove-from-story-btn')) { removeEntryFromStory(parseInt(target.getAttribute('data-id'), 10)); }
    if (target.closest('.toggle-story-vis-btn')) { toggleStoryVisibility(parseInt(target.getAttribute('data-id'), 10)); }
    if (target.closest('.edit-story-btn')) { openStoryEditModal(parseInt(target.getAttribute('data-id'), 10)); }
});

// HTML5 Native Drag & Drop Listeners for story entry reordering
document.addEventListener('dragstart', e => {
    if (e.target.closest('#storyEntriesList .draggable-item')) {
        draggedEntryItem = e.target.closest('.draggable-item');
        e.dataTransfer.effectAllowed = 'move';
    }
});

document.addEventListener('dragover', e => {
    const list = document.getElementById('storyEntriesList');
    if (list && list.contains(e.target)) {
        e.preventDefault();
        const targetItem = e.target.closest('.draggable-item');
        if (targetItem && targetItem !== draggedEntryItem && draggedEntryItem) {
            const rect = targetItem.getBoundingClientRect();
            const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
            list.insertBefore(draggedEntryItem, next ? targetItem.nextSibling : targetItem);
        }
    }
});

document.addEventListener('dragend', e => { draggedEntryItem = null; });
// Image upload handler
document.getElementById('entryImageInput')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }
    
    // Validate file type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
        alert('Please select a JPG or PNG image');
        event.target.value = '';
        return;
    }
    
    // Validate file size (limit to 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        alert('Image must be smaller than 5MB');
        event.target.value = '';
        return;
    }
    
    // Read the file and convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
        currentEntryImage = e.target?.result;
        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = `<img src="${currentEntryImage}" alt="Entry image" style="max-width: 200px; max-height: 200px; margin-top: 10px; border-radius: 4px;">`;
        document.getElementById('removeImageBtn').style.display = 'inline-block';
    };
    reader.onerror = () => {
        alert('Error reading image file');
        event.target.value = '';
    };
    reader.readAsDataURL(file);
});

// Handle Enter key in contenteditable editor to ensure proper line breaks on mobile
document.addEventListener('keydown', (event) => {
    const editor = document.getElementById('entryEditor');
    if (!editor || event.target !== editor) {
        return;
    }
    
    // Check for Enter/Return key (keyCode 13 for better mobile compatibility)
    if (event.key === 'Enter' || event.keyCode === 13) {
        // Don't prevent default - let the browser handle it naturally
        // The issue was likely preventDefault breaking mobile keyboard behavior
        return;
    }
});

// Additional handler to catch any form submission attempts
document.addEventListener('submit', (event) => {
    event.preventDefault();
    return false;
});

// Mobile navigation state management
function updateMobileNavState(activeNavId) {
    const navButtons = document.querySelectorAll('.mobile-nav button');
    navButtons.forEach((btn) => {
        btn.classList.remove('active');
    });
    const activeButton = document.getElementById(activeNavId);
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

// Custom Color Picker Logic
let currentHue = 341;
let currentSat = 67;
let currentLight = 40;

// Helper functions for color conversion
function hslToHex(h, s, l) {
    s = s / 100;
    l = l / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    
    if (h >= 0 && h < 60) {
        r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
        r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
        r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
        r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
        r = x; g = 0; b = c;
    } else if (h >= 300 && h < 360) {
        r = c; g = 0; b = x;
    }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    const toHex = (n) => {
        const hex = n.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

function hexToHSL(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { h: 0, s: 0, l: 0 };
    
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    
    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

function updateColorFromHSL() {
    const hexColor = hslToHex(currentHue, currentSat, currentLight);
    const preview = document.getElementById('colorPreview');
    const hexDisplay = document.getElementById('colorHexDisplay');
    const nativeInput = document.getElementById('storyLineColor');
    
    if (preview) preview.style.backgroundColor = hexColor;
    if (hexDisplay) hexDisplay.textContent = hexColor.toUpperCase();
    if (nativeInput) nativeInput.value = hexColor;
    
    // Update saturation gradient
    const satSlider = document.getElementById('satSlider');
    if (satSlider) {
        const hueColor = hslToHex(currentHue, 100, 50);
        satSlider.style.background = `linear-gradient(to right, #808080, ${hueColor})`;
    }
    
    // Update lightness gradient
    const lightSlider = document.getElementById('lightSlider');
    if (lightSlider) {
        const darkColor = hslToHex(currentHue, currentSat, 0);
        const midColor = hslToHex(currentHue, currentSat, 50);
        const lightColor = hslToHex(currentHue, currentSat, 100);
        lightSlider.style.background = `linear-gradient(to right, ${darkColor}, ${midColor}, ${lightColor})`;
    }
}

function setColorFromHex(hex) {
    const hsl = hexToHSL(hex);
    currentHue = hsl.h;
    currentSat = hsl.s;
    currentLight = hsl.l;
    
    const hueSlider = document.getElementById('hueSlider');
    const satSlider = document.getElementById('satSlider');
    const lightSlider = document.getElementById('lightSlider');
    
    if (hueSlider) hueSlider.value = currentHue;
    if (satSlider) satSlider.value = currentSat;
    if (lightSlider) lightSlider.value = currentLight;
    
    updateColorFromHSL();
}

// Color picker event listeners
document.addEventListener('input', (event) => {
    if (event.target.id === 'hueSlider') {
        currentHue = parseInt(event.target.value, 10);
        updateColorFromHSL();
    } else if (event.target.id === 'satSlider') {
        currentSat = parseInt(event.target.value, 10);
        updateColorFromHSL();
    } else if (event.target.id === 'lightSlider') {
        currentLight = parseInt(event.target.value, 10);
        updateColorFromHSL();
    } else if (event.target.id === 'storyLineColor') {
        // Native color picker changed
        setColorFromHex(event.target.value);
    }
});

// Quick color preset buttons
document.addEventListener('click', (event) => {
    const btn = event.target.closest('.quick-color-btn');
    if (btn) {
        const color = btn.getAttribute('data-color');
        if (color) {
            setColorFromHex(color);
            
            // Visual feedback
            document.querySelectorAll('.quick-color-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        }
    }
});