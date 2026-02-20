(function () {
    'use strict';

    function ballPosDisplay(pos) {
        if (pos == null) return '--';
        if (pos === 0) return '50';
        if (pos < 0) return 'OWN ' + (50 + pos);
        return 'OPP ' + (50 - pos);
    }

    function renderFieldHashMarks() {
        const hashContainer = document.getElementById('field-hash-marks');
        if (!hashContainer || hashContainer.children.length > 0) return; // Already rendered

        for (let y = 0; y <= 100; y++) {
            let markClass = 'mark-1yd';
            if (y % 10 === 0) {
                markClass = 'mark-10yd';
            } else if (y % 5 === 0) {
                markClass = 'mark-5yd';
            }

            const pct = y;
            const mark = document.createElement('div');
            mark.className = `field-hash-mark ${markClass}`;
            mark.style.left = pct + '%';
            hashContainer.appendChild(mark);
        }
    }

    function updateFirstDownLine(state) {
        const line = document.getElementById('first-down-line');
        if (!line) return;

        const pos = state.ball_position || 0;
        const distance = state.distance || 10;
        const firstDownPos = pos + distance;
        const pct = ((firstDownPos + 50) / 100) * 100;
        const clampedPct = Math.max(0, Math.min(100, pct));
        line.style.left = clampedPct + '%';
        line.style.opacity = pct < 0 || pct > 100 ? '0.3' : '1';
    }

    function updateFieldViz(state) {
        const marker = document.getElementById('ball-marker');
        const label = document.getElementById('ball-position-display');
        if (!marker) return;

        const pos = state.ball_position;
        if (pos === null || pos === undefined) return;

        const pct = ((pos + 50) / 100) * 100;

        if (!marker.style.left) marker.style.left = '25%';
        marker.style.left = pct + '%';
        if (label) label.textContent = ballPosDisplay(pos);
        renderFieldHashMarks();
        updateFirstDownLine(state);
    }

    window.TrackerModules = window.TrackerModules || {};
    window.TrackerModules.fieldViz = {
        ballPosDisplay,
        renderFieldHashMarks,
        updateFirstDownLine,
        updateFieldViz,
    };
})();
