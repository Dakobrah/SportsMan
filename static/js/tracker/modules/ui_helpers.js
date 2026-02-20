(function () {
    'use strict';

    function showToast(message, type = 'info') {
        // Minimal toast: append to #toasts container if present
        const container = document.getElementById('toasts');
        if (!container) return;
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    function addPlayToFeed(summary, detail) {
        const feed = document.getElementById('recent-plays');
        if (!feed) return;
        const li = document.createElement('li');
        li.className = 'recent-play-item';
        li.innerHTML = `<strong>${summary}</strong><div class="detail">${detail || ''}</div>`;
        feed.insertBefore(li, feed.firstChild);
    }

    window.TrackerModules = window.TrackerModules || {};
    window.TrackerModules.ui = {
        showToast,
        addPlayToFeed,
    };
})();
