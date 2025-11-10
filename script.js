function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('theme-icon-light').style.display = isDark ? 'block' : 'none';
    document.getElementById('theme-icon-dark').style.display = isDark ? 'none' : 'block';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

if (localStorage.getItem('theme') === 'dark') {
    toggleTheme();
}

// --- NEW IMAGE MODAL FUNCTIONS ---
/**
 * @param {string} src - The full-size image src
 * @param {string} filename - The original filename for download
 * @param {string} sender - 'sender' or 'receiver'
 * @param {string} msgId - The unique message ID (for download notification)
 */
function openImageModal(src, filename, sender, msgId) { // Added msgId
    const imageModalOverlay = document.getElementById('image-modal-overlay');
    const imageModalContent = document.getElementById('image-modal-content');
    const imageModalDownload = document.getElementById('image-modal-download');
    
    if (!imageModalOverlay || !imageModalContent || !imageModalDownload) return;
    
    console.log(`Opening modal for ${sender}, msgId: ${msgId}`);
    
    // Set image source
    imageModalContent.src = src;
    
    // Set download button properties
    if (sender === 'receiver') {
        imageModalDownload.href = src;
        imageModalDownload.download = filename;
        imageModalDownload.classList.add('active'); // Show download button
        
        // --- NEW: Add dynamic onclick for download notification ---
        imageModalDownload.onclick = (e) => {
            e.stopPropagation(); // Prevent modal from closing
            console.log('Download button clicked, sending notification...');
            
            // FIX: Check if function exists before calling
            if (typeof sendImageDownloadNotification === 'function') {
                sendImageDownloadNotification(msgId);
            }
            // The 'a' tag will handle the download itself
        };
        // --- END NEW ---
        
    } else {
        imageModalDownload.classList.remove('active'); // Hide for sender
        imageModalDownload.onclick = null; // Clear any previous listener
    }
    
    // Show modal
    imageModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeImageModal() {
    const imageModalOverlay = document.getElementById('image-modal-overlay');
    const imageModalContent = document.getElementById('image-modal-content');
    if (!imageModalOverlay) return;
    imageModalOverlay.classList.remove('active');
    imageModalContent.src = ''; // Clear src
    
    // --- NEW: Clear download onclick ---
    const imageModalDownload = document.getElementById('image-modal-download');
    imageModalDownload.onclick = null;
    // --- END ---
    document.body.style.overflow = ''; // Restore scrolling
}
// --- END NEW IMAGE MODAL FUNCTIONS ---


let html5QrCode = null;
let isScanning = false;
let hasScanned = false;
// This flag blocks peer init *while scanning* to prevent race conditions
let ALLOW_PEER_INIT = true;
// This flag prevents reload loops on disconnect
let IS_RELOADING = false; 

// --- NEW CALL STATE VARS ---
let localStream = null;
let remoteStream = null;
let currentCall = null;
let isCallActive = false;
let callTimerInterval = null;
let callStartTime = 0;
// --- END NEW CALL STATE VARS ---

window.APP_PEER = null;
window.APP_CONNECTION = null;

function openScanner() {
    // ADDED GUARD: If scanner modal is already active or we are scanning, do nothing.
    if (isScanning || document.getElementById('scanner-modal').classList.contains('active')) {
        console.log('⚠ openScanner called but scanner is already active. Ignoring.');
        return;
    }
    console.log('📷 Opening scanner...');
    hasScanned = false;
    // Block peer auto-init *before* starting scanner
    ALLOW_PEER_INIT = false; 
    console.log('🚫 BLOCKED peer auto-init');
    document.getElementById('scanner-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    startScanner();
}

function closeScanner() {
    // ADDED GUARD: Don't do anything if already closing
    if (!document.getElementById('scanner-modal').classList.contains('active')) {
        console.log('⚠ closeScanner called but modal is already closed.');
        return;
    }
    console.log('❌ Closing scanner...');
    document.getElementById('scanner-modal').classList.remove('active');
    document.body.style.overflow = '';
    stopScanner(); // This is now the only place that calls stopScanner after a scan
    // Re-allow peer init *only if* no scan was successful (and we are not reloading)
    if (!hasScanned && !IS_RELOADING) { 
        ALLOW_PEER_INIT = true;
        console.log('✅ RE-ENABLED peer auto-init');
    }
}

function startScanner() {
    if (html5QrCode || isScanning) {
        console.log('⚠ Scanner already running');
        return;
    }
    isScanning = true;
    console.log('🎥 Starting camera...');

    html5QrCode = new Html5Qrcode("qr-reader");
    
    const config = {
        fps: 30,
        qrbox: function(viewfinderWidth, viewfinderHeight) {
            let minDimension = Math.min(viewfinderWidth, viewfinderHeight);
            let qrboxSize = Math.floor(minDimension * 0.8);
            return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
        disableFlip: false
    };
    
    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            if (hasScanned) {
                console.log('⚠ Already processed, ignoring...');
                return;
            }
            hasScanned = true;
            // ALLOW_PEER_INIT remains false, which is correct
            
            console.log('✓✓✓ QR SCANNED:', decodedText);
            console.log('🔍 Type:', typeof decodedText);
            console.log('🔍 Length:', decodedText.length);
            
            if (navigator.vibrate) {
                navigator.vibrate(200);
            }
            
            // --- MODIFIED LOGIC ---
            // Use setTimeout to break out of the scanner's execution context
            // and prevent any race conditions.
            setTimeout(() => {
                // 1. Process the QR code first. This will set the IS_RELOADING flag.
                console.log('→ Calling processQRCode NOW (from timeout)...');
                processQRCode(decodedText);

                // 2. Then, close the scanner modal. closeScanner() will handle stopping the camera.
                console.log('→ Calling closeScanner NOW (from timeout)...');
                closeScanner();
            }, 0); // 0ms timeout executes after current stack.
            // --- END MODIFIED LOGIC ---
        },
        (errorMessage) => {
            // Silent
        }
    ).catch((err) => {
        console.error('❌ Scanner error:', err);
        isScanning = false;
        // Allow peer init to recover if camera fails
        ALLOW_PEER_INIT = true; 
        // Don't use alert, use a status message
        if (typeof showChatStatus === 'function') {
            showChatStatus('❌ Camera error: ' + err.name, true);
        }
        closeScanner();
    });
}

/**
 * UPDATED: This function now sets the URL hash and reloads the page.
 */
function processQRCode(decodedText) {
    if (IS_RELOADING) {
        console.log('⚠ Already processing QR and reloading. Ignoring.');
        return;
    }
    IS_RELOADING = true; // Set flag immediately

    console.log('=== PROCESSING QR CODE ===');
    console.log('URL:', decodedText);
    
    try {
        const url = new URL(decodedText);
        console.log('✓ Valid URL');
        console.log('Hash:', url.hash);
        
        const scannedPeerId = url.hash.substring(1);
        console.log('🎯 Extracted Peer ID:', scannedPeerId);
        console.log('🎯 Length:', scannedPeerId.length);
        
        if (!scannedPeerId || scannedPeerId.trim() === '') {
            console.error('❌ Empty peer ID!');
            if (typeof showChatStatus === 'function') {
                showChatStatus('QR code has no peer ID', true);
            }
            hasScanned = false; // Allow re-scan
            ALLOW_PEER_INIT = true; // Allow peer init to recover
            IS_RELOADING = false; // Reset flag on error
            return;
        }
        
        console.log('✓ Peer ID is valid');
        
        console.log('🔄 Setting hash and reloading to switch to CLIENT mode...');
        window.location.hash = scannedPeerId;
        window.location.reload();

    } catch (e) {
        console.error('❌❌❌ QR parse FAILED:', e);
        console.error('Error:', e.message);
        if (typeof showChatStatus === 'function') {
            showChatStatus('Invalid QR code: ' + e.message, true);
        }
        hasScanned = false; // Allow re-scan
        ALLOW_PEER_INIT = true; // Allow peer init to recover
        IS_RELOADING = false; // RESET FLAG on error
    }
}

function stopScanner() {
    if (html5QrCode && isScanning) {
        console.log('🛑 Stopping scanner...');
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
            isScanning = false;
            console.log('✓ Scanner stopped');
        }).catch((err) => {
            console.error('Stop error:', err);
            html5QrCode = null;
            isScanning = false;
        });
    }
}

function showConnectionAnimation() {
    const overlay = document.getElementById('connection-overlay');
    overlay.classList.add('active');
    setTimeout(() => {
        overlay.classList.remove('active');
    }, 2000);
}

// --- NEW: Helper to create HTML for a progress bar ---
/**
 * Creates and appends a progress bar UI to the transfer list.
 * @param {string} fileId - The unique ID for this transfer.
 * @param {string} fileName - The name of the file.
 * @param {boolean} isSender - True if this is a sending bar, false for receiving.
 */
function createTransferUI(fileId, fileName, isSender) {
    const container = document.getElementById('transfer-list-container');
    const el = document.createElement('div');
    el.className = 'progress-container';
    el.id = `transfer-${fileId}`;

    const label = isSender ? `Sending: ${fileName}` : `Receiving: ${fileName}`;
    
    // FIX: Always add '❌' content to the button for styling
    const cancelButtonHTML = `<button class="cancel-button" data-file-id="${fileId}">✕</button>`; 

    // --- UPDATED HTML STRUCTURE ---
    el.innerHTML = `
        <div class="progress-top-row">
            <div class="progress-bar-wrapper">
                <div class="progress-label">
                    <span class="progress-label-text">${label}</span>
                    <span class="progress-percentage">0%</span>
                </div>
                <div class="progress-bar-background">
                    <div class="progress-bar" style="width: 0%"></div>
                </div>
            </div>
            ${cancelButtonHTML}
        </div>
        <div class="progress-stats">
            <span class="progress-size">-- MB / -- MB</span>
            <span class="progress-eta">ETA: --:--</span>
        </div>
    `;
    // --- END UPDATED HTML ---

    container.appendChild(el);
    
    // FIX: Add click listener to the button itself
    el.querySelector('.cancel-button').addEventListener('click', () => {
        console.log(`[DEBUG] Cancel button clicked for fileId: ${fileId}, isSender: ${isSender}`); // DEBUG
        if (isSender) {
            if (typeof cancelTransfer === 'function') cancelTransfer(fileId);
        } else {
            if (typeof cancelReceive === 'function') cancelReceive(fileId); // New function
        }
    });
}

/**
 * Updates a specific progress bar in the UI.
 * @param {string} fileId - The ID of the transfer to update.
 * @param {object} options - The values to update.
 * @param {number} options.percent - The percentage (0-100).
 * @param {string} options.sizeText - The formatted size string (e.g., "1.2 MB / 5 MB").
 * @param {string} options.etaText - The formatted ETA string (e.g., "ETA: 0:05").
 * @param {string} [options.status] - Optional status like "Pending".
 */
function updateTransferUI(fileId, options) {
    const el = document.getElementById(`transfer-${fileId}`);
    if (!el) return;

    const bar = el.querySelector('.progress-bar');
    const percentage = el.querySelector('.progress-percentage');
    const size = el.querySelector('.progress-size');
    const eta = el.querySelector('.progress-eta');
    const label = el.querySelector('.progress-label-text');

    if (options.percent != null) {
        bar.style.width = `${options.percent}%`;
        percentage.textContent = `${options.percent}%`;
    }
    if (options.sizeText) size.textContent = options.sizeText;
    if (options.etaText) eta.textContent = options.etaText;
    
    if (options.status === 'pending') {
        bar.classList.add('pending');
        label.style.opacity = 0.7;
        percentage.textContent = 'Pending';
        size.textContent = options.sizeText; // Show file size for pending
        eta.textContent = '';
    } else {
         bar.classList.remove('pending');
         label.style.opacity = 1;
    }
}


document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App initialized');
    
    // --- CHAT HELPER CONSTANTS ---
    const MAX_WORDS = 1000;
    const MAX_IMAGES = 6;
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

    // --- CHAT STATE VARIABLES ---
    let typingTimer;
    let isTypingSent = false;
    let peerTypingTimer;

    // --- NEW: Reply State ---
    let replyingTo = null;


    // --- CHAT HELPER FUNCTIONS ---
    
    /**
     * Converts a File object to a Base64 Data URL.
     * @param {File} file - The file to convert.
     * @returns {Promise<string>} A promise that resolves with the Base64 string.
     */
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    /**
     * Scans the DOM and returns the current counts for words, images, and image size.
     * @returns {{wordCount: number, imageCount: number, imageSize: number}}
     */
    function getChatLimits() {
        const textMessages = chatMessages.querySelectorAll('.chat-message[data-type="text"]');
        const imageMessages = chatMessages.querySelectorAll('.chat-message[data-type="image"]');

        let totalWords = 0;
        textMessages.forEach(msg => {
            totalWords += parseInt(msg.dataset.words || 0, 10);
        });

        let totalImageSize = 0;
        imageMessages.forEach(img => {
            totalImageSize += parseInt(img.dataset.size || 0, 10);
        });

        return {
            wordCount: totalWords,
            imageCount: imageMessages.length,
            imageSize: totalImageSize
        };
    }

    /**
     * Prunes the chat DOM to enforce limits. Removes oldest messages first.
     */
    function pruneChat() {
        // Prune text
        const textMessages = Array.from(chatMessages.querySelectorAll('.chat-message[data-type="text"]'));
        let { wordCount } = getChatLimits(); // Get current word count

        while (wordCount > MAX_WORDS && textMessages.length > 0) {
            const oldMsg = textMessages.shift(); // Get oldest message
            const wordsToRemove = parseInt(oldMsg.dataset.words || 0, 10);
            wordCount -= wordsToRemove;
            oldMsg.remove();
        }

        // Prune images
        const imageMessages = Array.from(chatMessages.querySelectorAll('.chat-message[data-type="image"]'));
        let { imageCount, imageSize } = getChatLimits(); // Get current image stats

        while ((imageCount > MAX_IMAGES || imageSize > MAX_IMAGE_SIZE) && imageMessages.length > 0) {
            const oldImg = imageMessages.shift(); // Get oldest image
            const sizeToRemove = parseInt(oldImg.dataset.size || 0, 10);
            imageSize -= sizeToRemove;
            imageCount--;
            oldImg.remove();
        }
    }

    /**
     * Updates the chat limits UI with current stats.
     */
    function updateChatLimitsUI() {
        if (!chatLimitsInfo) return;
        const { wordCount, imageCount, imageSize } = getChatLimits();
        chatLimitsInfo.textContent = `Words: ${wordCount}/${MAX_WORDS} | Images: ${imageCount}/${MAX_IMAGES} (${formatBytes(imageSize)}/10 MB)`;
    }

    /**
     * Adds a new message to the chat window.
     * @param {string} type - 'text' or 'image'
     * @param {string} content - The text message or Base64 image data
     * @param {string} sender - 'sender' or 'receiver'
     * @param {object} metadata - { words: number } or { size: number, name: string }
     * @param {string} msgId - The unique message ID
     * @param {object} replyContext - Optional: { text: string }
     */
    function addMessageToDOM(type, content, sender, metadata, msgId, replyContext = null) {
        const msgEl = document.createElement('div');
        msgEl.className = `chat-message ${sender}`;
        msgEl.dataset.type = type;
        msgEl.dataset.msgId = msgId;

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';

        // --- NEW: Add Reply Context ---
        if (replyContext && replyContext.text) {
            const replyEl = document.createElement('div');
            replyEl.className = 'message-reply-context';
            replyEl.textContent = replyContext.text;
            msgEl.appendChild(replyEl);
        }
        // --- END NEW ---

        let textContentForReply = ''; // Store text for reply function

        if (type === 'text') {
            contentEl.textContent = content;
            msgEl.dataset.words = metadata.words;
            textContentForReply = content; // Store text
        } else if (type === 'image') {
            const img = document.createElement('img');
            img.src = content; // 'content' is Base64 data
            img.dataset.filename = metadata.name; // Store filename for download
            textContentForReply = `Image: ${metadata.name}`; // Store image name
            
            // --- MODIFIED CLICK HANDLER (passes msgId) ---
            img.onclick = () => {
                openImageModal(img.src, img.dataset.filename, sender, msgId);
            };
            // --- END MODIFIED HANDLER ---
            
            img.onload = () => {
                chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll on image load
            };
            contentEl.appendChild(img);
            msgEl.dataset.size = metadata.size;
        }
        
        msgEl.appendChild(contentEl);

        // --- NEW: Add Reply Button ---
        const replyBtn = document.createElement('button');
        replyBtn.className = 'chat-message-reply-btn';
        replyBtn.title = 'Reply';
        replyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>';
        replyBtn.onclick = () => {
            setReplyContext(msgId, textContentForReply);
        };
        msgEl.appendChild(replyBtn);
        // --- END NEW ---


        // Add status bar (for sender only)
        if (sender === 'sender') {
            const statusBar = document.createElement('div');
            statusBar.className = 'message-status-bar';
            
            if (type === 'image') {
                 const downloadStatus = document.createElement('span');
                 downloadStatus.className = 'download-status';
                 downloadStatus.textContent = 'Downloaded by peer';
                 statusBar.appendChild(downloadStatus);
            }
            
            const msgStatus = document.createElement('span');
            msgStatus.className = 'msg-status';
            msgStatus.innerHTML = '✓'; // One tick
            statusBar.appendChild(msgStatus);
            
            msgEl.appendChild(statusBar);
        }

        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Sends the text message from the input field.
     */
    function sendTextMessage() {
        const message = chatInput.value.trim();
        if (message === '' || !currentConnection || !currentConnection.open) return;

        const wordCount = message.split(/\s+/).length;
        const msgId = crypto.randomUUID();
        
        try {
            currentConnection.send({ 
                type: 'chat-text', 
                message: message, 
                msgId: msgId,
                replyContext: replyingTo // --- NEW: Send reply context
            });
            addMessageToDOM('text', message, 'sender', { words: wordCount }, msgId, replyingTo); // --- NEW: Pass context
            pruneChat();
            updateChatLimitsUI();
            chatInput.value = '';
            cancelReply(); // --- NEW: Clear reply state
            
            // Stop typing indicator after send
            clearTimeout(typingTimer);
            isTypingSent = false;
            currentConnection.send({ type: 'chat-stop-typing' });

        } catch (e) {
            console.error("Chat send error:", e);
            showChatStatus('Message send error', true);
        }
    }

    /**
     * Handles the file selection from the image input.
     */
    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > MAX_IMAGE_SIZE) {
            showChatStatus('❌ Image is too large (Max 10MB)', true);
            return;
        }
        
        const { imageCount, imageSize } = getChatLimits();
        if (imageCount >= MAX_IMAGES || imageSize + file.size > MAX_IMAGE_SIZE) {
             showChatStatus('Image quota full. Old images will be removed.', true);
             // We still allow sending, pruneChat() will handle removal.
        }

        fileToBase64(file).then(base64data => {
            if (!currentConnection || !currentConnection.open) return;
            
            const msgId = crypto.randomUUID();
            const metadata = { size: file.size, name: file.name };

            try {
                currentConnection.send({
                    type: 'chat-image',
                    name: file.name,
                    fileType: file.type,
                    size: file.size,
                    data: base64data,
                    msgId: msgId,
                    replyContext: replyingTo // --- NEW: Send reply context with image
                });
                addMessageToDOM('image', base64data, 'sender', metadata, msgId, replyingTo); // --- NEW: Pass context
                pruneChat();
                updateChatLimitsUI();
                cancelReply(); // --- NEW: Clear reply state
            } catch (e) {
                console.error("Image send error:", e);
                showChatStatus('Image send error', true);
            }
        }).catch(err => {
            console.error("Base64 conversion error:", err);
            showChatStatus('Could not read image', true);
        });
        
        event.target.value = null; // Clear input
    }

    /**
     * Shows a temporary status message in the chat UI.
     */
    function showChatStatus(message, isError = false) {
        if (!chatStatus) return;
        chatStatus.textContent = message;
        chatStatus.style.color = isError ? 'var(--error)' : 'var(--success)';
        chatStatus.style.opacity = 1;
        
        // Clear any existing timer
        clearTimeout(peerTypingTimer); 
        
        // Hide after 3 seconds
        peerTypingTimer = setTimeout(() => {
            chatStatus.style.opacity = 0;
        }, 3000);
    }
    
    // --- END CHAT HELPER FUNCTIONS ---
    
    // --- NEW: Download Notification Function ---
    /**
     * @param {string} msgId
     */
    function sendImageDownloadNotification(msgId) {
        if (currentConnection && currentConnection.open && msgId) {
            try {
                currentConnection.send({ type: 'chat-img-download', msgId: msgId });
            } catch (e) {
                console.error("Failed to send download notification:", e);
            }
        }
    }
    // --- END NEW ---

    // --- NEW REPLY FUNCTIONS ---
    /**
     * @param {string} msgId
     * @param {string} text
     */
    function setReplyContext(msgId, text) {
        const replyBar = document.getElementById('reply-context-bar');
        const replyContent = document.getElementById('reply-context-content');
        if (!replyBar || !replyContent) return;
        
        const truncatedText = text.length > 70 ? text.substring(0, 70) + '...' : text;
        
        replyingTo = { msgId, text: truncatedText };
        
        replyContent.textContent = truncatedText;
        replyBar.style.display = 'block';
        
        chatInput.focus();
    }

    function cancelReply() {
        const replyBar = document.getElementById('reply-context-bar');
        if (!replyBar) return;

        replyingTo = null;
        replyBar.style.display = 'none';
    }
    // --- END NEW REPLY FUNCTIONS ---


    // --- NEW CALL LOGIC FUNCTIONS ---
    
    /**
     * Starts a call (video or voice)
     * @param {boolean} isVideo - True for video call, false for voice
     */
    async function startCall(isVideo) {
        if (!currentConnection || !currentConnection.open || isCallActive) {
            showChatStatus('❌ Not connected or already in call', true);
            return;
        }
        
        console.log(`Starting ${isVideo ? 'video' : 'voice'} call...`);
        
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: isVideo,
                audio: true
            });
            
            showCallUI(true, isVideo); // Show our own UI
            
            // Show local video if enabled
            if (isVideo) {
                localVideo.srcObject = localStream;
                localVideo.style.display = 'block';
                toggleVideoButton.classList.add('active');
                toggleVideoButton.querySelector('.icon-video-on').style.display = 'block';
                toggleVideoButton.querySelector('.icon-video-off').style.display = 'none';
                callAvatar.style.display = 'none';
            } else {
                localVideo.style.display = 'none';
                toggleVideoButton.classList.remove('active');
                toggleVideoButton.querySelector('.icon-video-on').style.display = 'block';
                toggleVideoButton.querySelector('.icon-video-off').style.display = 'none';
                callAvatar.style.display = 'flex';
            }
            toggleMicButton.classList.add('active'); // Mic is on by default
            toggleMicButton.querySelector('.icon-mic-on').style.display = 'block';
            toggleMicButton.querySelector('.icon-mic-off').style.display = 'none';

            
            // INSTEAD: Directly make the call
            console.log('Initiating peer.call()...');
            currentCall = peer.call(currentConnection.peer, localStream, {
                metadata: { isVideo: isVideo }
            });
            
            currentCall.on('stream', setupRemoteStream);
            currentCall.on('close', endCall);
            currentCall.on('error', (err) => {
                console.error('Call error:', err);
                endCall();
            });
            
            callStatus.textContent = 'Ringing...';
            isCallActive = true; // Mark call as active *now*
            
        } catch (err) {
            console.error('getUserMedia error:', err);
            showChatStatus(`❌ ${err.name}`, true);
            cleanupCall();
        }
    }

    /**
     * Answers an incoming call
     */
    async function answerCall() {
        if (!currentCall || isCallActive) return;
        
        console.log('Answering call...');
        hideIncomingCallToast();
        
        isCallActive = true;
        
        const isVideo = currentCall.metadata.isVideo;
        
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: isVideo,
                audio: true
            });
            
            showCallUI(true, isVideo); // Show call UI
            
            if (isVideo) {
                localVideo.srcObject = localStream;
                localVideo.style.display = 'block';
                toggleVideoButton.classList.add('active');
                toggleVideoButton.querySelector('.icon-video-on').style.display = 'block';
                toggleVideoButton.querySelector('.icon-video-off').style.display = 'none';
                callAvatar.style.display = 'none';
            } else {
                localVideo.style.display = 'none';
                toggleVideoButton.classList.remove('active');
                toggleVideoButton.querySelector('.icon-video-on').style.display = 'block';
                toggleVideoButton.querySelector('.icon-video-off').style.display = 'none';
                callAvatar.style.display = 'flex';
            }
            toggleMicButton.classList.add('active');
            toggleMicButton.querySelector('.icon-mic-on').style.display = 'block';
            toggleMicButton.querySelector('.icon-mic-off').style.display = 'none';
            
            // Answer the call and send our stream
            currentCall.answer(localStream);
            
            currentCall.on('stream', setupRemoteStream);
            currentCall.on('close', endCall);
            currentCall.on('error', (err) => {
                console.error('Call error:', err);
                endCall();
            });
            
            callStatus.textContent = 'Connected';
            startCallTimer();
            
        } catch (err) {
            console.error('getUserMedia error:', err);
            showChatStatus(`❌ ${err.name}`, true);
            rejectCall(); // Reject if we can't get media
        }
    }

    /**
     * Rejects an incoming call
     */
    function rejectCall() {
        console.log('Rejecting call...');
        
        if (currentCall) {
            currentCall.close(); // This *is* the rejection
            currentCall = null;
        }
        hideIncomingCallToast();
        cleanupCall();
    }

    /**
     * Toggles the microphone on/off
     */
    function toggleMic() {
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            toggleMicButton.classList.toggle('active');
            // Toggle icons
            toggleMicButton.querySelector('.icon-mic-on').style.display = audioTrack.enabled ? 'block' : 'none';
            toggleMicButton.querySelector('.icon-mic-off').style.display = audioTrack.enabled ? 'none' : 'block';
        }
    }
    
    /**
     * Toggles the video on/off
     */
    function toggleVideo() {
        if (!localStream) return;
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            toggleVideoButton.classList.toggle('active');
            // Toggle icons
            toggleVideoButton.querySelector('.icon-video-on').style.display = videoTrack.enabled ? 'block' : 'none';
            toggleVideoButton.querySelector('.icon-video-off').style.display = videoTrack.enabled ? 'none' : 'block';
            
            // Show/hide avatar
            callAvatar.style.display = videoTrack.enabled ? 'none' : 'flex';
            localVideo.style.display = videoTrack.enabled ? 'block' : 'none';
            
            // Tell peer we toggled video
            if (currentConnection && currentConnection.open) {
                currentConnection.send({ type: 'call-toggle-video', isVideoOn: videoTrack.enabled });
            }
        }
    }

    /**
     * Ends the current call (initiated by us)
     */
    function endCall() {
        console.log('Ending call...');
        if (currentCall) {
            currentCall.close();
            currentCall = null; // Set to null *after* closing
        }
        // Send data message as a fallback
        if (currentConnection && currentConnection.open) {
            currentConnection.send({ type: 'call-end' });
        }
        cleanupCall();
    }

    /**
     * Cleans up all call-related state and UI
     */
    function cleanupCall() {
        console.log('Cleaning up call...');
        
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
            remoteStream = null;
        }
        
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
        
        isCallActive = false;
        
        stopCallTimer();
        showCallUI(false);
        hideIncomingCallToast();
    }
    
    /**
     * @param {MediaStream} stream
     */
    function setupRemoteStream(stream) {
        console.log('Received remote stream');
        remoteStream = stream;
        remoteVideo.srcObject = stream;
        remoteVideo.style.display = 'block';
        
        // If this is a voice call, hide avatar
        if (stream.getVideoTracks().length > 0) {
            callAvatar.style.display = 'none';
        } else {
            callAvatar.style.display = 'flex';
        }
        
        callStatus.textContent = 'Connected';
        startCallTimer();
    }
    
    /**
     * @param {boolean} show
     * @param {boolean} [isVideo=false]
     */
    function showCallUI(show, isVideo = false) {
        const callModalOverlay = document.getElementById('call-modal-overlay');
        const toggleVideoButton = document.getElementById('toggle-video-button');
        const localVideo = document.getElementById('local-video');
        const remoteVideo = document.getElementById('remote-video');
        const callAvatar = document.getElementById('call-avatar');

        if (show) {
            callModalOverlay.classList.add('active');
            // Show/hide video button based on call type
            toggleVideoButton.style.display = isVideo ? 'flex' : 'none';
            localVideo.style.display = isVideo ? 'block' : 'none';
            remoteVideo.style.display = 'none'; // Hide remote until stream arrives
            callAvatar.style.display = isVideo ? 'none' : 'flex';
        } else {
            callModalOverlay.classList.remove('active');
        }
    }
    
    function showIncomingCallToast(isVideo) {
        const incomingCallToast = document.getElementById('incoming-call-toast');
        const incomingCallType = document.getElementById('incoming-call-type');
        incomingCallType.textContent = `Incoming ${isVideo ? 'Video' : 'Voice'} Call...`;
        incomingCallToast.classList.add('active');
    }
    
    function hideIncomingCallToast() {
        const incomingCallToast = document.getElementById('incoming-call-toast');
        incomingCallToast.classList.remove('active');
    }
    
    function startCallTimer() {
        stopCallTimer();
        callStartTime = Date.now();
        callTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
            const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const seconds = String(elapsed % 60).padStart(2, '0');
            document.getElementById('call-timer').textContent = `${minutes}:${seconds}`;
        }, 1000);
    }
    
    function stopCallTimer() {
        if (callTimerInterval) {
            clearInterval(callTimerInterval);
            callTimerInterval = null;
        }
        document.getElementById('call-timer').textContent = '00:00';
    }
    
    // --- END NEW CALL LOGIC FUNCTIONS ---


    const statusEl = document.getElementById('status');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const qrEl = document.getElementById('qrcode');
    const scanInstructions = document.getElementById('scan-instructions');
    const fileInput = document.getElementById('file-input');
    const transferStatusEl = document.getElementById('transfer-status');
    const shareButtonsContainer = document.getElementById('share-buttons-container');

    const nativeShareButton = document.getElementById('native-share-button');
    const copyLinkButton = document.getElementById('copy-link-button');
    const downloadQrButton = document.getElementById('download-qr-button');
    
    // --- NEW: Transfer List Container ---
    const transferListContainer = document.getElementById('transfer-list-container');


    // --- CHAT ELEMENTS ---
    const chatContainer = document.getElementById('chat-container');
    const chatPlaceholder = document.getElementById('chat-placeholder');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendButton = document.getElementById('chat-send-button');
    const chatAttachButton = document.getElementById('chat-attach-button');
    const chatImageInput = document.getElementById('chat-image-input');
    const chatLimitsInfo = document.getElementById('chat-limits-info');
    const chatStatus = document.getElementById('chat-status');

    // --- NEW: Reply Bar Elements ---
    const replyContextBar = document.getElementById('reply-context-bar');
    const replyContextClose = document.getElementById('reply-context-close');

    // --- NEW MODAL & CALL ELEMENTS ---
    const callModalOverlay = document.getElementById('call-modal-overlay');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const callStatus = document.getElementById('call-status');
    const callTimer = document.getElementById('call-timer');
    const callAvatar = document.getElementById('call-avatar');
    
    const startVideoCallButton = document.getElementById('start-video-call');
    const startVoiceCallButton = document.getElementById('start-voice-call');
    
    const toggleMicButton = document.getElementById('toggle-mic-button');
    const toggleVideoButton = document.getElementById('toggle-video-button');
    const endCallButton = document.getElementById('end-call-button');
    
    const incomingCallToast = document.getElementById('incoming-call-toast');
    const incomingCallType = document.getElementById('incoming-call-type');
    const acceptCallButton = document.getElementById('accept-call-button');
    const rejectCallButton = document.getElementById('reject-call-button');
    // --- END NEW ELEMENTS ---


    // --- CHAT LISTENERS ---
    chatSendButton.addEventListener('click', sendTextMessage);
    
    chatInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            sendTextMessage();
        }
    });
    
    // Typing Indicator Logic
    chatInput.addEventListener('input', () => {
        if (!currentConnection || !currentConnection.open) return;
        
        if (!isTypingSent) {
            currentConnection.send({ type: 'chat-typing' });
            isTypingSent = true;
            // Cooldown to prevent spam
            setTimeout(() => { isTypingSent = false; }, 2000); 
        }
        
        // Clear previous "stop" timer
        clearTimeout(typingTimer);
        
        // Set a new timer to send "stop" if user pauses
        typingTimer = setTimeout(() => {
            currentConnection.send({ type: 'chat-stop-typing' });
        }, 3000);
    });
    
    chatInput.addEventListener('blur', () => {
         if (currentConnection && currentConnection.open) {
             currentConnection.send({ type: 'chat-stop-typing' });
         }
    });

    chatAttachButton.addEventListener('click', () => chatImageInput.click());
    chatImageInput.addEventListener('change', handleImageUpload);

    // --- NEW: Reply Close Listener ---
    if (replyContextClose) {
        replyContextClose.addEventListener('click', cancelReply);
    }

    // --- NEW CALL LISTENERS ---
    startVideoCallButton.addEventListener('click', () => startCall(true));
    startVoiceCallButton.addEventListener('click', () => startCall(false));
    
    toggleMicButton.addEventListener('click', toggleMic);
    toggleVideoButton.addEventListener('click', toggleVideo);
    endCallButton.addEventListener('click', endCall);
    
    acceptCallButton.addEventListener('click', answerCall);
    rejectCallButton.addEventListener('click', rejectCall);
    // --- END NEW CALL LISTENERS ---


    const CHUNK_SIZE = 64 * 1024;

    let peer = null;
    let currentConnection = null;
    let myId = '';
    let connectUrl = '';
    let isHost = false; // This will be set by initializePeer
    let connectionRetryCount = 0;
    const MAX_RETRY = 3;
    
    let fileQueue = []; // NEW: Will store { file, id, status }
    let isSending = false;
    let activeSend = null; // NEW: Will store the active fileJob
    
    // NEW: Map to store receiving file metadata
    let receivingFiles = new Map(); 

    let hasActiveTransfer = false; // Will be true if isSending or receivingFiles.size > 0
    let heartbeatInterval = null;
    
    // --- RELOAD WARNING FIX ---
    window.addEventListener('beforeunload', (event) => {
        hasActiveTransfer = isSending || receivingFiles.size > 0;
        
        // Only show warning if connected or transferring
        if (hasActiveTransfer || (currentConnection && currentConnection.open)) {
            
            // FIX: As requested, clear hash for client *before* showing prompt
            if (!isHost) {
                console.log('Client is reloading, clearing hash to become host.');
                const uri = window.location.toString();
                if (uri.indexOf("#") > 0) {
                    const cleanUri = uri.substring(0, uri.indexOf("#"));
                    // Use replaceState to avoid adding to history
                    window.history.replaceState({}, document.title, cleanUri);
                }
            }
            // --- END FIX ---

            const warningText = 'Disconnecting will stop all transfers and end the session. Are you sure?';
            event.preventDefault();
            event.returnValue = warningText; // For older browsers
            return warningText; // For modern browsers
        }
    });
    // --- END RELOAD WARNING FIX ---


    function initializePeer() {
        if (!ALLOW_PEER_INIT) {
            console.log('🚫 Peer init BLOCKED (scanner active)');
            return;
        }
        
        console.log('🔧 Initializing peer...');
        
        statusEl.textContent = 'Initializing...';
        
        try {
            peer = new Peer({
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { 
                            urls: 'turn:openrelay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
                    ],
                    sdpSemantics: 'unified-plan'
                },
                debug: 1
            });
            
            window.APP_PEER = peer;
            
        } catch (e) {
            console.error('❌ Init error:', e);
            statusEl.textContent = '❌ Error';
            return;
        }

        peer.on('open', (id) => {
            myId = id;
            console.log('✓ Peer ID:', id);
            const peerToConnect = window.location.hash.substring(1);

            if (peerToConnect) {
                // --- CLIENT MODE ---
                console.log('→ CLIENT MODE');
                isHost = false;
                statusEl.textContent = '🔗 Connecting...';
                qrCodeContainer.style.display = 'none'; // Hide QR
                shareButtonsContainer.style.display = 'none'; // Hide buttons
                scanInstructions.style.display = 'none';
                attemptConnection(peerToConnect); // Use peerToConnect
            } else {
                // --- HOST MODE ---
                console.log('→ HOST MODE');
                isHost = true;
                qrCodeContainer.style.display = 'block';
                scanInstructions.style.display = 'none';
                
                statusEl.textContent = 'Generating QR...';
                
                connectUrl = `${window.location.origin}${window.location.pathname}#${myId}`;
                qrEl.innerHTML = '';
                
                new QRCode(qrEl, {
                    text: connectUrl,
                    width: 256,
                    height: 256,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
                
                shareButtonsContainer.style.display = 'flex';
                setTimeout(setupShareButton, 100);
                statusEl.textContent = '✅ Ready';
            }
        });

        peer.on('connection', (conn) => {
            console.log('📡 Incoming connection');
            if (currentConnection) {
                console.log('⚠ Already connected, rejecting new connection.');
                conn.close();
                return;
            }
            
            statusEl.textContent = '📡 Incoming...';
            
            if (conn.open) {
                setupConnection(conn);
            } else {
                conn.on('open', () => setupConnection(conn));
            }
        });

        // --- NEW: HANDLE INCOMING CALLS ---
        peer.on('call', (call) => {
            console.log('Incoming call...');
            
            if (currentCall || isCallActive) {
                console.log('⚠ Already in call, rejecting new one.');
                // Caller will time out.
                return;
            }
            
            // Store the call object
            currentCall = call;
            const isVideo = call.metadata.isVideo;
            
            // Show toast
            showIncomingCallToast(isVideo);
        });
        // --- END NEW CALL HANDLER ---

        peer.on('error', (err) => {
            console.error('❌ Peer error:', err.type);
            if (err.type === 'peer-unavailable') { // This is CLIENT logic
                if (!isHost && connectionRetryCount < MAX_RETRY) {
                    connectionRetryCount++;
                    statusEl.textContent = `🔄 Retry ${connectionRetryCount}`;
                    setTimeout(() => {
                        const targetId = window.location.hash.substring(1);
                        if (targetId) attemptConnection(targetId);
                    }, 2000);
                } else if (!isHost) {
                    statusEl.textContent = '❌ Peer not found';
                    showSwitchButton(); 
                }
            } else if (!isHost && (err.type === 'network' || err.type === 'webrtc' || err.type === 'server-error')) { 
                // This reload logic is ONLY for the CLIENT
                statusEl.textContent = '❌ Connection Error. Reloading...';
                if (IS_RELOADING) return;
                IS_RELOADING = true;
                // Reload the page to reset
                window.location.hash = '';
                window.location.reload();
            } else if (isHost) {
                // The HOST should NOT reload. It should just wait.
                console.error('Host peer error:', err.type);
                if (err.type === 'disconnected') {
                    // If disconnected from peer server, try to reconnect.
                    console.log('Host disconnected from server, attempting to reconnect...');
                    statusEl.textContent = 'Reconnecting...';
                    try {
                        peer.reconnect();
                    } catch (e) {
                        console.error('Host reconnect failed', e);
                        statusEl.textContent = '⚠️ Connection Lost';
                    }
                } else if (err.type === 'network' || err.type === 'server-error') {
                    // On other errors, just show status but don't reload.
                    statusEl.textContent = '⚠️ Network Error';
                }
            }
        });
    }

    /**
     * UPDATED: This button now just reloads the page with no hash.
     */
    function showSwitchButton() {
        if (document.getElementById('switch-mode-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'switch-mode-btn';
        btn.textContent = '🔄 Go to Host Mode';
        btn.className = 'switch-mode-button';
        btn.onclick = () => {
            btn.remove();
            // --- NEW LOGIC ---
            // Just clear hash and reload
            window.location.hash = '';
            window.location.reload();
            // --- END NEW LOGIC ---
        };
        document.querySelector('.transfer-area').appendChild(btn);
    }

    function attemptConnection(targetId) {
        console.log('→ Attempting connection to:', targetId);
        let connectionFailed = false;
        let connectionTimer = null;
        
        const handleFailure = (message) => {
            if (connectionFailed) return;
            connectionFailed = true;
            if (connectionTimer) clearTimeout(connectionTimer);
            console.error('❌ Connection failed:', message);
            
            if (connectionRetryCount < MAX_RETRY) {
                connectionRetryCount++;
                statusEl.textContent = `🔄 Retry ${connectionRetryCount}`;
                setTimeout(() => attemptConnection(targetId), 2000);
            } else {
                statusEl.textContent = '❌ Failed to connect';
                showSwitchButton(); // Show button to go back
            }
        };

        try {
            connectionTimer = setTimeout(() => handleFailure('Timeout'), 20000);
            
            const conn = peer.connect(targetId, { 
                reliable: true,
                serialization: 'binary'
            });

            conn.on('open', () => {
                console.log('✓✓✓ CONNECTION OPENED!');
                clearTimeout(connectionTimer);
                if (!connectionFailed) {
                    connectionRetryCount = 0;
                    setupConnection(conn);
                }
            });

            conn.on('error', (err) => {
                console.error('❌ Connection error:', err);
                handleFailure('Error');
            });
            
            conn.on('close', () => {
                console.log('⚠ Connection closed early');
                if (!currentConnection) handleFailure('Closed');
            });
        } catch (e) {
            console.error('❌ Connect exception:', e);
            handleFailure('Failed');
        }
    }

    function setupConnection(conn) {
        console.log('✓ Setup connection');
        currentConnection = conn;
        window.APP_CONNECTION = conn;
        showConnectionAnimation();
        
        statusEl.textContent = '🔐 Connected!';
        fileInput.disabled = false;
        transferStatusEl.textContent = '✅ Ready';
        
        // Hide QR container and show "Connected" status
        qrCodeContainer.style.display = 'none';
        shareButtonsContainer.style.display = 'none';
        scanInstructions.style.display = 'block';

        // --- SHOW CHAT ---
        chatPlaceholder.style.display = 'none';
        chatContainer.style.display = 'flex'; // Changed to flex
        updateChatLimitsUI();
        
        const switchBtn = document.getElementById('switch-mode-btn');
        if (switchBtn) switchBtn.remove();
        
        if (isHost) startHeartbeat();

        // Send a 'ready' signal to the other peer
        setTimeout(() => {
            if (currentConnection && currentConnection.open) {
                try {
                    currentConnection.send({ type: 'ready' });
                } catch(e) {
                    console.error("Failed to send ready signal", e);
                }
            }
        }, 100);

        conn.on('data', (data) => {
            
            // --- HEARTBEAT & READY ---
            if (data.type === 'ready') {
                statusEl.textContent = '✅ Ready!';
                return;
            }
            if (data.type === 'heartbeat-ping') {
                conn.send({ type: 'heartbeat-pong' });
                return;
            }
            if (data.type === 'heartbeat-pong') return;

            // --- CHAT LOGIC ---
            if (data.type === 'chat-text') {
                addMessageToDOM('text', data.message, 'receiver', { words: data.message.split(/\s+/).length }, data.msgId, data.replyContext); // --- NEW: Pass context
                conn.send({ type: 'chat-read', msgId: data.msgId }); // Send read receipt
                pruneChat();
                updateChatLimitsUI();
                return;
            }
            if (data.type === 'chat-image') {
                addMessageToDOM('image', data.data, 'receiver', { size: data.size, name: data.name }, data.msgId, data.replyContext); // --- NEW: Pass context
                conn.send({ type: 'chat-read', msgId: data.msgId }); // Send read receipt
                pruneChat();
                updateChatLimitsUI();
                return;
            }
            if (data.type === 'chat-typing') {
                chatStatus.textContent = 'Typing...';
                chatStatus.style.opacity = 1;
                clearTimeout(peerTypingTimer);
                peerTypingTimer = setTimeout(() => { chatStatus.style.opacity = 0; }, 3500); // Auto-hide
                return;
            }
            if (data.type === 'chat-stop-typing') {
                clearTimeout(peerTypingTimer);
                chatStatus.style.opacity = 0;
                return;
            }
            if (data.type === 'chat-read') {
                const msgEl = document.querySelector(`.chat-message[data-msg-id="${data.msgId}"]`);
                if (msgEl) {
                    const statusEl = msgEl.querySelector('.msg-status');
                    if (statusEl) {
                        statusEl.innerHTML = '✓✓';
                        statusEl.classList.add('seen');
                    }
                }
                return;
            }
            // --- FIX: DOWNLOAD INDICATION ---
            if (data.type === 'chat-img-download') {
                console.log(`[DEBUG] Received chat-img-download for msgId: ${data.msgId}`); // DEBUG
                const msgEl = document.querySelector(`.chat-message[data-msg-id="${data.msgId}"]`);
                if (msgEl) {
                    console.log(`[DEBUG] Found message element for download status.`); // DEBUG
                    const statusEl = msgEl.querySelector('.download-status');
                    if (statusEl) {
                        console.log(`[DEBUG] Setting download status to 'inline'.`); // DEBUG
                        statusEl.style.display = 'inline';
                    }
                }
                return;
            }
            // --- END FIX ---


            // --- CLEANED UP CALL SIGNALING ---
            if (data.type === 'call-end') {
                // Peer ended the call
                console.log('Peer ended the call');
                cleanupCall();
                return;
            }
            
            if (data.type === 'call-toggle-video') {
                // Peer toggled their video
                console.log('Peer toggled video:', data.isVideoOn);
                if (remoteVideo) {
                    remoteVideo.style.display = data.isVideoOn ? 'block' : 'none';
                }
                if (callAvatar) {
                    callAvatar.style.display = data.isVideoOn ? 'none' : 'flex';
                }
                return;
            }
            // --- END CLEANED UP CALL SIGNALING ---


            // --- FILE TRANSFER LOGIC ---
            if (data.type === 'metadata') {
                const fileId = data.fileId;
                receivingFiles.set(fileId, {
                    id: fileId,
                    name: data.name,
                    size: data.size,
                    type: data.fileType,
                    data: [],
                    receivedBytes: 0,
                    startTime: Date.now() // Start ETA timer
                });
                
                createTransferUI(fileId, data.name, false);
                updateTransferUI(fileId, {
                    percent: 0,
                    sizeText: `0 / ${formatBytes(data.size)}`,
                    etaText: 'ETA: --:--'
                });
                
                transferStatusEl.textContent = `Receiving...`;
            } else if (data.type === 'end') {
                const fileId = data.fileId;
                const fileData = receivingFiles.get(fileId);
                
                if (!fileData) return; // Already cancelled or finished

                const fileBlob = new Blob(fileData.data, { type: fileData.type });
                const downloadUrl = URL.createObjectURL(fileBlob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = fileData.name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
                
                document.getElementById(`transfer-${fileId}`)?.remove();
                receivingFiles.delete(fileId);
                
                if (receivingFiles.size === 0 && !isSending) {
                    transferStatusEl.textContent = `✅ Received`;
                }
            // --- FIX: CANCEL LOGIC ---
            } else if (data.type === 'cancel') {
                const fileId = data.fileId;
                console.log(`Received cancel for: ${fileId}`);

                // 1. Is it our active send?
                if (activeSend && activeSend.id === fileId) {
                    activeSend.status = 'cancelled'; // This will be caught by reader.onload/readSlice
                    document.getElementById(`transfer-${fileId}`)?.remove();
                    
                    // We must manually stop and start the next file,
                    // just like in cancelTransfer()
                    isSending = false;
                    activeSend = null;
                    sendNextFileFromQueue();
                }
                // 2. Is it in our pending send queue?
                else if (fileQueue.some(job => job.id === fileId)) {
                    fileQueue = fileQueue.filter(job => job.id !== fileId);
                    document.getElementById(`transfer-${fileId}`)?.remove();
                }
                // 3. Is it our active receive?
                else if (receivingFiles.has(fileId)) {
                    receivingFiles.delete(fileId);
                    document.getElementById(`transfer-${fileId}`)?.remove();
                    if (receivingFiles.size === 0 && !isSending) {
                        transferStatusEl.textContent = '❌ Cancelled by peer';
                    }
                }
            // --- END FIX ---
            } else {
                // This is a file chunk (ArrayBuffer)
                // It must have a fileId attached
                const fileId = data.fileId; 
                const chunk = data.chunk;
                
                const fileData = receivingFiles.get(fileId);
                if (!fileData) return; // No metadata for this chunk, ignore

                fileData.data.push(chunk);
                fileData.receivedBytes += chunk.byteLength;
                
                const percent = Math.round((fileData.receivedBytes / fileData.size) * 100);
                
                // Calculate Receiver ETA
                const elapsedTime = (Date.now() - fileData.startTime) / 1000;
                let etaText = 'ETA: --:--';
                if (elapsedTime > 0.5) {
                    const speed = fileData.receivedBytes / elapsedTime;
                    const remainingBytes = fileData.size - fileData.receivedBytes;
                    const remainingTime = remainingBytes / speed;
                    etaText = `ETA: ${formatTime(remainingTime)}`;
                }
                
                updateTransferUI(fileId, {
                    percent: percent,
                    sizeText: `${formatBytes(fileData.receivedBytes)} / ${formatBytes(fileData.size)}`,
                    etaText: etaText
                });
            }
        });

        conn.on('close', () => handleDisconnect('Closed'));
        conn.on('error', (err) => {
            console.error("Connection error:", err);
            handleDisconnect('Error');
        });
        
        // Start sending if queue has items
        sendNextFileFromQueue();
    }
    
    function startHeartbeat() {
        stopHeartbeat();
        heartbeatInterval = setInterval(() => {
            if (currentConnection && currentConnection.open) {
                try {
                    currentConnection.send({ type: 'heartbeat-ping' });
                } catch (e) {}
            }
        }, 5000);
    }

    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }
    
    /**
     * --- CRITICAL FIX: handleDisconnect ---
     * This function now behaves differently for Host vs Client.
     */
    function handleDisconnect(message) {
        console.log('⚠ Disconnect:', message);
        stopHeartbeat();
        
        // --- HIDE CHAT & CALL UI ---
        chatContainer.style.display = 'none';
        chatPlaceholder.style.display = 'flex';
        cleanupCall(); // End any active call
        
        if (currentConnection) {
            try { currentConnection.close(); } catch (e) {}
            currentConnection = null;
        }

        if (isHost) {
            // --- HOST LOGIC ---
            // The Host does NOT reload. It resets its state.
            console.log('Host reset: waiting for new connection.');
            statusEl.textContent = '⚠️ Disconnected. Ready...';
            
            // Reset UI to QR code state
            qrCodeContainer.style.display = 'block';
            shareButtonsContainer.style.display = 'flex';
            scanInstructions.style.display = 'none';
            fileInput.disabled = true;
            transferStatusEl.textContent = 'Waiting...';
            
            // Cancel any pending transfers
            isSending = false;
            activeSend = null;
            fileQueue = [];
            receivingFiles.clear();
            transferListContainer.innerHTML = ''; // Clear UI
            
            // Peer itself is still valid and listening, so we don't destroy it.

        } else {
            // --- CLIENT LOGIC ---
            // The Client MUST reload to go back to Host mode.
            if (IS_RELOADING) return;
            IS_RELOADING = true;

            statusEl.textContent = '⚠️ Disconnected... Reloading...';
            
            if (peer && !peer.destroyed) {
                try { peer.destroy(); } catch (e) {}
                peer = null;
            }
            
            console.log('🔄 Client disconnected, reloading to host mode...');
            window.location.hash = '';
            window.location.reload();
        }
    }

    fileInput.addEventListener('change', (event) => {
        for (const file of event.target.files) {
            const fileId = crypto.randomUUID();
            const fileJob = {
                file: file,
                id: fileId,
                status: 'pending'
            };
            fileQueue.push(fileJob);
            
            // Add to UI as "Pending"
            createTransferUI(fileId, file.name, true);
            updateTransferUI(fileId, {
                status: 'pending',
                sizeText: formatBytes(file.size)
            });
        }
        event.target.value = null; // Clear input
        transferStatusEl.textContent = `📁 ${fileQueue.length} files queued`;
        
        if (currentConnection && currentConnection.open && !isSending) {
            sendNextFileFromQueue();
        }
    });

    function sendNextFileFromQueue() {
        if (fileQueue.length === 0) {
            isSending = false;
            activeSend = null;
            if (receivingFiles.size === 0) {
                transferStatusEl.textContent = '✅ All sent!';
            }
            return;
        }
        
        if (!currentConnection || !currentConnection.open || isSending) return;
        
        isSending = true;
        const fileJob = fileQueue.shift();
        activeSend = fileJob; // Mark this job as active
        
        fileJob.status = 'sending';
        const file = fileJob.file;
        
        transferStatusEl.textContent = `📤 Sending...`;
        
        const startTime = Date.now();

        try {
            currentConnection.send({
                type: 'metadata',
                fileId: fileJob.id, // Send the unique ID
                name: file.name,
                size: file.size,
                fileType: file.type
            });
        } catch (e) {
            handleDisconnect('Send failed');
            return;
        }

        let offset = 0;
        const reader = new FileReader();

        reader.onload = (e) => {
            // --- FIX ---
            // If this job is no longer the active job (i.e., it was cancelled by sender),
            // do nothing. The cancellation function handled cleanup.
            if (activeSend !== fileJob) {
                console.log('reader.onload fired for a cancelled/stale job. Ignoring.');
                return;
            }
            // --- END FIX ---

            if (fileJob.status === 'cancelled') {
                // This should now only be hit if cancelled by RECEIVER
                isSending = false;
                activeSend = null;
                sendNextFileFromQueue(); // Try next file
                return;
            }
            
            if(!currentConnection || !currentConnection.open) {
                isSending = false;
                activeSend = null;
                // Put job back in queue
                fileQueue.unshift(fileJob);
                console.error("Connection lost during sending");
                return;
            }
        
            try {
                // Send chunk with fileId
                currentConnection.send({
                    type: 'chunk',
                    fileId: fileJob.id,
                    chunk: e.target.result
                });
                
                offset += e.target.result.byteLength;
                
                updateProgress(fileJob.id, offset, file.size, startTime);

                if (offset < file.size) {
                    readSlice(offset);
                } else {
                    currentConnection.send({ type: 'end', fileId: fileJob.id });
                    document.getElementById(`transfer-${fileJob.id}`)?.remove();
                    isSending = false;
                    activeSend = null;
                    sendNextFileFromQueue(); // Send next file
                }
            } catch (err) {
                console.error("Send error:", err);
            }
        };
        
        reader.onerror = (e) => {
            isSending = false;
            activeSend = null;
            transferStatusEl.textContent = '❌ File Read error';
            document.getElementById(`transfer-${fileJob.id}`)?.remove();
        };

        function readSlice(o) {
            // --- FIX ---
            // If this job is no longer the active job (i.t. it was cancelled by sender),
            // do nothing.
            if (activeSend !== fileJob) {
                 console.log('readSlice called for a cancelled/stale job. Ignoring.');
                return;
            }
            // --- END FIX ---

            // Check for cancellation before reading
            if (fileJob.status === 'cancelled') {
                // This should now only be hit if cancelled by RECEIVER
                isSending = false;
                activeSend = null;
                sendNextFileFromQueue();
                return;
            }
            const slice = file.slice(o, o + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        }
        
        readSlice(0);
    }
    
    /**
     * @param {string} fileId
     */
    function cancelTransfer(fileId) {
        console.log(`[DEBUG] [cancelTransfer] called for ${fileId}`); // DEBUG
        // Is it the active transfer?
        if (activeSend && activeSend.id === fileId) {
            console.log(`Cancelling active transfer: ${fileId}`);
            activeSend.status = 'cancelled'; // Flag for reader.onload/readSlice
            
            // Remove UI
            document.getElementById(`transfer-${fileId}`)?.remove();
            
            // Send cancellation to peer
            if (currentConnection && currentConnection.open) {
                try {
                    currentConnection.send({ type: 'cancel', fileId: fileId });
                } catch (err) {}
            }
            
            // --- NEW ---
            // Immediately stop sending and start the next file
            isSending = false;
            activeSend = null;
            sendNextFileFromQueue(); // Start next file
            // --- END NEW ---

        } else {
            // It's in the queue, just remove it
            console.log(`Cancelling pending transfer: ${fileId}`);
            fileQueue = fileQueue.filter(job => job.id !== fileId);
            document.getElementById(`transfer-${fileId}`)?.remove();
            // No need to send 'cancel' message, it never started
        }
        
        if (!isSending && fileQueue.length === 0) {
             transferStatusEl.textContent = '❌ Cancelled';
        }
    }

    /**
     * @param {string} fileId
     */
    function updateProgress(fileId, sentBytes, totalBytes, startTime) {
        const percent = Math.round((sentBytes / totalBytes) * 100);
        const sizeText = `${formatBytes(sentBytes)} / ${formatBytes(totalBytes)}`;
        
        const elapsedTime = (Date.now() - startTime) / 1000;
        let etaText = 'ETA: --:--';
        if (elapsedTime > 0.5) {
            const speed = sentBytes / elapsedTime;
            const remainingBytes = totalBytes - sentBytes;
            const remainingTime = remainingBytes / speed;
            etaText = `ETA: ${formatTime(remainingTime)}`;
        }
        
        updateTransferUI(fileId, {
            percent: percent,
            sizeText: sizeText,
            etaText: etaText
        });
    }

    // --- NEW: Cancel Receive Function ---
    function cancelReceive(fileId) {
        console.log(`[DEBUG] [cancelReceive] called for ${fileId}`); // DEBUG
        // 1. Remove from map
        receivingFiles.delete(fileId);
        
        // 2. Remove UI
        document.getElementById(`transfer-${fileId}`)?.remove();
        
        // 3. Send cancellation to sender
        if (currentConnection && currentConnection.open) {
            try {
                currentConnection.send({ type: 'cancel', fileId: fileId });
            } catch (err) {}
        }
        
        // 4. Update status if no more files
        if (receivingFiles.size === 0 && !isSending) {
            transferStatusEl.textContent = '❌ Receive cancelled';
        }
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    function formatTime(seconds) {
        if (seconds === Infinity || isNaN(seconds)) return '--:--';
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }

    function setupShareButton() {
        const canvas = qrEl.querySelector('canvas');
        if (!canvas || typeof navigator.share === 'undefined') {
            nativeShareButton.style.display = 'none';
            copyLinkButton.style.display = 'inline-flex';
            downloadQrButton.style.display = 'inline-flex';
            return;
        }

        canvas.toBlob((blob) => {
            if (!blob) {
                nativeShareButton.style.display = 'none';
                copyLinkButton.style.display = 'inline-flex';
                downloadQrButton.style.display = 'inline-flex';
                return;
            }
            
            const file = new File([blob], 'qr-code.png', { type: 'image/png' });
            const shareData = {
                title: 'QR Send',
                text: 'Scan to connect',
                url: connectUrl,
                files: [file]
            };

            if (navigator.canShare && navigator.canShare(shareData)) {
                nativeShareButton.style.display = 'inline-flex';
                copyLinkButton.style.display = 'none';
                downloadQrButton.style.display = 'none';
                nativeShareButton.onclick = async () => {
                    try {
                        await navigator.share(shareData);
                    } catch (err) {}
                };
            } else {
                nativeShareButton.style.display = 'none';
                copyLinkButton.style.display = 'inline-flex';
                downloadQrButton.style.display = 'inline-flex';
            }
        }, 'image/png');
    }

    function copyToClipboard(text, element) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            if(element) {
                const originalText = element.textContent;
                element.textContent = '✅ Copied!';
                setTimeout(() => {
                    element.textContent = originalText;
                }, 1500);
            }
        } catch (err) {}
        document.body.removeChild(textarea);
    }
    
    function downloadQRCode() {
        try {
            const canvas = qrEl.querySelector('canvas');
            if (canvas) {
                const dataUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = 'qr-send.png';
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        } catch (e) {}
    }

    copyLinkButton.addEventListener('click', () => {
        if (connectUrl) copyToClipboard(connectUrl, copyLinkButton);
    });
    
    downloadQrButton.addEventListener('click', downloadQRCode);

    // Start the app
    initializePeer();
    
    // --- NEW: Add click listener for closing image modal (on overlay) ---
    const imageModalOverlay = document.getElementById('image-modal-overlay');
    if (imageModalOverlay) {
        imageModalOverlay.addEventListener('click', () => closeImageModal());
    }
    const imageModalCloseBtn = document.getElementById('image-modal-close-btn');
    if(imageModalCloseBtn) {
        imageModalCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeImageModal();
        });
    }
    // --- END ---
    
    // --- REMOVED BUGGY GLOBAL LISTENER ---
    // The faulty global listener for 'image-modal-download' has been removed.
    // The correct, dynamic 'onclick' listener is now set inside openImageModal().

});
