/**
 * Sports-Man Football Analytics - Application JavaScript
 */

(function() {
    'use strict';

    // Initialize Bootstrap tooltips
    function initTooltips() {
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
    }

    // Initialize Bootstrap popovers
    function initPopovers() {
        const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
        popoverTriggerList.forEach(el => new bootstrap.Popover(el));
    }

    // Auto-dismiss alerts after 5 seconds
    function initAutoAlertDismiss() {
        const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
        alerts.forEach(alert => {
            setTimeout(() => {
                const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
                bsAlert.close();
            }, 5000);
        });
    }

    // Form validation feedback
    function initFormValidation() {
        const forms = document.querySelectorAll('.needs-validation');
        forms.forEach(form => {
            form.addEventListener('submit', event => {
                if (!form.checkValidity()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                form.classList.add('was-validated');
            });
        });
    }

    // Loading state for buttons
    function initLoadingButtons() {
        const buttons = document.querySelectorAll('[data-loading]');
        buttons.forEach(button => {
            button.addEventListener('click', function() {
                const loadingText = this.dataset.loading || 'Loading...';
                const originalText = this.innerHTML;

                this.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${loadingText}`;
                this.disabled = true;

                // Store original text for potential restoration
                this.dataset.originalText = originalText;
            });
        });
    }

    // Confirm delete actions
    function initDeleteConfirmation() {
        const deleteButtons = document.querySelectorAll('[data-confirm-delete]');
        deleteButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                const message = this.dataset.confirmDelete || 'Are you sure you want to delete this item?';
                if (!confirm(message)) {
                    e.preventDefault();
                }
            });
        });
    }

    // Table row click navigation
    function initTableRowLinks() {
        const rows = document.querySelectorAll('tr[data-href]');
        rows.forEach(row => {
            row.style.cursor = 'pointer';
            row.addEventListener('click', function(e) {
                // Don't navigate if clicking on a link or button
                if (e.target.closest('a, button, .btn')) return;
                window.location.href = this.dataset.href;
            });
        });
    }

    // Search input debouncing
    function initSearchDebounce() {
        const searchInputs = document.querySelectorAll('.search-debounce');
        searchInputs.forEach(input => {
            let timeout;
            input.addEventListener('input', function() {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.form.submit();
                }, 500);
            });
        });
    }

    // Preserve scroll position after form submission
    function preserveScrollPosition() {
        const scrollPos = sessionStorage.getItem('scrollPosition');
        if (scrollPos) {
            window.scrollTo(0, parseInt(scrollPos));
            sessionStorage.removeItem('scrollPosition');
        }

        // Save scroll position before form submission
        const forms = document.querySelectorAll('form[data-preserve-scroll]');
        forms.forEach(form => {
            form.addEventListener('submit', () => {
                sessionStorage.setItem('scrollPosition', window.scrollY);
            });
        });
    }

    // Mobile touch feedback
    function initTouchFeedback() {
        if ('ontouchstart' in window) {
            const touchElements = document.querySelectorAll('.btn, .card, .list-group-item');
            touchElements.forEach(el => {
                el.addEventListener('touchstart', function() {
                    this.style.opacity = '0.7';
                });
                el.addEventListener('touchend', function() {
                    this.style.opacity = '1';
                });
            });
        }
    }

    // Copy to clipboard
    function initCopyToClipboard() {
        const copyButtons = document.querySelectorAll('[data-copy]');
        copyButtons.forEach(button => {
            button.addEventListener('click', async function() {
                const text = this.dataset.copy;
                try {
                    await navigator.clipboard.writeText(text);

                    // Show feedback
                    const originalTitle = this.title;
                    this.title = 'Copied!';
                    setTimeout(() => {
                        this.title = originalTitle;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });
        });
    }

    // Dark mode toggle (optional feature)
    function initDarkModeToggle() {
        const toggle = document.querySelector('#darkModeToggle');
        if (!toggle) return;

        // Check for saved preference or system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedTheme = localStorage.getItem('theme');

        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.setAttribute('data-bs-theme', 'dark');
            toggle.checked = true;
        }

        toggle.addEventListener('change', function() {
            if (this.checked) {
                document.documentElement.setAttribute('data-bs-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-bs-theme', 'light');
                localStorage.setItem('theme', 'light');
            }
        });
    }

    // Keyboard shortcuts
    function initKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            // Only if not in an input field
            if (e.target.matches('input, textarea, select')) return;

            // Cmd/Ctrl + K for search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                const searchInput = document.querySelector('#globalSearch');
                if (searchInput) searchInput.focus();
            }

            // G then H for home
            // G then G for games
            // G then R for reports
        });
    }

    // Initialize all features when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        initTooltips();
        initPopovers();
        initAutoAlertDismiss();
        initFormValidation();
        initLoadingButtons();
        initDeleteConfirmation();
        initTableRowLinks();
        initSearchDebounce();
        preserveScrollPosition();
        initTouchFeedback();
        initCopyToClipboard();
        initDarkModeToggle();
        initKeyboardShortcuts();

        console.log('Sports-Man initialized');
    });

})();
