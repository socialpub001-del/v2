 /*
  QR Send - script.js
  Yeh file website ki poori logic (Frontend) ko control karti hai.
  Yeh aapke private PeerJS server (Render.com par) se connect hogi.
*/

// --- THEME TOGGLE ---
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('theme-icon-light').style.display = isDark ? 'block' : 'none';
    document.getElementById('theme-icon-dark').style.display = isDark ? 'none' : 'block';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Check theme on page load
if (localStorage.getItem('theme') === 'dark') {
    toggleTheme();
}

// --- IMAGE MODAL FUNCTIONS ---
/**
 * Image modal ko kholta hai.
 * @param {string} src - Image ka poora URL
 * @param {string} filename - Download ke liye file ka naam
 * @param {string} sender - 'sender' ya 'receiver'
 * @param {string} msgId - Message ki unique ID (download notification ke liye)
 */
function openImageModal(src, filename, sender, msgId) {
    const imageModalOverlay = document.getElementById('image-modal-overlay');
    const imageModalContent = document.getElementById('image-modal-content');
    const imageModalDownload = document.getElementById('image-modal-download');
    
    if (!imageModalOverlay || !imageModalContent || !imageModalDownload) return;
    
    console.log(`Modal khol raha hai: ${sender}, msgId: ${msgId}`);
    
    // Image source set karein
    imageModalContent.src = src;
    
    // Download button ki properties set karein
    if (sender === 'receiver') {
        imageModalDownload.href = src;
        imageModalDownload.download = filename;
        imageModalDownload.classList.add('active'); // Download button dikhayein
        
        // --- NAYA: Download notification ke liye dynamic onclick ---
        imageModalDownload.onclick = (e) => {
            e.stopPropagation(); // Modal ko band hone se rokein
            console.log('Download button click hua, notification bhej raha hai...');
            
            // Check karein ki function maujood hai ya nahi
            if (typeof sendImageDownloadNotification === 'function') {
                sendImageDownloadNotification(msgId);
            }
            // 'a' tag download ko khud handle kar lega
        };
        // --- END NAYA ---
        
    } else {
        imageModalDownload.classList.remove('active'); // Sender ke liye chupayein
        imageModalDownload.onclick = null; // Purana listener clear karein
    }
    
    // Modal dikhayein
    imageModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // Background scrolling rokein
}

/**
 * Image modal ko band karta hai.
 */
function closeImageModal() {
    const imageModalOverlay = document.getElementById('image-modal-overlay');
    const imageModalContent = document.getElementById('image-modal-content');
    if (!imageModalOverlay) return;
    imageModalOverlay.classList.remove('active');
    imageModalContent.src = ''; // Source clear karein
    
    // Download onclick ko clear karein
    const imageModalDownload = document.getElementById('image-modal-download');
    imageModalDownload.onclick = null;
    
    document.body.style.overflow = ''; // Scrolling vapas chalu karein
}
// --- END IMAGE MODAL FUNCTIONS ---


// --- SCANNER STATE VARIABLES ---
let html5QrCode = null;
let isScanning = false;
let hasScanned = false;
let ALLOW_PEER_INIT = true; // Peer init ko control karne ke liye flag
let IS_RELOADING = false; // Reload loops ko rokne ke liye flag

// --- CALL STATE VARIABLES ---
let localStream = null;
let remoteStream = null;
let currentCall = null;
let isCallActive = false;
let callTimerInterval = null;
let callStartTime = 0;

// --- GLOBAL APP STATE ---
window.APP_PEER = null;
window.APP_CONNECTION = null;

// --- SCANNER FUNCTIONS ---

/**
 * QR code scanner modal ko kholta hai.
 */
function openScanner() {
    if (isScanning || document.getElementById('scanner-modal').classList.contains('active')) {
        console.log('⚠ Scanner pehle se active hai. Ignoring.');
        return;
    }
    console.log('📷 Scanner khol raha hai...');
    hasScanned = false;
    ALLOW_PEER_INIT = false; // Peer auto-init ko rokein
    console.log('🚫 Peer auto-init ROKA GAYA');
    document.getElementById('scanner-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    startScanner();
}

/**
 * QR code scanner modal ko band karta hai.
 */
function closeScanner() {
    if (!document.getElementById('scanner-modal').classList.contains('active')) {
        console.log('⚠ closeScanner call hua lekin modal pehle se band hai.');
        return;
    }
    console.log('❌ Scanner band kar raha hai...');
    document.getElementById('scanner-modal').classList.remove('active');
    document.body.style.overflow = '';
    stopScanner(); // Camera ko band karein
    
    // Peer init ko vapas allow karein (agar scan safal nahi hua)
    if (!hasScanned && !IS_RELOADING) { 
        ALLOW_PEER_INIT = true;
        console.log('✅ Peer auto-init VAPAS CHALU');
    }
}

/**
 * Camera chalu karta hai aur scanning shuru karta hai.
 */
function startScanner() {
    if (html5QrCode || isScanning) {
        console.log('⚠ Scanner pehle se chalu hai');
        return;
    }
    isScanning = true;
    console.log('🎥 Camera chalu kar raha hai...');

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
        { facingMode: "environment" }, // Peeche ka camera
        config,
        (decodedText) => { // Scan safal hone par
            if (hasScanned) {
                console.log('⚠ Pehle hi scan ho chuka hai, ignore kar raha hai...');
                return;
            }
            hasScanned = true;
            console.log('✓✓✓ QR SCANNED:', decodedText);
            
            if (navigator.vibrate) {
                navigator.vibrate(200);
            }
            
            // Race conditions se bachne ke liye setTimeout ka istemaal
            setTimeout(() => {
                console.log('→ processQRCode call kar raha hai...');
                processQRCode(decodedText);

                console.log('→ closeScanner call kar raha hai...');
                closeScanner();
            }, 0);
        },
        (errorMessage) => {
            // Error message na dikhayein
        }
    ).catch((err) => {
        console.error('❌ Scanner error:', err);
        isScanning = false;
        ALLOW_PEER_INIT = true; // Error par peer init allow karein
        if (typeof showChatStatus === 'function') {
            showChatStatus('❌ Camera error: ' + err.name, true);
        }
        closeScanner();
    });
}

/**
 * Scan kiye gaye text (URL) ko process karta hai.
 */
function processQRCode(decodedText) {
    if (IS_RELOADING) {
        console.log('⚠ Pehle se reload ho raha hai. Ignoring.');
        return;
    }
    IS_RELOADING = true; // Turant flag set karein

    console.log('=== QR CODE PROCESS HO RAHA HAI ===');
    
    try {
        const url = new URL(decodedText);
        const scannedPeerId = url.hash.substring(1);
        console.log('🎯 Peer ID mili:', scannedPeerId);
        
        if (!scannedPeerId || scannedPeerId.trim() === '') {
            console.error('❌ Khali peer ID!');
            if (typeof showChatStatus === 'function') {
                showChatStatus('QR code mein peer ID nahi hai', true);
            }
            hasScanned = false; // Dobara scan karne dein
            ALLOW_PEER_INIT = true; 
            IS_RELOADING = false; // Error par flag reset karein
            return;
        }
        
        console.log('🔄 CLIENT mode mein switch karne ke liye reload kar raha hai...');
        window.location.hash = scannedPeerId;
        window.location.reload();

    } catch (e) {
        console.error('❌ QR parse FAILED:', e);
        if (typeof showChatStatus === 'function') {
            showChatStatus('Invalid QR code: ' + e.message, true);
        }
        hasScanned = false; // Dobara scan karne dein
        ALLOW_PEER_INIT = true;
        IS_RELOADING = false; // Error par flag reset karein
    }
}

/**
 * Camera aur scanner ko surakshit roop se band karta hai.
 */
function stopScanner() {
    if (html5QrCode && isScanning) {
        console.log('🛑 Scanner rok raha hai...');
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
            isScanning = false;
            console.log('✓ Scanner ruka');
        }).catch((err) => {
            console.error('Stop error:', err);
            html5QrCode = null;
            isScanning = false;
        });
    }
}

/**
 * Connection safal hone par lock animation dikhata hai.
 */
function showConnectionAnimation() {
    const overlay = document.getElementById('connection-overlay');
    overlay.classList.add('active');
    setTimeout(() => {
        overlay.classList.remove('active');
    }, 2000); // 2 second baad gayab
}

// --- FILE TRANSFER UI FUNCTIONS ---

/**
 * Transfer list mein ek naya progress bar banata hai.
 * @param {string} fileId - Transfer ki unique ID
 * @param {string} fileName - File ka naam
 * @param {boolean} isSender - `true` agar bhej rahe hain, `false` agar receive kar rahe hain
 */
function createTransferUI(fileId, fileName, isSender) {
    const container = document.getElementById('transfer-list-container');
    const el = document.createElement('div');
    el.className = 'progress-container';
    el.id = `transfer-${fileId}`;

    const label = isSender ? `Bhej rahe hain: ${fileName}` : `Receive kar rahe hain: ${fileName}`;
    
    // Cancel button (hamesha '✕' text ke saath banayein)
    const cancelButtonHTML = `<button class="cancel-button" data-file-id="${fileId}">✕</button>`; 

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

    container.appendChild(el);
    
    // --- FIX: Cancel button par click listener lagayein ---
    el.querySelector('.cancel-button').addEventListener('click', () => {
        console.log(`[DEBUG] Cancel button click hua: ${fileId}, Sender: ${isSender}`);
        if (isSender) {
            // Check karein ki function maujood hai
            if (typeof cancelTransfer === 'function') cancelTransfer(fileId);
        } else {
            // Check karein ki function maujood hai
            if (typeof cancelReceive === 'function') cancelReceive(fileId);
        }
    });
}

/**
 * Progress bar ko update karta hai.
 * @param {string} fileId - Transfer ki ID
 * @param {object} options - Update karne ke liye options
 */
function updateTransferUI(fileId, options) {
    const el = document.getElementById(`transfer-${fileId}`);
    if (!el) return; // Agar element nahi mila (ho sakta hai cancel ho gaya ho)

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
        percentage.textContent = 'Pending...';
        size.textContent = options.sizeText; // Pending mein bhi size dikhayein
        eta.textContent = '';
    } else {
         bar.classList.remove('pending');
         label.style.opacity = 1;
    }
}

// --- DOMContentLoaded: Jab poora page load ho jaaye tab yeh code chalayein ---

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App initialized');
    
    // --- CHAT CONSTANTS ---
    const MAX_WORDS = 1000;
    const MAX_IMAGES = 6;
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

    // --- CHAT STATE ---
    let typingTimer; // "Typing..." ke liye timer
    let isTypingSent = false;
    let peerTypingTimer; // Doosre user ke "Typing..." ke liye timer
    let replyingTo = null; // Reply state


    // --- CHAT HELPER FUNCTIONS ---
    
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

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

    // Chat se purane messages hatata hai agar limit poori ho jaaye
    function pruneChat() {
        // Text messages hatayein
        const textMessages = Array.from(chatMessages.querySelectorAll('.chat-message[data-type="text"]'));
        let { wordCount } = getChatLimits();
        while (wordCount > MAX_WORDS && textMessages.length > 0) {
            const oldMsg = textMessages.shift();
            const wordsToRemove = parseInt(oldMsg.dataset.words || 0, 10);
            wordCount -= wordsToRemove;
            oldMsg.remove();
        }

        // Image messages hatayein
        const imageMessages = Array.from(chatMessages.querySelectorAll('.chat-message[data-type="image"]'));
        let { imageCount, imageSize } = getChatLimits();
        while ((imageCount > MAX_IMAGES || imageSize > MAX_IMAGE_SIZE) && imageMessages.length > 0) {
            const oldImg = imageMessages.shift();
            const sizeToRemove = parseInt(oldImg.dataset.size || 0, 10);
            imageSize -= sizeToRemove;
            imageCount--;
            oldImg.remove();
        }
    }

    // "Words: 0/1000" wala text update karta hai
    function updateChatLimitsUI() {
        if (!chatLimitsInfo) return;
        const { wordCount, imageCount, imageSize } = getChatLimits();
        chatLimitsInfo.textContent = `Words: ${wordCount}/${MAX_WORDS} | Images: ${imageCount}/${MAX_IMAGES} (${formatBytes(imageSize)}/10 MB)`;
    }

    /**
     * Chat window mein naya message (text ya image) jodata hai.
     */
    function addMessageToDOM(type, content, sender, metadata, msgId, replyContext = null) {
        const msgEl = document.createElement('div');
        msgEl.className = `chat-message ${sender}`;
        msgEl.dataset.type = type;
        msgEl.dataset.msgId = msgId;

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';

        // Reply context (agar hai) jodein
        if (replyContext && replyContext.text) {
            const replyEl = document.createElement('div');
            replyEl.className = 'message-reply-context';
            replyEl.textContent = replyContext.text;
            msgEl.appendChild(replyEl);
        }

        let textContentForReply = ''; // Reply button ke liye text

        if (type === 'text') {
            contentEl.textContent = content;
            msgEl.dataset.words = metadata.words;
            textContentForReply = content;
        } else if (type === 'image') {
            const img = document.createElement('img');
            img.src = content; // Base64 data
            img.dataset.filename = metadata.name;
            textContentForReply = `Image: ${metadata.name}`;
            
            // Image par click karne se modal khulega
            img.onclick = () => {
                openImageModal(img.src, img.dataset.filename, sender, msgId);
            };
            
            img.onload = () => {
                chatMessages.scrollTop = chatMessages.scrollHeight; // Image load hone par scroll karein
            };
            contentEl.appendChild(img);
            msgEl.dataset.size = metadata.size;
        }
        
        msgEl.appendChild(contentEl);

        // Reply button jodein
        const replyBtn = document.createElement('button');
        replyBtn.className = 'chat-message-reply-btn';
        replyBtn.title = 'Reply';
        replyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>';
        replyBtn.onclick = () => {
            setReplyContext(msgId, textContentForReply);
        };
        msgEl.appendChild(replyBtn);


        // Status bar (ticks, download status) sirf sender ke liye jodein
        if (sender === 'sender') {
            const statusBar = document.createElement('div');
            statusBar.className = 'message-status-bar';
            
            // Image ke liye "Downloaded" status wala text (shuru mein chupa hua)
            if (type === 'image') {
                 const downloadStatus = document.createElement('span');
                 downloadStatus.className = 'download-status';
                 downloadStatus.textContent = 'Downloaded by peer';
                 statusBar.appendChild(downloadStatus);
            }
            
            // "Seen" status (✓)
            const msgStatus = document.createElement('span');
            msgStatus.className = 'msg-status';
            msgStatus.innerHTML = '✓'; // Ek tick (sent)
            statusBar.appendChild(msgStatus);
            
            msgEl.appendChild(statusBar);
        }

        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Naye message par neeche scroll karein
    }

    /**
     * Text message bhejta hai.
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
                replyContext: replyingTo // Reply context saath bhej
            });
            addMessageToDOM('text', message, 'sender', { words: wordCount }, msgId, replyingTo);
            pruneChat(); // Purane messages check karein
            updateChatLimitsUI(); // Limit UI update karein
            chatInput.value = '';
            cancelReply(); // Reply state clear karein
            
            // "Typing..." indicator band karein
            clearTimeout(typingTimer);
            isTypingSent = false;
            currentConnection.send({ type: 'chat-stop-typing' });

        } catch (e) {
            console.error("Chat bhejte waqt error:", e);
            showChatStatus('Message bhejte waqt error', true);
        }
    }

    /**
     * Image file ko select karne par handle karta hai.
     */
    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > MAX_IMAGE_SIZE) {
            showChatStatus('❌ Image 10MB se badi hai', true);
            return;
        }
        
        const { imageCount, imageSize } = getChatLimits();
        if (imageCount >= MAX_IMAGES || imageSize + file.size > MAX_IMAGE_SIZE) {
             showChatStatus('Image quota poora ho gaya. Purani images delete ho jayengi.', true);
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
                    replyContext: replyingTo // Image ke saath reply context bhej
                });
                addMessageToDOM('image', base64data, 'sender', metadata, msgId, replyingTo);
                pruneChat();
                updateChatLimitsUI();
                cancelReply();
            } catch (e) {
                console.error("Image bhejte waqt error:", e);
                showChatStatus('Image bhejte waqt error', true);
            }
        }).catch(err => {
            console.error("Base64 conversion error:", err);
            showChatStatus('Image read nahi kar pa raha', true);
        });
        
        event.target.value = null; // Input clear karein
    }

    /**
     * Chat mein chhota status message dikhata hai (jaise "Typing...").
     */
    function showChatStatus(message, isError = false) {
        if (!chatStatus) return;
        chatStatus.textContent = message;
        chatStatus.style.color = isError ? 'var(--error)' : 'var(--success)';
        chatStatus.style.opacity = 1;
        
        clearTimeout(peerTypingTimer); // Purana timer clear karein
        
        // 3 second baad message gayab karein
        peerTypingTimer = setTimeout(() => {
            chatStatus.style.opacity = 0;
        }, 3000);
    }
    
    // --- DOWNLOAD NOTIFICATION FUNCTION ---
    /**
     * Receiver ke download karne par sender ko notification bhejta hai.
     * Yeh function `openImageModal` mein call hota hai.
     */
    function sendImageDownloadNotification(msgId) {
        if (currentConnection && currentConnection.open && msgId) {
            try {
                console.log(`[DEBUG] 'chat-img-download' notification bhej raha hai: ${msgId}`);
                currentConnection.send({ type: 'chat-img-download', msgId: msgId });
            } catch (e) {
                console.error("Download notification bhejte waqt error:", e);
            }
        }
    }

    // --- REPLY FUNCTIONS ---
    /**
     * Reply bar ko set karta hai.
     */
    function setReplyContext(msgId, text) {
        const replyBar = document.getElementById('reply-context-bar');
        const replyContent = document.getElementById('reply-context-content');
        if (!replyBar || !replyContent) return;
        
        // Text ko chhota karein agar bahut bada hai
        const truncatedText = text.length > 70 ? text.substring(0, 70) + '...' : text;
        
        replyingTo = { msgId, text: truncatedText };
        
        replyContent.textContent = truncatedText;
        replyBar.style.display = 'block';
        
        chatInput.focus(); // Input par focus karein
    }

    /**
     * Reply bar ko band karta hai.
     */
    function cancelReply() {
        const replyBar = document.getElementById('reply-context-bar');
        if (!replyBar) return;

        replyingTo = null;
        replyBar.style.display = 'none';
    }


    // --- VIDEO/VOICE CALL FUNCTIONS ---
    
    /**
     * Call shuru karta hai (video ya voice).
     */
    async function startCall(isVideo) {
        if (!currentConnection || !currentConnection.open || isCallActive) {
            showChatStatus('❌ Connected nahi hai ya pehle se call par hain', true);
            return;
        }
        
        console.log(`${isVideo ? 'Video' : 'Voice'} call shuru kar raha hai...`);
        
        try {
            // Camera/mic access maangein
            localStream = await navigator.mediaDevices.getUserMedia({
                video: isVideo,
                audio: true
            });
            
            showCallUI(true, isVideo); // Call ka UI dikhayein
            
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
            toggleMicButton.classList.add('active'); // Mic shuru mein ON
            toggleMicButton.querySelector('.icon-mic-on').style.display = 'block';
            toggleMicButton.querySelector('.icon-mic-off').style.display = 'none';

            
            // Peer ko call karein
            console.log('peer.call() initiate kar raha hai...');
            currentCall = peer.call(currentConnection.peer, localStream, {
                metadata: { isVideo: isVideo } // Bataayein ki yeh video call hai ya nahi
            });
            
            currentCall.on('stream', setupRemoteStream); // Jab unka stream aaye
            currentCall.on('close', endCall); // Jab call kate
            currentCall.on('error', (err) => {
                console.error('Call error:', err);
                endCall();
            });
            
            callStatus.textContent = 'Ringing...';
            isCallActive = true;
            
        } catch (err) {
            console.error('getUserMedia error:', err);
            showChatStatus(`❌ ${err.name}`, true);
            cleanupCall();
        }
    }

    /**
     * Aa rahi call ko uthata hai.
     */
    async function answerCall() {
        if (!currentCall || isCallActive) return;
        
        console.log('Call utha rahe hain...');
        hideIncomingCallToast();
        isCallActive = true;
        const isVideo = currentCall.metadata.isVideo;
        
        try {
            // Apna camera/mic chalu karein
            localStream = await navigator.mediaDevices.getUserMedia({
                video: isVideo,
                audio: true
            });
            
            showCallUI(true, isVideo); // Call UI dikhayein
            
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
            
            // Call ko answer karein aur apna stream bhej
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
            rejectCall(); // Agar media nahi mila to call reject kar dein
        }
    }

    /**
     * Aa rahi call ko reject (kaat) karta hai.
     */
    function rejectCall() {
        console.log('Call reject kar rahe hain...');
        
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        hideIncomingCallToast();
        cleanupCall();
    }

    /**
     * Mic ko mute/unmute karta hai.
     */
    function toggleMic() {
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled; // Toggle
            toggleMicButton.classList.toggle('active');
            toggleMicButton.querySelector('.icon-mic-on').style.display = audioTrack.enabled ? 'block' : 'none';
            toggleMicButton.querySelector('.icon-mic-off').style.display = audioTrack.enabled ? 'none' : 'block';
        }
    }
    
    /**
     * Video ko on/off karta hai.
     */
    function toggleVideo() {
        if (!localStream) return;
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled; // Toggle
            toggleVideoButton.classList.toggle('active');
            toggleVideoButton.querySelector('.icon-video-on').style.display = videoTrack.enabled ? 'block' : 'none';
            toggleVideoButton.querySelector('.icon-video-off').style.display = videoTrack.enabled ? 'none' : 'block';
            
            // Avatar dikhayein/chupayein
            callAvatar.style.display = videoTrack.enabled ? 'none' : 'flex';
            localVideo.style.display = videoTrack.enabled ? 'block' : 'none';
            
            // Peer ko bataayein ki humne video toggle kiya
            if (currentConnection && currentConnection.open) {
                currentConnection.send({ type: 'call-toggle-video', isVideoOn: videoTrack.enabled });
            }
        }
    }

    /**
     * Current call ko kaat deta hai.
     */
    function endCall() {
        console.log('Call kaat rahe hain...');
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        // Fallback: Peer ko message bhej kar bhi bataayein
        if (currentConnection && currentConnection.open) {
            currentConnection.send({ type: 'call-end' });
        }
        cleanupCall();
    }

    /**
     * Call se judi sabhi cheezein (stream, timer, UI) saaf karta hai.
     */
    function cleanupCall() {
        console.log('Call cleanup kar raha hai...');
        
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
        showCallUI(false); // Call UI chupayein
        hideIncomingCallToast(); // Toast chupayein
    }
    
    /**
     * Doosre user ka video/audio stream set karta hai.
     */
    function setupRemoteStream(stream) {
        console.log('Remote stream mila');
        remoteStream = stream;
        remoteVideo.srcObject = stream;
        remoteVideo.style.display = 'block';
        
        if (stream.getVideoTracks().length > 0) {
            callAvatar.style.display = 'none'; // Video hai to avatar chupayein
        } else {
            callAvatar.style.display = 'flex'; // Sirf audio hai to avatar dikhayein
        }
        
        callStatus.textContent = 'Connected';
        startCallTimer();
    }
    
    /**
     * Call UI ko dikhata ya chupata hai.
     */
    function showCallUI(show, isVideo = false) {
        const callModalOverlay = document.getElementById('call-modal-overlay');
        const localVideo = document.getElementById('local-video');
        const remoteVideo = document.getElementById('remote-video');
        const callAvatar = document.getElementById('call-avatar');

        if (show) {
            callModalOverlay.classList.add('active');
            toggleVideoButton.style.display = isVideo ? 'flex' : 'none';
            localVideo.style.display = isVideo ? 'block' : 'none';
            remoteVideo.style.display = 'none'; // Remote stream aane tak chupa
            callAvatar.style.display = isVideo ? 'none' : 'flex';
        } else {
            callModalOverlay.classList.remove('active');
        }
    }
    
    // Call aane par notification (toast) dikhata hai
    function showIncomingCallToast(isVideo) {
        const incomingCallToast = document.getElementById('incoming-call-toast');
        const incomingCallType = document.getElementById('incoming-call-type');
        incomingCallType.textContent = `Incoming ${isVideo ? 'Video' : 'Voice'} Call...`;
        incomingCallToast.classList.add('active');
    }
    
    // Call notification (toast) chupata hai
    function hideIncomingCallToast() {
        const incomingCallToast = document.getElementById('incoming-call-toast');
        incomingCallToast.classList.remove('active');
    }
    
    // Call ka timer chalu karta hai
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
    
    // Call ka timer roktok hai
    function stopCallTimer() {
        if (callTimerInterval) {
            clearInterval(callTimerInterval);
            callTimerInterval = null;
        }
        document.getElementById('call-timer').textContent = '00:00';
    }
    
    // --- END CALL FUNCTIONS ---


    // --- DOM Elements ko JavaScript mein laana ---
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
    const transferListContainer = document.getElementById('transfer-list-container');
    const chatContainer = document.getElementById('chat-container');
    const chatPlaceholder = document.getElementById('chat-placeholder');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendButton = document.getElementById('chat-send-button');
    const chatAttachButton = document.getElementById('chat-attach-button');
    const chatImageInput = document.getElementById('chat-image-input');
    const chatLimitsInfo = document.getElementById('chat-limits-info');
    const chatStatus = document.getElementById('chat-status');
    const replyContextBar = document.getElementById('reply-context-bar');
    const replyContextClose = document.getElementById('reply-context-close');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const callStatus = document.getElementById('call-status');
    const callAvatar = document.getElementById('call-avatar');
    const startVideoCallButton = document.getElementById('start-video-call');
    const startVoiceCallButton = document.getElementById('start-voice-call');
    const toggleMicButton = document.getElementById('toggle-mic-button');
    const toggleVideoButton = document.getElementById('toggle-video-button');
    const endCallButton = document.getElementById('end-call-button');
    const acceptCallButton = document.getElementById('accept-call-button');
    const rejectCallButton = document.getElementById('reject-call-button');
    // --- End DOM Elements ---


    // --- Chat Event Listeners ---
    chatSendButton.addEventListener('click', sendTextMessage);
    chatInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') sendTextMessage();
    });
    
    // "Typing..." indicator logic
    chatInput.addEventListener('input', () => {
        if (!currentConnection || !currentConnection.open) return;
        if (!isTypingSent) {
            currentConnection.send({ type: 'chat-typing' });
            isTypingSent = true;
            setTimeout(() => { isTypingSent = false; }, 2000); 
        }
        clearTimeout(typingTimer);
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
    if (replyContextClose) {
        replyContextClose.addEventListener('click', cancelReply);
    }
    // --- End Chat Listeners ---


    // --- Call Event Listeners ---
    startVideoCallButton.addEventListener('click', () => startCall(true));
    startVoiceCallButton.addEventListener('click', () => startCall(false));
    toggleMicButton.addEventListener('click', toggleMic);
    toggleVideoButton.addEventListener('click', toggleVideo);
    endCallButton.addEventListener('click', endCall);
    acceptCallButton.addEventListener('click', answerCall);
    rejectCallButton.addEventListener('click', rejectCall);
    // --- End Call Listeners ---


    // --- PEERJS CORE LOGIC ---
    
    const CHUNK_SIZE = 64 * 1024; // File transfer ke liye 64KB chunks

    let peer = null;
    let currentConnection = null;
    let myId = '';
    let connectUrl = '';
    let isHost = false; // Flag: Kya yeh device Host hai?
    let connectionRetryCount = 0;
    const MAX_RETRY = 3;
    
    let fileQueue = []; // Bhejne ke liye file ki line
    let isSending = false; // Flag: Kya abhi koi file bhej rahe hain?
    let activeSend = null; // Jo file abhi bhej rahe hain
    
    let receivingFiles = new Map(); // Jo files receive ho rahi hain

    let hasActiveTransfer = false; // Koi transfer chalu hai ya nahi
    let heartbeatInterval = null; // Connection check karne ke liye timer
    
    // --- RELOAD WARNING FIX ---
    // Page reload/band karne se pehle warning
    window.addEventListener('beforeunload', (event) => {
        hasActiveTransfer = isSending || receivingFiles.size > 0;
        
        // Warning sirf tab dikhayein jab connected hon ya transfer chalu ho
        if (hasActiveTransfer || (currentConnection && currentConnection.open)) {
            
            // --- YEH CLIENT RELOAD WALI PROBLEM KA FIX HAI ---
            if (!isHost) {
                console.log('Client reload kar raha hai, hash clear kar raha hai...');
                // Yeh page reload hone se pehle URL se #... hata dega.
                // Isse jab page reload hoga, to woh HOST ban jayega.
                window.location.hash = '';
            }
            // --- END FIX ---

            const warningText = 'Disconnect karne se saare transfers ruk jaayenge. Kya aap sure hain?';
            event.preventDefault();
            event.returnValue = warningText; // Purane browsers ke liye
            return warningText; // Naye browsers ke liye
        }
    });
    // --- END RELOAD WARNING FIX ---


    /**
     * PeerJS connection ko shuru karta hai.
     */
    function initializePeer() {
        if (!ALLOW_PEER_INIT) {
            console.log('🚫 Peer init ROKA GAYA (scanner active)');
            return;
        }
        
        console.log('🔧 Peer initialize kar raha hai...');
        statusEl.textContent = 'Initializing...';
        
        try {
            // --- PRIVATE SERVER CONFIGURATION ---
            
            // !!!!! BAHUT ZAROORI !!!!!
            // Jab aap Render.com par server deploy kar denge, to aapko ek URL milega
            // (jaise: 'my-server-123.onrender.com').
            // Aapko us URL ko yahaan 'YOUR_RENDER_URL_HERE' ki jagah daalna hai.
            
            // Abhi ke liye, hum ek placeholder daal rahe hain.
            // Yeh tab tak kaam nahi karega jab tak aap asli URL nahi daalte.
            const RENDER_HOST = 'qr-send-server.onrender.com'; // <--- Yahaan RENDER.COM ka URL daalein
            
            // --- END ZAROORI ---

            peer = new Peer(undefined, {
                host: RENDER_HOST,      // Aapka Render server domain
                port: 443,              // Render.com standard HTTPS port
                path: '/peerjs',        // Yeh 'server.js' file ke path se match hona chahiye
                secure: true,           // Render.com HTTPS istemaal karta hai
                debug: 1                // Console mein debug messages ke liye
            });
            // --- END PRIVATE SERVER CONFIGURATION ---
            
            window.APP_PEER = peer;
            
        } catch (e) {
            console.error('❌ Init error:', e);
            statusEl.textContent = '❌ Server se connect nahi ho pa raha';
            return;
        }

        // Jab Peer server se successfully connect ho jaaye
        peer.on('open', (id) => {
            myId = id;
            console.log('✓ Aapki Peer ID hai:', id);
            const peerToConnect = window.location.hash.substring(1); // URL se #... ID check karein

            if (peerToConnect) {
                // --- CLIENT MODE ---
                // Agar URL mein # ID hai, to hum Client hain
                console.log('→ CLIENT MODE');
                isHost = false;
                statusEl.textContent = '🔗 Connect ho raha hai...';
                qrCodeContainer.style.display = 'none'; // QR code chupayein
                shareButtonsContainer.style.display = 'none';
                scanInstructions.style.display = 'none';
                attemptConnection(peerToConnect); // Host se connect karne ki koshish karein
            } else {
                // --- HOST MODE ---
                // Agar URL mein # ID nahi hai, to hum Host hain
                console.log('→ HOST MODE');
                isHost = true;
                qrCodeContainer.style.display = 'block'; // QR code dikhayein
                scanInstructions.style.display = 'none';
                statusEl.textContent = 'Generating QR...';
                
                // Naya connection URL banayein (e.g., app.netlify.app/#PEER_ID)
                connectUrl = `${window.location.origin}${window.location.pathname}#${myId}`;
                qrEl.innerHTML = '';
                
                // Naya QR code banayein
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

        // Jab koi Client humse connect karne ki koshish kare (HOST logic)
        peer.on('connection', (conn) => {
            console.log('📡 Koi connect ho raha hai...');
            if (currentConnection) {
                console.log('⚠ Pehle se connected hai, naya connection reject kar raha hai.');
                conn.close();
                return;
            }
            statusEl.textContent = '📡 Incoming...';
            
            // Connection setup karein
            conn.on('open', () => setupConnection(conn));
        });

        // Jab koi humein call kare (Video/Voice)
        peer.on('call', (call) => {
            console.log('Incoming call...');
            if (currentCall || isCallActive) {
                console.log('⚠ Pehle se call par hain, reject kar raha hai.');
                return;
            }
            currentCall = call; // Call ko store karein
            const isVideo = call.metadata.isVideo;
            showIncomingCallToast(isVideo); // Notification dikhayein
        });

        // Jab PeerJS mein koi error aaye
        peer.on('error', (err) => {
            console.error('❌ Peer error:', err.type);
            
            // Agar CLIENT connect nahi kar paaya
            if (err.type === 'peer-unavailable') {
                if (!isHost && connectionRetryCount < MAX_RETRY) {
                    connectionRetryCount++;
                    statusEl.textContent = `🔄 Retry ${connectionRetryCount}`;
                    setTimeout(() => {
                        const targetId = window.location.hash.substring(1);
                        if (targetId) attemptConnection(targetId);
                    }, 2000);
                } else if (!isHost) {
                    statusEl.textContent = '❌ Peer nahi mila';
                    showSwitchButton(); 
                }
            } 
            // Agar CLIENT ka server se connection toota
            else if (!isHost && (err.type === 'network' || err.type === 'server-error')) { 
                statusEl.textContent = '❌ Connection Error. Reload ho raha hai...';
                if (IS_RELOADING) return;
                IS_RELOADING = true;
                window.location.hash = ''; // Hash clear karein
                window.location.reload(); // Host banne ke liye reload karein
            } 
            // Agar HOST ka server se connection toota
            else if (isHost) {
                console.error('Host peer error:', err.type);
                if (err.type === 'disconnected') {
                    console.log('Host server se disconnect ho gaya, reconnect kar raha hai...');
                    statusEl.textContent = 'Reconnecting...';
                    try { peer.reconnect(); } catch (e) {
                        console.error('Host reconnect failed', e);
                        statusEl.textContent = '⚠️ Connection Lost';
                    }
                } else if (err.type === 'network' || err.type === 'server-error') {
                    statusEl.textContent = '⚠️ Network Error';
                }
            }
        });
    }

    /**
     * "Go to Host Mode" button dikhata hai (jab client fail ho)
     */
    function showSwitchButton() {
        if (document.getElementById('switch-mode-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'switch-mode-btn';
        btn.textContent = '🔄 Host Mode mein jaayein';
        btn.className = 'switch-mode-button';
        btn.onclick = () => {
            btn.remove();
            window.location.hash = ''; // Hash clear karein
            window.location.reload(); // Reload
        };
        document.querySelector('.transfer-area').appendChild(btn);
    }

    /**
     * Host se connect karne ki koshish karta hai (CLIENT logic)
     */
    function attemptConnection(targetId) {
        console.log('→ Connection attempt ho raha hai:', targetId);
        let connectionFailed = false;
        let connectionTimer = null;
        
        const handleFailure = (message) => {
            if (connectionFailed) return;
            connectionFailed = true;
            if (connectionTimer) clearTimeout(connectionTimer);
            console.error('❌ Connection fail:', message);
            
            if (connectionRetryCount < MAX_RETRY) { // 3 baar retry karein
                connectionRetryCount++;
                statusEl.textContent = `🔄 Retry ${connectionRetryCount}`;
                setTimeout(() => attemptConnection(targetId), 2000);
            } else {
                statusEl.textContent = '❌ Connect nahi ho paaya';
                showSwitchButton(); // Host mode mein jaane ka button dikhayein
            }
        };

        try {
            // 20 second ka timeout
            connectionTimer = setTimeout(() => handleFailure('Timeout'), 20000);
            
            const conn = peer.connect(targetId, { 
                reliable: true,
                serialization: 'binary' // File transfer ke liye zaroori
            });

            conn.on('open', () => {
                console.log('✓✓✓ CONNECTION SAFAL!');
                clearTimeout(connectionTimer);
                if (!connectionFailed) {
                    connectionRetryCount = 0;
                    setupConnection(conn);
                }
            });

            conn.on('error', (err) => handleFailure('Error'));
            conn.on('close', () => {
                if (!currentConnection) handleFailure('Closed');
            });
        } catch (e) {
            handleFailure('Failed');
        }
    }

    /**
     * Connection safal hone par saare event listeners set karta hai.
     */
    function setupConnection(conn) {
        console.log('✓ Connection setup kar raha hai');
        currentConnection = conn;
        window.APP_CONNECTION = conn;
        showConnectionAnimation(); // Lock animation dikhayein
        
        statusEl.textContent = '🔐 Connected!';
        fileInput.disabled = false; // File input chalu karein
        transferStatusEl.textContent = '✅ Ready';
        
        // QR code hata kar "Connected" status dikhayein
        qrCodeContainer.style.display = 'none';
        shareButtonsContainer.style.display = 'none';
        scanInstructions.style.display = 'block';

        // Chat UI dikhayein
        chatPlaceholder.style.display = 'none';
        chatContainer.style.display = 'flex';
        updateChatLimitsUI();
        
        const switchBtn = document.getElementById('switch-mode-btn');
        if (switchBtn) switchBtn.remove();
        
        if (isHost) startHeartbeat(); // Host hai to connection check chalu karein

        // Doosre peer ko 'ready' signal bhej
        setTimeout(() => {
            if (currentConnection && currentConnection.open) {
                try { currentConnection.send({ type: 'ready' }); } catch(e) {}
            }
        }, 100);

        // --- SABSE ZAROORI: Data listener ---
        // Jab bhi doosre user se koi data aaye
        conn.on('data', (data) => {
            
            // Heartbeat
            if (data.type === 'ready') {
                statusEl.textContent = '✅ Ready!';
                return;
            }
            if (data.type === 'heartbeat-ping') {
                conn.send({ type: 'heartbeat-pong' });
                return;
            }
            if (data.type === 'heartbeat-pong') return;

            // --- Chat Data ---
            if (data.type === 'chat-text') {
                addMessageToDOM('text', data.message, 'receiver', { words: data.message.split(/\s+/).length }, data.msgId, data.replyContext);
                conn.send({ type: 'chat-read', msgId: data.msgId }); // "Read" receipt bhej
                pruneChat();
                updateChatLimitsUI();
                return;
            }
            if (data.type === 'chat-image') {
                addMessageToDOM('image', data.data, 'receiver', { size: data.size, name: data.name }, data.msgId, data.replyContext);
                conn.send({ type: 'chat-read', msgId: data.msgId }); // "Read" receipt bhej
                pruneChat();
                updateChatLimitsUI();
                return;
            }
            if (data.type === 'chat-typing') {
                showChatStatus('Typing...');
                return;
            }
            if (data.type === 'chat-stop-typing') {
                clearTimeout(peerTypingTimer);
                chatStatus.style.opacity = 0;
                return;
            }
            if (data.type === 'chat-read') { // Jab receiver message "read" kare
                const msgEl = document.querySelector(`.chat-message[data-msg-id="${data.msgId}"]`);
                if (msgEl) {
                    const statusEl = msgEl.querySelector('.msg-status');
                    if (statusEl) {
                        statusEl.innerHTML = '✓✓'; // Double tick
                        statusEl.classList.add('seen'); // Blue tick
                    }
                }
                return;
            }
            // --- FIX: DOWNLOAD INDICATION ---
            // Jab receiver image download kare
            if (data.type === 'chat-img-download') {
                console.log(`[DEBUG] 'chat-img-download' receive hua: ${data.msgId}`);
                const msgEl = document.querySelector(`.chat-message[data-msg-id="${data.msgId}"]`);
                if (msgEl) {
                    const statusEl = msgEl.querySelector('.download-status');
                    if (statusEl) {
                        console.log(`[DEBUG] 'Downloaded by peer' dikha raha hai`);
                        statusEl.style.display = 'inline'; // "Downloaded" text dikhayein
                    }
                }
                return;
            }
            // --- END FIX ---


            // --- Call Data ---
            if (data.type === 'call-end') {
                console.log('Peer ne call kaat diya');
                cleanupCall();
                return;
            }
            if (data.type === 'call-toggle-video') {
                console.log('Peer ne video toggle kiya:', data.isVideoOn);
                if (remoteVideo) remoteVideo.style.display = data.isVideoOn ? 'block' : 'none';
                if (callAvatar) callAvatar.style.display = data.isVideoOn ? 'none' : 'flex';
                return;
            }

            // --- File Transfer Data ---
            if (data.type === 'metadata') { // File ki info
                const fileId = data.fileId;
                receivingFiles.set(fileId, {
                    id: fileId,
                    name: data.name,
                    size: data.size,
                    type: data.fileType,
                    data: [], // Chunks yahaan store honge
                    receivedBytes: 0,
                    startTime: Date.now()
                });
                
                createTransferUI(fileId, data.name, false); // Receive wala progress bar banayein
                updateTransferUI(fileId, {
                    percent: 0,
                    sizeText: `0 / ${formatBytes(data.size)}`,
                    etaText: 'ETA: --:--'
                });
                transferStatusEl.textContent = `Receiving...`;
            } else if (data.type === 'end') { // File poora receive hua
                const fileId = data.fileId;
                const fileData = receivingFiles.get(fileId);
                
                if (!fileData) return; // Agar pehle hi cancel ho gaya

                // Sabhi chunks ko jodkar file banayein
                const fileBlob = new Blob(fileData.data, { type: fileData.type });
                const downloadUrl = URL.createObjectURL(fileBlob);
                
                // File ko automatically download karein
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = fileData.name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
                
                document.getElementById(`transfer-${fileId}`)?.remove(); // Progress bar hatayein
                receivingFiles.delete(fileId);
                
                if (receivingFiles.size === 0 && !isSending) {
                    transferStatusEl.textContent = `✅ Receive hua`;
                }
            // --- FIX: CANCEL LOGIC ---
            } else if (data.type === 'cancel') { // Jab doosra user cancel kare
                const fileId = data.fileId;
                console.log(`Cancel receive hua: ${fileId}`);

                // Agar humari active send file cancel hui
                if (activeSend && activeSend.id === fileId) {
                    activeSend.status = 'cancelled'; 
                    document.getElementById(`transfer-${fileId}`)?.remove();
                    isSending = false;
                    activeSend = null;
                    sendNextFileFromQueue(); // Agli file bhejna shuru karein
                }
                // Agar queue wali file cancel hui
                else if (fileQueue.some(job => job.id === fileId)) {
                    fileQueue = fileQueue.filter(job => job.id !== fileId);
                    document.getElementById(`transfer-${fileId}`)?.remove();
                }
                // Agar humari active receive file cancel hui
                else if (receivingFiles.has(fileId)) {
                    receivingFiles.delete(fileId);
                    document.getElementById(`transfer-${fileId}`)?.remove();
                    if (receivingFiles.size === 0 && !isSending) {
                        transferStatusEl.textContent = '❌ Peer ne cancel kiya';
                    }
                }
            // --- END FIX ---
            } else {
                // Yeh ek file ka chunk (hissa) hai
                const fileId = data.fileId; 
                const chunk = data.chunk;
                
                const fileData = receivingFiles.get(fileId);
                if (!fileData) return; // Agar file cancel ho chuki hai

                fileData.data.push(chunk);
                fileData.receivedBytes += chunk.byteLength;
                
                const percent = Math.round((fileData.receivedBytes / fileData.size) * 100);
                
                // ETA calculate karein
                const elapsedTime = (Date.now() - fileData.startTime) / 1000;
                let etaText = 'ETA: --:--';
                if (elapsedTime > 0.5) {
                    const speed = fileData.receivedBytes / elapsedTime;
                    const remainingBytes = fileData.size - fileData.receivedBytes;
                    const remainingTime = remainingBytes / speed;
                    etaText = `ETA: ${formatTime(remainingTime)}`;
                }
                
                // Progress bar update karein
                updateTransferUI(fileId, {
                    percent: percent,
                    sizeText: `${formatBytes(fileData.receivedBytes)} / ${formatBytes(fileData.size)}`,
                    etaText: etaText
                });
            }
        });

        // Connection band hone par
        conn.on('close', () => handleDisconnect('Closed'));
        conn.on('error', (err) => handleDisconnect('Error'));
        
        sendNextFileFromQueue(); // Agar queue mein kuch hai to bhejna shuru karein
    }
    
    /**
     * Heartbeat chalu karta hai (HOST logic)
     */
    function startHeartbeat() {
        stopHeartbeat();
        heartbeatInterval = setInterval(() => {
            if (currentConnection && currentConnection.open) {
                try {
                    currentConnection.send({ type: 'heartbeat-ping' });
                } catch (e) {}
            }
        }, 5000); // Har 5 second
    }

    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }
    
    /**
     * Connection tootne par (Disconnect) logic handle karta hai.
     */
    function handleDisconnect(message) {
        console.log('⚠ Disconnect:', message);
        stopHeartbeat();
        
        // Chat aur Call UI band karein
        chatContainer.style.display = 'none';
        chatPlaceholder.style.display = 'flex';
        cleanupCall();
        
        if (currentConnection) {
            try { currentConnection.close(); } catch (e) {}
            currentConnection = null;
        }

        if (isHost) {
            // --- HOST LOGIC ---
            // Host reload nahi karega. Woh naye connection ka intezaar karega.
            console.log('Host reset: Naye connection ka intezaar...');
            statusEl.textContent = '⚠️ Disconnected. Naya QR ready hai.';
            
            // UI ko QR code state par reset karein
            qrCodeContainer.style.display = 'block';
            shareButtonsContainer.style.display = 'flex';
            scanInstructions.style.display = 'none';
            fileInput.disabled = true;
            transferStatusEl.textContent = 'Waiting...';
            
            // Saare pending transfers cancel karein
            isSending = false;
            activeSend = null;
            fileQueue = [];
            receivingFiles.clear();
            transferListContainer.innerHTML = '';
            
        } else {
            // --- CLIENT LOGIC ---
            // Client ko reload hokar naya HOST banna chahiye.
            if (IS_RELOADING) return; // Agar pehle se reload ho raha hai
            IS_RELOADING = true;

            statusEl.textContent = '⚠️ Disconnected... Reload ho raha hai...';
            
            if (peer && !peer.destroyed) {
                try { peer.destroy(); } catch (e) {}
                peer = null;
            }
            
            console.log('🔄 Client disconnect hua, host mode ke liye reload kar raha hai...');
            // 'beforeunload' listener pehle hi hash clear kar chuka hai.
            window.location.reload();
        }
    }

    // --- FILE SENDING LOGIC ---

    // Jab user file select karta hai
    fileInput.addEventListener('change', (event) => {
        for (const file of event.target.files) {
            const fileId = crypto.randomUUID(); // Har file ke liye unique ID
            const fileJob = {
                file: file,
                id: fileId,
                status: 'pending' // Shuru mein pending
            };
            fileQueue.push(fileJob); // Queue mein daalein
            
            // "Pending" state mein progress bar banayein
            createTransferUI(fileId, file.name, true);
            updateTransferUI(fileId, {
                status: 'pending',
                sizeText: formatBytes(file.size)
            });
        }
        event.target.value = null; // Input clear karein
        transferStatusEl.textContent = `📁 ${fileQueue.length} files queue mein hain`;
        
        // Agar connected hain aur kuch bhej nahi rahe, to bhejna shuru karein
        if (currentConnection && currentConnection.open && !isSending) {
            sendNextFileFromQueue();
        }
    });

    /**
     * Queue se agli file uthakar bhejna shuru karta hai.
     */
    function sendNextFileFromQueue() {
        if (fileQueue.length === 0) { // Queue khali hai
            isSending = false;
            activeSend = null;
            if (receivingFiles.size === 0) { // Kuch receive bhi nahi ho raha
                transferStatusEl.textContent = '✅ Sab bhej diya!';
            }
            return;
        }
        
        if (!currentConnection || !currentConnection.open || isSending) return;
        
        isSending = true;
        const fileJob = fileQueue.shift(); // Queue se pehli file nikalein
        activeSend = fileJob; // Ise active set karein
        fileJob.status = 'sending';
        const file = fileJob.file;
        
        transferStatusEl.textContent = `📤 Bhej rahe hain...`;
        const startTime = Date.now(); // Speed/ETA ke liye time note karein

        try {
            // Step 1: File ki info (Metadata) bhej
            currentConnection.send({
                type: 'metadata',
                fileId: fileJob.id,
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

        // Jab file ka hissa (chunk) read ho jaaye
        reader.onload = (e) => {
            // Check karein ki file cancel to nahi ho gayi
            if (activeSend !== fileJob || fileJob.status === 'cancelled') {
                console.log('Stale ya cancelled job ko ignore kar raha hai.');
                if (activeSend === fileJob) { // Agar receiver ne cancel kiya
                     isSending = false;
                     activeSend = null;
                     sendNextFileFromQueue();
                }
                return;
            }
            
            if(!currentConnection || !currentConnection.open) {
                isSending = false;
                activeSend = null;
                fileQueue.unshift(fileJob); // File ko queue mein vapas daal dein
                console.error("Connection toota, sending ruki");
                return;
            }
        
            try {
                // Step 2: File ka chunk (hissa) bhej
                currentConnection.send({
                    type: 'chunk',
                    fileId: fileJob.id,
                    chunk: e.target.result // Yeh ArrayBuffer hai
                });
                
                offset += e.target.result.byteLength;
                updateProgress(fileJob.id, offset, file.size, startTime); // UI update karein

                if (offset < file.size) { // Agar file baaki hai
                    readSlice(offset); // Agla hissa read karein
                } else {
                    // Step 3: File poori ho gayi, 'end' signal bhej
                    currentConnection.send({ type: 'end', fileId: fileJob.id });
                    document.getElementById(`transfer-${fileJob.id}`)?.remove();
                    isSending = false;
                    activeSend = null;
                    sendNextFileFromQueue(); // Agli file bhej
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

        // File ka agla hissa (slice) read karne ke liye function
        function readSlice(o) {
            if (activeSend !== fileJob || fileJob.status === 'cancelled') {
                 console.log('readSlice ko roka (cancelled)');
                 if (activeSend === fileJob) { // Agar receiver ne cancel kiya
                     isSending = false;
                     activeSend = null;
                     sendNextFileFromQueue();
                 }
                 return;
            }
            const slice = file.slice(o, o + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        }
        
        readSlice(0); // Pehla hissa read karna shuru karein
    }
    
    /**
     * File transfer ko cancel karta hai (SENDER logic).
     */
    function cancelTransfer(fileId) {
        console.log(`[DEBUG] [cancelTransfer] call hua: ${fileId}`);
        // Agar active transfer ko cancel kar rahe hain
        if (activeSend && activeSend.id === fileId) {
            console.log(`Active transfer cancel ho raha hai: ${fileId}`);
            activeSend.status = 'cancelled'; // Flag set karein (taaki reader.onload ruk jaaye)
            document.getElementById(`transfer-${fileId}`)?.remove();
            
            // Peer ko bataayein ki cancel ho gaya
            if (currentConnection && currentConnection.open) {
                try { currentConnection.send({ type: 'cancel', fileId: fileId }); } catch (err) {}
            }
            
            // Turant agla file bhejna shuru karein
            isSending = false;
            activeSend = null;
            sendNextFileFromQueue();

        } else {
            // Agar queue mein padi file ko cancel kar rahe hain
            console.log(`Pending transfer cancel ho raha hai: ${fileId}`);
            fileQueue = fileQueue.filter(job => job.id !== fileId);
            document.getElementById(`transfer-${fileId}`)?.remove();
            // Peer ko batane ki zaroorat nahi, kyonki yeh shuru hi nahi hua tha
        }
        
        if (!isSending && fileQueue.length === 0) {
             transferStatusEl.textContent = '❌ Cancelled';
        }
    }

    /**
     * File receive ko cancel karta hai (RECEIVER logic).
     */
    function cancelReceive(fileId) {
        console.log(`[DEBUG] [cancelReceive] call hua: ${fileId}`);
        receivingFiles.delete(fileId); // Map se hatayein
        document.getElementById(`transfer-${fileId}`)?.remove(); // UI se hatayein
        
        // Sender ko bataayein ki humein yeh file nahi chahiye
        if (currentConnection && currentConnection.open) {
            try { currentConnection.send({ type: 'cancel', fileId: fileId }); } catch (err) {}
        }
        
        if (receivingFiles.size === 0 && !isSending) {
            transferStatusEl.textContent = '❌ Receive cancelled';
        }
    }

    // --- UTILITY FUNCTIONS ---

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

    // Share/Copy/Download buttons ko set karta hai (HOST logic)
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
                // ... fallback
                return;
            }
            const file = new File([blob], 'qr-code.png', { type: 'image/png' });
            const shareData = {
                title: 'QR Send',
                text: 'Connect karne ke liye scan karein',
                url: connectUrl,
                files: [file]
            };

            if (navigator.canShare && navigator.canShare(shareData)) {
                nativeShareButton.style.display = 'inline-flex';
                copyLinkButton.style.display = 'none';
                downloadQrButton.style.display = 'none';
                nativeShareButton.onclick = async () => {
                    try { await navigator.share(shareData); } catch (err) {}
                };
            } else {
                // ... fallback
            }
        }, 'image/png');
    }

    // Link copy karne ke liye
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
    
    // QR code image download karne ke liye
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

    // Share/Download buttons ke listeners
    copyLinkButton.addEventListener('click', () => {
        if (connectUrl) copyToClipboard(connectUrl, copyLinkButton);
    });
    downloadQrButton.addEventListener('click', downloadQRCode);

    // App shuru karein
    initializePeer();
    
    // Image modal ke close buttons ke listeners
    const imageModalOverlay = document.getElementById('image-modal-overlay');
    if (imageModalOverlay) {
        imageModalOverlay.addEventListener('click', () => closeImageModal());
    }
    const imageModalCloseBtn = document.getElementById('image-modal-close-btn');
    if(imageModalCloseBtn) {
        imageModalCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Overlay ko click hone se rokein
            closeImageModal();
        });
    }

});
