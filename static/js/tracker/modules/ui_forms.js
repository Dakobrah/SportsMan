(function () {
    'use strict';

    function resetToPlayTypeSelection() {
        const formArea = document.getElementById('play-form-area');
        if (!formArea) return;
        formArea.innerHTML = document.getElementById('play-type-selection-template')
            ? document.getElementById('play-type-selection-template').innerHTML
            : '';
    }

    function showPlayForm(type) {
        const formArea = document.getElementById('play-form-area');
        if (!formArea) return;
        // Placeholder: in the real tracker this builds complex forms.
        formArea.innerHTML = `<div class="play-form play-form-${type}">Form: ${type}</div>`;
    }

    window.TrackerModules = window.TrackerModules || {};
    window.TrackerModules.forms = {
        resetToPlayTypeSelection,
        showPlayForm,
    };
})();
