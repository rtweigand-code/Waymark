// 1. App state
let mapInitialized = false;
let isGuestMode = false;
let guestEntryWarningShown = false;
// 2. Data structures
let journalEntries = [];
let currentClickCoords = null;
let currentPointKey = null;
let currentEditingEntryId = null;
// 3. ArcGIS objects (initialized in initMap)
let nextEntryId = 1;
const pointStore = new Map();
// 4. Map & UI references
let appView = null;
let appGraphicsLayer = null;
let GraphicCtor = null;
// Storytelling additions
let PolylineCtor = null;
let geometryEngineModule = null;
let GraphicsLayerCtor = null;
let mapInstance = null;
// 5. Storytelling data
let stories = [];
let currentEditingStoryId = null;
let currentStoryEditEntries = [];
let nextStoryId = 1;
let draggedEntryItem = null;
// 6. App entry point
function enterApp(userLabel, guestMode) {
    isGuestMode = guestMode;
    if (!isGuestMode) {
        guestEntryWarningShown = false;
    }
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    document.getElementById('userInfo').innerText = userLabel;

    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.map-container').style.display = 'block';

    if (!mapInitialized) {
        initMap();
        mapInitialized = true;
    }
}
// 7. Global click listener for delegation
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
    // Map vs List toggle & Entry interactions
    if (target.closest('#guestBtn')) {
        enterApp('Guest mode: data will not be saved', true);
        return;
    }
    // Navigation buttons
    if (target.closest('#navMap')) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.map-container').style.display = 'block';
        return;
    }
    // Navigation buttons
    if (target.closest('#navList')) {
        document.getElementById('sidebar').classList.add('active');
        document.querySelector('.map-container').style.display = 'none';
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
    // Detail Panel buttons
    if (target.closest('#closeDetailBtn')) {
        closeDetailPanel();
        return;
    }
    // Editor formatting buttons
    const editorBtn = target.closest('.editor-btn');
    if (editorBtn) {
        applyEditorCommand(editorBtn.getAttribute('data-cmd'));
    }
});
// 8. Utility functions
// Rounds coordinates to 3 decimal places for consistent point keys
function roundCoord(value) {
    return Math.round(value * 1000) / 1000;
}
// Builds a unique key for a point based on its rounded latitude and longitude
function buildPointKey(lat, lon) {
    return `${roundCoord(lat)},${roundCoord(lon)}`;
}
// Converts HTML content to plain text for previews and storage
function htmlToText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || '').trim();
}
// Truncates text to a specified length and adds ellipsis if needed
function truncateText(text, maxLength = 180) {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}...`;
}
// Escapes HTML special characters to prevent injection in popups and lists
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
// 9. Core logic functions
function getOrCreatePointRecord(coords) {
    const pointKey = buildPointKey(coords.lat, coords.lon);
    if (!pointStore.has(pointKey)) {
        pointStore.set(pointKey, {
            pointKey,
            lat: coords.lat,
            lon: coords.lon,
            mapPoint: coords.mapPoint,
            entries: [],
            graphic: null
        });
    }
    return pointStore.get(pointKey);
}
// Retrieves the latest entry for a point record, or null if there are no entries
function getLatestEntry(pointRecord) {
    if (!pointRecord || pointRecord.entries.length === 0) {
        return null;
    }
    return pointRecord.entries[pointRecord.entries.length - 1];
}
// Builds a popup template for a given entry, including story mileage info if available
function buildEntryPopupTemplate(entry, pointStory = null) {
    const preview = truncateText(entry.textPlain, 180);

    //Inject story mileage data if it exists!
    let storyHtml = '';
    if (pointStory && entry.storyDistanceInfo) {
        storyHtml = `
            <div style="background: #f8e8eb; padding: 10px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid #a43855;">
                <strong>Part of Story: ${escapeHtml(pointStory.title)}</strong><br/>
                <small>Distance from previous: ${entry.storyDistanceInfo.distFromPrev.toFixed(2)} mi</small><br/>
                <small>Distance to next: ${entry.storyDistanceInfo.distToNext.toFixed(2)} mi</small>
            </div>
        `;
    }
    // Build the popup content with the entry preview and story info if applicable
    return {
        title: entry.title,
        content: `
            <div>
                ${storyHtml}
                <p>${escapeHtml(preview)}</p>
                ${entry.textPlain.length > 180 ? '<p><em>Use "Read full entry" below to view everything.</em></p>' : ''}
            </div>
        `,
        actions: [
            { title: 'Read full entry', id: 'read-full-entry', className: 'esri-icon-documentation' },
            { title: 'Edit entry', id: 'edit-entry', className: 'esri-icon-edit' },
            { title: 'Add new entry to same point', id: 'add-same-point', className: 'esri-icon-plus-circled' },
            { title: 'Close', id: 'close-popup', className: 'esri-icon-close' }
        ]
    };
}
// Opens a popup for a specific entry at a point, optionally at a specific location (like from a click event)
function openEntryPopup(pointRecord, entry, location) {
    if (!pointRecord.graphic) {
        return;
    }
    // Update the graphic's attributes and popup template to reflect the selected entry
    pointRecord.graphic.attributes = {
        pointKey: pointRecord.pointKey,
        selectedEntryId: entry.id,
        title: entry.title
    };
    pointRecord.graphic.popupTemplate = buildEntryPopupTemplate(entry);
    // Open the popup at the specified location or default to the point's map location
    appView.popup.open({
        features: [pointRecord.graphic],
        location: location || pointRecord.mapPoint
    });
}
// If a point has multiple entries, this function opens a popup that allows the user to select which entry they want to view
function openEntrySelectorPopup(pointRecord, location) {
    const features = pointRecord.entries.map((entry) => new GraphicCtor({
        geometry: pointRecord.mapPoint,
        symbol: pointRecord.graphic ? pointRecord.graphic.symbol : {
            type: 'simple-marker',
            color: [164, 56, 85],
            outline: { color: [255, 255, 255], width: 2 }
        },
        attributes: {
            pointKey: pointRecord.pointKey,
            selectedEntryId: entry.id,
            title: entry.title
        },
        popupTemplate: buildEntryPopupTemplate(entry)
    }));

    appView.popup.open({
        features,
        location: location || pointRecord.mapPoint
    });
}

// Updates the graphic for a point record, reflecting the latest entry and story status
function updatePointGraphic(pointRecord) {
    const latestEntry = getLatestEntry(pointRecord);
    if (!latestEntry) { return; }

    // Check if this point is locked into a story
    let pointStory = null;
    stories.forEach(s => {
        s.entryIds.forEach(eid => {
            const je = journalEntries.find(j => j.id === eid);
            if (je && buildPointKey(je.lat, je.lon) === pointRecord.pointKey) { pointStory = s; }
        });
    });
    // Build the popup template with story info if this point is part of a story
    const popupTemplate = buildEntryPopupTemplate(latestEntry, pointStory);
    const targetLayer = pointStory ? pointStory.graphicsLayer : appGraphicsLayer;
    const targetMarkerColor = pointStory ? [0, 0, 0] : [164, 56, 85];

    if (!pointRecord.graphic) {
        pointRecord.graphic = new GraphicCtor({
            geometry: pointRecord.mapPoint,
            symbol: {
                type: 'simple-marker',
                color: targetMarkerColor,
                outline: { color: [255, 255, 255], width: 2 }
            },
            attributes: { pointKey: pointRecord.pointKey, selectedEntryId: latestEntry.id, title: latestEntry.title },
            popupTemplate
        });
        // Add the new graphic to the appropriate layer (story layer if part of a story, otherwise the main app layer)
        targetLayer.add(pointRecord.graphic);
    } else {
        if (pointRecord.graphic.layer && pointRecord.graphic.layer !== targetLayer) {
            pointRecord.graphic.layer.remove(pointRecord.graphic);
            targetLayer.add(pointRecord.graphic);
        }
        // Update the existing graphic's symbol, attributes, and popup template to reflect any changes (like story association or entry updates)
        pointRecord.graphic.symbol = {
            type: 'simple-marker',
            color: targetMarkerColor,
            outline: { color: [255, 255, 255], width: 2 }
        };
        pointRecord.graphic.attributes = { pointKey: pointRecord.pointKey, selectedEntryId: latestEntry.id, title: latestEntry.title };
        pointRecord.graphic.popupTemplate = popupTemplate;
    }
}
// Opens the entry modal for creating a new entry or editing an existing one, pre-filling data if editing
function openEntryModal(mode, pointRecord, entryToEdit) {
    const titleInput = document.getElementById('entryTitle');
    const editor = document.getElementById('entryEditor');
    const modal = document.getElementById('entryModal');
    const modalTitle = document.getElementById('entryModalTitle');

    currentPointKey = pointRecord.pointKey;
    currentEditingEntryId = entryToEdit ? entryToEdit.id : null;
    // Display the coordinates in the modal for context
    document.getElementById('entryCoords').innerText = `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    modalTitle.innerText = mode === 'edit' ? 'Edit Diary Entry ✏️' : 'New Diary Entry 📓';
    // If editing, pre-fill the title and editor with the existing entry data; if creating new, clear the fields
    if (entryToEdit) {
        titleInput.value = entryToEdit.title;
        editor.innerHTML = entryToEdit.textHtml;
    } else {
        titleInput.value = '';
        editor.innerHTML = '';
    }

    modal.style.display = 'flex';
}
// Closes the entry modal and resets the current editing state
function closeEntryModal() {
    document.getElementById('entryModal').style.display = 'none';
    document.getElementById('entryTitle').value = '';
    document.getElementById('entryEditor').innerHTML = '';
    currentEditingEntryId = null;
}
// When in guest mode, this function ensures that the journalEntries array is kept up to date with the latest entry data for each point, allowing the sidebar list and popups to reflect changes even though we're not saving to a backend
function upsertGuestArrayEntry(entry, pointRecord) {
    if (!isGuestMode) {
        return;
    }
// Check if an entry for this point already exists in the journalEntries array; if so, update it, otherwise add a new entry
    const existingIndex = journalEntries.findIndex((item) => item.id === entry.id);
    const guestEntry = {
        id: entry.id,
        title: entry.title,
        text: entry.textPlain,
        lat: pointRecord.lat,
        lon: pointRecord.lon
    };

    if (existingIndex >= 0) {
        journalEntries[existingIndex] = guestEntry;
    } else {
        journalEntries.push(guestEntry);
    }
}
// Updates the sidebar list of entries, showing a preview of each entry and its location; if there are no entries, 
// it prompts the user to create one by tapping the map
function updateSidebarList() {
    const listContainer = document.getElementById('entriesList');
    listContainer.innerHTML = '';
    // If there are no entries, show a friendly message encouraging the user to create one
    if (journalEntries.length === 0) {
        listContainer.innerHTML = '<p>No entries yet. Tap the map to create one!</p>';
        return;
    }
    // For each entry in the journalEntries array, create a div that shows the title, 
    // a truncated preview of the text, and the coordinates.
    // clicking on it will open the detail panel for that entry
    journalEntries.forEach((entry) => {
        const entryDiv = document.createElement('div');
        entryDiv.style.borderBottom = '1px solid #ccc';
        entryDiv.style.padding = '10px 0';
        entryDiv.innerHTML = `
            <h4 style="margin: 0 0 5px 0; color: #a43855;">${entry.title}</h4>
            <p style="margin: 0; font-size: 0.9em;">${truncateText(entry.text, 120)}</p>
            <small style="color: #666;">Lat: ${entry.lat}, Lon: ${entry.lon}</small>
        `;
        listContainer.appendChild(entryDiv);
    });
}
// Opens the detail panel for a specific entry, showing the full text and location information
function openDetailPanel(pointRecord, entry) {
    const detailPanel = document.getElementById('entryDetailPanel');
    document.getElementById('detailTitle').innerText = entry.title;
    document.getElementById('detailMeta').innerText = `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    document.getElementById('detailContent').innerHTML = entry.textHtml;
    detailPanel.classList.add('active');
}
// Closes the entry detail panel
function closeDetailPanel() {
    document.getElementById('entryDetailPanel').classList.remove('active');
}
// When a user clicks on a point with multiple entries, this function helps determine which entry to show based on the selected entry ID from the popup
// if no matching entry is found, it defaults to showing the latest entry for that point  
function findEntryById(pointRecord, entryId) {
    return pointRecord.entries.find((entry) => entry.id === entryId) || getLatestEntry(pointRecord);
}
// Saves the current entry being edited or created, updating the point record, the map graphic, and the sidebar list accordingly
function saveEntry() {
    if (!currentPointKey || !pointStore.has(currentPointKey)) {
        return;
    }
    // Get the current point record based on the currentPointKey, and extract the title and text from the modal inputs
    const pointRecord = pointStore.get(currentPointKey);
    const title = document.getElementById('entryTitle').value.trim();
    const textHtml = document.getElementById('entryEditor').innerHTML.trim();
    const textPlain = htmlToText(textHtml);
    // Validate that both the title and the text are not empty; if either is empty, show an alert and do not save
    if (!title || !textPlain) {
        alert("Don't be lazy, fill out both the title and your memory! 🖤");
        return;
    }
    // If we're editing an existing entry, update its title and text
    // if we're creating a new entry, create it and add it to the point record's entries array
    if (currentEditingEntryId) {
        const editingEntry = pointRecord.entries.find((entry) => entry.id === currentEditingEntryId);
        if (editingEntry) {
            editingEntry.title = title;
            editingEntry.textHtml = textHtml;
            editingEntry.textPlain = textPlain;
            upsertGuestArrayEntry(editingEntry, pointRecord);
        }
    } else {
        const newEntry = {
            id: nextEntryId++,
            title,
            textHtml,
            textPlain,
            createdAt: Date.now()
        };
        pointRecord.entries.push(newEntry);
        upsertGuestArrayEntry(newEntry, pointRecord);
    }
    // After saving the entry, update the graphic for the point to reflect any changes (like the latest entry preview or story association), 
    // update the sidebar list to show the new or updated entry, and close the entry modal
    updatePointGraphic(pointRecord);
    updateSidebarList();
    closeEntryModal();
}
// Applies formatting commands to the entry editor when the user clicks on the formatting buttons in the modal
function applyEditorCommand(command) {
    const editor = document.getElementById('entryEditor');
    editor.focus();
    // Handle custom commands for ordered list with upper-alpha and checklist, since these require special handling beyond simple execCommand calls
    if (command === 'alphaList') {
        document.execCommand('insertOrderedList', false);
        const selection = window.getSelection();
        if (selection && selection.anchorNode) {
            const parent = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
            const orderedList = parent ? parent.closest('ol') : null;
            if (orderedList) {
                orderedList.style.listStyleType = 'upper-alpha';
            }
        }
        return;
    }
    // For the checklist command, we insert a custom HTML snippet that represents an unchecked checklist item
    // since execCommand doesn't have native support for checklists
    if (command === 'checkList') {
        document.execCommand('insertHTML', false, '<ul style="list-style-type:none;"><li>☐ Checklist item</li></ul>');
        return;
    }

    document.execCommand(command, false);
}
// 10. Map initialization
function initMap() {
    require([
        'esri/Map',
        'esri/views/MapView',
        'esri/config',
        'esri/widgets/Search',
        'esri/widgets/Locate',
        'esri/widgets/BasemapGallery',
        'esri/widgets/Expand',
        'esri/Graphic',
        'esri/layers/GraphicsLayer',
        'esri/geometry/Polyline',        // NEW
        'esri/geometry/geometryEngine'   // NEW
    ], (Map, MapView, esriConfig, Search, Locate, BasemapGallery, Expand, Graphic, GraphicsLayer, Polyline, geometryEngine) => {
        esriConfig.apiKey = 'AAPTxy8BH1VEsoebNVZXo8HurP99AuF0u6hFXE5XsMHKuzBSGN5LvVSYilawxafx85hn9PCGXebaJHWlitVBT5zeCUaAyEvqj1BxcDK_zJC-tVX6YCERGHXEpZz6YEPcefm_vmXsNbePUUZ7JAXpHdXjsnh5x7OFNgUY22Xi2rwI6cYzTClvMoxyiN9hd4ig364gzmVxs5mLuQQYqSwxcO8eUnY8D8k0W9Tj3o-WFWbJGlMs42rjT9Cgf1AsZxwet7SYAT1_FDERp6GX';

        GraphicCtor = Graphic;
        GraphicsLayerCtor = GraphicsLayer; // Save this to make new layers for stories
        PolylineCtor = Polyline;           // Save for drawing lines
        geometryEngineModule = geometryEngine; // Save for calculating miles

        appGraphicsLayer = new GraphicsLayer();

        const map = new Map({
            basemap: 'arcgis-human-geography-dark',
            layers: [appGraphicsLayer]
        });

        mapInstance = map; // Save globally for story layer additions
        // Initialize the MapView with a default center and zoom level, and set the container to the 'viewDiv' element
        const view = new MapView({
            map,
            center: [-106.644568, 35.126358],
            zoom: 9,
            container: 'viewDiv'
        });
        // Disable the default popup behavior since we'll be managing popups manually based on our custom logic
        view.popup.autoOpenEnabled = false;
        //
        appView = view;
        // Add the Search widget to the top-right corner of the view, allowing users to search for locations on the map
        new Search({ view, container: 'searchContainer' });
        // Add the Locate widget to the bottom-right corner, allowing users to quickly navigate to their current location
        const locateBtn = new Locate({ view });
        const basemapGallery = new BasemapGallery({ view });
        // Create a container for the Locate and BasemapGallery widgets, and add it to the view's UI in the bottom-right corner
        const widgetRow = document.createElement('div');
        widgetRow.className = 'map-widget-row';
        // We create separate containers for the locate button and the basemap gallery to ensure they are styled correctly and don't interfere with each other  
        const locateContainer = document.createElement('div');
        const basemapContainer = document.createElement('div');
        widgetRow.appendChild(locateContainer);
        widgetRow.appendChild(basemapContainer);
        // Set the containers for the widgets to the respective divs we just created
        locateBtn.container = locateContainer;
        // Wrap the BasemapGallery in an Expand widget so it doesn't take up too much space, and set it to auto-collapse after a selection is made
        new Expand({
            view,
            content: basemapGallery,
            container: basemapContainer,
            autoCollapse: true
        });
        // Finally, add the entire widget row to the view's UI in the bottom-right corner
        view.ui.add(widgetRow, { position: 'bottom-right', index: 0 });
        // When the view is ready, attempt to locate the user
        // if that fails (like if they deny permission), we fall back to using the browser's geolocation API 
        // as a last resort to center the map on their location
        view.when(() => {
            locateBtn.locate().catch(() => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        view.goTo({
                            center: [position.coords.longitude, position.coords.latitude],
                            zoom: 13
                        });
                    });
                }
            });
        });
        // Set up a listener for actions triggered from the popups on the map. 
        // This allows us to handle user interactions with the popup buttons, such as reading the full entry, editing it,
        //  or adding a new entry at the same point.
        view.popup.on('trigger-action', (popupEvent) => {
            if (popupEvent.action.id === 'close-popup') {
                view.popup.close();
                return;
            }
            // Get the selected graphic from the popup, and ensure it has the necessary attributes to identify the point and entry
            const selectedGraphic = view.popup.selectedFeature;
            if (!selectedGraphic) {
                return;
            }
            // Use the pointKey attribute from the graphic to find the corresponding point record in our pointStore; if it doesn't exist, we can't proceed
            const pointKey = selectedGraphic.attributes.pointKey;
            if (!pointStore.has(pointKey)) {
                return;
            }
            // With the point record in hand, we can find the specific entry that was selected in the popup using the selectedEntryId attribute
            // if we can't find it, we can't proceed
            const pointRecord = pointStore.get(pointKey);
            const selectedEntry = findEntryById(pointRecord, selectedGraphic.attributes.selectedEntryId);
            // Depending on which action was triggered in the popup, we call the appropriate function to either open the detail panel,
            // open the entry modal for editing, or open the entry modal for adding a new entry at the same point
            if (!selectedEntry) {
                return;
            }
            // Handle the different popup actions based on the action ID
            if (popupEvent.action.id === 'read-full-entry') {
                openDetailPanel(pointRecord, selectedEntry);
            }
            // When the user clicks "Edit entry" in the popup, we want to open the entry modal pre-filled with the selected entry's data for editing
            if (popupEvent.action.id === 'edit-entry') {
                openEntryModal('edit', pointRecord, selectedEntry);
            }
            // When the user clicks "Add new entry to same point" in the popup, we want to open the entry modal for creating a new entry,
            if (popupEvent.action.id === 'add-same-point') {
                currentClickCoords = {
                    lat: pointRecord.lat,
                    lon: pointRecord.lon,
                    mapPoint: pointRecord.mapPoint
                };
                openEntryModal('new', pointRecord, null);
            }
        });
        // Set up a listener for double-click events on the view, which allows users to create new entries by double-clicking on the map
        view.on('double-click', async (event) => {
            event.stopPropagation();
            const hitResponse = await view.hitTest(event);
            const graphicResult = hitResponse.results.find((result) => {
                const graphic = result && result.graphic ? result.graphic : null;
                if (!graphic || !graphic.attributes) {
                    return false;
                }
                return !!graphic.attributes.pointKey && pointStore.has(graphic.attributes.pointKey);
            });
            // If the user double-clicked on an existing graphic that has a pointKey attribute, we want to open the appropriate popup for that point
            if (graphicResult) {
                const pointKey = graphicResult.graphic.attributes.pointKey;
                if (!pointStore.has(pointKey)) {
                    return;
                }
                // If the point has multiple entries, we show the entry selector popup
                // if it has only one entry, we go straight to showing the entry detail popup
                const pointRecord = pointStore.get(pointKey);
                if (pointRecord.entries.length > 1) {
                    openEntrySelectorPopup(pointRecord, event.mapPoint);
                } else {
                    const latestEntry = getLatestEntry(pointRecord);
                    if (latestEntry) {
                        openEntryPopup(pointRecord, latestEntry, event.mapPoint);
                    }
                }
                return;
            }
            // If the user double-clicked on an empty area of the map, we want to open the entry modal for creating a new entry at that location
            if (isGuestMode && !guestEntryWarningShown) {
                alert('Guest mode note: diary entries are stored temporarily and will be deleted if you refresh the page.');
                guestEntryWarningShown = true;
            }
            // Store the coordinates of the click event in currentClickCoords, rounding them for consistency and including the original mapPoint for later use
            currentClickCoords = {
                lat: roundCoord(event.mapPoint.latitude),
                lon: roundCoord(event.mapPoint.longitude),
                mapPoint: event.mapPoint
            };
            // Get or create a point record for the clicked coordinates, and then open the entry modal for creating a new entry at that point
            const pointRecord = getOrCreatePointRecord(currentClickCoords);
            openEntryModal('new', pointRecord, null);
        });
    });
}

//Storytelling logic
// 1. New Click Listeners
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

// 2. HTML5 Native Drag & Drop Listeners
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

// 3. UI Flow
function openStoriesModal() {
    const listContainer = document.getElementById('storiesList');
    listContainer.innerHTML = '';
    if (stories.length === 0) {
        listContainer.innerHTML = '<p>No stories yet. Create one!</p>';
    } else {
        stories.forEach(story => {
            const div = document.createElement('div');
            div.className = 'story-list-item';
            div.innerHTML = `
                <div>
                    <strong>${escapeHtml(story.title)}</strong><br>
                    <small style="color: #666;">${story.totalMiles.toFixed(2)} miles • ${story.entryIds.length} stops</small>
                </div>
                <div>
                    <button class="story-btn-small toggle-story-vis-btn" data-id="${story.id}">${story.visible ? '👁️ Hide' : '👁️‍🗨️ Show'}</button>
                    <button class="story-btn-small edit-story-btn" data-id="${story.id}">Edit</button>
                </div>
            `;
            listContainer.appendChild(div);
        });
    }
    document.getElementById('storiesModal').style.display = 'flex';
}
// opens the story edit modal for creating a new story or editing an existing one, pre-filling data if editing
function openStoryEditModal(storyId) {
    currentEditingStoryId = storyId;
    currentStoryEditEntries = [];
    const titleInput = document.getElementById('storyTitleInput');

    if (storyId) {
        const story = stories.find(s => s.id === storyId);
        titleInput.value = story.title;
        currentStoryEditEntries = [...story.entryIds];
    } else {
        titleInput.value = '';
    }

    renderStoryEditLists();
    document.getElementById('storiesModal').style.display = 'none';
    document.getElementById('storyEditModal').style.display = 'flex';
}
// Renders the lists of available entries and selected entries in the story edit modal, 
// allowing users to add/remove entries from the story and see which entries are locked due to being part of other stories
function renderStoryEditLists() {
    const availableList = document.getElementById('availableEntriesList');
    const selectedList = document.getElementById('storyEntriesList');
    availableList.innerHTML = ''; selectedList.innerHTML = '';

    // Lock points: If a point is in a different story, none of its entries can be used!
    const lockedPointKeys = new Set();
    stories.forEach(s => {
        if (s.id !== currentEditingStoryId) {
            s.entryIds.forEach(eid => {
                const je = journalEntries.find(j => j.id === eid);
                if (je) lockedPointKeys.add(buildPointKey(je.lat, je.lon));
            });
        }
    });
    // For each journal entry, determine if it's selected for the current story, if it's locked due to being in another story, or if it's available to be added.
    journalEntries.forEach(entry => {
        const isLocked = lockedPointKeys.has(buildPointKey(entry.lat, entry.lon));
        if (currentStoryEditEntries.includes(entry.id)) {
            // It's selected, draw it in the drag and drop list
            const li = document.createElement('li');
            li.className = 'draggable-item';
            li.setAttribute('draggable', 'true');
            li.setAttribute('data-id', entry.id);
            li.innerHTML = `<span>☰ ${escapeHtml(entry.title)}</span><button class="story-btn-small remove-from-story-btn" data-id="${entry.id}">X</button>`;
            selectedList.appendChild(li);
        } else if (!isLocked) {
            // It's available
            const div = document.createElement('div');
            div.className = 'draggable-item';
            div.innerHTML = `<span>${escapeHtml(entry.title)}</span><button class="story-btn-small add-to-story-btn" data-id="${entry.id}">Add</button>`;
            availableList.appendChild(div);
        }
    });
}
// Adds an entry to the current story being edited by its ID, and then re-renders the lists to reflect the change
function moveEntryToStory(entryId) { currentStoryEditEntries.push(entryId); renderStoryEditLists(); }
function removeEntryFromStory(entryId) { currentStoryEditEntries = currentStoryEditEntries.filter(id => id !== entryId); renderStoryEditLists(); }

// 4. Save and Map Logic
function saveStory() {
    const title = document.getElementById('storyTitleInput').value.trim();
    if (!title) { alert("Give your story a title!"); return; }

    // Grab the actual DOM order from the dragged list
    const listItems = document.querySelectorAll('#storyEntriesList li');
    const orderedEntryIds = Array.from(listItems).map(li => parseInt(li.getAttribute('data-id'), 10));
    // Validate that there are at least 2 entries in the story, since a story with only one entry doesn't make much sense and can't have a line drawn on the map
    if (orderedEntryIds.length < 2) { alert("A story must have at least 2 entries to draw a line! 🖤"); return; }
    // If we're editing an existing story, update its title and entryIds
    // if we're creating a new story, create it with the provided title and entryIds, add a new graphics layer for it on the map,
    //  and push it to the stories array
    let story;
    if (currentEditingStoryId) {
        story = stories.find(s => s.id === currentEditingStoryId);
        story.title = title;
        story.entryIds = orderedEntryIds;
    } else {
        story = {
            id: nextStoryId++, title, entryIds: orderedEntryIds, visible: true, totalMiles: 0, graphicsLayer: new GraphicsLayerCtor()
        };
        mapInstance.add(story.graphicsLayer);
        stories.push(story);
    }
    // After saving the story, we need to update the graphics on the map to reflect the new story composition, 
    // including drawing the line connecting the entries in the order specified and updating the popups to show story mileage info. 
    // Finally, we close the story edit modal and re-open the main stories modal to show the updated list of stories.
    updateStoryMapGraphics(story);
    document.getElementById('storyEditModal').style.display = 'none';
    openStoriesModal();
}
// This function takes a story object and updates the graphics on the map to reflect the entries that are part of that story,
function updateStoryMapGraphics(story) {
    story.graphicsLayer.removeAll();
    const orderedPoints = [];
    const storyEntries = [];
    //
    story.entryIds.forEach(eid => {
        const entry = journalEntries.find(je => je.id === eid);
        if (entry) { orderedPoints.push([entry.lon, entry.lat]); storyEntries.push(entry); }
    });

    // Draw Line & Calculate Math
    let totalMiles = 0;
    const segmentMiles = [];
    // Only attempt to draw the line and calculate mileage if we have at least 2 points, and if the necessary ArcGIS modules are loaded
    if (orderedPoints.length >= 2 && PolylineCtor && geometryEngineModule) {
        const polyline = new PolylineCtor({ paths: [orderedPoints], spatialReference: { wkid: 4326 } });
        totalMiles = geometryEngineModule.geodesicLength(polyline, "miles");
        story.totalMiles = totalMiles;

        const lineGraphic = new GraphicCtor({
            geometry: polyline,
            symbol: { type: "simple-line", color: [164, 56, 85, 0.9], width: 3, style: "short-dot" }
        });
        story.graphicsLayer.add(lineGraphic);

        // Get segment distances
        for (let i = 0; i < orderedPoints.length; i++) {
            let distFromPrev = 0, distToNext = 0;
            if (i > 0) {
                distFromPrev = geometryEngineModule.geodesicLength(new PolylineCtor({ paths: [[orderedPoints[i-1], orderedPoints[i]]], spatialReference: { wkid: 4326 } }), "miles");
            }
            if (i < orderedPoints.length - 1) {
                distToNext = geometryEngineModule.geodesicLength(new PolylineCtor({ paths: [[orderedPoints[i], orderedPoints[i+1]]], spatialReference: { wkid: 4326 } }), "miles");
            }
            segmentMiles.push({ distFromPrev, distToNext });
        }
    }

    // Attach math to entries and re-render points into the proper layers!
    storyEntries.forEach((entry, idx) => { entry.storyDistanceInfo = segmentMiles[idx]; });
    // Now that we've updated the story's graphics layer with the line and calculated the mileage info for each entry, 
    // we need to loop through all points on the map and update their graphics to reflect any changes in story association
    // or popup content (like showing mileage info in the popup if they're part of a story)
    pointStore.forEach((pointRecord) => {
        if (!pointRecord.graphic) return;

        let pointStory = null;
        stories.forEach(s => {
            s.entryIds.forEach(eid => {
                const je = journalEntries.find(j => j.id === eid);
                if (je && buildPointKey(je.lat, je.lon) === pointRecord.pointKey) pointStory = s;
            });
        });

        // Trigger the update function we modified earlier to fix popups and layers
        updatePointGraphic(pointRecord);
    });
}
// This function toggles the visibility of a story's graphics layer on the map, allowing users to show or hide the story's line and associated entry graphics.
function toggleStoryVisibility(storyId) {
    const story = stories.find(s => s.id === storyId);
    if (story) {
        story.visible = !story.visible;
        story.graphicsLayer.visible = story.visible;
        openStoriesModal();
    }
}