/**
 * Recent-plays feed: incremental prepend, server-play merging, and
 * truncation when another device undoes a play.
 */
import { escapeHtml } from './ui.js';

const MAX_ITEMS = 15;

function feedEl() {
    return document.getElementById('plays-feed');
}

function renderItem({ seq, quarter, summary, yards, badges }) {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.dataset.seq = seq;

    let yardsHtml = '';
    if (yards !== undefined && yards !== null) {
        const cls = yards > 0 ? 'positive' : (yards < 0 ? 'negative' : 'neutral');
        yardsHtml = `<span class="feed-yards ${cls}">${yards > 0 ? '+' : ''}${yards}</span>`;
    }

    item.innerHTML = `
        <span class="feed-seq">#${seq}</span>
        <span class="feed-qtr">Q${quarter}</span>
        <span class="feed-desc">${escapeHtml(summary)}${badges || ''}</span>
        ${yardsHtml}
    `;
    return item;
}

function badgesFor(detail) {
    let badges = '';
    if (!detail) return badges;
    if (detail.is_touchdown) badges += ' <span class="feed-badge-td">TD</span>';
    if (detail.is_defensive_touchdown) badges += ' <span class="feed-badge-td">DEF TD</span>';
    if (detail.is_interception) badges += ' <span class="feed-badge-int">INT</span>';
    return badges;
}

function prepend(item) {
    const feed = feedEl();
    if (!feed) return;
    const empty = feed.querySelector('.feed-empty');
    if (empty) empty.remove();
    feed.insertBefore(item, feed.firstChild);
    while (feed.children.length > MAX_ITEMS) {
        feed.removeChild(feed.lastChild);
    }
}

/** Highest sequence number currently rendered in the feed. */
export function topSequence() {
    const feed = feedEl();
    if (!feed || !feed.firstElementChild) return 0;
    return parseInt(feed.firstElementChild.dataset.seq || '0', 10) || 0;
}

/** Add the operator's own play from a tracker_add_* response. */
export function addLocalPlay(seq, quarter, summary, detail) {
    prepend(renderItem({
        seq,
        quarter,
        summary,
        yards: detail ? detail.yards : undefined,
        badges: badgesFor(detail),
    }));
}

/**
 * Merge plays from a poll payload (newest first). Only plays newer than
 * what's already rendered are added.
 */
export function mergeServerPlays(plays) {
    if (!plays || !plays.length) return;
    const newest = topSequence();
    // Insert oldest-first so the newest ends up on top.
    [...plays]
        .filter(p => p.sequence_number > newest)
        .sort((a, b) => a.sequence_number - b.sequence_number)
        .forEach(p => {
            prepend(renderItem({
                seq: p.sequence_number,
                quarter: p.quarter,
                summary: p.summary,
                yards: p.yards,
                badges: badgesFor(p),
            }));
        });
}

/** Remove feed items above maxSeq — another device undid those plays. */
export function truncateAbove(maxSeq) {
    const feed = feedEl();
    if (!feed) return;
    [...feed.querySelectorAll('.feed-item')].forEach(item => {
        const seq = parseInt(item.dataset.seq || '0', 10) || 0;
        if (seq > maxSeq) item.remove();
    });
}

/** Remove the newest item (local undo). */
export function removeNewest() {
    const feed = feedEl();
    if (feed && feed.firstElementChild) {
        feed.removeChild(feed.firstElementChild);
    }
}
