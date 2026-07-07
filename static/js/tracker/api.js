/**
 * HTTP helpers: CSRF-aware JSON POST/GET against the tracker endpoints.
 */
import { GAME_ID } from './state.js';

export function getCSRFToken() {
    const el = document.querySelector('[name=csrfmiddlewaretoken]');
    if (el) return el.value;
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
}

/** POST JSON to /games/<id>/tracker/<path>/ and return the parsed body. */
export async function postJSON(path, payload) {
    const resp = await fetch(`/games/${GAME_ID}/tracker/${path}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken(),
        },
        body: JSON.stringify(payload || {}),
    });
    const body = await resp.json();
    return { status: resp.status, body };
}

/** GET /games/<id>/tracker/<path>/?<params> and return the parsed body. */
export async function getJSON(path, params) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const resp = await fetch(`/games/${GAME_ID}/tracker/${path}/${qs}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}
