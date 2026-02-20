(function () {
    'use strict';

    function showCoinTossModal() {
        const modal = document.getElementById('coin-toss-modal');
        if (!modal) return;
        modal.classList.remove('hidden');

        const teamChoiceButtons = document.getElementById('team-choice-buttons');
        const callSelection = document.getElementById('call-selection');
        const coinResult = document.getElementById('coin-result');
        if (teamChoiceButtons) teamChoiceButtons.classList.remove('hidden');
        if (callSelection) callSelection.classList.add('hidden');
        if (coinResult) coinResult.classList.add('hidden');

        const teamButtons = teamChoiceButtons.querySelectorAll('button');
        teamButtons.forEach(btn => {
            btn.addEventListener('click', (e) => handleTeamSelection(e, callSelection, teamChoiceButtons));
        });
    }

    function handleTeamSelection(e, callSelection, teamChoiceButtons) {
        const selectedTeam = e.target.dataset.team;
        const teamName = selectedTeam === 'home' ? window.TEAM_ABBR : window.OPPONENT;
        teamChoiceButtons.classList.add('hidden');
        callSelection.classList.remove('hidden');
        const callingTeamName = document.getElementById('calling-team-name');
        if (callingTeamName) callingTeamName.textContent = teamName;
        window.coinTossState = { selectedTeam };
        const headsBtn = document.getElementById('coin-heads');
        const tailsBtn = document.getElementById('coin-tails');
        if (headsBtn && tailsBtn) {
            headsBtn.removeEventListener('click', handleCoinToss);
            tailsBtn.removeEventListener('click', handleCoinToss);
            headsBtn.addEventListener('click', (e) => handleCoinCall(e, callSelection));
            tailsBtn.addEventListener('click', (e) => handleCoinCall(e, callSelection));
        }
    }

    function handleCoinCall(e, callSelection) {
        const call = e.target.dataset.result;
        const { selectedTeam } = window.coinTossState || {};
        const teamName = selectedTeam === 'home' ? window.TEAM_ABBR : window.OPPONENT;
        const actualResult = Math.random() > 0.5 ? 'heads' : 'tails';
        const callWins = (call === actualResult);
        const winningTeam = callWins ? selectedTeam : (selectedTeam === 'home' ? 'away' : 'home');
        const winnerName = winningTeam === 'home' ? window.TEAM_ABBR : window.OPPONENT;
        callSelection.classList.add('hidden');
        const coinResult = document.getElementById('coin-result');
        if (coinResult) {
            coinResult.classList.remove('hidden');
            const resultValue = document.getElementById('coin-result-value');
            const resultWinner = document.getElementById('coin-winner');
            const continueBtn = document.getElementById('coin-continue');
            if (resultValue) resultValue.textContent = actualResult.toUpperCase();
            if (resultWinner) resultWinner.textContent = `${winnerName} won the coin toss`;
            if (continueBtn) {
                continueBtn.addEventListener('click', () => {
                    const modal = document.getElementById('coin-toss-modal');
                    modal.classList.add('hidden');
                    setTimeout(() => showDeferModal(winningTeam), 300);
                });
            }
        }
    }

    function handleCoinToss(e) {
        const result = e.target.closest('button').dataset.result;
        const modal = document.getElementById('coin-toss-modal');
        if (modal) modal.classList.add('hidden');
        const actualResult = Math.random() > 0.5 ? 'heads' : 'tails';
        const home_wins = (result === actualResult);
        setTimeout(() => showDeferModal(home_wins ? 'home' : 'away'), 500);
    }

    function showDeferModal(winning_team) {
        const modal = document.getElementById('defer-modal');
        if (!modal) return;
        const msg = document.getElementById('defer-team-msg');
        if (msg) msg.textContent = `${winning_team === 'home' ? window.TEAM_ABBR : window.OPPONENT} won the coin toss`;
        modal.classList.remove('hidden');
        const btnDefer = document.getElementById('btn-defer');
        const btnPlay = document.getElementById('btn-play');
        if (btnDefer) btnDefer.addEventListener('click', () => handleDeferDecision('defer', winning_team));
        if (btnPlay) btnPlay.addEventListener('click', () => handleDeferDecision('play', winning_team));
    }

    function handleDeferDecision(choice, winning_team) {
        const modal = document.getElementById('defer-modal');
        if (modal) modal.classList.add('hidden');
        const receiving_team = winning_team === 'home' ? (choice === 'defer' ? 'away' : 'home') : (choice === 'defer' ? 'home' : 'away');
        window._lastDefer = { choice, winning_team, receiving_team };
    }

    window.TrackerModules = window.TrackerModules || {};
    window.TrackerModules.coin = {
        showCoinTossModal,
        handleTeamSelection,
        handleCoinCall,
        handleCoinToss,
        showDeferModal,
        handleDeferDecision,
    };
})();
