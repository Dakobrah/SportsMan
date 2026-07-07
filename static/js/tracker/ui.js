/**
 * Generic UI helpers: XSS-safe escaping, toasts, focus and touch-target
 * accessibility utilities.
 */

/** Escape HTML entities to prevent XSS via innerHTML. */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function showToast(message, type) {
    const existing = document.querySelector('.tracker-toast');
    if (existing) existing.remove();

    const icons = {
        success: '<i class="bi bi-check-circle-fill"></i>',
        error: '<i class="bi bi-exclamation-triangle-fill"></i>',
        info: '<i class="bi bi-info-circle-fill"></i>',
    };

    const toast = document.createElement('div');
    toast.className = 'tracker-toast' + (type ? ' ' + type : '');
    // role="status" + aria-live="polite" causes screen readers to announce the
    // toast without interrupting ongoing speech (errors are assertive).
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toast.innerHTML = (icons[type] || '') + ' ' + escapeHtml(message);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
}

/** Return the first keyboard-focusable element inside a container. */
export function firstFocusable(container) {
    return container.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
        'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
}

/** Show a modal and move focus into it. */
export function openModal(modal) {
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        const f = firstFocusable(modal);
        if (f) f.focus();
    });
}

function isNativeInteractive(el) {
    return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
}

/** Give non-native elements button semantics and keyboard activation. */
export function makeInteractive(el) {
    if (!el) return;
    if (!isNativeInteractive(el)) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
    }

    if (el.classList.contains('toggle-btn')) {
        el.setAttribute('aria-pressed', el.dataset.active === 'true' ? 'true' : 'false');
    }

    el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            el.click();
        }
    });
}
